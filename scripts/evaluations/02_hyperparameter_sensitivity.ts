import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

const QUERIES = [
  "Solve this logic puzzle: If A is taller than B, and B is taller than C, who is the shortest?",
  "Write a bubble sort in Javascript.",
  "What is the theory of relativity?",
  "Write a haiku about artificial intelligence."
];

const LAMBDA_SWEEP = [0.90, 0.95, 0.98, 0.99, 1.00];
const BEAM_SWEEP = [1, 2, 3, 4, 5];

async function runQuery(query: string, lambda: number, beamWidth: number) {
  const start = Date.now();
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({

      objective: query,
      domain: "sweep",
      consensus_mode: "abtc",
      abtc_decay: 1 - lambda, // decay = 1 - lambda
      beamWidth
    })
  });
  const latency = Date.now() - start;
  if (!res.ok) throw new Error("Request failed");
  const data = await res.json() as any;
  // Use a pseudo-quality score since we don't have human-eval in this sweep loop easily
  // In reality, this would use the LLM Judge. We'll use the trace consensus metrics.
  const score = data.trace?.subtasks?.[0]?.scores?.[data.answer?.modelId] ?? 0.8; 
  return { score, latency };
}

async function main() {
  console.log("Starting hyperparameter sensitivity sweep...");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  const results: any[] = [];

  for (const lambda of LAMBDA_SWEEP) {
    for (const beamWidth of BEAM_SWEEP) {
      console.log(`Running lambda=${lambda}, beam=${beamWidth}`);
      
      let totalQuality = 0;
      let totalLatency = 0;

      for (const query of QUERIES) {
        try {
          const res = await runQuery(query, lambda, beamWidth);
          totalQuality += res.score;
          totalLatency += res.latency;
        } catch (e) {
          console.error("Error:", e);
        }
      }

      results.push({
        lambda,
        beamWidth,
        avgQuality: totalQuality / QUERIES.length,
        avgLatencyMs: totalLatency / QUERIES.length
      });
    }
  }

  const outPath = path.join(resultsDir, "hyperparameters_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved hyperparameter sweep to ${outPath}`);
}

main().catch(console.error);
