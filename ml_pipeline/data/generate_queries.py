import json
from collections import Counter, defaultdict
from pathlib import Path

OUTPUT_QUERIES = Path("ml_pipeline/data/queries.json")
OUTPUT_SUMMARY = Path("ml_pipeline/data/queries_summary.json")

DIFFICULTIES = ["easy", "medium", "hard", "very_hard", "challenge"]
DOMAIN_ORDER = [
    "analytical_reasoning",
    "code_generation",
    "multi_step_problem",
    "knowledge_retrieval",
    "creative_synthesis",
]
DOMAIN_ID_PREFIX = {
    "analytical_reasoning": "analytical",
    "code_generation": "code_generation",
    "multi_step_problem": "multi_step",
    "knowledge_retrieval": "knowledge",
    "creative_synthesis": "creative",
}


ANALYTICAL_EASY = [
    "What can we conclude if all birds have wings and a penguin is a bird?",
    "If it rains, the ground gets wet. It rained. Is the ground wet?",
    "A rectangle has length 8 and width 5. What is its area and perimeter?",
    "If A > B and B > C, what is the relationship between A and C?",
    "All squares are rectangles. Is a square a rectangle? Explain why.",
    "If today is Monday, what day is it in 10 days?",
    "A number is even and greater than 10. Can it be 12? Can it be 13? Why?",
    "If 3x = 15, what is x? Show your reasoning.",
    "All cats are mammals. Felix is a cat. What can we say about Felix?",
    "If P is true and P implies Q, what is the truth value of Q?",
    "A store has 50 items. 30% are sold. How many remain?",
    "If every student passed, and Maria is a student, did Maria pass?",
    "Two numbers sum to 20. One is 7. What is the other?",
    "If you travel at 60 km/h for 2 hours, how far do you travel?",
    "All prime numbers greater than 2 are odd. Is 7 prime? Is it odd?",
    "If A = B and B = C, is A = C? What property does this demonstrate?",
    "A bag has 4 red, 6 blue balls. What fraction are red?",
    "If not-A is false, what is the truth value of A?",
    "A triangle has angles 60°, 70°. What is the third angle?",
    "If all X are Y and no Y are Z, can any X be Z?",
]

ANALYTICAL_MEDIUM = [
    "If all roses are flowers and some flowers fade quickly, what can we conclude about roses? Explain the full logical chain.",
    "A train travels 120km in 1.5 hours. Then 80km at 60km/h. What is total journey time and average speed for the whole trip?",
    "Company revenue: +15% Q1, -8% Q2, +20% Q3. Starting from $1M, what is final revenue? What is compound growth rate?",
    "Evaluate: P1: All mammals are warm-blooded. P2: Whales are mammals. C: Whales are warm-blooded. Valid? Sound?",
    "If P→Q and Q→R and R→S, and P is true, what can be concluded? Name the logical law.",
    "A 20% discount is applied, then a 10% discount. Is this the same as a 30% discount? Prove it mathematically.",
    "A sequence: 2, 6, 18, 54. What is the pattern? What is the 7th term? What is the sum of first 5 terms?",
    "If the probability of A is 0.3 and A and B are mutually exclusive with P(A or B) = 0.7, what is P(B)?",
    "Three switches control three bulbs in a room you cannot see. You can only enter once. How do you identify which switch controls which bulb?",
    "A store marks up goods 40% then offers a 20% sale. What is the net markup percentage?",
    "Analyze: 'This statement is false.' What is the logical status of this sentence?",
    "If all A are B, some B are C, does it follow that some A are C? Construct a proof or counterexample.",
    "A clock shows 3:15. What is the angle between the hour and minute hands?",
    "Worker A completes a job in 6 hours. Worker B in 4 hours. Working together, how long does the job take?",
    "Evaluate the argument: Most politicians are lawyers. John is a politician. Therefore John is a lawyer.",
    "A boat travels upstream at 6 km/h and downstream at 10 km/h. What is the river current speed? Boat speed in still water?",
    "If you double a number and add 3, you get 19. If you triple that original number and subtract 5, what do you get?",
    "All ethical actions maximize wellbeing. Lying sometimes maximizes wellbeing. Does it follow that lying is sometimes ethical?",
    "A 3×3 magic square uses numbers 1-9. The center is 5. What must each row, column, diagonal sum to? Prove it.",
    "Construct a truth table for: (P AND Q) OR (NOT P AND R). Under what conditions is it false?",
]

