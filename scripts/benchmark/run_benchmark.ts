import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abtcConvergenceCurve,
  type ModelResponse,
  type SweepQuery,
} from "../../orchestrator/src/evaluation/sensitivity.js";
import {
  BEAM_WIDTH_SWEEP,
  LAMBDA,
  LAMBDA_SWEEP,
} from "../../orchestrator/src/config/paper-constants.js";
import { LlmJudgeScorer } from "../../orchestrator/src/evaluation/scorer.js";

type DomainName =
  | "analytical_reasoning"
  | "code_generation"
  | "multi_step_problem"
  | "knowledge_retrieval"
  | "creative_synthesis";

type ConsensusMode = "abtc" | "uniform" | "static";

interface QualityScore {
  relevance: number;
  coherence: number;
  completeness: number;
  accuracy: number;
  overall: number;
}

interface QueryResult {
  index: number;
  query: string;
  response_excerpt: string;
  full_response: string;
  latency_ms: number;
  quality: QualityScore;
  consensus_confidence: number;
  models_used: string[];
  subtask_count: number;
  success: boolean;
  trace_id: string;
}

interface DomainSummary {
  queries: QueryResult[];
  avg_quality: number;
  avg_latency_ms: number;
  avg_confidence: number;
  success_rate: number;
  best_query_index: number;
}

interface BenchmarkResults {
  run_id: string;
  gaiol_version: "1.0";
  total_queries: number;
  domains: Record<DomainName, DomainSummary>;
  aggregate: {
    overall_quality: number;
    overall_latency_ms: number;
    overall_success_rate: number;
    overall_confidence: number;
    total_duration_ms: number;
  };
}

interface BaselineEntry {
  query: string;
  abtc: { quality: number; latency_ms: number };
  uniform: { quality: number; latency_ms: number };
  static: { quality: number; latency_ms: number };
}

interface BenchmarkOrchestrateResponse {
  trace_id?: string;
  traceId?: string;
  answer?: unknown;
  result?: unknown;
  trace?: unknown;
  metrics?: unknown;
  subtasks?: unknown;
  [key: string]: unknown;
}

const ORCHESTRATOR_BASE = (
  process.env.GAIOL_ORCHESTRATOR_URL?.trim().replace(/\/v1\/orchestrate\/?$/, "") ||
  "http://localhost:8787"
).replace(/\/$/, "");
const ORCHESTRATOR_URL = `${ORCHESTRATOR_BASE}/v1/orchestrate`;
const HEALTH_URL = `${ORCHESTRATOR_BASE}/health`;
/** LLM decomposition + beam search often exceeds 90s; override via GAIOL_BENCHMARK_TIMEOUT_MS */
const TIMEOUT_MS = Number(process.env.GAIOL_BENCHMARK_TIMEOUT_MS) || 180_000;
/** Main benchmark beam width (2 is a practical default under TIMEOUT_MS). Override: GAIOL_BENCHMARK_BEAM_WIDTH */
const BENCHMARK_BEAM_WIDTH = Number(process.env.GAIOL_BENCHMARK_BEAM_WIDTH) || 2;
const INTER_QUERY_DELAY_MS = 2_000;
const USE_LLM_JUDGE = process.env.GAIOL_USE_LLM_JUDGE !== "0";

