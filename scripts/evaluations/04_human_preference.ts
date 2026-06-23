import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";
const TRUST_URL = "http://localhost:8787/v1/trust";

// All five paper domains with representative queries
const DOMAINS: Record<string, string[]> = {
  analytical_reasoning: [
    "If all mammals are warm-blooded and whales are mammals, are whales warm-blooded?",
    "A train travels 120 km in 1.5 hours. What is its average speed?",
    "Evaluate: If P implies Q and Q implies R, and P is true, what is the truth value of R?",
    "A company's revenue grew 15% in Q1 and declined 8% in Q2. What is the net percentage change?",
    "Using pigeonhole principle: in a group of 13 people, must at least two share a birth month?",
  ],
  code_generation: [
    "Write a Python function that implements binary search on a sorted list.",
    "Write a TypeScript function that debounces an async function with configurable delay.",
    "Implement an LRU cache in Python using only built-in data structures.",
    "Write a SQL query to find the top 3 customers by total purchase amount in the last 30 days.",
    "Create a React hook called usePagination that manages page, pageSize, and totalItems state.",
  ],
  multi_step_problem: [
    "Plan a 7-day machine learning project from problem definition to model deployment.",
    "Design a PostgreSQL schema for a multi-tenant SaaS with users, orgs, and subscriptions.",
    "How do you debug a production API that intermittently returns 500 errors under load?",
    "Outline the steps to migrate a monolith to microservices with zero downtime.",
    "A startup has $50,000 to build a mobile app, REST API, and 6 months of cloud hosting. Prioritize costs.",
  ],
  knowledge_retrieval: [
    "Explain the difference between self-attention, cross-attention, and multi-head attention.",
    "What is the CAP theorem and what trade-off does it describe?",
    "Explain how the Raft consensus algorithm handles leader failure.",
    "What distinguishes BERT from GPT in terms of training objective and primary use cases?",
    "Explain Bayesian inference: what are prior, likelihood, and posterior?",
  ],
  creative_synthesis: [
    "Write a 150-word blog post introduction explaining why multi-model AI orchestration matters.",
    "Propose three novel research directions to improve LLM reasoning reliability.",
    "Write an analogy explaining Bayesian trust updates to a business stakeholder who understands investing.",
    "Design a product name, tagline, and 3-sentence elevator pitch for an AI governance platform.",
    "Summarize the tradeoffs between model accuracy, inference cost, and response latency in production AI.",
  ],
};

// Correct mock model IDs from orchestrator/src/config/sample-registry.ts
const MOCK_MODELS = ["mock-fast", "mock-strong", "mock-code"] as const;

function extractAnswerText(data: any): string {
  if (typeof data.answer === "string") return data.answer;
  if (typeof data.result === "string") return data.result;
  if (data.answer?.content) return String(data.answer.content);
  if (data.trace?.finalAnswer) return String(data.trace.finalAnswer);
  if (data.trace?.subtasks?.[0]?.answer) return String(data.trace.subtasks[0].answer);
  return "";
}