ANALYTICAL_HARD = [
    "In a clinical test, 2% of patients have condition X. Test sensitivity is 95% and specificity is 90%. If a patient tests positive, what is P(X|positive)? Show Bayes calculation.",
    "A game offers two actions each round: Safe gives +2 points guaranteed, Risk gives +6 with probability 0.4 and -1 otherwise. Over 50 rounds, which policy maximizes expected score and why?",
    "A SAT problem has clauses (A OR B), (NOT A OR C), (NOT B OR C), (NOT C OR D). Determine if it is satisfiable and provide one satisfying assignment or proof of unsat.",
    "You observe two servers failing with correlation 0.6. Propose a probabilistic model for common-cause failure and estimate independent vs shared risk contributions.",
    "Given P(A)=0.5, P(B)=0.4, P(C)=0.3, pairwise intersections 0.2, 0.15, 0.1 and triple intersection 0.08, compute P(A∪B∪C) and interpret.",
    "A shortest-path algorithm may use heuristic h(n). State conditions under which A* remains optimal, then evaluate whether h(n)=1.3*true_distance is admissible.",
    "Three-player voting game: proposal passes with any two votes. Utilities differ by policy outcome. Find one mixed-strategy Nash equilibrium under your own numeric utility assumptions.",
    "Minimize cost 4x+7y subject to x+y>=12, x>=3, y>=2, x,y integers. Solve and justify optimality with feasible region reasoning.",
    "A Markov chain has states S0,S1,S2 with transition matrix [[0.6,0.3,0.1],[0.2,0.5,0.3],[0.1,0.3,0.6]]. Compute stationary distribution.",
    "Prove or refute: If P→Q and NOT Q→R, then P→R. Use formal derivation or countermodel.",
    "A distributed lock grants lease for 5s; network delay is up to 2s and clock skew up to 1s. Derive a safe lease renewal window preventing split-brain writes.",
    "For binary classifier thresholds t in [0,1], define utility U=3*TPR-1*FPR. Given ROC points (0.1,0.6), (0.2,0.75), (0.35,0.9), choose best threshold and justify.",
    "A knapsack has capacity 15. Items: (w,v)=(2,6),(3,10),(5,12),(6,18),(7,22). Find optimal subset and explain dynamic programming recurrence.",
    "In repeated prisoner's dilemma with discount factor delta, derive condition on delta for grim-trigger cooperation to be subgame-perfect.",
    "A DAG scheduler has tasks A,B,C,D,E with durations 3,2,4,5,2 and edges A->D, B->D, C->E, D->E. Compute critical path and minimum completion time.",
    "Given CNF formula F and assignment distribution where each variable is true with probability p, derive expected number of satisfied clauses for a 3-CNF with m clauses.",
    "In queueing system M/M/1 with lambda=8 and mu=11, compute utilization, expected queue length, and expected system time.",
    "A robot chooses path P1 (cost mean 5, std 3) or P2 (cost mean 6, std 1). Under risk-averse utility U=-exp(0.4*cost), which path is preferred?",
    "If hypothesis class H has VC dimension d, give sample complexity bound for PAC learning with error epsilon and confidence delta, then instantiate for d=20, epsilon=0.1, delta=0.05.",
    "You can ask yes/no queries to identify one faulty component among 64. Some responses may be wrong once. Design an optimal strategy minimizing worst-case queries.",
]