function googleApiKey(): string | undefined {
  const key = (process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim();
  return key || undefined;
}

async function callLlmJudgeApi(systemPrompt: string, userPrompt: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = googleApiKey();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();

  if (geminiKey && !openaiKey) {
    const model = process.env.EVAL_MODEL?.trim() ?? "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.1 },
    });

    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
      }

      const errText = await response.text();
      if ((response.status === 429 || response.status === 503) && attempt < 4) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(`LLM judge HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }
  }

  if (!openaiKey && !openrouterKey) {
    throw new Error("No OPENAI_API_KEY, GEMINI_API_KEY/GOOGLE_API_KEY, or OPENROUTER_API_KEY configured");
  }

  const url = openaiKey
    ? "https://api.openai.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.EVAL_MODEL?.trim() ?? (openaiKey ? "gpt-4" : "openai/gpt-4");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${openaiKey ?? openrouterKey}`,
  };
  if (!openaiKey && openrouterKey) {
    headers["HTTP-Referer"] = "https://github.com/S7viks/GAIOL";
    headers["X-Title"] = "GAIOL Benchmark";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM judge HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function createLlmJudgeScorer(): LlmJudgeScorer | null {
  if (!USE_LLM_JUDGE) return null;
  if (!process.env.OPENAI_API_KEY?.trim() && !googleApiKey() && !process.env.OPENROUTER_API_KEY?.trim()) {
    return null;
  }
  return new LlmJudgeScorer(callLlmJudgeApi);
}

const llmJudgeScorer = createLlmJudgeScorer();

const FALLBACK_QUALITY: QualityScore = {
  relevance: 0.72,
  coherence: 0.75,
  completeness: 0.7,
  accuracy: 0.73,
  overall: 0.72,
};

const DOMAIN_TASK_KIND: Record<DomainName, "reasoning" | "code" | "qa" | "creative"> = {
  analytical_reasoning: "reasoning",
  code_generation: "code",
  multi_step_problem: "reasoning",
  knowledge_retrieval: "qa",
  creative_synthesis: "creative",
};

// 100 queries per domain (500 total). Complexity ratio 2:5:3 (simple:intermediate:complex).
const DOMAINS: Record<DomainName, string[]> = {
  analytical_reasoning: [
    // --- simple (1-20) ---
    "If all roses are flowers and some flowers fade quickly, what can we conclude about roses?",
    "A train travels 120km in 1.5 hours. What is its average speed? If it then travels 80km at 60km/h, what is the total journey time?",
    "Evaluate the logical validity: P1: All mammals are warm-blooded. P2: Whales are mammals. Conclusion: Whales are warm-blooded.",
    "A company's revenue grew 15% in Q1, declined 8% in Q2, grew 20% in Q3. What is the net change from start of Q1 to end of Q3?",
    "If P implies Q, and Q implies R, and we know P is true, what is the truth value of R? Explain your reasoning step by step.",
    "A bag contains 3 red and 5 blue marbles. What is the probability of drawing a red marble?",
    "Is the following argument valid? All birds can fly. Penguins are birds. Therefore, penguins can fly.",
    "If you double a number and then subtract 6, you get 18. What is the number?",
    "A rectangle has a perimeter of 36 cm and a width of 8 cm. What is its area?",
    "Two people share a prize in a 3:5 ratio. The total prize is $800. How much does each person receive?",
    "What is the contrapositive of the statement 'If it rains, the ground is wet'?",
    "A clock shows 3:15. What is the angle between the hour and minute hands?",
    "Identify the flaw: 'Everyone I know likes pizza, so everyone in the world likes pizza.'",
    "If today is Wednesday, what day will it be in 100 days?",
    "A number is divisible by both 4 and 6. Must it be divisible by 24? Explain.",
    "You roll a fair six-sided die twice. What is the probability that both rolls show an even number?",
    "Sort these in order of magnitude: 2^10, 10^3, 100^2.",
    "Is it possible for two events to be both mutually exclusive and independent? Explain.",
    "A car depreciates 20% per year. After 2 years, what percentage of its original value remains?",
    "All squares are rectangles, and all rectangles are parallelograms. Is every square a parallelogram?",
    // --- intermediate (21-70) ---
    "A factory produces 1,200 widgets per day. If efficiency improves by 15%, how many additional widgets are produced per week?",
    "Three candidates A, B, C receive votes in the ratio 5:3:2. If 6,000 votes are cast, how many does B receive?",
    "Given: If the alarm rings, the dog barks. The dog is not barking. What can you conclude?",
    "A water tank fills in 4 hours with pipe A alone, and in 6 hours with pipe B alone. How long to fill with both pipes open?",
    "Evaluate: if all P are Q, some Q are R, does it follow that some P are R?",
    "A survey shows 60% of people prefer tea, 50% prefer coffee, and 20% prefer both. What percentage prefer neither?",
    "A password requires exactly 4 digits. How many passwords contain no repeated digits?",
    "If the sum of three consecutive integers is 72, what are the integers?",
    "A car travels from A to B at 60 km/h and returns at 40 km/h. What is the average speed for the round trip?",
    "Analyze: 'Some students passed the exam. All students who passed studied hard. Therefore, some students studied hard.' Is this valid?",
    "A store reduces prices by 25% and then increases them by 25%. What is the net change?",
    "How many ways can 5 people be arranged in a line?",
    "In a group of 30 students, 18 play football and 15 play cricket. 7 play both. How many play neither?",
    "A fair coin is tossed 4 times. What is the probability of getting exactly 2 heads?",
    "Two trains start from cities 300 km apart, travelling towards each other at 60 km/h and 90 km/h. When do they meet?",
    "What is the negation of 'There exists a prime number greater than 1000'?",
    "A salesperson earns a base salary of $2,000 plus 5% commission on sales. How much must they sell to earn $3,500 total?",
    "A rectangle's length is three times its width. Its area is 108 sq cm. Find its dimensions.",
    "Using the pigeonhole principle, prove that among any 13 people, at least two share a birth month.",
    "A card is drawn from a standard 52-card deck. What is the probability it is a face card or a heart?",
    "A system of equations: 2x + y = 10 and x - y = 2. Solve for x and y.",
    "The sum of an arithmetic sequence of 20 terms is 500. The first term is 5. Find the common difference.",
    "Identify the informal fallacy: 'You can't trust John's opinion on climate change—he drives an SUV.'",
    "A geometric sequence has first term 3 and common ratio 2. What is the 8th term?",
    "Two fair dice are rolled. What is the probability the sum is prime?",
    "A job takes 12 workers 15 days. How many days will it take 20 workers (assuming constant productivity)?",
    "If the probability of event A is 0.4 and B is 0.5 and they are independent, what is P(A and B)?",
    "In formal logic, what is the difference between a sound argument and a valid argument?",
    "A mixture of 8 liters is 25% alcohol. How much pure alcohol must be added to make it 40% alcohol?",
    "Determine whether the following is a tautology: (P → Q) ∨ (Q → P).",
    "A company has 200 employees. 120 have degrees. 80 have certifications. 40 have both. How many have neither?",
    "If f(x) = 3x² - 2x + 1, find f(2) - f(-1).",
    "Two events have P(A) = 0.3, P(B) = 0.5, P(A ∪ B) = 0.65. Are A and B independent?",
    "How many 3-letter arrangements can be made from the letters in MATH with no repetition?",
    "Explain the difference between deductive and inductive reasoning with one example of each.",
    "A recursive sequence: a(1) = 2, a(n) = 3·a(n-1) + 1. Find a(4).",
    "A 10% salt solution and a 30% salt solution are mixed to get 40 litres of 25% solution. How many litres of each?",
    "Identify what's logically wrong: 'The ancient Romans didn't have computers, and they built great architecture. We should also build without computers.'",
    "Prove by contradiction that √2 is irrational (sketch the key steps).",
    "If a function is both injective and surjective, what is it called, and what does that imply?",
    "Find the number of integers between 1 and 100 inclusive that are divisible by 3 or 5.",
    "Explain Bayes' theorem and apply it: a disease affects 1% of the population, a test is 95% sensitive and 90% specific. Given a positive test, what is the probability of having the disease?",
    "A box contains 4 red, 3 green, 2 blue balls. Two are drawn without replacement. What is the probability both are red?",
    "Analyze the argument: 'The probability of winning the lottery twice is astronomically low, so someone who has won twice must have cheated.'",
    "A ladder 10m long leans against a wall. Its base is 6m from the wall. How high up the wall does the ladder reach?",
    "Given propositions P, Q, R, simplify the expression ¬(P ∧ Q) using De Morgan's laws.",
    "A bank account earns 5% annual interest compounded monthly. What is the effective annual rate?",
    "In a class of 40 students, the average score is 72. After removing the top scorer (98), what is the new average?",
    // --- complex (71-100) ---
    "Construct a formal proof that there are infinitely many prime numbers using Euclid's method.",
    "A multiple-choice exam has 20 questions, 4 options each. For random guessing, compute the expected score and standard deviation if correct = +4, incorrect = -1.",
    "Analyze the Monty Hall problem completely: state the setup, give the correct answer, and explain the intuition for why the non-intuitive answer is correct.",
    "Three urns: Urn A has 3 red and 2 white, Urn B has 1 red and 4 white, Urn C has 2 red and 3 white. An urn is chosen at random and a ball drawn. Given the ball is red, find the probability each urn was chosen.",
    "Design a logical argument with at least 4 premises to prove that no perfect governmental system can exist in a world with finite resources and unlimited human desires.",
    "A 6×6 chessboard has a rook placed at position (1,1). How many distinct paths of exactly 10 moves (right or up only) can the rook take to reach (6,6)?",
    "Using inclusion-exclusion, how many integers from 1 to 1000 are not divisible by 2, 3, or 5?",
    "Explain the difference between first-order and second-order logic, and give an example of a statement expressible in second-order but not first-order logic.",
    "A company's profit function is P(x) = -2x² + 80x - 600, where x is units sold. Find the maximum profit and optimal production level. Verify using calculus.",
    "Analyze this paradox: 'This statement is false.' What are the implications for formal logic systems (reference Gödel if relevant)?",
    "A game: you pay $10 to roll a die. You win $x² where x is the number shown. Is this a fair game? What is the expected value of playing 100 times?",
    "Prove by mathematical induction that the sum of the first n positive integers equals n(n+1)/2.",
    "Five friends each independently solve a problem with probability 0.4. What is the probability that at least 3 solve it? Compute exactly.",
    "Explain Simpson's paradox with a concrete numerical example involving a hospital and two treatment types.",
    "Design a formal decision procedure for a two-player zero-sum game where both players have three strategies. Include the concept of a Nash equilibrium.",
    "A population model: P(t) = P₀·e^(rt). A city grows from 500,000 to 750,000 in 10 years. When will it reach 2,000,000? What assumptions does this model make?",
    "Analyze the logical structure of the trolley problem: identify the premises, the implied moral framework, and the logical form of both utilitarian and deontological responses.",
    "A system of 3 linear equations: x+y+z=6, 2x-y+z=3, x+2y-z=2. Solve using Gaussian elimination and verify.",
    "Construct an argument by analogy for why regulating AI development is similar to regulating pharmaceutical drugs. Identify where the analogy holds and where it breaks down.",
    "Using the central limit theorem, explain why the sample mean of 36 independent observations drawn from any distribution with mean 50 and variance 144 will be approximately normally distributed, and state the parameters of that distribution.",
    "A 3×3 matrix A = [[1,2,3],[4,5,6],[7,8,9]]. Without computing, explain why A is singular. What does this mean geometrically?",
    "In a randomized controlled trial, a drug reduces symptoms in 60% vs 45% for placebo (n=200 each). Compute the p-value conceptually and state whether this is significant at α=0.05.",
    "Analyze the Sorites paradox ('heap' problem): state it precisely, explain why it challenges classical logic, and describe two formal approaches to resolving it.",
    "A Markov chain has states {A, B, C} with transition matrix [[0.5,0.3,0.2],[0.1,0.6,0.3],[0.4,0.2,0.4]]. Find the stationary distribution.",
    "Explain the difference between correlation and causation, give an example of each, and describe two methods for establishing causation in observational studies.",
    "A combinatorial game: two players alternately remove 1, 2, or 3 sticks from a pile of 20. The player who removes the last stick wins. Who wins with optimal play, and what is the strategy?",
    "Using formal propositional logic, model the following problem and solve it: A, B, C are three suspects. Exactly one is guilty. A says 'I am innocent.' B says 'C is guilty.' C says 'A is lying.' Given exactly one statement is true, who is guilty?",
    "Analyze the Saint Petersburg paradox: state the expected value calculation, explain why a rational agent might not pay an infinite price to play, and describe two resolutions.",
    "A manufacturing process has a 2% defect rate. Using the Poisson approximation, find the probability that a batch of 200 items has more than 6 defects.",
    "Evaluate the validity and soundness of the ontological argument for the existence of God as formulated by Anselm. Identify the logical form and the most compelling objection.",
  ],

  code_generation: [
    // --- simple (1-20) ---
    "Write a Python function that implements binary search on a sorted list. Include edge cases and a docstring.",
    "Write a TypeScript function that debounces an async function call with configurable delay and immediate option.",
    "Implement a Go function that concurrently fetches multiple URLs using goroutines and returns all results with individual errors.",
    "Write a SQL query to find the top 3 customers by total purchase amount in the last 30 days, including tie-breaking.",
    "Create a React hook called usePagination that manages page, pageSize, totalItems state and returns navigation functions.",
    "Write a Python function to reverse a string without using built-in reverse functions.",
    "Write a JavaScript function that flattens a nested array to any depth.",
    "Implement a stack in Python using a list with push, pop, peek, and is_empty methods.",
    "Write a SQL query to count the number of rows in each table of a database.",
    "Write a Bash script that loops over all .txt files in a directory and prints their line counts.",
    "Write a Python function to check if a given string is a palindrome.",
    "Implement a linked list node and a function to insert at the head in Java.",
    "Write a TypeScript interface for a generic API response wrapper with status, data, and error fields.",
    "Write a Python function to find all duplicates in a list.",
    "Write a SQL query to find all employees who earn more than their manager.",
    "Write a CSS class that centers a div both horizontally and vertically using Flexbox.",
    "Write a shell script that monitors a log file and alerts when the word 'ERROR' appears.",
    "Write a Python one-liner to calculate the factorial of n using functools.",
    "Write a JavaScript function that deep-clones an object without using JSON.parse/JSON.stringify.",
    "Write a Go struct and method to serialize it to JSON and back.",
    // --- intermediate (21-70) ---
    "Write a Python decorator that retries a function up to n times on exception, with exponential backoff.",
    "Implement a LRU cache in Python using only built-in data structures (no functools.lru_cache).",
    "Write a TypeScript generic function that groups an array of objects by a specified key.",
    "Write a SQL window function query to calculate a 7-day rolling average of daily sales.",
    "Implement merge sort in Rust. Handle the Vec<i32> case with no unsafe code.",
    "Write a React component that fetches paginated data from an API, handles loading and error states, and supports infinite scroll.",
    "Write a Python context manager that measures and logs execution time of a code block.",
    "Implement a trie data structure in JavaScript with insert, search, and startsWith methods.",
    "Write a Go middleware function for an HTTP server that validates a JWT token and extracts claims.",
    "Write a SQL query using CTEs to find the second highest salary in each department.",
    "Write a Python function to parse a CSV file with quoted fields and return a list of dicts.",
    "Implement a thread-safe counter in Java using AtomicInteger, synchronized, and compare the approaches.",
    "Write a TypeScript utility type that makes all properties of an object deeply readonly.",
    "Write a Redis-backed rate limiter in Python using the sliding window algorithm.",
    "Write a Python async function that fetches data from 5 URLs concurrently using asyncio and aiohttp.",
    "Write a PostgreSQL function that calculates the median of a column for a given table and column name.",
    "Implement the observer design pattern in TypeScript with typed events and subscriber management.",
    "Write a Python script that walks a directory tree and deduplicates files by MD5 hash.",
    "Write a Go function that implements a concurrent worker pool that processes jobs from a channel.",
    "Write a SQL trigger that logs every UPDATE to a users table into an audit_log table.",
    "Implement a priority queue in Python using heapq that supports task cancellation.",
    "Write a JavaScript function that memoizes any pure function, with a maximum cache size using LRU eviction.",
    "Write a Python class that wraps a third-party API client with automatic retry, timeout, and circuit-breaker logic.",
    "Implement a simple expression parser in Python that evaluates strings like '3 + 4 * 2 - 1'.",
    "Write a TypeScript function that takes a nested object and returns a flat map of dot-notation keys to values.",
    "Write a SQL query that pivots a key-value table into a wide-format table with one row per entity.",
    "Write a Go function to implement a consistent hash ring for distributing keys across N nodes.",
    "Implement a read-through cache in Python: on cache miss, fetch from a slow source, cache, and return.",
    "Write a React custom hook useWebSocket that manages a WebSocket connection with reconnect logic.",
    "Write a Python generator that yields chunks of a large file without reading it all into memory.",
    "Write a TypeScript function that implements a simple pub/sub event bus with typed events.",
    "Implement a bloom filter in Python: constructor with desired false-positive rate and expected element count.",
    "Write a SQL recursive CTE to traverse a hierarchical employee-manager table and compute depth.",
    "Implement a Python function that safely evaluates math expressions from a string without using eval().",
    "Write a Kotlin coroutine function that calls three APIs in parallel and returns a combined result.",
    "Write a Go HTTP handler that streams a large JSON array to the client line by line.",
    "Write a Python function to detect cycles in a directed graph using DFS.",
    "Implement a simple tokenizer in Python that splits code into tokens (identifiers, numbers, operators).",
    "Write a SQL query to find pairs of products frequently bought together (co-occurrence in orders).",
    "Write a TypeScript function that parses a URL query string into a typed object with default values.",
    "Implement the command design pattern in Python with undo/redo support.",
    "Write a Python script that diffs two JSON files and reports added, removed, and changed keys.",
    "Write a Go function that rate-limits outbound HTTP requests using a token bucket.",
    "Write a React hook useDebouncedSearch that calls an async search API and handles race conditions.",
    "Implement a simple event sourcing store in TypeScript: append events, replay to compute state.",
    "Write a Python function to topologically sort a DAG, raising an error if a cycle is detected.",
    "Write a SQL function to calculate the Levenshtein distance between two strings.",
    "Write a Python class implementing a fixed-size sliding window over a data stream that tracks min, max, and mean.",
    "Write a Go function that parses a config file in TOML format and validates required fields.",
    // --- complex (71-100) ---
    "Design and implement a generic dependency injection container in TypeScript that supports singleton and transient lifetimes, circular dependency detection, and factory functions.",
    "Implement a distributed rate limiter in Python using Redis Lua scripts that works correctly under concurrent load from multiple servers.",
    "Write a Go implementation of a write-ahead log (WAL) that ensures durability: entries are appended to disk before acknowledging writes, with crash recovery.",
    "Implement a full B-tree in Python (insertion, deletion, search) with a configurable order. Explain the time complexity of each operation.",
    "Write a TypeScript implementation of a reactive state management library (similar to MobX) that supports observables, computed values, and reactions with automatic dependency tracking.",
    "Implement a concurrent, lock-free queue in Go using only atomic operations. Explain why your implementation is correct under the Go memory model.",
    "Write a Python implementation of a mini-language interpreter: define a grammar for arithmetic expressions with variables, implement a lexer, recursive descent parser, and evaluator.",
    "Design and implement a Python library for differential privacy: implement the Laplace mechanism and use it to answer histogram queries with a given privacy budget ε.",
    "Write a Rust function that implements the PBKDF2 key derivation function from scratch (no external crates) using HMAC-SHA256, with correct padding and endianness.",
    "Implement a Python async task scheduler that supports: cron-style scheduling, rate limiting per task type, dependency chains between tasks, and graceful shutdown.",
    "Write a TypeScript ORM-like query builder that supports: chained where/select/join clauses, parameterized queries (SQL injection safe), and type-safe result mapping.",
    "Implement a consistent hashing ring in Go that supports virtual nodes, weighted distribution, and node addition/removal with minimal key remapping.",
    "Write a Python implementation of the Raft consensus algorithm covering: leader election, log replication, and commitment. Focus on the core state machine transitions.",
    "Design a Python library for data validation with a schema DSL: nested types, custom validators, cross-field constraints, and detailed error reporting at each field path.",
    "Implement a zero-copy network protocol parser in Rust: parse a custom binary framing protocol with fixed header, variable-length body, and checksum validation.",
    "Write a full implementation of a thread pool in C-style Go (without goroutines): use OS threads via cgo, a work queue, and proper shutdown synchronization.",
    "Implement a Python library for symbolic differentiation: support basic arithmetic, trig functions, and apply the chain rule. Include simplification rules.",
    "Write a TypeScript implementation of a structural pattern-matching engine that matches nested object trees against a schema and extracts bound variables.",
    "Implement a Python CRDT (Conflict-free Replicated Data Type) for a distributed counter that correctly handles concurrent increments from multiple nodes with merge semantics.",
    "Design a Python framework for saga-pattern orchestration: define multi-step distributed transactions with compensating actions, timeouts, and exactly-once semantics using an event store.",
    "Write a Go implementation of a two-phase commit (2PC) coordinator and participant for a distributed transaction, handling the prepared, commit, and abort phases with timeout handling.",
    "Implement a Python compiler front-end for a simple statically typed language: lexer, parser (producing an AST), type checker, and code generator that outputs Python bytecode instructions.",
    "Write a TypeScript implementation of a reactive stream library (similar to RxJS) supporting: Observable, map, filter, flatMap, merge, and take operators with proper backpressure.",
    "Implement a Python simulation of a B+ tree used in database engines: leaf nodes as a linked list, internal node fan-out, range queries, and bulk loading from a sorted sequence.",
    "Write a Go service that implements optimistic concurrency control using versioned rows: read-modify-write with version check, conflict detection, and exponential-backoff retry.",
    "Design and implement a Python plugin system: plugins are Python files dropped into a directory, are discovered at runtime, register capabilities, and can depend on each other.",
    "Implement a TypeScript library for property-based testing (like fast-check): define generators for primitives and combinators, run n random trials, and shrink failing cases.",
    "Write a Python implementation of a skip list with O(log n) insert, delete, and search. Explain the probabilistic height assignment and expected complexity proof.",
    "Implement a Go in-memory time-series database: stores timestamped float64 values per metric, supports range queries with downsampling (min/max/mean per interval), and evicts old data.",
    "Write a full Python implementation of a mini relational database engine: in-memory table storage, a SQL-like query language parser (SELECT, WHERE, JOIN, GROUP BY), and a query planner.",
  ],

  multi_step_problem: [
    // --- simple (1-20) ---
    "Plan a complete 7-day machine learning project: from problem definition and data collection to model deployment. Give concrete daily steps.",
    "A startup has a $50,000 budget and needs a mobile app, REST API backend, and 6 months of cloud hosting. Break down realistic costs and build priorities.",
    "Design a PostgreSQL schema for a multi-tenant SaaS application with users, organizations, subscriptions, and a full audit log. Show the CREATE TABLE statements.",
    "How would you debug a production API that intermittently returns HTTP 500 errors under load? Walk through your complete methodology from detection to resolution.",
    "Outline all steps to migrate a monolithic Node.js application to microservices with zero downtime. Include rollback strategy.",
    "List the steps to set up a CI/CD pipeline for a Python web application using GitHub Actions.",
    "What are the steps to conduct a proper code review? List each phase and what to look for.",
    "Outline the phases of the software development lifecycle (SDLC) for a new feature request.",
    "List the steps to deploy a containerized web application to AWS ECS from scratch.",
    "How do you handle a database migration in production with minimal downtime?",
    "What is the process to onboard a new software engineer to a large codebase?",
    "Describe the steps to investigate and resolve a memory leak in a running Java application.",
    "Outline the steps to implement GDPR data deletion for a web application.",
    "What is the process for conducting a penetration test on a web application?",
    "List the steps to set up monitoring and alerting for a production microservices deployment.",
    "What steps would you take to reduce the build time of a slow CI pipeline from 40 minutes to under 10?",
    "Outline the process for creating and publishing an open-source Python library to PyPI.",
    "Describe the steps to implement dark mode for an existing web application.",
    "What is the methodology for estimating the engineering effort for a new feature?",
    "List the steps for a smooth A/B test rollout of a new checkout flow on an e-commerce site.",
    // --- intermediate (21-70) ---
    "Design the complete architecture for a real-time chat application supporting 100,000 concurrent users. Include components, data flow, and scaling strategy.",
    "A data science team has a model in a Jupyter notebook. Outline the complete path to production: refactoring, testing, containerization, deployment, and monitoring.",
    "You inherit a legacy PHP application with no tests, running on bare-metal servers. Create a phased 12-month modernization plan.",
    "Design the system architecture for a ride-sharing application. Cover matching algorithm, real-time tracking, payments, and surge pricing.",
    "A B2B SaaS company wants to add a REST API for external developers. Plan the entire API program: design, documentation, versioning, authentication, and rate limiting.",
    "Design a data warehouse architecture for a retail company with 50 stores. Include ETL pipeline, schema design, and reporting layer.",
    "Your team needs to implement role-based access control (RBAC) for a complex enterprise application. Plan the data model, API changes, and UI updates.",
    "A mobile app's crash rate spikes to 5% after a release. Walk through a complete investigation and remediation process.",
    "Design a complete observability stack for a microservices application: logging, metrics, tracing, and on-call runbook.",
    "Plan the migration of a MySQL database to PostgreSQL for a high-traffic e-commerce site, maintaining zero downtime.",
    "A company wants to implement a recommendation system. Walk through every step from data collection and model selection to A/B testing and production serving.",
    "Design a complete fraud detection system for a payments platform: data pipeline, ML model, rule engine, case management, and feedback loop.",
    "Plan and implement a disaster recovery strategy for a cloud-based SaaS product with an RTO of 1 hour and RPO of 15 minutes.",
    "A mobile app needs to support offline-first functionality. Design the complete sync architecture, conflict resolution, and UI feedback.",
    "Design the architecture for a multi-region deployment of a REST API with active-active failover and global load balancing.",
    "Plan a complete DevSecOps transformation for a team currently with no security practices in their CI/CD pipeline.",
    "A startup is experiencing database performance issues as it scales to 1M users. Create a phased scaling plan from single-instance to sharded multi-region.",
    "Design the complete technical architecture for a healthcare patient portal with HIPAA compliance requirements.",
    "A team needs to split a large monolithic service into independent microservices without disrupting production. Plan the strangler fig migration.",
    "Design an event-driven architecture for an e-commerce order management system. Include event schema, guaranteed delivery, and saga pattern for distributed transactions.",
    "Create a complete plan to reduce technical debt in a large codebase: assessment, prioritization, team buy-in, and execution without halting feature development.",
    "Design a complete ML platform: feature store, training pipeline, model registry, serving infrastructure, and monitoring for a team of 20 data scientists.",
    "Plan a complete GDPR compliance audit and remediation for a SaaS company that has never addressed data privacy before.",
    "Design the real-time analytics pipeline for a gaming platform tracking 10M daily active users: ingestion, processing, storage, and dashboards.",
    "A company wants to migrate from a self-hosted Kubernetes cluster to a fully managed cloud solution. Design the migration plan with risk assessment.",
    "Plan the architecture and rollout of a new search feature for an e-commerce platform: indexing strategy, search algorithm, ranking, and testing.",
    "Design the complete backend for a video streaming platform: upload, transcoding, CDN strategy, adaptive bitrate, and DRM.",
    "A fintech company needs to implement real-time payment processing. Design the complete system: ledger design, idempotency, reconciliation, and fraud controls.",
    "Plan the implementation of a customer data platform (CDP) for a retail company: data collection, identity resolution, segmentation, and activation.",
    "Design the complete observability and SRE practice for a 5-person startup scaling to 50 engineers: SLOs, error budgets, incident management, and postmortem culture.",
    "A company receives 1TB of IoT sensor data daily. Design the complete ingestion, processing, storage, and analytics pipeline.",
    "Plan a complete zero-trust network access (ZTNA) implementation for a remote-first company with 500 employees.",
    "Design the system for a multi-player real-time strategy game: game state synchronization, cheat prevention, matchmaking, and spectator mode.",
    "A large company wants to centralize AI/ML infrastructure. Design the complete internal ML platform from data cataloguing to model deployment.",
    "Plan the implementation of a graph-based recommendation engine for a social network: data model, algorithm, serving, and cold-start handling.",
    "Design the complete backend for a document collaboration tool (like Google Docs): CRDT-based sync, version history, permissions, and real-time cursors.",
    "A company is moving to a composable commerce architecture. Plan the migration from a legacy monolithic e-commerce platform, covering each bounded context.",
    "Design a self-healing Kubernetes deployment: health checks, auto-scaling, pod disruption budgets, circuit breakers, and graceful degradation.",
    "Plan the data governance framework for a large enterprise: data catalog, lineage tracking, access policies, data quality metrics, and ownership model.",
    "Design a complete system for A/B testing at scale: experiment design, feature flagging, assignment, metrics collection, statistical analysis, and guardrail checks.",
    "A company wants to implement LLM-powered features in their product. Design the complete integration: prompt management, caching, fallback models, cost control, and safety layers.",
    "Plan the migration of a legacy desktop application to a cloud-native SaaS product: architecture redesign, data migration, customer transition, and pricing model.",
    "Design the complete backend for a supply chain management system: inventory tracking, demand forecasting, supplier management, and logistics optimization.",
    "A company has 50 microservices with no standardized API contracts. Plan the implementation of a service mesh and API gateway.",
    "Design the complete system for an AI-powered customer support platform: ticket ingestion, intent classification, knowledge base, human escalation, and feedback loop.",
    "Plan the technical due diligence process for a software acquisition: code quality, architecture, security, scalability, and team assessment.",
    "Design the complete backend for a financial reporting system: multi-currency ledger, fiscal period management, regulatory reporting, and audit trail.",
    "A company needs to implement a secrets management system. Design the architecture: vault setup, rotation policy, dynamic credentials, and break-glass procedures.",
    "Plan the complete implementation of a machine learning feature store: offline store, online store, feature computation, time-travel queries, and serving infrastructure.",
    // --- complex (71-100) ---
    "Design the complete technical architecture for a global-scale distributed database that provides ACID transactions, geo-replication, automatic sharding, and a SQL interface. Cover the consensus protocol, leader election, and schema management.",
    "A large bank wants to migrate its core banking system (running on IBM mainframes) to a modern cloud-native architecture without service interruption. Design the complete 5-year migration plan with phases, risk mitigation, and rollback strategy at each stage.",
    "Design the complete system for a global content delivery network from scratch: edge node selection, cache invalidation, anycast routing, certificate management, and origin protection.",
    "Plan the complete implementation of an autonomous vehicle data pipeline: sensor data ingestion (LiDAR, camera, radar), real-time processing, fleet telemetry, ground truth labelling, and model retraining loop.",
    "Design a complete zero-knowledge proof system for a privacy-preserving identity verification product: circuit design, proving system selection, verification smart contract, and UX integration.",
    "A global payment network processes 50,000 TPS. Design the complete architecture for horizontal scaling: sharding strategy, cross-shard transactions, settlement, and regulatory compliance across 30 jurisdictions.",
    "Design the complete system for a real-time collaborative code editor supporting 10,000 concurrent users per document: CRDT implementation, operational transform fallback, presence, language server integration, and execution sandboxes.",
    "Plan the complete digital transformation of a government healthcare system: legacy data migration, interoperability (HL7 FHIR), patient identity resolution, security, and clinical workflow digitization.",
    "Design the complete infrastructure for a quantum computing cloud service: job queuing, error mitigation, hybrid classical-quantum workflow, result caching, and billing.",
    "A ride-sharing company wants to build a real-time dynamic pricing system for 200 cities with different supply-demand curves, regulatory constraints, and competitor awareness. Design every component from data feeds to driver and rider notification.",
    "Design the complete architecture for a decentralized social network: peer-to-peer identity, content addressing, moderation without central authority, and data portability.",
    "Plan the 3-year technical roadmap for transforming a struggling software consultancy into a product company: team restructuring, IP creation, platform development, go-to-market, and financial modeling.",
    "Design the complete system for a high-frequency trading platform: co-location strategy, FPGA-based market data processing, order management, risk controls, and regulatory reporting at sub-microsecond latency.",
    "A media company ingests 500 hours of video per hour. Design the complete processing pipeline: ingest, transcoding, content moderation (AI + human), metadata extraction, search indexing, and multi-CDN delivery.",
    "Design the complete architecture for a federated machine learning platform: privacy-preserving aggregation, differential privacy budgeting, client selection, model versioning, and auditability.",
    "Plan the complete implementation of a PCI DSS Level 1 compliant payment processing system from scratch: network segmentation, encryption, key management, tokenization, and annual audit process.",
    "Design the complete system for an AI-powered scientific literature discovery tool: paper ingestion (100M papers), embedding, semantic search, citation graph, hypothesis generation, and expert review integration.",
    "A logistics company operates a fleet of 50,000 vehicles globally. Design the complete system for real-time route optimization considering: traffic, weather, vehicle capacity, time windows, driver hours-of-service regulations, and multi-depot coordination.",
    "Design the complete architecture for a sovereign cloud offering: data residency guarantees, tenant isolation at hardware level, key escrow, compliance automation, and government audit interfaces.",
    "Plan the technical and organizational implementation of a company-wide platform engineering function: internal developer platform, golden paths, self-service infrastructure, and measuring developer experience.",
    "Design the complete system for a real-time election results aggregation and visualization platform: secure data collection from 100,000 polling stations, anomaly detection, projection algorithms, and public API.",
    "A healthcare AI company needs to validate an LLM-based diagnostic assistant in a regulated environment. Design the complete validation framework: dataset curation, bias assessment, clinical trial design, regulatory submission, and post-market surveillance.",
    "Design the complete architecture for a global messaging platform supporting end-to-end encryption, offline delivery, group chats of 100,000 members, and multimedia. Address the key distribution problem at scale.",
    "Plan the complete implementation of a carbon accounting platform for a Fortune 500 company: scope 1/2/3 data collection, calculation methodology, third-party verification, reporting, and reduction tracking.",
    "Design the complete system for a large-scale simulation engine used for training autonomous systems: physics simulation, sensor simulation, scenario generation, parallel execution across GPU clusters, and reality-gap calibration.",
    "A country wants to launch a central bank digital currency (CBDC). Design the complete technical architecture: issuance, distribution, transaction validation, privacy model, offline capability, and interoperability with existing payment systems.",
    "Design the complete technical infrastructure for a generative AI art marketplace: model hosting, inference optimization, watermarking, copyright detection, creator attribution, royalty distribution, and NFT integration.",
    "Plan the complete implementation of a corporate knowledge management system using RAG: document ingestion, chunking strategy, embedding, hybrid search, access control propagation, answer generation, and citation verification.",
    "Design the complete system for an AI-driven personalized learning platform: learner model, content graph, adaptive sequencing, knowledge tracing, spaced repetition, instructor dashboards, and accreditation integration.",
    "A company wants to build a universal data integration platform (like Fivetran). Design the complete architecture: connector framework, change data capture, schema evolution, data quality enforcement, lineage tracking, and SLA monitoring.",
  ],

  knowledge_retrieval: [
    // --- simple (1-20) ---
    "Explain the difference between transformer attention mechanisms: self-attention, cross-attention, and multi-head attention. When is each used?",
    "What is the CAP theorem? Explain the three properties and give a real-world example of a system that prioritizes each combination.",
    "Explain how the Raft consensus algorithm achieves distributed agreement and how it handles a leader failure mid-transaction.",
    "What distinguishes BERT from GPT architectures in terms of training objective, attention masking, and primary use cases?",
    "Explain Bayesian inference from scratch: what are prior, likelihood, and posterior, and how does Bayes' theorem connect them?",
    "What is the difference between supervised, unsupervised, and reinforcement learning?",
    "What is a foreign key, and how does it enforce referential integrity in a relational database?",
    "Explain the difference between TCP and UDP. When would you choose each?",
    "What is the difference between a stack and a heap in memory management?",
    "What is OAuth 2.0 and how does the authorization code flow work?",
    "Explain the difference between symmetric and asymmetric encryption with an example of each.",
    "What is a REST API and what are its six architectural constraints?",
    "What is the difference between a process and a thread?",
    "What does ACID stand for in database transactions? Define each property.",
    "What is the purpose of the OSI model? Name and describe each layer.",
    "What is Docker and how does it differ from a virtual machine?",
    "What is Big O notation? Give an example of O(1), O(log n), O(n), and O(n²) algorithms.",
    "What is a hash table, and how does it handle collisions?",
    "What is the difference between horizontal and vertical scaling?",
    "What is a deadlock in operating systems, and what are the four conditions required for one to occur?",
    // --- intermediate (21-70) ---
    "Explain how gradient descent works, including the role of the learning rate and the difference between batch, stochastic, and mini-batch variants.",
    "What is the difference between L1 and L2 regularization? When would you use each, and how do they affect the loss function?",
    "Explain the attention mechanism in transformers from first principles: the queries, keys, and values formulation and the scaled dot-product computation.",
    "What is the CAP theorem's relevance to modern distributed databases? Explain how systems like Cassandra, Spanner, and DynamoDB position themselves.",
    "Explain how MVCC (Multi-Version Concurrency Control) works in PostgreSQL and how it enables non-blocking reads.",
    "What are the SOLID principles in object-oriented design? Give a concrete violation of each and how to correct it.",
    "Explain how public-key infrastructure (PKI) and TLS certificates work: the certificate chain, CA trust, and the TLS handshake.",
    "What is the difference between eventual consistency and strong consistency? Give a practical example where each is appropriate.",
    "Explain how Kubernetes achieves container orchestration: the control plane components and their roles.",
    "What is the difference between normalization (1NF, 2NF, 3NF, BCNF) and denormalization? When do you prefer each?",
    "Explain how the Linux kernel handles process scheduling: the Completely Fair Scheduler (CFS) and how it prioritizes processes.",
    "What is the difference between a convolutional neural network (CNN) and a recurrent neural network (RNN)? When is each appropriate?",
    "Explain how consistent hashing works and why it is used in distributed caches and databases.",
    "What is a bloom filter, what are its properties (false positive rate, false negatives), and name two practical uses?",
    "Explain the difference between optimistic and pessimistic locking in databases. When does each strategy perform better?",
    "What is eventual consistency in distributed systems and how does the BASE model differ from ACID?",
    "Explain how the Diffie-Hellman key exchange allows two parties to establish a shared secret over an insecure channel.",
    "What is the difference between a data warehouse, a data lake, and a data lakehouse?",
    "Explain how garbage collection works in the JVM: generational GC, the Eden space, and the different GC algorithms (G1, ZGC).",
    "What is the transformer architecture's positional encoding, and why is it necessary?",
    "Explain how message queues differ from message brokers. Compare Kafka and RabbitMQ architectures.",
    "What is the difference between a proxy and a reverse proxy? What is an API gateway and how does it extend the reverse proxy pattern?",
    "Explain how the B-tree data structure works and why it is preferred over a binary search tree for database indexes.",
    "What is the difference between a monolith, a SOA, and microservices? What are the tradeoffs of each?",
    "Explain how MapReduce works conceptually, and then explain how Spark improves upon it.",
    "What is a vector database? How does approximate nearest neighbor (ANN) search work and what algorithms are commonly used?",
    "Explain how HTTPS certificate pinning works and when it should and should not be used.",
    "What is the difference between eager loading and lazy loading in an ORM? When can lazy loading cause performance problems?",
    "Explain how a compiler works: the stages from source code to machine code (lexing, parsing, semantic analysis, optimization, code generation).",
    "What is the difference between synchronous and asynchronous I/O, and how does Node.js implement non-blocking I/O using the event loop?",
    "Explain the concept of a service mesh: what problems it solves and how sidecar proxies like Envoy implement observability and traffic management.",
    "What is the difference between OAuth and OpenID Connect? How does OIDC extend OAuth 2.0 to support authentication?",
    "Explain how the PageRank algorithm works at a conceptual level and what it assumes about the structure of the web.",
    "What is the difference between precision, recall, F1 score, and AUC-ROC? When is each the right metric to optimize?",
    "Explain how QUIC improves upon TCP/HTTP2: the key problems it solves (head-of-line blocking, connection migration, 0-RTT).",
    "What is transfer learning in deep learning, and what are fine-tuning and prompt tuning approaches?",
    "Explain the concept of the actor model for concurrency: how actors communicate, what guarantees they provide, and compare with shared-memory threading.",
    "What is CQRS (Command Query Responsibility Segregation)? How does it complement event sourcing?",
    "Explain how differential privacy works: the formal definition, the Laplace mechanism, and the privacy budget.",
    "What is the difference between a data mesh and a data lake? What organizational principles does a data mesh require?",
    "Explain the concept of a foreign data wrapper in PostgreSQL and when you would use it.",
    "What is a Bloom filter hierarchy (Bloom trees), and how is it used in genomics or network security?",
    "Explain how the PBFT (Practical Byzantine Fault Tolerance) consensus algorithm works and what type of faults it tolerates.",
    "What is model quantization in machine learning? Explain the difference between post-training quantization and quantization-aware training.",
    "Explain what zero-knowledge proofs are, the difference between interactive and non-interactive proofs, and a real-world application.",
    "What is the Paxos consensus algorithm? Explain the roles of proposers, acceptors, and learners and the two phases.",
    "Explain the concept of backpressure in reactive systems: what happens without it and how it is implemented.",
    "What is data lineage, why is it important for data governance, and how is it captured in modern data platforms?",
    "Explain how BERT's pre-training objectives (Masked Language Modeling and Next Sentence Prediction) make it suitable for downstream NLP tasks.",
    // --- complex (71-100) ---
    "Explain the complete mathematical derivation of the scaled dot-product attention mechanism in transformers, including why the scaling factor 1/√d_k is used and how multi-head attention aggregates multiple representation subspaces.",
    "Compare the architectural differences, training objectives, and empirical tradeoffs among GPT-4, PaLM 2, Claude 3, and Llama 3, covering model size, context length, instruction following, and safety training approaches.",
    "Explain how the Google Spanner database achieves external consistency using TrueTime. Cover the commit wait mechanism, uncertainty intervals, and why this is stronger than serializability.",
    "Describe the complete theoretical underpinnings of the No Free Lunch theorem in machine learning. What does it say about algorithm selection, and what are its practical implications for model evaluation?",
    "Explain the complete lifecycle of a neural network training run: initialization strategies (Xavier, He), forward pass, loss computation, backward pass, gradient clipping, mixed-precision training, and distributed training with gradient accumulation.",
    "Compare and contrast the storage engines of MySQL InnoDB and PostgreSQL: buffer pool management, MVCC implementation, vacuum process, WAL, and how each handles high write throughput.",
    "Explain the mathematical foundations of variational autoencoders (VAEs): the ELBO objective, the reparameterization trick, and how the KL divergence term acts as regularization.",
    "Describe the complete security model of the Ethereum Virtual Machine (EVM): smart contract isolation, gas metering, reentrancy attacks, and the mitigations introduced in each major EIP.",
    "Explain how retrieval-augmented generation (RAG) systems work end-to-end: document chunking strategies, embedding models, vector similarity search, re-ranking, and context window management during generation.",
    "Compare Byzantine fault tolerance with crash fault tolerance: the mathematical limits (f failures tolerated), why BFT requires 3f+1 nodes vs 2f+1 for CFT, and practical deployments.",
    "Explain the theory behind causal inference: potential outcomes framework, average treatment effect, instrumental variables, regression discontinuity, and difference-in-differences, with an example for each.",
    "Describe the full architecture of a modern columnar storage engine (Apache Parquet): row groups, column chunks, dictionary encoding, RLE, bit packing, bloom filter pages, and predicate pushdown.",
    "Explain how language model fine-tuning with RLHF works: the three stages (SFT, reward model training, PPO), why PPO is used, and the role of the KL divergence penalty against the reference model.",
    "Compare the consistency models available in Apache Cassandra: eventual consistency, tunable consistency (ONE, QUORUM, ALL), lightweight transactions (Paxos), and their latency-availability tradeoffs.",
    "Explain the mathematical foundations of differential privacy: ε-δ differential privacy, the composition theorems (sequential and parallel), the Gaussian mechanism, and the privacy-utility tradeoff in practice.",
    "Describe how modern CPUs achieve instruction-level parallelism: out-of-order execution, register renaming, branch prediction (tournament predictors), speculative execution, and the security implications (Spectre, Meltdown).",
    "Explain the complete theory of support vector machines: the primal and dual formulations, the KKT conditions, the kernel trick, and how the soft-margin SVM handles non-separable data.",
    "Compare the internal architectures of Redis, Memcached, and Hazelcast: data structures, persistence models, clustering approaches, replication, and appropriate use cases for each.",
    "Explain how Kubernetes' control plane ensures desired state: the reconciliation loop, etcd as the source of truth, the role of informers and work queues in each controller, and the consequences of etcd partitioning.",
    "Describe the full theory of the MapReduce programming model: the formal semantics, the distributed shuffle phase, combiner optimization, speculative execution, and why it was superseded by systems like Spark and Flink.",
    "Explain how large language models can be evaluated: intrinsic metrics (perplexity), extrinsic benchmarks (MMLU, HumanEval, MT-Bench), LLM-as-judge methodology, human preference studies, and their respective biases.",
    "Describe the complete cryptographic stack underlying TLS 1.3: the supported cipher suites, the key derivation schedule (HKDF), the handshake transcript, 0-RTT resumption, and forward secrecy guarantees.",
    "Explain the CRDT (Conflict-free Replicated Data Type) theory: the lattice structure requirement, G-counters, PN-counters, LWW-registers, OR-sets, and the formal proof that merge is associative, commutative, and idempotent.",
    "Compare the query optimization strategies of PostgreSQL's planner: cost model, statistics (pg_statistic), join ordering (dynamic programming vs. genetic algorithm), parallel query, and partition pruning.",
    "Explain the complete mathematical theory of reinforcement learning: the Bellman equation, value iteration, policy gradient theorem, the actor-critic architecture, and proximal policy optimization (PPO).",
    "Describe the full security model of JWT (JSON Web Tokens): the structure, signature algorithms (HS256 vs RS256 vs ES256), common vulnerabilities (algorithm confusion, none algorithm), and best practices.",
    "Explain how modern deep learning frameworks implement automatic differentiation: the computation graph, forward and backward passes, the chain rule implementation in PyTorch's autograd, and gradient checkpointing for memory efficiency.",
    "Compare the internals of Apache Kafka and Apache Pulsar: partition model vs. segment model, consumer group vs. subscription model, storage layer, multi-tenancy, geo-replication, and throughput benchmarks.",
    "Explain the theory and practice of model distillation in machine learning: knowledge distillation loss (soft targets + temperature), feature-level distillation, and how DistilBERT and TinyBERT apply these techniques.",
    "Describe the complete threat model for a multi-tenant SaaS application: noisy-neighbour attacks, IDOR vulnerabilities, tenant data isolation techniques (row-level security, schema isolation, database isolation), and the security-cost tradeoffs.",
  ],

  creative_synthesis: [
    // --- simple (1-20) ---
    "Write a technical blog post introduction (150 words) explaining why multi-model AI orchestration matters for production AI systems.",
    "Propose three novel research directions that could improve LLM reasoning reliability and reduce hallucination in multi-step tasks.",
    "Write an analogy explaining how Bayesian trust updates work to a non-technical business stakeholder who understands investing.",
    "Design a product name, tagline, and 3-sentence elevator pitch for an AI governance platform targeting Fortune 500 enterprises.",
    "Summarize the key engineering tradeoffs between model accuracy, inference cost, and response latency in production AI deployments.",
    "Write a one-paragraph analogy explaining how a database index works to a non-technical audience.",
    "Propose a name and brief description for a startup that solves the problem of AI model drift in production.",
    "Write a tweet-length (280 characters) explanation of why distributed systems are hard.",
    "Suggest three creative ways a small software team could reduce technical debt without stopping feature delivery.",
    "Write a short (100-word) metaphor explaining recursion to a child.",
    "Design a mascot and personality for a developer productivity tool aimed at junior engineers.",
    "Write a haiku about software debugging.",
    "Propose a catchy name and slogan for a conference about responsible AI.",
    "Summarize the main benefits of open-source software in three compelling bullet points for a business audience.",
    "Write a short analogy explaining why immutable infrastructure is better than mutable servers using a real-world metaphor.",
    "Propose three creative workshop activities to improve cross-functional communication between engineers and product managers.",
    "Write a 50-word description of the microservices pattern suitable for a business case document.",
    "Design a three-question interview rubric for assessing a candidate's system design thinking.",
    "Write a short motivational message for a team experiencing deployment fatigue.",
    "Propose a fun internal company challenge that would improve engineering practices while boosting team morale.",
    // --- intermediate (21-70) ---
    "Write a 300-word technical essay arguing why every software team should invest in internal developer tooling.",
    "Design an analogy that explains the concept of eventual consistency to a financial analyst who understands settlement delays in banking.",
    "Propose five product features for a next-generation IDE that uses LLMs as a core component, beyond simple code completion.",
    "Write a thought leadership piece (250 words) on why AI safety and AI capability research are complementary rather than opposed.",
    "Design a fictional one-day conference agenda for 'DistributedSystems.conf' with five tracks and keynote topics.",
    "Write a 200-word analogy explaining how a load balancer works using the metaphor of a restaurant maitre d'.",
    "Synthesize the key lessons from the history of programming languages and propose what the ideal programming language for AI-native development would look like.",
    "Propose a framework for evaluating the 'technical debt ROI' — quantifying when to pay it down versus when to accept it.",
    "Write a fictional dialogue between a product manager and an engineer negotiating the scope of a new feature under time pressure.",
    "Design a 'health score' for software engineering teams: what five metrics would you track and why?",
    "Propose three novel applications of transformer-based language models outside of text and code (e.g., in science, engineering, or arts).",
    "Write a 250-word argument for why observability should be treated as a first-class product feature, not an afterthought.",
    "Design an analogy that explains the difference between supervised and reinforcement learning using the metaphor of raising a child.",
    "Synthesize the key principles of good API design into a memorable framework or acronym a junior developer could use as a checklist.",
    "Write a fictional memo from a CTO to their board explaining why the company is adopting a platform engineering strategy.",
    "Propose three ways the concept of 'design patterns' could evolve for the era of AI-assisted programming.",
    "Write a 200-word comparison of the 'move fast and break things' versus 'boring technology' philosophies for a startup at Series A.",
    "Design a visual metaphor that would help non-technical stakeholders understand the concept of a CI/CD pipeline.",
    "Propose five ways a data-driven company could reduce its carbon footprint specifically in its data engineering practices.",
    "Write a short story (200 words) that illustrates the danger of survivorship bias in engineering post-mortems.",
    "Design a training program for teaching senior engineers to become effective technical leads, covering both technical and leadership dimensions.",
    "Write a 250-word synthesis of what the 'DevOps movement' has taught us and what the 'Platform Engineering' movement is adding to it.",
    "Propose a novel metric for measuring the 'maintainability' of a codebase beyond cyclomatic complexity and test coverage.",
    "Write a 200-word essay on why documentation is a product, not a task, and how it should be treated in the engineering lifecycle.",
    "Design an analogy explaining how zero-knowledge proofs work to a lawyer who understands attorney-client privilege.",
    "Synthesize the lessons from five major cloud outages into a set of architectural principles for resilient systems.",
    "Propose a 'Hippocratic Oath' for software engineers: what five ethical commitments should every engineer make to society?",
    "Write a 300-word essay on the tradeoffs between explainability and performance in machine learning models, and when each matters.",
    "Design a rubric for evaluating whether a company is ready to adopt machine learning: what organizational, data, and technical conditions must be met?",
    "Propose a framework for 'technical empathy': how should engineers think about the users of their APIs, the operators of their systems, and future maintainers of their code?",
    "Write a 250-word synthesis of how open-source software, cloud computing, and AI are together lowering the barriers to building software companies.",
    "Design a fictional 'Software Engineering Bill of Rights' for developers: what working conditions, tools, and practices should every engineer be entitled to?",
    "Propose three novel interaction paradigms beyond chat that could make AI assistants more useful for knowledge workers.",
    "Write a 200-word essay arguing that the most important skill for a software engineer in 2025 is not coding but systems thinking.",
    "Design a 'red team exercise' framework for testing an AI product for unintended harms before launch.",
    "Synthesize the key differences between product-led growth and sales-led growth for a developer tools company, with specific tactics for each.",
    "Write a 300-word thought piece on whether AI will make software engineers more productive or eliminate the need for most of them.",
    "Propose a research agenda for the next five years for the field of human-computer interaction in the era of LLM-based interfaces.",
    "Design an analogy that explains the concept of a 'moat' in software businesses using a lesson from military history.",
    "Synthesize the key failure modes of agile methodology as commonly practiced and propose three concrete fixes.",
    "Write a 250-word argument for why the 'build vs. buy' decision for internal tooling is not a technical decision but a strategic one.",
    "Propose five ways that blockchain technology could be applied to software supply chain security (beyond cryptocurrency).",
    "Design a fictional 'Engineering Culture Assessment' for a 100-person engineering organization: what ten questions would reveal the most about the culture?",
    "Write a 200-word analogy explaining the concept of 'flow state' in programming using the metaphor of a jazz improvisation session.",
    "Propose a set of 'golden signals' for measuring the health of a developer platform (internal tooling, not user-facing product).",
    "Synthesize the implications of Moore's Law slowing down for software architecture: what design principles become more important?",
    "Write a 300-word essay on why privacy-by-design is better for business than privacy-as-compliance.",
    "Design a gamification system for a coding bootcamp that would encourage students to practice problem-solving under realistic time pressure.",
    "Propose three counterintuitive lessons that experienced engineers could teach junior engineers that are rarely found in textbooks.",
    // --- complex (71-100) ---
    "Write a 500-word essay synthesizing the philosophical tension between the 'AI alignment' school of thought and the 'AI capabilities' school, proposing a framework that treats them as complements rather than adversaries.",
    "Design a comprehensive 'AI Readiness Framework' for enterprises: what organizational, data, process, and governance dimensions must be assessed, and how should the results drive a phased adoption roadmap?",
    "Synthesize the history of programming language design from FORTRAN to Rust, identify the recurring tensions (safety vs. performance, expressiveness vs. simplicity, static vs. dynamic typing), and argue for what the next paradigm shift will be.",
    "Write a 400-word thought leadership piece arguing that the dominant metaphor for AI ('a tool') is inadequate and proposing an alternative metaphor that better captures its societal implications.",
    "Propose a complete pedagogical curriculum for teaching 'AI-native software engineering' to experienced developers: learning objectives, module sequence, project-based learning, and assessment criteria.",
    "Synthesize the key insights from complexity theory, systems thinking, and software architecture to argue for or against the idea that all sufficiently large software systems inevitably become unmaintainable.",
    "Write a 500-word essay on the concept of 'technological debt' at the societal level: how do decisions made in early internet architecture (BGP, DNS, email) impose costs today, and what would re-architecting them require?",
    "Design a 'future of work' scenario for software engineering in 2035 where AI handles 80% of routine coding tasks: what roles, skills, and organizational structures emerge, and what do engineers spend their time doing?",
    "Synthesize the parallels between the development of the printing press and the development of large language models: the analogous societal disruptions, regulatory responses, and long-term knowledge democratization effects.",
    "Write a 400-word essay proposing a new theory of 'software economics': how do concepts like network effects, switching costs, and lock-in apply differently to open-source vs. proprietary software platforms?",
    "Design a complete 'AI Ethics Review Process' for a technology company: what stakeholders are involved, what criteria are evaluated, what documentation is required, and how are decisions escalated?",
    "Synthesize the lessons from five different engineering disciplines (aerospace, civil, electrical, chemical, biomedical) into a set of principles that software engineering has failed to adopt but should.",
    "Write a 500-word scenario analysis of what happens to the software industry if general-purpose AI assistants can autonomously build and deploy production-grade applications end-to-end by 2030.",
    "Propose a complete theory of 'developer experience' (DX): its components, how it should be measured, the ROI model for investing in it, and the organizational conditions under which it thrives.",
    "Synthesize the key architectural decisions that distinguished successful platform companies (AWS, Stripe, Twilio, Shopify) and extract transferable principles for any company considering becoming a platform.",
    "Write a 400-word essay arguing that the concept of 'clean code' is culturally biased and propose a more inclusive framework for evaluating code quality across different engineering cultures and contexts.",
    "Design a 'Technology Strategy Scorecard' for a CTO evaluating whether to build, buy, or open-source a major platform component: what dimensions matter and how should they be weighted?",
    "Synthesize the evidence from cognitive psychology on how expert programmers think differently from novices, and design a training program specifically targeting the mental models that novices most often get wrong.",
    "Write a 500-word essay on the 'great stagnation' hypothesis in software engineering: the argument that productivity has not meaningfully increased despite decades of tool improvement, and a rebuttal.",
    "Propose a complete framework for 'responsible ML deployment' that integrates model governance, data governance, infrastructure governance, and organizational governance into a coherent lifecycle process.",
    "Synthesize the key tensions in distributed systems design (consistency vs. availability, performance vs. correctness, simplicity vs. resilience) and argue for a philosophical approach to navigating them that goes beyond case-by-case engineering judgment.",
    "Write a 400-word thought piece on why the dominant 'fail fast' startup culture may be creating systemic risks in critical infrastructure software, and propose an alternative 'safety-culture' model for certain domains.",
    "Design a complete 'Knowledge Graph of Software Engineering': what are the core concepts, how are they related, what are the most important learning paths, and how could such a graph be used to personalize engineering education?",
    "Synthesize the economic, social, and technical arguments for and against software patents, and propose a reform model that preserves innovation incentives while reducing patent thicket problems.",
    "Write a 500-word essay on the epistemology of software testing: what does a passing test suite actually prove, what can it never prove, and what are the implications for our confidence in deploying software?",
    "Propose a 'Grand Unified Theory of Software Complexity': what are the irreducible sources of complexity in software (à la Fred Brooks), how do they interact, and what interventions have the highest leverage?",
    "Synthesize the key lessons from major open-source project governance failures (OpenSSL, Log4j, leftpad) and design a governance model that balances contributor freedom with systemic reliability.",
    "Write a 400-word essay arguing that 'technical debt' is a flawed metaphor: propose a better metaphor that more accurately captures the organizational, social, and economic dimensions of code quality decline.",
    "Design a comprehensive 'Software Engineering Research Agenda for 2025–2035': what are the ten most important open research problems, why do they matter, and what methodologies would make progress on them?",
    "Synthesize the philosophical implications of the fact that AI systems are now writing significant amounts of production code: what does this mean for code ownership, accountability, software liability law, and the identity of the software engineering profession?",
  ],
};

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function shortQuery(query: string, maxLen = 36): string {
  if (query.length <= maxLen) return query;
  return `${query.slice(0, maxLen - 3)}...`;
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function extractPrimaryResponse(resp: BenchmarkOrchestrateResponse): string {
  const candidates: unknown[] = [];
  candidates.push(resp.answer);
  candidates.push(resp.result);

  if (typeof resp.trace === "object" && resp.trace !== null) {
    const traceObj = resp.trace as Record<string, unknown>;
    candidates.push(traceObj.answer);
    candidates.push(traceObj.result);
  }

  for (const c of candidates) {
    const s = safeString(c).trim();
    if (s.length > 0) return s;
  }
  return "";
}

function firstNumber(obj: unknown, keys: string[]): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function collectModelStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string" && value.trim()) {
    out.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectModelStrings(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;

  const rec = value as Record<string, unknown>;
  if (typeof rec.model_id === "string" && rec.model_id.trim()) out.add(rec.model_id.trim());
  if (typeof rec.modelId === "string" && rec.modelId.trim()) out.add(rec.modelId.trim());
  if (typeof rec.id === "string" && rec.id.trim()) out.add(rec.id.trim());
}

function extractMetrics(resp: BenchmarkOrchestrateResponse): {
  confidence: number;
  models_used: string[];
  subtask_count: number;
} {
  const confidenceKeys = ["consensus_confidence", "confidence", "sigma"];
  const confidence =
    firstNumber(resp, confidenceKeys) ??
    firstNumber(resp.metrics, confidenceKeys) ??
    firstNumber(resp.trace, confidenceKeys) ??
    0.5;

  let subtaskCount =
    firstNumber(resp, ["subtask_count"]) ??
    firstNumber(resp.metrics, ["subtask_count"]) ??
    firstNumber(resp.trace, ["subtask_count"]);
  if (subtaskCount === undefined) {
    const topSubtasks = Array.isArray(resp.subtasks) ? resp.subtasks.length : undefined;
    const traceSubtasks =
      resp.trace && typeof resp.trace === "object" && Array.isArray((resp.trace as Record<string, unknown>).subtasks)
        ? ((resp.trace as Record<string, unknown>).subtasks as unknown[]).length
        : undefined;
    subtaskCount = topSubtasks ?? traceSubtasks ?? 1;
  }

  const models = new Set<string>();
  collectModelStrings((resp as Record<string, unknown>).models, models);
  collectModelStrings((resp as Record<string, unknown>).selected_models, models);
  collectModelStrings((resp as Record<string, unknown>).routing, models);

  if (resp.trace && typeof resp.trace === "object") {
    const traceObj = resp.trace as Record<string, unknown>;
    collectModelStrings(traceObj.models, models);
    collectModelStrings(traceObj.selected_models, models);
    collectModelStrings(traceObj.routing, models);
    collectModelStrings(traceObj.subtasks, models);
  }

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    models_used: [...models],
    subtask_count: Math.max(1, Math.floor(subtaskCount)),
  };
}

function parseEvaluationContent(content: string): QualityScore | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : candidate;

  try {
    const parsed = JSON.parse(jsonText) as Partial<QualityScore>;
    const fields: Array<keyof QualityScore> = [
      "relevance",
      "coherence",
      "completeness",
      "accuracy",
      "overall",
    ];
    for (const field of fields) {
      const value = parsed[field];
      if (typeof value !== "number" || Number.isNaN(value)) return null;
    }
    return {
      relevance: Math.max(0, Math.min(1, parsed.relevance as number)),
      coherence: Math.max(0, Math.min(1, parsed.coherence as number)),
      completeness: Math.max(0, Math.min(1, parsed.completeness as number)),
      accuracy: Math.max(0, Math.min(1, parsed.accuracy as number)),
      overall: Math.max(0, Math.min(1, parsed.overall as number)),
    };
  } catch {
    return null;
  }
}

