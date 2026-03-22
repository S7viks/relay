import Fastify from "fastify";
import { HeuristicDecomposer } from "../decomposition/engine.js";
import { newTraceId } from "../observability/trace.js";
import { createLogger } from "../observability/logger.js";
import { buildAdaptersFromEnv } from "../config/adapters.js";
import {
  InMemoryEvaluationRepository,
  InMemorySessionRepository,
  InMemoryTraceRepository,
  InMemoryTrustRepository,
} from "../persistence/memory-store.js";
import { OrchestratorPipeline } from "../orchestration/pipeline.js";
import { sampleRegistry } from "../config/sample-registry.js";
import { loadOrchestratorPort } from "../config/env.js";
import type { OrchestrationRequest } from "../domain/task.js";
import {
  consensusModeV1ToConfigPartial,
  orchestrateRequestV1ToDomain,
  toOrchestrateResponseV1,
  validateOrchestrateRequestV1,
  validateOrchestrateResponseV1,
} from "../contract/v1/index.js";
import { fileURLToPath } from "node:url";
import { rebuildTimelineFromTrace } from "../observability/replay.js";
import { summarizeOrchestrationTrace } from "../observability/metrics-summary.js";
import type { TraceId } from "../domain/ids.js";

export function buildServer() {
  const logger = createLogger();
  const trust = new InMemoryTrustRepository();
  const traces = new InMemoryTraceRepository();
  const sessions = new InMemorySessionRepository();
  const evaluations = new InMemoryEvaluationRepository();
  const registry = sampleRegistry();
  const adapters = buildAdaptersFromEnv();

  const orchestrator = new OrchestratorPipeline({
    decomposer: new HeuristicDecomposer(),
    registry,
    adapters,
    trust,
    traces,
    sessions,
    evaluations,
    logger,
    config: {
      consensusMode: "abtc",
      beamWidth: 2,
      maxParallelCalls: 3,
      maxCostUsdPerRequest: 5,
      abtc: {
        decay: 0.15,
        strength: 2,
        participantStrength: 1.2,
        consensusTrustExponent: 1.5,
      },
      retry: { retries: 2, baseDelayMs: 50 },
    },
  });

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  /** Debug: load persisted trace and rebuild timeline + metrics (does not re-run providers). */
  app.get<{ Params: { traceId: string } }>("/v1/traces/:traceId", async (req, reply) => {
    const traceId = req.params.traceId as TraceId;
    const trace = await traces.get(traceId);
    if (!trace) {
      return reply.code(404).send({ error: "not_found", trace_id: traceId });
    }
    return reply.send({
      trace,
      timeline_rebuilt: rebuildTimelineFromTrace(trace),
      metrics_summary: summarizeOrchestrationTrace(trace),
    });
  });

  app.post<{
    Body: Partial<OrchestrationRequest> & {
      objective?: string;
      domain?: string;
      taskKind?: OrchestrationRequest["taskKind"];
      schema_version?: string;
    };
  }>("/v1/orchestrate", async (req, reply) => {
    const body = req.body ?? {};
    const raw = body as Record<string, unknown>;

    if (raw.schema_version === "1.0") {
      validateOrchestrateRequestV1(body);
      const v1 = body as import("../contract/v1/wire-types.js").OrchestrateRequestV1;
      const orchestrationReq = orchestrateRequestV1ToDomain(v1);
      const modePartial = consensusModeV1ToConfigPartial(v1.consensus_mode);
      const result = await orchestrator.run(
        orchestrationReq,
        modePartial ? { configOverride: modePartial } : undefined,
      );
      const out = toOrchestrateResponseV1({
        trace: result.trace,
        answer: result.answer,
        trustUpdates: result.trustUpdates,
        sessionId: v1.session_id,
      });
      validateOrchestrateResponseV1(out);
      return reply.send(out);
    }

    const traceId = body.traceId ?? newTraceId();
    const orchestrationReq: OrchestrationRequest = {
      traceId,
      domain: body.domain ?? "general",
      taskKind: body.taskKind ?? "unknown",
      objective: body.objective ?? "",
      messages: body.messages ?? [{ role: "user", content: body.objective ?? "" }],
      constraints: body.constraints,
      explorePaths: body.explorePaths,
      beamWidth: body.beamWidth,
    };

    const result = await orchestrator.run(orchestrationReq);
    return reply.send({
      traceId: result.trace.traceId,
      answer: result.answer,
      trace: result.trace,
    });
  });

  return { app, orchestrator, trust, traces };
}

async function main() {
  const { app } = buildServer();
  const port = loadOrchestratorPort();
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`orchestrator listening on :${port}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