ANALYTICAL_VERY_HARD = [
    "Prove that any deterministic consensus protocol in an asynchronous network with one crash failure cannot guarantee termination (outline FLP-style reasoning).",
    "Given constrained optimization min f(x,y)=x^2+xy+y^2 subject to x+2y=1 and x>=0, solve using KKT conditions and verify global optimality.",
    "For Bayesian network A->B->C with noisy conditional tables, derive expression for P(A|C) and discuss identifiability when B is latent.",
    "Show how to reduce 3-SAT to graph coloring in polynomial time and explain why this proves NP-hardness of k-coloring for k>=3.",
    "A zero-sum game has payoff matrix [[3,-1,2],[0,4,-2],[-3,1,5]]. Compute minimax mixed strategies and value using linear programming duality.",
    "Derive Chernoff bound for sum of independent Bernoulli variables and apply to estimate P(X>=70) when X~Binomial(100,0.5).",
    "Formally verify a mutex algorithm invariant: no two processes are in critical section simultaneously. Provide state invariant and induction argument.",
    "Given stochastic gradient descent with diminishing step size alpha_t=1/t, prove convergence conditions for convex Lipschitz objective and mention required assumptions.",
    "A supply chain optimization has 4 factories and 6 markets with capacity and demand constraints. Formulate primal and dual LP and interpret shadow prices.",
    "Construct a counterexample where greedy interval scheduling by shortest duration fails, while earliest-finish-time succeeds.",
    "A distributed database uses quorum reads/writes (R,W,N). Derive safety condition for strong consistency and evaluate configurations (2,2,3), (1,3,4), (3,3,5).",
    "Prove that if a heuristic is consistent then A* graph search never needs to reopen expanded nodes.",
    "Given theorem prover rules (modus ponens, conjunction intro/elimination), derive whether formula ((P->Q) AND (Q->R) AND P)->R is a tautology with proof sketch.",
    "In mechanism design, show why VCG is truthful for welfare maximization under quasi-linear utilities.",
    "Derive Bellman optimality equation for finite MDP and prove contraction of the Bellman operator in infinity norm.",
    "A coding-theory channel has bit-flip probability p. Compare repetition-3 and (7,4) Hamming code in terms of effective error probability and rate.",
    "Formulate SAT-based bounded model checking for transition system with safety property G(not bad) and bound k=10.",
    "In a federated setup with non-IID clients, derive why averaging can diverge and propose a convergence-stabilizing modification with rationale.",
    "Provide a formal argument for amortized O(1) push/pop on dynamic array with geometric resizing factor 2.",
    "Given 5 coupled constraints in integer programming, describe branch-and-cut strategy and prove validity of one nontrivial cutting plane.",
]

ANALYTICAL_CHALLENGE = [
    "Design a formal verification strategy for a multi-agent AI orchestrator with dynamic tool calls. Specify temporal properties, state abstraction, and model checking approach.",
    "Propose a byzantine-resilient consensus protocol for geo-distributed inference coordinators with weighted trust. Analyze liveness/safety tradeoffs under partition.",
    "Given an AI system with planner, retriever, and code executor, define a compositional reliability model and derive end-to-end failure probability bounds.",
    "Formulate a game-theoretic defense against prompt injection where attacker and defender alternate moves; characterize equilibrium defense policy class.",
    "Develop an optimization framework for latency-cost-quality routing across 6 LLM providers with stochastic availability and SLA constraints.",
    "Construct a proof outline for noninterference in a tool-augmented agent architecture where secret context must not influence public outputs.",
    "Define a causal inference study to estimate effect of chain-of-thought depth on answer correctness while controlling for query complexity confounders.",
    "Propose a distributed checkpoint protocol for long-running AI workflows under partial failures; prove recovery completeness and bounded replay.",
    "Design an online bandit algorithm for model selection with delayed rewards and switching costs; derive regret bound intuition.",
    "Create a formal semantics for declarative orchestration plans including parallel composition, retries, and fallback; define operational rules.",
    "Specify a verification harness for consensus-of-models outputs that flags contradictory rationales; include satisfiability-based consistency checks.",
    "Model hallucination containment as constrained optimization balancing recall and precision of abstention; derive KKT interpretation of tradeoffs.",
    "Design an adversarial evaluation for retrieval-augmented generation under stale knowledge and poisoned indexes; define robust scoring protocol.",
    "Formulate a differential privacy mechanism for telemetry collected from agent traces while preserving utility for debugging.",
    "Propose a fault-tolerant scheduler for DAG-based AI pipelines with uncertain task duration and heterogeneous accelerators; justify approximation strategy.",
    "Provide a mechanized proof approach for eventual consistency convergence in CRDT-backed agent memory under message reordering and duplication.",
    "Define a benchmark to compare verifier-guided decoding strategies across mathematical reasoning tasks with calibrated uncertainty.",
    "Develop a formal contract language for tool APIs that enables static precondition checking before autonomous execution.",
    "Construct an information-theoretic analysis of context-window allocation across subtasks in multi-agent reasoning.",
    "Design a red-team protocol that stress-tests distributed AI governance rules against collusion and delayed-observation attacks.",
]


