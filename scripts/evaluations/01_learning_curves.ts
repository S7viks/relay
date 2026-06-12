import { writeFile } from "node:fs/promises";
import path from "node:path";

const ORCHESTRATOR_URL = "http://localhost:8787/v1/orchestrate";
const TRUST_URL = "http://localhost:8787/v1/trust";

const DOMAINS = {
  general: [
    "What is the capital of France?",
    "Explain quantum computing in one sentence.",
    "Write a hello world program in Python.",
    "How does a four-stroke engine work?",
    "What are the main causes of the French Revolution?",
    "Translate 'good morning' to Spanish.",
    "What is the square root of 144?",
    "Who wrote Romeo and Juliet?",
    "What is the difference between a virus and a bacteria?",
    "How far is the Earth from the Sun?",
    "Name three renewable energy sources.",
    "What is the tallest mountain in the world?",
    "How does photosynthesis work?",
    "What is the largest ocean on Earth?",
    "Who painted the Mona Lisa?",
    "What is the chemical symbol for gold?",
    "What year did World War II end?",
    "What is the speed of light?",
    "Name the planets in our solar system.",
    "What is the freezing point of water in Celsius?"
  ] // Expanding the query set to simulate 20 rounds of learning
};

async function fetchTrustState(domain: string) {
  const res = await fetch(`${TRUST_URL}?domain=${domain}`);
  if (!res.ok) return [];
  const data = await res.json() as any;
  return data.records;
}

async function runQuery(query: string, domain: string, mode: string) {
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({

      objective: query,
      domain,
      consensus_mode: mode
    })
  });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  const data = await res.json();
  return data;
}

async function main() {
  console.log("Starting learning curves evaluation...");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsDir = path.join(__dirname, "results");
  await import("node:fs/promises").then(fs => fs.mkdir(resultsDir, { recursive: true }));

  const csvRows = ["round,domain,model_id,alpha,beta,tau_hat"];
  
  for (const [domain, queries] of Object.entries(DOMAINS)) {
    console.log(`Evaluating domain: ${domain}`);
    
    for (let round = 0; round < queries.length; round++) {
      const query = queries[round];
      console.log(`  Round ${round + 1}/${queries.length}`);
      
      try {
        await runQuery(query, domain, "abtc");
        const trustState = await fetchTrustState(domain);
        
        for (const record of trustState) {
          const alpha = record.distribution.alpha;
          const beta = record.distribution.beta;
          const tauHat = alpha / (alpha + beta);
          csvRows.push(`${round + 1},${domain},${record.modelId},${alpha},${beta},${tauHat}`);
        }
      } catch (e) {
        console.error(`Error on query ${round + 1}:`, e);
      }
    }
  }

  const outPath = path.join(resultsDir, "learning_curves.csv");
  await writeFile(outPath, csvRows.join("\n"), "utf8");
  console.log(`Saved learning curves to ${outPath}`);
}

main().catch(console.error);