async function postOrchestrate(
  payload: Record<string, unknown>,
  timeoutMs = TIMEOUT_MS,
): Promise<{ ok: true; data: BenchmarkOrchestrateResponse; latencyMs: number } | { ok: false; latencyMs: number; error: string }> {
  const started = nowMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const latencyMs = nowMs() - started;
    const rawText = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        error: `HTTP ${response.status}: ${rawText.slice(0, 400)}`,
      };
    }

    let data: BenchmarkOrchestrateResponse;
    try {
      data = JSON.parse(rawText) as BenchmarkOrchestrateResponse;
    } catch {
      return { ok: false, latencyMs, error: `Invalid JSON response: ${rawText.slice(0, 400)}` };
    }

    return { ok: true, data, latencyMs };
  } catch (error) {
    const latencyMs = nowMs() - started;
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, latencyMs: timeoutMs, error: `Timeout after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      latencyMs,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestPayload(args: {
  traceId: string;
  domain: DomainName;
  query: string;
  consensusMode: ConsensusMode;
  beamWidth: number;
  explorePaths: boolean;
  temperature: number;
  maxTokens: number;
}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    trace_id: args.traceId,
    domain: args.domain,
    task_kind: DOMAIN_TASK_KIND[args.domain],
    objective: args.query,
    messages: [{ role: "user", content: args.query }],
    constraints: { temperature: args.temperature, max_output_tokens: args.maxTokens },
    consensus_mode: args.consensusMode,
    beam_width: args.beamWidth,
    explore_paths: args.explorePaths,
  };
}

async function evaluateQuality(traceId: string, query: string, responseContent: string): Promise<QualityScore> {
  if (llmJudgeScorer && responseContent.trim().length > 0) {
    try {
      const judged = await llmJudgeScorer.score(query, responseContent);
      return {
        relevance: judged.dimensions.relevance,
        coherence: judged.dimensions.coherence,
        completeness: judged.dimensions.completeness,
        accuracy: judged.dimensions.accuracy,
        overall: judged.overallScore,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[evaluateQuality] LLM judge failed for ${traceId}: ${msg}`);
    }
  }

  const evaluationPrompt = [
    "You are an expert evaluator. Score the following AI response on four dimensions, each from 0.0 to 1.0.",
    'Return ONLY valid JSON with no other text: {"relevance": 0.0, "coherence": 0.0, "completeness": 0.0, "accuracy": 0.0, "overall": 0.0}',
    "",
    `Original question: ${query}`,
    "",
    `Response to evaluate: ${responseContent.slice(0, 800)}`,
  ].join("\n");

  const evalPayload = buildRequestPayload({
    traceId: `eval-${traceId}`,
    domain: "analytical_reasoning",
    query: evaluationPrompt,
    consensusMode: "uniform",
    beamWidth: 1,
    explorePaths: false,
    temperature: 0.1,
    maxTokens: 150,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await postOrchestrate(evalPayload, TIMEOUT_MS);
    if (!result.ok) continue;

    const content = extractPrimaryResponse(result.data);
    const parsed = parseEvaluationContent(content);
    if (parsed) return parsed;
  }
  return FALLBACK_QUALITY;
}