def chunk_20(items):
    if len(items) != 20:
        raise ValueError(f"Expected 20 prompts, got {len(items)}")
    return items


def make_query_item(query_id, domain, difficulty, query_text, key_concepts, answer_type, relevance, completeness):
    return {
        "id": query_id,
        "domain": domain,
        "difficulty": difficulty,
        "query": query_text,
        "key_concepts": key_concepts,
        "expected_answer_type": answer_type,
        "rubric_hints": {
            "relevance": relevance,
            "completeness": completeness,
        },
    }


def make_generic_questions(domain, difficulty, prompts, key_concepts):
    items = []
    for idx, prompt in enumerate(prompts, start=1):
        items.append(
            make_query_item(
                query_id="",  # filled later
                domain=domain,
                difficulty=difficulty,
                query_text=prompt,
                key_concepts=key_concepts[idx % len(key_concepts)],
                answer_type="explanation" if difficulty in {"easy", "medium"} else "step_by_step_solution",
                relevance="Must directly solve the stated technical objective.",
                completeness="Must include reasoning, assumptions, and final answer/action.",
            )
        )
    return items


def build_code_generation():
    topics = [
        "Python algorithm optimization",
        "TypeScript type-safe API client",
        "Go goroutine coordination",
        "SQL query tuning",
        "React hooks state management",
        "REST API design",
        "Graph data structure",
        "Caching strategy",
        "Input validation",
        "Error handling middleware",
        "Unit test strategy",
        "Rate limiting",
        "Background job processing",
        "Event-driven architecture",
        "Authentication flow",
        "Pagination design",
        "Observability instrumentation",
        "Concurrency safety",
        "Schema migration",
        "Streaming responses",
    ]
    prompts = {
        "easy": [f"Write a small code example for {t} with clear comments and expected output." for t in topics],
        "medium": [f"Implement {t} in production-style code and explain tradeoffs and complexity." for t in topics],
        "hard": [f"Design and implement {t} under high-load constraints with tests and failure handling." for t in topics],
        "very_hard": [f"Provide an end-to-end architecture + code skeleton for {t} across services with scalability and reliability guarantees." for t in topics],
        "challenge": [f"Propose a research-grade implementation strategy for {t} including formal correctness checks, benchmarking, and rollout safeguards." for t in topics],
    }
    concept_pool = [
        ["python", "algorithms", "complexity"],
        ["typescript", "typing", "api-design"],
        ["go", "concurrency", "channels"],
        ["sql", "indexes", "query-planning"],
        ["react", "hooks", "state"],
    ]
    domain_items = []
    for difficulty in DIFFICULTIES:
        domain_items.extend(make_generic_questions("code_generation", difficulty, prompts[difficulty], concept_pool))
    return domain_items


