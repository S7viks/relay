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
import { FileTrustRepository } from "../persistence/file-trust-store.js";
import { OrchestratorPipeline } from "../orchestration/pipeline.js";
import { buildOrchestratorRegistry } from "../config/registry-from-env.js";
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
import { evaluateAgainstContains, type EvalExample } from "../evaluation/harness.js";
import type { ModelCallResult } from "../domain/task.js";
import { DEFAULT_LAMBDA } from "../consensus/abtc.js";

export function buildServer() {
  const logger = createLogger();
  const consensusMode = "abtc" as const;
  const beamWidth = 2;
  const lambda = DEFAULT_LAMBDA;
  const trustPath = process.env.TRUST_STORE_PATH?.trim() || '';
  const trust = trustPath ? new FileTrustRepository(trustPath) : new InMemoryTrustRepository();
  const traces = new InMemoryTraceRepository();
  const sessions = new InMemorySessionRepository();
  const evaluations = new InMemoryEvaluationRepository();
  const registry = buildOrchestratorRegistry();
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
      consensusMode,
      beamWidth,
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

  /** Trust snapshot for ABTC dashboard (all rows or filtered by domain). */
  app.get<{ Querystring: { domain?: string } }>("/v1/trust", async (req, reply) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";
    const records = domain ? await trust.listByDomain(domain) : await trust.listAll();
    return reply.send({ records, count: records.length, domain: domain || null });
  });

  /** Recent trace ids (newest last), for metrics index MVP. */
  app.get<{ Querystring: { limit?: string } }>("/v1/traces", async (req, reply) => {
    let limit = 50;
    const q = req.query.limit;
    if (typeof q === "string" && q.trim() !== "") {
      const n = Number(q);
      if (Number.isFinite(n)) limit = n;
    }
    const trace_ids = await traces.listTraceIds(limit);
    return reply.send({ trace_ids, count: trace_ids.length });
  });

  /** Run contains-based eval on a single answer string (no live model call). */
  app.post<{
    Body: {
      examples?: EvalExample[];
      answerText?: string;
    };
  }>("/v1/eval/contains", async (req, reply) => {
    const body = req.body ?? {};
    const examples = Array.isArray(body.examples) ? body.examples : [];
    const answerText = typeof body.answerText === "string" ? body.answerText : "";
    if (!examples.length) {
      return reply.code(400).send({ error: "examples_required" });
    }
    const result: ModelCallResult = {
      modelId: "eval",
      providerId: "eval",
      text: answerText,
      latencyMs: 0,
    };
    const results = examples.map((ex) => {
      const r = evaluateAgainstContains(ex, result);
      return {
        objective: ex.objective,
        pass: r.pass,
        score: r.score,
        notes: r.notes,
      };
    });
    const passAll = results.every((r) => r.pass);
    const id = `eval-${Date.now()}`;
    await evaluations.append({
      id,
      traceId: "eval-contains",
      createdAt: new Date().toISOString(),
      scores: Object.fromEntries(results.map((r, i) => [`ex_${i}`, r.score])),
      pass: passAll,
      notes: "contains harness",
    });
    return reply.send({
      pass: passAll,
      results,
      eval_id: id,
    });
  });

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

  return { app, orchestrator, trust, traces, consensusMode, beamWidth, lambda };
}

async function main() {
  const { app: server, consensusMode, beamWidth, lambda } = buildServer();
  const PORT = loadOrchestratorPort();
  await server.listen({ port: PORT, host: "0.0.0.0" });
  console.log(
    `GAIOL TS Orchestrator started mode=${consensusMode} lambda=${lambda} port=${PORT} beam_width=${beamWidth}`,
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