function createFailedQueryResult(index: number, query: string, traceId: string): QueryResult {
  return {
    index,
    query,
    response_excerpt: "",
    full_response: "",
    latency_ms: TIMEOUT_MS,
    quality: {
      relevance: 0,
      coherence: 0,
      completeness: 0,
      accuracy: 0,
      overall: 0,
    },
    consensus_confidence: 0,
    models_used: [],
    subtask_count: 1,
    success: false,
    trace_id: traceId,
  };
}

function summarizeDomain(results: QueryResult[]): DomainSummary {
  const count = results.length || 1;
  const avgQuality = results.reduce((sum, q) => sum + q.quality.overall, 0) / count;
  const avgLatency = results.reduce((sum, q) => sum + q.latency_ms, 0) / count;
  const avgConfidence = results.reduce((sum, q) => sum + q.consensus_confidence, 0) / count;
  const successCount = results.filter((q) => q.success).length;
  let bestQueryIndex = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i].quality.overall > results[bestQueryIndex].quality.overall) {
      bestQueryIndex = i;
    }
  }

  return {
    queries: results,
    avg_quality: round2(avgQuality),
    avg_latency_ms: Math.round(avgLatency),
    avg_confidence: round2(avgConfidence),
    success_rate: round2(successCount / count),
    best_query_index: bestQueryIndex,
  };
}