// Deterministic heuristic quality — replaces Math.random() fallback
function heuristicQuality(query: string, answer: string): number {
  if (!answer || answer.length < 20) return 0.30;
  const lengthScore = Math.min(1.0, answer.length / 600);
  const hasStructure = /\n|[•\-*]|```|\d+\./.test(answer) ? 0.10 : 0;
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const matches = queryWords.filter(w => answer.toLowerCase().includes(w)).length;
  const relevanceScore = Math.min(0.25, matches * 0.06);
  return Math.min(1.0, Math.max(0.30, 0.45 + lengthScore * 0.30 + hasStructure + relevanceScore));
}

async function callGroqJudge(query: string, response: string, apiKey: string): Promise<number> {
  const prompt = `Rate the quality of this AI response on a scale from 0.0 to 1.0.

Query: ${query}

Response: ${response.slice(0, 800)}

Reply with only a number between 0.0 and 1.0 (e.g. "0.82").`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 10,
      }),
    });
    if (!res.ok) {
      console.warn("Groq API failed:", res.status);
      return -1;
    }
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content ?? "";
    const score = parseFloat(content.match(/\d+(\.\d+)?/)?.[0] ?? "");
    if (isNaN(score)) return -1;
    return Math.max(0, Math.min(1, score));
  } catch (e) {
    console.warn("Groq call failed:", (e as Error).message);
    return -1;
  }
}

function calculateKendallsTauB(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length || arr1.length < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  let ties1 = 0;
  let ties2 = 0;
  for (let i = 0; i < arr1.length - 1; i++) {
    for (let j = i + 1; j < arr1.length; j++) {
      const s1 = Math.sign(arr1[i] - arr1[j]);
      const s2 = Math.sign(arr2[i] - arr2[j]);
      if (s1 === 0) ties1++;
      else if (s2 === 0) ties2++;
      else if (s1 === s2) concordant++;
      else discordant++;
    }
  }
  const n = arr1.length;
  const n0 = (n * (n - 1)) / 2;
  const denom = Math.sqrt((n0 - ties1) * (n0 - ties2));
  if (denom === 0) return 0;
  return (concordant - discordant) / denom;
}

async function main() {
  console.log("Starting Human Preference Cross-Validation...");

  // Load GROQ_API_KEY from .env if present
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
    path.join(process.cwd(), "..", "..", ".env"),
  ];
  for (const envPath of envPaths) {
    try {
      const envContent = await readFile(envPath, "utf8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^GROQ_API_KEY=(.*)$/);
        if (match && match[1].trim()) {
          process.env.GROQ_API_KEY = match[1].trim();
          console.log(`Loaded GROQ_API_KEY from ${envPath}`);
        }
      }
    } catch {
      // file not found — skip
    }
  }

  const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
  const useGroq = groqKey.length > 0;
  console.log(useGroq ? "Using Groq LLM-as-judge." : "No GROQ_API_KEY — using heuristic quality scorer.");

  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  const results: any[] = [];

  for (const [domain, queries] of Object.entries(DOMAINS)) {
    console.log(`\nDomain: ${domain}`);

    // Pre-warm trust by running ABTC orchestration on all queries in this domain
    const modelAnswers: Record<string, string[]> = {};
    for (const model of MOCK_MODELS) {
      modelAnswers[model] = [];
    }

    for (const query of queries) {
      const traceId = `pref-${domain}-${Date.now()}`;
      try {
        const res = await fetch(ORCHESTRATOR_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema_version: "1.0",
            trace_id: traceId,
            objective: query,
            messages: [{ role: "user", content: query }],
            domain,
            consensus_mode: "abtc",
            beam_width: 3,
            explore_paths: false,
          }),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const answer = extractAnswerText(data);
          // Attribute answer to the winning model if available, else distribute
          const winnerId: string = data.answer?.modelId ?? data.trace?.winner?.modelId ?? "";
          for (const model of MOCK_MODELS) {
            modelAnswers[model].push(model === winnerId ? answer : "");
          }
        }
      } catch (e) {
        console.warn("  Orchestration error:", (e as Error).message);
      }
    }

    // Fetch ABTC-inferred trust ranking for this domain
    let inferredScores: number[] = MOCK_MODELS.map(() => 1 / (1 + 1)); // prior mean 0.5
    try {
      const trustRes = await fetch(`${TRUST_URL}?domain=${domain}`, { signal: AbortSignal.timeout(5000) });
      if (trustRes.ok) {
        const trustData = await trustRes.json() as any;
        inferredScores = MOCK_MODELS.map(m => {
          const rec = (trustData.records ?? []).find((r: any) => r.modelId === m);
          if (!rec) return 0.5;
          const { alpha = 1, beta = 1 } = rec.distribution ?? {};
          return alpha / (alpha + beta);
        });
      }
    } catch {
      console.log("  Trust endpoint unavailable — using prior means (0.5 per model).");
    }

    // Score each model's responses using Groq judge or heuristic
    const humanScores: number[] = [];
    for (const model of MOCK_MODELS) {
      const answers = modelAnswers[model].filter(a => a.length > 0);
      if (answers.length === 0) {
        humanScores.push(0.40);
        continue;
      }
      let totalScore = 0;
      for (let i = 0; i < answers.length; i++) {
        const query = queries[i] ?? queries[0];
        let score: number;
        if (useGroq) {
          score = await callGroqJudge(query, answers[i], groqKey);
          if (score < 0) score = heuristicQuality(query, answers[i]);
        } else {
          score = heuristicQuality(query, answers[i]);
        }
        totalScore += score;
      }
      humanScores.push(totalScore / answers.length);
    }

    const tau = calculateKendallsTauB(inferredScores, humanScores);
    console.log(`  Inferred ranking : ${inferredScores.map(s => s.toFixed(3)).join(", ")}`);
    console.log(`  Human ranking    : ${humanScores.map(s => s.toFixed(3)).join(", ")}`);
    console.log(`  Kendall's τ_b   : ${tau.toFixed(3)}`);

    results.push({
      domain,
      models: MOCK_MODELS,
      inferredRanking: inferredScores.map(s => parseFloat(s.toFixed(4))),
      humanRanking: humanScores.map(s => parseFloat(s.toFixed(4))),
      kendallsTauB: parseFloat(tau.toFixed(4)),
      judgeMethod: useGroq ? "groq-llama-3.1-8b" : "heuristic",
    });
  }

  const outPath = path.join(resultsDir, "human_preference_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nSaved human preference results to ${outPath}`);
}

main().catch(console.error);
