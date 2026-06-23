import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";

const QUERIES = [
  "Solve this logic puzzle: If A is taller than B, and B is taller than C, who is the shortest?",
  "Write a bubble sort in JavaScript and explain its time complexity.",
  "Explain the theory of special relativity and its key consequences.",
  "Write a haiku about artificial intelligence, then explain the metaphor you chose.",
  "A company's revenue grew 15% in Q1, declined 8% in Q2, and grew 20% in Q3. What is the net change?",
  "Design a simple REST API for a todo list application with CRUD endpoints.",
];

const LAMBDA_SWEEP = [0.90, 0.95, 0.98, 0.99, 1.00];
const BEAM_SWEEP = [1, 2, 3, 4, 5];

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

async function runQuery(query: string, lambda: number, beamWidth: number) {
  const traceId = `sweep-lambda${lambda}-beam${beamWidth}-${Date.now()}`;
  const start = Date.now();
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "1.0",
      trace_id: traceId,
      objective: query,
      messages: [{ role: "user", content: query }],
      domain: "analytical_reasoning",
      consensus_mode: "abtc",
      abtc_decay: parseFloat((1 - lambda).toFixed(4)),
      beam_width: beamWidth,
      explore_paths: false,
    })
  });
  const latency = Date.now() - start;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;
  const answer = extractAnswerText(data);
  const score = heuristicQuality(query, answer);
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
      console.log(`Running lambda=${lambda}, beam_width=${beamWidth}`);

      let totalQuality = 0;
      let totalLatency = 0;
      let successCount = 0;

      for (const query of QUERIES) {
        try {
          const res = await runQuery(query, lambda, beamWidth);
          totalQuality += res.score;
          totalLatency += res.latency;
          successCount++;
        } catch (e) {
          console.error(`  Query error: ${(e as Error).message}`);
        }
      }

      const n = successCount || 1;
      results.push({
        lambda,
        beamWidth,
        avgQuality: parseFloat((totalQuality / n).toFixed(4)),
        avgLatencyMs: Math.round(totalLatency / n),
        successCount,
        totalQueries: QUERIES.length,
      });
    }
  }

  const outPath = path.join(resultsDir, "hyperparameters_results.json");
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved hyperparameter sweep to ${outPath}`);
}

main().catch(console.error);