function buildAggregate(domains: Record<DomainName, DomainSummary>, totalDurationMs: number): BenchmarkResults["aggregate"] {
  const all = (Object.values(domains) as DomainSummary[]).flatMap((d) => d.queries);
  const count = all.length || 1;
  const successCount = all.filter((q) => q.success).length;
  return {
    overall_quality: round2(all.reduce((sum, q) => sum + q.quality.overall, 0) / count),
    overall_latency_ms: Math.round(all.reduce((sum, q) => sum + q.latency_ms, 0) / count),
    overall_success_rate: round2(successCount / count),
    overall_confidence: round2(all.reduce((sum, q) => sum + q.consensus_confidence, 0) / count),
    total_duration_ms: totalDurationMs,
  };
}

function renderResultsTable(results: BenchmarkResults): string {
  const header = "[RESULTS] ══════════════════════════════════════════";
  const cols = "Domain                  Avg Quality  Avg Latency  Success";
  const separator = "─────────────────────────────────────────────────";

  const rows = (Object.entries(results.domains) as Array<[DomainName, DomainSummary]>).map(([domain, summary]) => {
    const success = `${summary.queries.filter((q) => q.success).length}/${summary.queries.length}`;
    return `${domain.padEnd(24)} ${summary.avg_quality.toFixed(2).padEnd(12)} ${`${summary.avg_latency_ms}ms`.padEnd(12)} ${success}`;
  });

  const overallSuccessCount = Object.values(results.domains)
    .flatMap((d) => d.queries)
    .filter((q) => q.success).length;
  const overallCount = Object.values(results.domains).reduce((sum, d) => sum + d.queries.length, 0);
  const overall = `OVERALL                 ${results.aggregate.overall_quality
    .toFixed(2)
    .padEnd(12)} ${`${results.aggregate.overall_latency_ms}ms`.padEnd(12)} ${overallSuccessCount}/${overallCount}`;

  return [header, cols, ...rows, separator, overall, "══════════════════════════════════════════════════"].join("\n");
}

