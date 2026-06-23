import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

// Correct mock model IDs from orchestrator/src/config/sample-registry.ts
const MOCK_MODELS = ["mock-fast", "mock-strong", "mock-code"] as const;

const QUERIES = [
  "Write a polite email declining a job offer.",
  "What is the airspeed velocity of an unladen swallow?",
  "Translate 'I am testing the fault tolerance' to German.",
  "Write a Python script to reverse a string.",
  "Explain the difference between TCP and UDP.",
  "List three advantages of microservices architecture.",
];

function extractAnswerText(data: any): string {
  if (typeof data.answer === "string") return data.answer;
  if (typeof data.result === "string") return data.result;
  if (data.answer?.content) return String(data.answer.content);
  if (data.trace?.finalAnswer) return String(data.trace.finalAnswer);
  if (data.trace?.subtasks?.[0]?.answer) return String(data.trace.subtasks[0].answer);
  return "";
}

function heuristicQuality(query: string, answer: string): number {
  if (!answer || answer.length < 20) return 0.30;
  const lengthScore = Math.min(1.0, answer.length / 600);
  const hasStructure = /\n|[•\-*]|```|\d+\./.test(answer) ? 0.10 : 0;
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const matches = queryWords.filter(w => answer.toLowerCase().includes(w)).length;
  const relevanceScore = Math.min(0.25, matches * 0.06);
  return Math.min(1.0, Math.max(0.30, 0.45 + lengthScore * 0.30 + hasStructure + relevanceScore));
}

async function runScenario(scenarioName: string, debugFaults: Record<string, unknown>) {
  let successCount = 0;
  let totalQuality = 0;

  console.log(`\nRunning scenario: ${scenarioName}`);

  for (const query of QUERIES) {
    const traceId = `fault-${scenarioName.replace(/\W+/g, "_")}-${Date.now()}`;
    try {
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
          _debug_faults: debugFaults,
        })
      });
      if (res.ok) {
        successCount++;
        const data = await res.json() as any;
        const answer = extractAnswerText(data);
        totalQuality += heuristicQuality(query, answer);
      } else {
        console.warn(`  Query failed with HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("  Query threw error:", (e as Error).message);
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

  // Scenario 1: Baseline — no faults
  results.push(await runScenario("Baseline (No Faults)", {}));

  // Scenario 2: Single model 100% timeout
  results.push(await runScenario("Single Model Timeout", {
    "mock-fast": { timeoutMs: 8000 },
  }));

  // Scenario 3: Two models completely unavailable (leaves only mock-code)
  results.push(await runScenario("Dual Model Unavailable", {
    "mock-fast": { failCompletely: true },
    "mock-strong": { failCompletely: true },
  }));

  // Scenario 4: All models 10% intermittent errors
  results.push(await runScenario("10% Intermittent Error", {
    "mock-fast": { errorRate: 0.10 },
    "mock-strong": { errorRate: 0.10 },
    "mock-code": { errorRate: 0.10 },
  }));

  // Scenario 5: All models 20% intermittent errors
  results.push(await runScenario("20% Intermittent Error", {
    "mock-fast": { errorRate: 0.20 },
    "mock-strong": { errorRate: 0.20 },
    "mock-code": { errorRate: 0.20 },
  }));

  // Scenario 6: All models 30% intermittent errors
  results.push(await runScenario("30% Intermittent Error", {
    "mock-fast": { errorRate: 0.30 },
    "mock-strong": { errorRate: 0.30 },
    "mock-code": { errorRate: 0.30 },
  }));

  const outPath = path.join(resultsDir, "fault_tolerance_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nSaved fault tolerance results to ${outPath}`);
}

main().catch(console.error);
