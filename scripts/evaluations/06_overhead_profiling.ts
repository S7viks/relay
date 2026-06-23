import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

// Vary query complexity so overhead measurements aren't biased by a single query
const PROBE_QUERIES = [
  "What is the capital of Spain?",
  "Explain the difference between TCP and UDP in one paragraph.",
  "Write a Python one-liner to flatten a list of lists.",
  "What year was the Eiffel Tower completed?",
  "Summarize the main idea of Newton's second law of motion.",
];

async function runOverheadProfile(query: string, runIdx: number) {
  const traceId = `overhead-run${runIdx}-${Date.now()}`;

  const startNetwork = Date.now();
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "1.0",
      trace_id: traceId,
      objective: query,
      messages: [{ role: "user", content: query }],
      domain: "knowledge_retrieval",
      consensus_mode: "abtc",
      beam_width: 3,
      explore_paths: false,
      constraints: { temperature: 0.3, max_output_tokens: 256 },
    })
  });
  const totalClientLatency = Date.now() - startNetwork;

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;

  // Orchestrator-side wall time from trace timestamps
  const orchestratorDuration =
    data.trace?.finishedAt && data.trace?.startedAt
      ? new Date(data.trace.finishedAt).getTime() - new Date(data.trace.startedAt).getTime()
      : 0;

  // Max single-model inference latency (models run in parallel; critical-path is the max)
  const calls: any[] = data.trace?.subtasks?.[0]?.calls ?? [];
  let maxModelInferenceTime = 0;
  for (const c of calls) {
    if ((c.latencyMs ?? 0) > maxModelInferenceTime) maxModelInferenceTime = c.latencyMs;
  }

  // Decomposition: network/serialization is the client-observed extra round-trip time;
  // orchestration+consensus overhead is everything the orchestrator spent that is NOT
  // model inference (decomposition planning, ABTC scoring, beam pruning, consensus).
  const networkAndSerializationOverhead = Math.max(0, totalClientLatency - orchestratorDuration);
  const orchestrationAndConsensusOverhead = Math.max(0, orchestratorDuration - maxModelInferenceTime);

  return {
    query,
    runIdx,
    totalClientLatency_ms: totalClientLatency,
    orchestratorDuration_ms: orchestratorDuration,
    maxModelInference_ms: maxModelInferenceTime,
    networkSerialization_ms: networkAndSerializationOverhead,
    orchestrationAndConsensus_ms: orchestrationAndConsensusOverhead,
  };
}

async function main() {
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  // Warmup — allow JIT and connection pool to stabilise
  console.log("Warming up (3 runs)...");
  for (let i = 0; i < 3; i++) {
    try { await runOverheadProfile(PROBE_QUERIES[i % PROBE_QUERIES.length], -1); }
    catch (e) { console.warn("Warmup error:", (e as Error).message); }
  }

  console.log("\n--- Measurement runs ---");
  const rawResults: ReturnType<typeof runOverheadProfile extends (...args: any[]) => Promise<infer T> ? (...args: any[]) => Promise<T> : never>[] = [];

  for (let i = 0; i < PROBE_QUERIES.length; i++) {
    const query = PROBE_QUERIES[i];
    console.log(`Run ${i + 1}: "${query.slice(0, 60)}"`);
    try {
      const r = await runOverheadProfile(query, i);
      rawResults.push(r as any);
      console.log(`  Total: ${r.totalClientLatency_ms} ms | Orchestrator: ${r.orchestratorDuration_ms} ms | MaxInference: ${r.maxModelInference_ms} ms | Consensus overhead: ${r.orchestrationAndConsensus_ms} ms`);
    } catch (e) {
      console.warn(`  Failed: ${(e as Error).message}`);
    }
  }

  if (rawResults.length === 0) {
    console.error("No successful runs — is the orchestrator running?");
    process.exit(1);
  }

  const n = rawResults.length;
  const avg = (key: string) => Math.round((rawResults as any[]).reduce((s, r) => s + r[key], 0) / n);

  const summary = {
    runs: n,
    totalClientLatency_ms: avg("totalClientLatency_ms"),
    orchestratorDuration_ms: avg("orchestratorDuration_ms"),
    maxModelInference_ms: avg("maxModelInference_ms"),
    networkSerialization_ms: avg("networkSerialization_ms"),
    orchestrationAndConsensusOverhead_ms: avg("orchestrationAndConsensus_ms"),
    raw: rawResults,
  };

  console.log(`\nAverage over ${n} runs:`);
  console.log(`  Total client latency       : ${summary.totalClientLatency_ms} ms`);
  console.log(`  Orchestrator duration      : ${summary.orchestratorDuration_ms} ms`);
  console.log(`  Max model inference        : ${summary.maxModelInference_ms} ms`);
  console.log(`  Network/serialization      : ${summary.networkSerialization_ms} ms`);
  console.log(`  Orchestration+consensus OH : ${summary.orchestrationAndConsensusOverhead_ms} ms`);

  const outPath = path.join(resultsDir, "overhead_profiling_results.json");
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nSaved overhead profile to ${outPath}`);
}

main().catch(console.error);