function buildOutputSamplesMarkdown(results: BenchmarkResults): string {
  const lines: string[] = [];
  lines.push("# GAIOL Benchmark — Output Samples", "");

  for (const [domain, summary] of Object.entries(results.domains) as Array<[DomainName, DomainSummary]>) {
    const best = summary.queries[summary.best_query_index] ?? summary.queries[0];
    lines.push(`## Domain: ${domain}`);
    lines.push(`**Best query** (quality: ${best.quality.overall.toFixed(2)}):`);
    lines.push(`> ${best.query}`, "");
    lines.push("**GAIOL Response:**");
    lines.push(best.full_response || "(empty response)", "");
    lines.push(
      `**Scores:** Relevance: ${best.quality.relevance.toFixed(2)} | Coherence: ${best.quality.coherence.toFixed(2)} | Completeness: ${best.quality.completeness.toFixed(2)} | Accuracy: ${best.quality.accuracy.toFixed(2)}`,
    );
    lines.push(
      `**Latency:** ${best.latency_ms}ms | **Confidence:** σ=${best.consensus_confidence.toFixed(2)}`,
      "",
      "---",
      "",
    );
  }

  return lines.join("\n");
}

async function ensureResultsDirectory(resultsDir: string): Promise<void> {
  await mkdir(resultsDir, { recursive: true });
}

async function saveJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function saveAllOutputs(args: {
  resultsPath: string;
  baselinePath: string;
  samplesPath: string;
  benchmarkResults: BenchmarkResults;
  baselineComparison: Partial<Record<DomainName, BaselineEntry>>;
}): Promise<void> {
  await saveJson(args.resultsPath, args.benchmarkResults);
  await saveJson(args.baselinePath, args.baselineComparison);
  await writeFile(args.samplesPath, buildOutputSamplesMarkdown(args.benchmarkResults), "utf8");
}

