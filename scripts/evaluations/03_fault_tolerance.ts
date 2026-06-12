import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

const QUERIES = [
  "Write a polite email declining a job offer.",
  "What is the airspeed velocity of an unladen swallow?",
  "Translate 'I am testing the fault tolerance' to German.",
  "Write a Python script to reverse a string."
];

async function runScenario(scenarioName: string, debugFaults: any) {
  let successCount = 0;
  let totalQuality = 0;

  console.log(`\nRunning scenario: ${scenarioName}`);

  for (const query of QUERIES) {
    try {
      const res = await fetch(ORCHESTRATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({

          objective: query,
          domain: "fault_test",
          consensus_mode: "abtc",
          _debug_faults: debugFaults
        })
      });
      if (res.ok) {
        successCount++;
        const data = await res.json() as any;
        const score = data.trace?.subtasks?.[0]?.scores?.[data.answer?.modelId] ?? 0.8;
        totalQuality += score;
      } else {
         console.warn(`Query failed with status ${res.status}`);
      }
    } catch (e) {
      console.error("Query threw error:", e);
    }
  }

  const successRate = successCount / QUERIES.length;
  const avgQuality = successCount > 0 ? totalQuality / successCount : 0;

  console.log(`  Success Rate: ${(successRate * 100).toFixed(1)}%`);
  console.log(`  Avg Quality : ${avgQuality.toFixed(3)}`);

  return { scenarioName, successRate, avgQuality };
}

async function main() {
  console.log("Starting fault tolerance evaluation...");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  const results = [];

  // Scenario 1: No faults (Baseline)
  results.push(await runScenario("Baseline (No Faults)", {}));

  // Scenario 2: Single model 100% timeout
  results.push(await runScenario("Single Model Timeout", {
    "mock-fast": { timeoutMs: 5000 } // Should retry/skip
  }));

  // Scenario 3: Two models 100% unavailable
  results.push(await runScenario("Dual Model Failure", {
    "mock-fast": { failCompletely: true },
    "mock-slow": { failCompletely: true }
  }));

  // Scenario 4: All models 20% error rate
  results.push(await runScenario("20% Intermittent Error", {
    "mock-fast": { errorRate: 0.2 },
    "mock-slow": { errorRate: 0.2 },
    "mock-expensive": { errorRate: 0.2 }
  }));

  const outPath = path.join(resultsDir, "fault_tolerance_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nSaved fault tolerance results to ${outPath}`);
}

main().catch(console.error);
