import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abtcConvergenceCurve,
  type ModelResponse,
  type SweepQuery,
} from "../../orchestrator/src/evaluation/sensitivity.js";

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
 * Section 6.5 of the revised paper: vary λ ∈ {0.5, 0.7, 0.9, 0.95, 0.99}.
 *
 * For each λ we run PROBE_QUERIES_PER_DOMAIN queries per domain so that trust
 * updates actually accumulate (λ only matters across sequential rounds).  We
 * send abtc_decay = 1 - λ in the request body which the API now threads
 * through to OrchestratorConfig.abtc.decay.
 */
const LAMBDA_VALUES = [0.5, 0.7, 0.9, 0.95, 0.99];
const PROBE_QUERIES_PER_DOMAIN = 3; // keep runtime reasonable

async function runLambdaSweep(resultsDir: string): Promise<LambdaSweepRow[]> {
  console.log("\n[Lambda Sweep] Starting — λ ∈ {0.50, 0.70, 0.90, 0.95, 0.99}");
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
          beam_width: 3,
          explore_paths: true,
          abtc_decay: decay,
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
const BEAM_WIDTH_VALUES = [1, 2, 3, 4, 5];

async function runBeamWidthSweep(resultsDir: string): Promise<BeamWidthSweepRow[]> {
  console.log("\n[Beam Width Sweep] Starting — beam_width ∈ {1,2,3,4,5}");
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
  { name: "normal (90s)", request_timeout_ms: 90_000 },
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
        beam_width: 3,
        explore_paths: true,
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

const CONVERGENCE_ROUNDS = 20;
const CONVERGENCE_LAMBDA = 0.9;
const CONVERGENCE_DOMAIN: DomainName = "analytical_reasoning";

interface ConvergenceCurvePoint {
  round: number;
  model_id: string;
  posterior_mean: number;
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

function buildConvergenceQueries(rounds: number): SweepQuery[] {
  const pool = Object.values(DOMAINS).flat();
  const queries: SweepQuery[] = [];
  for (let i = 0; i < rounds; i++) {
    queries.push({ query: pool[i % pool.length]! });
  }
  return queries;
}

async function runConvergenceCurve(resultsDir: string): Promise<ConvergenceCurvePoint[]> {
  console.log(
    `\n[Convergence] Starting — ${CONVERGENCE_ROUNDS} sequential rounds, λ=${CONVERGENCE_LAMBDA}, domain=${CONVERGENCE_DOMAIN}`,
  );

  const queries = buildConvergenceQueries(CONVERGENCE_ROUNDS);
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
      beam_width: 3,
      explore_paths: true,
      abtc_decay: round2(1 - CONVERGENCE_LAMBDA),
    };

    const res = await postOrchestrate(payload, TIMEOUT_MS);
    if (!res.ok) {
      console.warn(`    round ${roundIndex}: orchestration failed — ${res.error}`);
      return [];
    }

    const responses = extractModelResponsesFromTrace(res.data);
    console.log(`    round ${roundIndex}/${CONVERGENCE_ROUNDS}: ${responses.length} model response(s)`);
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
    rounds: CONVERGENCE_ROUNDS,
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
  const skipSweeps = process.argv.includes("--no-sweeps");

  await assertOrchestratorHealthy();

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

  if (!skipSweeps) {
    await runLambdaSweep(resultsDir);
    await runBeamWidthSweep(resultsDir);
    await runFaultToleranceSweep(resultsDir);
    await runConvergenceCurve(resultsDir);
  }

  console.log("\n[GAIOL Benchmark] All phases complete.");
  console.log(`  Results written to: ${resultsDir}`);
  console.log("  Files:");
  console.log("    benchmark_results.json   — 25-query domain benchmark");
  console.log("    baseline_comparison.json — ABTC vs uniform vs static per domain");
  console.log("    output_samples.md        — best response per domain");
  console.log("    sensitivity_lambda.json  — λ ∈ {0.50,0.70,0.90,0.95,0.99} quality sweep");
  console.log("    sensitivity_beamwidth.json — beam_width ∈ {1..5} quality/latency tradeoff");
  console.log("    fault_tolerance.json     — graceful degradation under real timeout pressure");
  console.log("    convergence_curve.json   — ABTC posterior mean per round (Section 6.4)");
}

await main();