def build_multi_step_problem():
    topics = [
        "service migration plan",
        "legacy monolith decomposition",
        "incident response workflow",
        "on-call escalation design",
        "database sharding rollout",
        "cost optimization roadmap",
        "feature launch checklist",
        "cross-team dependency plan",
        "API versioning transition",
        "security hardening initiative",
        "CI/CD modernization",
        "disaster recovery drill",
        "observability gap remediation",
        "cache invalidation strategy",
        "schema evolution governance",
        "performance bottleneck triage",
        "vendor lock-in mitigation",
        "multi-region deployment",
        "technical debt reduction sprint",
        "postmortem action prioritization",
    ]
    prompts = {
        "easy": [f"Create a step-by-step plan for {t} with owners, timeline, and success criteria." for t in topics],
        "medium": [f"Build a detailed execution plan for {t}, including dependencies, risks, and rollback steps." for t in topics],
        "hard": [f"For {t}, propose a phased implementation with measurable milestones, budget assumptions, and risk controls." for t in topics],
        "very_hard": [f"Design a multi-quarter strategy for {t} across engineering, product, and operations with decision gates." for t in topics],
        "challenge": [f"Develop a research-level framework for {t} that combines simulation, scenario analysis, and adaptive governance." for t in topics],
    }
    concept_pool = [
        ["planning", "risk-management", "execution"],
        ["systems-design", "migration", "rollback"],
        ["cost-estimation", "roadmap", "coordination"],
        ["architecture", "tradeoffs", "operations"],
        ["prioritization", "dependencies", "metrics"],
    ]
    domain_items = []
    for difficulty in DIFFICULTIES:
        domain_items.extend(make_generic_questions("multi_step_problem", difficulty, prompts[difficulty], concept_pool))
    return domain_items


def build_knowledge_retrieval():
    topics = [
        "transformer attention mechanism",
        "diffusion models",
        "vector databases",
        "CAP theorem",
        "Raft consensus",
        "B-tree indexing",
        "dynamic programming",
        "asymptotic complexity classes",
        "gradient clipping",
        "quantization methods",
        "retrieval-augmented generation",
        "zero-knowledge proofs",
        "map-reduce architecture",
        "gRPC vs REST",
        "eventual consistency",
        "GPU memory hierarchy",
        "federated learning",
        "agentic AI architectures",
        "recent multimodal model trends",
        "evaluation metric calibration",
    ]
    prompts = {
        "easy": [f"Explain the core idea of {t} in concise technical terms with one practical example." for t in topics],
        "medium": [f"Compare {t} to a close alternative and describe when each approach is preferable." for t in topics],
        "hard": [f"Provide a deep technical explanation of {t}, including assumptions, failure modes, and implementation details." for t in topics],
        "very_hard": [f"Analyze {t} from theory to production deployment, including tradeoffs in scale, reliability, and cost." for t in topics],
        "challenge": [f"Synthesize current research directions around {t}, highlighting unresolved problems and promising experiments." for t in topics],
    }
    concept_pool = [
        ["ml", "ai", "fundamentals"],
        ["distributed-systems", "databases", "consensus"],
        ["algorithms", "complexity", "theory"],
        ["systems", "performance", "tradeoffs"],
        ["research", "evaluation", "trends"],
    ]
    domain_items = []
    for difficulty in DIFFICULTIES:
        domain_items.extend(make_generic_questions("knowledge_retrieval", difficulty, prompts[difficulty], concept_pool))
    return domain_items


def build_creative_synthesis():
    topics = [
        "explain LLM hallucination to non-technical executives",
        "name a privacy-preserving AI product",
        "draft a technical blog outline on distributed tracing",
        "create an analogy for vector embeddings",
        "summarize a complex architecture for a sales audience",
        "propose a research direction for reliable tool-using agents",
        "write a product one-pager for model monitoring",
        "generate interview questions for ML platform engineers",
        "design onboarding material for prompt engineering",
        "craft a user-facing explanation for latency spikes",
        "compose release notes for a breaking API change",
        "build a learning path for junior backend engineers",
        "turn a postmortem into actionable team principles",
        "propose a narrative for adopting typed APIs",
        "write an internal memo on cost-quality tradeoffs",
        "create a taxonomy for AI safety incidents",
        "explain consensus algorithms with everyday examples",
        "invent naming conventions for microservices",
        "synthesize customer feedback into roadmap themes",
        "draft a workshop agenda on systems thinking",
    ]
    prompts = {
        "easy": [f"{t}. Keep it clear, engaging, and technically accurate." for t in topics],
        "medium": [f"{t}. Include structure, audience adaptation, and concrete examples." for t in topics],
        "hard": [f"{t}. Add constraints: limited time, competing priorities, and measurable outcomes." for t in topics],
        "very_hard": [f"{t}. Produce a multi-audience synthesis balancing technical rigor, persuasion, and risk communication." for t in topics],
        "challenge": [f"{t}. Deliver a novel synthesis suitable for publication-level technical communication and strategic decision-making." for t in topics],
    }
    concept_pool = [
        ["technical-writing", "communication", "clarity"],
        ["analogy", "synthesis", "audience-design"],
        ["product-thinking", "narrative", "strategy"],
        ["research", "ideation", "framing"],
        ["explanation", "education", "impact"],
    ]
    domain_items = []
    for difficulty in DIFFICULTIES:
        domain_items.extend(make_generic_questions("creative_synthesis", difficulty, prompts[difficulty], concept_pool))
    return domain_items


