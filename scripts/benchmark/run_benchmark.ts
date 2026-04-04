import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const ORCHESTRATOR_URL = "http://localhost:3001/v1/orchestrate";
const HEALTH_URL = "http://localhost:3001/health";
const TIMEOUT_MS = 90_000;
const INTER_QUERY_DELAY_MS = 2_000;
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

const DOMAINS: Record<DomainName, string[]> = {
  analytical_reasoning: [
    "If all roses are flowers and some flowers fade quickly, what can we conclude about roses?",
    "A train travels 120km in 1.5 hours. What is its average speed? If it then travels 80km at 60km/h, what is the total journey time?",
    "Evaluate the logical validity: P1: All mammals are warm-blooded. P2: Whales are mammals. Conclusion: Whales are warm-blooded.",
    "A company's revenue grew 15% in Q1, declined 8% in Q2, grew 20% in Q3. What is the net change from start of Q1 to end of Q3?",
    "If P implies Q, and Q implies R, and we know P is true, what is the truth value of R? Explain your reasoning step by step.",
  ],
  code_generation: [
    "Write a Python function that implements binary search on a sorted list. Include edge cases and a docstring.",
    "Write a TypeScript function that debounces an async function call with configurable delay and immediate option.",
    "Implement a Go function that concurrently fetches multiple URLs using goroutines and returns all results with individual errors.",
    "Write a SQL query to find the top 3 customers by total purchase amount in the last 30 days, including tie-breaking.",
    "Create a React hook called usePagination that manages page, pageSize, totalItems state and returns navigation functions.",
  ],
  multi_step_problem: [
    "Plan a complete 7-day machine learning project: from problem definition and data collection to model deployment. Give concrete daily steps.",
    "A startup has a $50,000 budget and needs a mobile app, REST API backend, and 6 months of cloud hosting. Break down realistic costs and build priorities.",
    "Design a PostgreSQL schema for a multi-tenant SaaS application with users, organizations, subscriptions, and a full audit log. Show the CREATE TABLE statements.",
    "How would you debug a production API that intermittently returns HTTP 500 errors under load? Walk through your complete methodology from detection to resolution.",
    "Outline all steps to migrate a monolithic Node.js application to microservices with zero downtime. Include rollback strategy.",
  ],
  knowledge_retrieval: [
    "Explain the difference between transformer attention mechanisms: self-attention, cross-attention, and multi-head attention. When is each used?",
    "What is the CAP theorem? Explain the three properties and give a real-world example of a system that prioritizes each combination.",
    "Explain how the Raft consensus algorithm achieves distributed agreement and how it handles a leader failure mid-transaction.",
    "What distinguishes BERT from GPT architectures in terms of training objective, attention masking, and primary use cases?",
    "Explain Bayesian inference from scratch: what are prior, likelihood, and posterior, and how does Bayes' theorem connect them?",
  ],
  creative_synthesis: [
    "Write a technical blog post introduction (150 words) explaining why multi-model AI orchestration matters for production AI systems.",
    "Propose three novel research directions that could improve LLM reasoning reliability and reduce hallucination in multi-step tasks.",
    "Write an analogy explaining how Bayesian trust updates work to a non-technical business stakeholder who understands investing.",
    "Design a product name, tagline, and 3-sentence elevator pitch for an AI governance platform targeting Fortune 500 enterprises.",
    "Summarize the key engineering tradeoffs between model accuracy, inference cost, and response latency in production AI deployments.",
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

async function main(): Promise<void> {
  await assertOrchestratorHealthy();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(scriptDir, "results");
  const resultsPath = path.join(resultsDir, "benchmark_results.json");
  const baselinePath = path.join(resultsDir, "baseline_comparison.json");
  const samplesPath = path.join(resultsDir, "output_samples.md");

  await ensureResultsDirectory(resultsDir);

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
        beamWidth: 3,
        explorePaths: true,
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

await main();
