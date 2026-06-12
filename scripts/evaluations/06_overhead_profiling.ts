import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

async function runOverheadProfile() {
  console.log("Running overhead profiling experiment...");

  const query = "What is the capital of Spain?";
  
  const startNetwork = Date.now();
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({

      objective: query,
      domain: "profiling",
      consensus_mode: "abtc"
    })
  });
  const totalClientLatency = Date.now() - startNetwork;

  if (!res.ok) throw new Error("Request failed");
  const data = await res.json() as any;

  // The metrics summary from the orchestrator trace 
  const orchestratorDuration = data.trace?.finishedAt && data.trace?.startedAt 
    ? new Date(data.trace.finishedAt).getTime() - new Date(data.trace.startedAt).getTime() 
    : 0;
  
  // Model inference time (we take the max since they run in parallel, or average if specified)
  const calls = data.trace?.subtasks?.[0]?.calls ?? [];
  let maxModelInferenceTime = 0;
  for (const c of calls) {
     if (c.latencyMs > maxModelInferenceTime) maxModelInferenceTime = c.latencyMs;
  }

  // Decompose
  const networkAndSerializationOverhead = totalClientLatency - orchestratorDuration;
  const orchestrationAndConsensusOverhead = orchestratorDuration - maxModelInferenceTime;

  console.log(`\nLatency Decomposition:`);
  console.log(`  Total Client Latency: ${totalClientLatency} ms`);
  console.log(`  Orchestrator Total  : ${orchestratorDuration} ms`);
  console.log(`  Max Model Inference : ${maxModelInferenceTime} ms`);
  console.log(`  -----------------------------------`);
  console.log(`  Network/Serialization Overhead: ${networkAndSerializationOverhead} ms`);
  console.log(`  Orchestration Overhead        : ${orchestrationAndConsensusOverhead} ms`);

  return {
    totalClientLatency,
    orchestratorDuration,
    maxModelInferenceTime,
    networkAndSerializationOverhead,
    orchestrationAndConsensusOverhead
  };
}

async function main() {
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  // Run a few times to warmup JIT
  console.log("Warming up...");
  for (let i = 0; i < 3; i++) await runOverheadProfile();

  console.log("\n--- REAL RUN ---");
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await runOverheadProfile());
  }

  const avg = {
    totalClientLatency: results.reduce((a, b) => a + b.totalClientLatency, 0) / results.length,
    orchestratorDuration: results.reduce((a, b) => a + b.orchestratorDuration, 0) / results.length,
    maxModelInferenceTime: results.reduce((a, b) => a + b.maxModelInferenceTime, 0) / results.length,
    networkAndSerializationOverhead: results.reduce((a, b) => a + b.networkAndSerializationOverhead, 0) / results.length,
    orchestrationAndConsensusOverhead: results.reduce((a, b) => a + b.orchestrationAndConsensusOverhead, 0) / results.length,
  };

  const outPath = path.join(resultsDir, "overhead_profiling_results.json");
  await writeFile(outPath, JSON.stringify(avg, null, 2), "utf8");
  console.log(`\nSaved averaged overhead profile to ${outPath}`);
}

main().catch(console.error);
