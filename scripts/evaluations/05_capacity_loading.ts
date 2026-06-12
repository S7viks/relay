import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

const CONCURRENCY_LEVELS = [1, 10, 100];
const BASE_QUERY = "Explain the advantages of microservices architecture.";

async function runThroughputTest(concurrency: number) {
  console.log(`\nRunning capacity load test at N=${concurrency}...`);
  
  let successes = 0;
  const start = Date.now();
  
  // Fire N requests concurrently
  const promises = Array.from({ length: concurrency }).map(() => 
    fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({

        objective: BASE_QUERY,
        domain: "capacity",
        consensus_mode: "uniform" // simple mode for throughput
      })
    }).then(res => {
       if (res.ok) successes++;
    }).catch(err => {
       // Ignore individual errors during load test
    })
  );

  await Promise.all(promises);
  
  const end = Date.now();
  const durationMs = end - start;
  const qps = (successes / durationMs) * 1000;
  
  console.log(`  Completed in ${durationMs}ms`);
  console.log(`  Successes: ${successes}/${concurrency}`);
  console.log(`  Throughput: ${qps.toFixed(2)} QPS`);

  return {
    concurrency,
    durationMs,
    successRate: successes / concurrency,
    qps
  };
}

async function main() {
  console.log("Starting capacity loading throughput test...");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  const results = [];

  for (const n of CONCURRENCY_LEVELS) {
    const res = await runThroughputTest(n);
    results.push(res);
  }

  const outPath = path.join(resultsDir, "capacity_loading_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nSaved capacity loading results to ${outPath}`);
}

main().catch(console.error);