def build_analytical_reasoning():
    concept_pool = [
        ["logic", "syllogism"],
        ["arithmetic", "reasoning"],
        ["formal-logic", "inference"],
        ["probability", "optimization"],
        ["proof", "deduction"],
    ]
    all_by_difficulty = {
        "easy": chunk_20(ANALYTICAL_EASY),
        "medium": chunk_20(ANALYTICAL_MEDIUM),
        "hard": chunk_20(ANALYTICAL_HARD),
        "very_hard": chunk_20(ANALYTICAL_VERY_HARD),
        "challenge": chunk_20(ANALYTICAL_CHALLENGE),
    }
    domain_items = []
    for difficulty in DIFFICULTIES:
        prompts = all_by_difficulty[difficulty]
        domain_items.extend(
            make_generic_questions("analytical_reasoning", difficulty, prompts, concept_pool)
        )
    # Override rubric for analytical domain per requirement style.
    for item in domain_items:
        item["expected_answer_type"] = "explanation"
        item["rubric_hints"] = {
            "relevance": "Must address the logical chain",
            "completeness": "Must state conclusion and explain why",
        }
    return domain_items


def assign_ids(domain, items):
    prefix = DOMAIN_ID_PREFIX[domain]
    for idx, item in enumerate(items, start=1):
        item["id"] = f"{prefix}_{idx:03d}"
    return items


def build_all_queries():
    domain_builders = {
        "analytical_reasoning": build_analytical_reasoning,
        "code_generation": build_code_generation,
        "multi_step_problem": build_multi_step_problem,
        "knowledge_retrieval": build_knowledge_retrieval,
        "creative_synthesis": build_creative_synthesis,
    }

    queries = []
    for domain in DOMAIN_ORDER:
        domain_items = assign_ids(domain, domain_builders[domain]())
        if len(domain_items) != 100:
            raise ValueError(f"Domain {domain} generated {len(domain_items)} items, expected 100")
        queries.extend(domain_items)
    if len(queries) != 500:
        raise ValueError(f"Expected 500 total queries, got {len(queries)}")
    return queries


def summarize(queries):
    by_domain = Counter()
    by_difficulty = Counter()
    by_domain_difficulty = defaultdict(lambda: Counter())
    for q in queries:
        by_domain[q["domain"]] += 1
        by_difficulty[q["difficulty"]] += 1
        by_domain_difficulty[q["domain"]][q["difficulty"]] += 1

    return {
        "total_queries": len(queries),
        "counts_by_domain": dict(by_domain),
        "counts_by_difficulty": dict(by_difficulty),
        "counts_by_domain_and_difficulty": {
            domain: dict(counts) for domain, counts in by_domain_difficulty.items()
        },
    }


def main():
    OUTPUT_QUERIES.parent.mkdir(parents=True, exist_ok=True)

    queries = build_all_queries()
    summary = summarize(queries)

    with OUTPUT_QUERIES.open("w", encoding="utf-8") as f:
        json.dump(queries, f, indent=2, ensure_ascii=False)

    with OUTPUT_SUMMARY.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(queries)} queries to {OUTPUT_QUERIES}")
    print(f"Wrote summary to {OUTPUT_SUMMARY}")


if __name__ == "__main__":
    main()