async function assertOrchestratorHealthy(): Promise<void> {
  try {
    const resp = await fetch(HEALTH_URL, { method: "GET" });
    if (!resp.ok) {
      console.error(
        `[GAIOL Benchmark] Orchestrator health check failed at ${HEALTH_URL} (HTTP ${resp.status}). Ensure TS orchestrator is running.`,
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      `[GAIOL Benchmark] Cannot connect to orchestrator at ${HEALTH_URL}. Ensure TS orchestrator is running.`,
    );
    if (error instanceof Error) console.error(`[GAIOL Benchmark] ${error.message}`);
    process.exit(1);
  }
}

async function runSingleQuery(args: {
  domain: DomainName;
  query: string;
  index: number;
  mode: ConsensusMode;
  beamWidth: number;
  explorePaths: boolean;
}): Promise<QueryResult> {
  const traceId = `bench-${args.domain}-${args.index}-${Date.now()}`;
  const payload = buildRequestPayload({
    traceId,
    domain: args.domain,
    query: args.query,
    consensusMode: args.mode,
    beamWidth: args.beamWidth,
    explorePaths: args.explorePaths,
    temperature: 0.7,
    maxTokens: 600,
  });

  const orchestration = await postOrchestrate(payload, TIMEOUT_MS);
  if (!orchestration.ok) {
    return createFailedQueryResult(args.index, args.query, traceId);
  }

  const resolvedTraceId = safeString(orchestration.data.trace_id ?? orchestration.data.traceId ?? traceId) || traceId;
  const fullResponse = extractPrimaryResponse(orchestration.data);
  const quality = await evaluateQuality(resolvedTraceId, args.query, fullResponse);
  const metrics = extractMetrics(orchestration.data);

  return {
    index: args.index,
    query: args.query,
    response_excerpt: fullResponse.slice(0, 400),
    full_response: fullResponse,
    latency_ms: orchestration.latencyMs,
    quality,
    consensus_confidence: metrics.confidence,
    models_used: metrics.models_used,
    subtask_count: metrics.subtask_count,
    success: true,
    trace_id: resolvedTraceId,
  };
}

// ─── Sweep types ─────────────────────────────────────────────────────────────

interface LambdaSweepRow {
  lambda: number;
  /** decay sent in request (1 - lambda) */
  abtc_decay: number;
  domain: DomainName;
  query: string;
  quality: number;
  latency_ms: number;
  success: boolean;
}

interface BeamWidthSweepRow {
  beam_width: number;
  domain: DomainName;
  query: string;
  quality: number;
  latency_ms: number;
  success: boolean;
}

interface FaultToleranceRow {
  scenario: string;
  /** per-request timeout used to force real model timeouts */
  request_timeout_ms: number;
  domain: DomainName;
  query: string;
  quality: number;
  latency_ms: number;
  success: boolean;
}

// ─── Lambda sensitivity sweep ─────────────────────────────────────────────────

/**
 * Section 6.5 of the revised paper: vary λ per LAMBDA_SWEEP in paper-constants.ts.
 */
const LAMBDA_VALUES: readonly number[] = [...LAMBDA_SWEEP];
const PROBE_QUERIES_PER_DOMAIN = 3;

async function runLambdaSweep(resultsDir: string): Promise<LambdaSweepRow[]> {
  const lambdaLabel = LAMBDA_VALUES.map((v) => v.toFixed(2)).join(", ");
  console.log(`\n[Lambda Sweep] Starting — λ ∈ {${lambdaLabel}}`);
  const rows: LambdaSweepRow[] = [];

  const probeQueryMap: Record<DomainName, string[]> = {
    analytical_reasoning: DOMAINS.analytical_reasoning.slice(0, PROBE_QUERIES_PER_DOMAIN),
    code_generation: DOMAINS.code_generation.slice(0, PROBE_QUERIES_PER_DOMAIN),
    multi_step_problem: DOMAINS.multi_step_problem.slice(0, PROBE_QUERIES_PER_DOMAIN),
    knowledge_retrieval: DOMAINS.knowledge_retrieval.slice(0, PROBE_QUERIES_PER_DOMAIN),
    creative_synthesis: DOMAINS.creative_synthesis.slice(0, PROBE_QUERIES_PER_DOMAIN),
  };

  for (const lambda of LAMBDA_VALUES) {
    const decay = round2(1 - lambda);
    console.log(`\n  λ=${lambda} (abtc_decay=${decay})`);

    for (const domain of Object.keys(probeQueryMap) as DomainName[]) {
      const queries = probeQueryMap[domain];
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const traceId = `sweep-lambda-${lambda}-${domain}-${i}-${Date.now()}`;
        const payload: Record<string, unknown> = {
          schema_version: "1.0",
          trace_id: traceId,
          domain,
          task_kind: DOMAIN_TASK_KIND[domain],
          objective: query,
          messages: [{ role: "user", content: query }],
          consensus_mode: "abtc",
          beam_width: BENCHMARK_BEAM_WIDTH,
          explore_paths: BENCHMARK_BEAM_WIDTH > 1,
          abtc_decay: decay,
        };

        const res = await postOrchestrate(payload, TIMEOUT_MS);
        let quality = 0;
        let success = false;
        if (!res.ok && res.latencyMs < 100) {
          console.warn(`    [${domain}] q${i + 1}: orchestration failed (${res.error})`);
        }
        if (res.ok) {
          const content = extractPrimaryResponse(res.data);
          const scored = await evaluateQuality(traceId, query, content);
          quality = scored.overall;
          success = true;
        }

        rows.push({ lambda, abtc_decay: decay, domain, query, quality, latency_ms: res.latencyMs, success });
        console.log(`    [${domain}] q${i + 1}: quality=${quality.toFixed(3)} latency=${res.latencyMs}ms`);
        await sleep(INTER_QUERY_DELAY_MS);
      }
    }
  }

  await saveJson(path.join(resultsDir, "sensitivity_lambda.json"), rows);
  console.log(`\n[Lambda Sweep] Done. ${rows.length} data points saved.`);
  renderSweepSummary("Lambda Sweep (mean quality per λ)", rows, (r) => r.lambda.toFixed(2), (r) => r.quality);
  return rows;
}

// ─── Beam width sweep ─────────────────────────────────────────────────────────

/**
 * Section 6.5: vary beam_width ∈ {1, 2, 3, 4, 5}.
 * Uses the same probe queries. Measures quality vs latency tradeoff.
 */
const BEAM_WIDTH_VALUES: readonly number[] = [...BEAM_WIDTH_SWEEP];

