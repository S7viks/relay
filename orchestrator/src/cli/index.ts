import { HeuristicDecomposer } from "../decomposition/engine.js";
import { createLogger } from "../observability/logger.js";
import { newTraceId } from "../observability/trace.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { InMemoryTraceRepository, InMemoryTrustRepository } from "../persistence/memory-store.js";
import { OrchestratorPipeline } from "../orchestration/pipeline.js";
import { sampleRegistry } from "../config/sample-registry.js";

async function main() {
  const objective = process.argv.slice(2).join(" ") || "Explain quantum tunneling in two sentences.";
  const logger = createLogger();
  const traceId = newTraceId();
  const mock = new MockProviderAdapter();
  const orchestrator = new OrchestratorPipeline({
    decomposer: new HeuristicDecomposer(),
    registry: sampleRegistry(),
    adapters: new Map([[mock.providerId, mock]]),
    trust: new InMemoryTrustRepository(),
    traces: new InMemoryTraceRepository(),
    logger,
    config: {
      consensusMode: "abtc",
      beamWidth: 2,
      maxParallelCalls: 3,
      abtc: { decay: 0.1, strength: 1.5 },
      retry: { retries: 1, baseDelayMs: 20 },
    },
  });

  const result = await orchestrator.run({
    traceId,
    domain: "science",
    taskKind: "qa",
    objective,
    messages: [{ role: "user", content: objective }],
    explorePaths: true,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ answer: result.answer, traceId, trustUpdates: result.trustUpdates.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