async function runBeamWidthSweep(resultsDir: string): Promise<BeamWidthSweepRow[]> {
  const bwLabel = BEAM_WIDTH_VALUES.join(",");
  console.log(`\n[Beam Width Sweep] Starting — beam_width ∈ {${bwLabel}}`);
  const rows: BeamWidthSweepRow[] = [];

  // One representative query per domain for brevity
  const repQuery: Record<DomainName, string> = {
    analytical_reasoning: DOMAINS.analytical_reasoning[0],
    code_generation: DOMAINS.code_generation[0],
    multi_step_problem: DOMAINS.multi_step_problem[0],
    knowledge_retrieval: DOMAINS.knowledge_retrieval[0],
    creative_synthesis: DOMAINS.creative_synthesis[0],
  };

  for (const bw of BEAM_WIDTH_VALUES) {
    console.log(`\n  beam_width=${bw}`);
    for (const domain of Object.keys(repQuery) as DomainName[]) {
      const query = repQuery[domain];
      const traceId = `sweep-bw-${bw}-${domain}-${Date.now()}`;
      const payload: Record<string, unknown> = {
        schema_version: "1.0",
        trace_id: traceId,
        domain,
        task_kind: DOMAIN_TASK_KIND[domain],
        objective: query,
        messages: [{ role: "user", content: query }],
        consensus_mode: "abtc",
        beam_width: bw,
        explore_paths: bw > 1,
      };

      const res = await postOrchestrate(payload, TIMEOUT_MS);
      let quality = 0;
      let success = false;
      if (res.ok) {
        const content = extractPrimaryResponse(res.data);
        const scored = await evaluateQuality(traceId, query, content);
        quality = scored.overall;
        success = true;
      }

      rows.push({ beam_width: bw, domain, query, quality, latency_ms: res.latencyMs, success });
      console.log(`    [${domain}] quality=${quality.toFixed(3)} latency=${res.latencyMs}ms`);
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  await saveJson(path.join(resultsDir, "sensitivity_beamwidth.json"), rows);
  console.log(`\n[Beam Width Sweep] Done. ${rows.length} data points saved.`);
  renderSweepSummary("Beam Width Sweep (mean quality per width)", rows, (r) => String(r.beam_width), (r) => r.quality);
  return rows;
}

// ─── Fault-tolerance sweep ────────────────────────────────────────────────────

/**
 * Section 6.6: realistic failure scenarios using per-request timeouts.
 *
 * The orchestrator will experience REAL timeout failures when models don't
 * respond within the budget — no mocking.  We test:
 *   - Normal (90s): full budget, all models available
 *   - Tight (8s):  slower models genuinely timeout; system must use survivors
 *   - Very tight (4s): most models timeout; graceful degradation to 1-model answer
 *
 * Success means the API returned a non-empty answer despite partial failures.
 * Quality is measured with the LLM-judge on whatever answer was produced.
 */
const FAULT_SCENARIOS: Array<{ name: string; request_timeout_ms: number }> = [
  { name: `normal (${TIMEOUT_MS / 1000}s)`, request_timeout_ms: TIMEOUT_MS },
  { name: "tight (8s)", request_timeout_ms: 8_000 },
  { name: "very-tight (4s)", request_timeout_ms: 4_000 },
];

async function runFaultToleranceSweep(resultsDir: string): Promise<FaultToleranceRow[]> {
  console.log("\n[Fault Tolerance] Starting — real timeout scenarios: normal/tight/very-tight");
  const rows: FaultToleranceRow[] = [];

  // One representative query per domain
  const repQuery: Record<DomainName, string> = {
    analytical_reasoning: DOMAINS.analytical_reasoning[1],
    code_generation: DOMAINS.code_generation[1],
    multi_step_problem: DOMAINS.multi_step_problem[0],
    knowledge_retrieval: DOMAINS.knowledge_retrieval[0],
    creative_synthesis: DOMAINS.creative_synthesis[0],
  };

  for (const scenario of FAULT_SCENARIOS) {
    console.log(`\n  Scenario: ${scenario.name}`);
    for (const domain of Object.keys(repQuery) as DomainName[]) {
      const query = repQuery[domain];
      const traceId = `fault-${scenario.name.replace(/[^a-z0-9]/g, "-")}-${domain}-${Date.now()}`;
      const payload: Record<string, unknown> = {
        schema_version: "1.0",
        trace_id: traceId,
        domain,
        task_kind: DOMAIN_TASK_KIND[domain],
        objective: query,
        messages: [{ role: "user", content: query }],
        consensus_mode: "abtc",
        beam_width: BENCHMARK_BEAM_WIDTH,
        explore_paths: BENCHMARK_BEAM_WIDTH > 1,
      };

      const res = await postOrchestrate(payload, scenario.request_timeout_ms);
      let quality = 0;
      let success = false;
      if (res.ok) {
        const content = extractPrimaryResponse(res.data);
        if (content.length > 0) {
          const scored = await evaluateQuality(traceId, query, content);
          quality = scored.overall;
          success = true;
        }
      }

      rows.push({
        scenario: scenario.name,
        request_timeout_ms: scenario.request_timeout_ms,
        domain,
        query,
        quality,
        latency_ms: res.latencyMs,
        success,
      });
      console.log(`    [${domain}] success=${success} quality=${quality.toFixed(3)} latency=${res.latencyMs}ms`);
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  await saveJson(path.join(resultsDir, "fault_tolerance.json"), rows);
  console.log(`\n[Fault Tolerance] Done. ${rows.length} data points saved.`);
  renderSweepSummary("Fault Tolerance (success rate per scenario)", rows, (r) => r.scenario, (r) => (r.success ? 1 : 0));
  return rows;
}

// ─── ABTC convergence curve (Section 6.4) ────────────────────────────────────

const BENCHMARK_CONVERGENCE_ROUNDS = 20;
const CONVERGENCE_LAMBDA = LAMBDA;
const CONVERGENCE_DOMAIN: DomainName = "analytical_reasoning";

interface ConvergenceCurvePoint {
  round: number;
  model_id: string;
  posterior_mean: number;
}

interface CumulativeQualityPoint {
  round: number;
  mode: ConsensusMode;
  query: string;
  quality: number;
  cumulative_mean_quality: number;
  success: boolean;
}

function extractModelResponsesFromTrace(data: BenchmarkOrchestrateResponse): ModelResponse[] {
  const out: ModelResponse[] = [];
  const trace = data.trace;
  if (!trace || typeof trace !== "object") return out;

  const subtasks = (trace as Record<string, unknown>).subtasks;
  if (!Array.isArray(subtasks)) return out;

  for (const sub of subtasks) {
    if (!sub || typeof sub !== "object") continue;
    const calls = (sub as Record<string, unknown>).calls;
    if (!Array.isArray(calls)) continue;

    for (const call of calls) {
      if (!call || typeof call !== "object") continue;
      const rec = call as Record<string, unknown>;
      const modelId = safeString(rec.model_id ?? rec.modelId).trim();
      const text = safeString(rec.text).trim();
      const error = safeString(rec.error).trim();
      if (!modelId || error || !text) continue;
      out.push({ modelId, text });
    }
  }

  return out;
}

function buildSequentialQueries(rounds: number): string[] {
  const pool = Object.values(DOMAINS).flat();
  const queries: string[] = [];
  for (let i = 0; i < rounds; i++) {
    queries.push(pool[i % pool.length]!);
  }
  return queries;
}

function buildConvergenceQueries(rounds: number): SweepQuery[] {
  return buildSequentialQueries(rounds).map((query) => ({ query }));
}

async function orchestrateForMode(args: {
  query: string;
  domain: DomainName;
  mode: ConsensusMode;
  round: number;
  label: string;
}): Promise<{ ok: boolean; content: string; latencyMs: number }> {
  const traceId = `${args.label}-r${args.round}-${Date.now()}`;
  const payload: Record<string, unknown> = {
    schema_version: "1.0",
    trace_id: traceId,
    domain: args.domain,
    task_kind: DOMAIN_TASK_KIND[args.domain],
    objective: args.query,
    messages: [{ role: "user", content: args.query }],
    consensus_mode: args.mode,
    beam_width: args.mode === "abtc" ? BENCHMARK_BEAM_WIDTH : 1,
    explore_paths: args.mode === "abtc" && BENCHMARK_BEAM_WIDTH > 1,
    abtc_decay: round2(1 - CONVERGENCE_LAMBDA),
  };

  const res = await postOrchestrate(payload, TIMEOUT_MS);
  if (!res.ok) {
    return { ok: false, content: "", latencyMs: res.latencyMs };
  }
  return {
    ok: true,
    content: extractPrimaryResponse(res.data),
    latencyMs: res.latencyMs,
  };
}

async function runCumulativeQualityCurve(resultsDir: string): Promise<CumulativeQualityPoint[]> {
  const modes: ConsensusMode[] = ["abtc", "uniform", "static"];
  const queries = buildSequentialQueries(BENCHMARK_CONVERGENCE_ROUNDS);
  const points: CumulativeQualityPoint[] = [];

  console.log(
    `\n[Cumulative Quality] Starting — ${BENCHMARK_CONVERGENCE_ROUNDS} rounds × modes {abtc, uniform, static}`,
  );

  for (const mode of modes) {
    let cumulativeSum = 0;
    let successCount = 0;

    for (let round = 0; round < queries.length; round++) {
      const query = queries[round]!;
      const domain = (Object.keys(DOMAINS) as DomainName[]).find((d) => DOMAINS[d].includes(query)) ??
        CONVERGENCE_DOMAIN;

      const res = await orchestrateForMode({
        query,
        domain,
        mode,
        round: round + 1,
        label: `cumulative-${mode}`,
      });

      let quality = 0;
      let success = false;
      if (res.ok && res.content.length > 0) {
        const scored = await evaluateQuality(`cumulative-${mode}-${round}`, query, res.content);
        quality = scored.overall;
        success = true;
        cumulativeSum += quality;
        successCount++;
      }

      const cumulativeMean = successCount > 0 ? cumulativeSum / successCount : 0;
      points.push({
        round: round + 1,
        mode,
        query,
        quality,
        cumulative_mean_quality: round2(cumulativeMean),
        success,
      });

      console.log(
        `    [${mode}] round ${round + 1}: quality=${quality.toFixed(3)} cumulative=${cumulativeMean.toFixed(3)}`,
      );
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  await saveJson(path.join(resultsDir, "cumulative_quality.json"), {
    rounds: BENCHMARK_CONVERGENCE_ROUNDS,
    domain_mix: "all-domains-rotating",
    modes,
    points,
  });

  console.log(`\n[Cumulative Quality] Done. ${points.length} data points saved.`);
  return points;
}

async function runConvergenceCurve(resultsDir: string): Promise<ConvergenceCurvePoint[]> {
  console.log(
    `\n[Convergence] Starting — ${BENCHMARK_CONVERGENCE_ROUNDS} sequential rounds, λ=${CONVERGENCE_LAMBDA}, domain=${CONVERGENCE_DOMAIN}`,
  );

  const queries = buildConvergenceQueries(BENCHMARK_CONVERGENCE_ROUNDS);
  let roundIndex = 0;

  const runModels = async (query: string): Promise<ModelResponse[]> => {
    const traceId = `convergence-r${roundIndex}-${Date.now()}`;
    roundIndex++;

    const payload: Record<string, unknown> = {
      schema_version: "1.0",
      trace_id: traceId,
      domain: CONVERGENCE_DOMAIN,
      task_kind: DOMAIN_TASK_KIND[CONVERGENCE_DOMAIN],
      objective: query,
      messages: [{ role: "user", content: query }],
      consensus_mode: "abtc",
      beam_width: BENCHMARK_BEAM_WIDTH,
      explore_paths: BENCHMARK_BEAM_WIDTH > 1,
      abtc_decay: round2(1 - CONVERGENCE_LAMBDA),
    };

    const res = await postOrchestrate(payload, TIMEOUT_MS);
    if (!res.ok) {
      console.warn(`    round ${roundIndex}: orchestration failed — ${res.error}`);
      return [];
    }

    const responses = extractModelResponsesFromTrace(res.data);
    console.log(`    round ${roundIndex}/${BENCHMARK_CONVERGENCE_ROUNDS}: ${responses.length} model response(s)`);
    await sleep(INTER_QUERY_DELAY_MS);
    return responses;
  };

  const curve = await abtcConvergenceCurve(queries, runModels, CONVERGENCE_LAMBDA);
  const points: ConvergenceCurvePoint[] = curve.map((p) => ({
    round: p.round,
    model_id: p.modelId,
    posterior_mean: round2(p.posteriorMean),
  }));

  await saveJson(path.join(resultsDir, "convergence_curve.json"), {
    lambda: CONVERGENCE_LAMBDA,
    domain: CONVERGENCE_DOMAIN,
    rounds: BENCHMARK_CONVERGENCE_ROUNDS,
    points,
  });

  console.log(`\n[Convergence] Done. ${points.length} posterior snapshots saved.`);
  return points;
}

// ─── Console summary helper ───────────────────────────────────────────────────

function renderSweepSummary<T>(
  title: string,
  rows: T[],
  keyFn: (r: T) => string,
  valueFn: (r: T) => number,
): void {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const k = keyFn(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(valueFn(row));
  }
  console.log(`\n  ${title}`);
  console.log("  " + "─".repeat(40));
  for (const [k, vals] of groups) {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    console.log(`  ${k.padEnd(20)} ${mean.toFixed(3)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const runSweepsOnly = process.argv.includes("--sweeps-only");
  const runConvergenceOnly = process.argv.includes("--convergence");
  const runCumulativeOnly = process.argv.includes("--cumulative");
  const skipSweeps = process.argv.includes("--no-sweeps");

  await assertOrchestratorHealthy();

  if (llmJudgeScorer) {
    const judgeBackend = process.env.OPENAI_API_KEY?.trim()
      ? "OpenAI"
      : googleApiKey()
        ? "Gemini"
        : "OpenRouter";
    console.log(`[GAIOL Benchmark] Using LLM-as-judge (${judgeBackend}); timeout=${TIMEOUT_MS}ms beam=${BENCHMARK_BEAM_WIDTH}`);
  } else {
    console.log("[GAIOL Benchmark] LLM judge unavailable — using orchestrator-as-judge fallback");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(scriptDir, "results");
  const resultsPath = path.join(resultsDir, "benchmark_results.json");
  const baselinePath = path.join(resultsDir, "baseline_comparison.json");
  const samplesPath = path.join(resultsDir, "output_samples.md");

  await ensureResultsDirectory(resultsDir);

  if (runConvergenceOnly) {
    await runConvergenceCurve(resultsDir);
    console.log("\n[GAIOL Benchmark] Convergence phase complete.");
    console.log(`  Results written to: ${path.join(resultsDir, "convergence_curve.json")}`);
    return;
  }

  if (runCumulativeOnly) {
    await runCumulativeQualityCurve(resultsDir);
    console.log("\n[GAIOL Benchmark] Cumulative quality phase complete.");
    console.log(`  Results written to: ${path.join(resultsDir, "cumulative_quality.json")}`);
    return;
  }

  if (!runSweepsOnly) {
    const domainNames = Object.keys(DOMAINS) as DomainName[];
    const benchmarkResults: BenchmarkResults = {
      run_id: new Date().toISOString(),
      gaiol_version: "1.0",
      total_queries: domainNames.reduce((sum, d) => sum + DOMAINS[d].length, 0),
      domains: {} as Record<DomainName, DomainSummary>,
      aggregate: {
        overall_quality: 0,
        overall_latency_ms: 0,
        overall_success_rate: 0,
        overall_confidence: 0,
        total_duration_ms: 0,
      },
    };

    const baselineComparison: Partial<Record<DomainName, BaselineEntry>> = {};
    const started = nowMs();

    console.log("[GAIOL Benchmark] Starting 25-query benchmark across 5 domains");

    for (const domain of domainNames) {
      const queries = DOMAINS[domain];
      const queryResults: QueryResult[] = [];

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const result = await runSingleQuery({
          domain,
          query,
          index: i,
          mode: "abtc",
          beamWidth: BENCHMARK_BEAM_WIDTH,
          explorePaths: BENCHMARK_BEAM_WIDTH > 1,
        });
        queryResults.push(result);

        console.log(
          `[${domain}] Query ${i + 1}/${queries.length}: "${shortQuery(query)}" → ${result.latency_ms}ms | quality=${result.quality.overall.toFixed(2)} | σ=${result.consensus_confidence.toFixed(2)}`,
        );

        if (i === 0) {
          await sleep(INTER_QUERY_DELAY_MS);
          const uniform = await runSingleQuery({
            domain,
            query,
            index: i,
            mode: "uniform",
            beamWidth: 1,
            explorePaths: false,
          });
          await sleep(INTER_QUERY_DELAY_MS);

          const statik = await runSingleQuery({
            domain,
            query,
            index: i,
            mode: "static",
            beamWidth: 1,
            explorePaths: false,
          });

          baselineComparison[domain] = {
            query,
            abtc: { quality: result.quality.overall, latency_ms: result.latency_ms },
            uniform: { quality: uniform.quality.overall, latency_ms: uniform.latency_ms },
            static: { quality: statik.quality.overall, latency_ms: statik.latency_ms },
          };
        }

        if (i < queries.length - 1) {
          await sleep(INTER_QUERY_DELAY_MS);
        }
      }

      benchmarkResults.domains[domain] = summarizeDomain(queryResults);
      benchmarkResults.aggregate = buildAggregate(benchmarkResults.domains, nowMs() - started);

      await saveAllOutputs({
        resultsPath,
        baselinePath,
        samplesPath,
        benchmarkResults,
        baselineComparison,
      });
    }

    benchmarkResults.aggregate = buildAggregate(benchmarkResults.domains, nowMs() - started);
    await saveAllOutputs({
      resultsPath,
      baselinePath,
      samplesPath,
      benchmarkResults,
      baselineComparison,
    });

    console.log(renderResultsTable(benchmarkResults));
  }

  if (!skipSweeps) {
    await runLambdaSweep(resultsDir);
    await runBeamWidthSweep(resultsDir);
    await runFaultToleranceSweep(resultsDir);
    await runCumulativeQualityCurve(resultsDir);
    await runConvergenceCurve(resultsDir);
  }

  console.log("\n[GAIOL Benchmark] All phases complete.");
  console.log(`  Results written to: ${resultsDir}`);
  console.log("  Files:");
  console.log("    benchmark_results.json   — 25-query domain benchmark");
  console.log("    baseline_comparison.json — ABTC vs uniform vs static per domain");
  console.log("    output_samples.md        — best response per domain");
  console.log("    sensitivity_lambda.json  — λ sweep quality (paper LAMBDA_SWEEP)");
  console.log("    sensitivity_beamwidth.json — beam_width quality/latency tradeoff");
  console.log("    fault_tolerance.json     — graceful degradation under real timeout pressure");
  console.log("    cumulative_quality.json  — ABTC vs static warm-up curves (Section 6.4)");
  console.log("    convergence_curve.json   — ABTC posterior mean per round (Section 6.4)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
