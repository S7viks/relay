import type { OrchestrationTrace } from "../domain/task.js";

export interface OrchestrationMetricsSummary {
  traceId: string;
  domain: string;
  durationMs: number;
  subtaskCount: number;
  totalModelCalls: number;
  successfulModelCalls: number;
  failedModelCalls: number;
  /** Retries are only known from live timeline; omitted or 0 when summarizing trace-only. */
  totalRetries: number;
  latencyMs: {
    max: number;
    sum: number;
    count: number;
    avg?: number;
    p50?: number;
    p90?: number;
  };
  costUsd: {
    total: number;
    byModel: Record<string, number>;
    byProvider: Record<string, number>;
  };
  beam: {
    maxBeamWidth: number;
    prunedPathCount: number;
    keptPathCount: number;
  };
  trust: {
    trustRoundCount: number;
    persistedEntryCount: number;
    /** Mean (posteriorMean - priorMean) over trust entries, when any. */
    meanTrustMeanDelta?: number;
  };
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Aggregates latency, cost, success, beam, and trust movement from a completed trace (pure).
 */
export function summarizeOrchestrationTrace(
  trace: OrchestrationTrace,
  opts?: { totalRetries?: number },
): OrchestrationMetricsSummary {
  const started = Date.parse(trace.startedAt);
  const finished = Date.parse(trace.finishedAt);
  const durationMs = Number.isFinite(finished - started) ? Math.max(0, finished - started) : 0;

  let totalModelCalls = 0;
  let successfulModelCalls = 0;
  let failedModelCalls = 0;
  const latencies: number[] = [];
  let latSum = 0;
  const byModel: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let costTotal = 0;

  let maxBeamWidth = 0;
  let prunedPathCount = 0;
  let keptPathCount = 0;

  let trustRoundCount = 0;
  let persistedEntryCount = 0;
  const trustDeltas: number[] = [];

  for (const st of trace.subtasks) {
    if (st.pathExploration?.pruning) {
      maxBeamWidth = Math.max(maxBeamWidth, st.pathExploration.pruning.beamWidth);
      prunedPathCount += st.pathExploration.pruning.discardedPathIds.length;
      keptPathCount += st.pathExploration.pruning.keptPathIds.length;
    }

    if (st.trustRound) {
      trustRoundCount += 1;
      for (const e of st.trustRound.entries) {
        if (e.persisted) persistedEntryCount += 1;
        trustDeltas.push(e.posteriorMean - e.priorMean);
      }
    }

    for (const c of st.calls) {
      totalModelCalls += 1;
      if (c.error) {
        failedModelCalls += 1;
      } else {
        successfulModelCalls += 1;
      }
      latencies.push(c.latencyMs);
      latSum += c.latencyMs;
      const cost = c.usage?.costUsd ?? 0;
      costTotal += cost;
      byModel[c.modelId] = (byModel[c.modelId] ?? 0) + cost;
      byProvider[c.providerId] = (byProvider[c.providerId] ?? 0) + cost;
    }
  }

  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  const meanTrustDelta =
    trustDeltas.length > 0 ? trustDeltas.reduce((a, b) => a + b, 0) / trustDeltas.length : undefined;

  return {
    traceId: trace.traceId,
    domain: trace.domain,
    durationMs,
    subtaskCount: trace.subtasks.length,
    totalModelCalls,
    successfulModelCalls,
    failedModelCalls,
    totalRetries: opts?.totalRetries ?? 0,
    latencyMs: {
      max: count ? latencies[count - 1]! : 0,
      sum: latSum,
      count,
      ...(count > 0 ? { avg: latSum / count, p50: percentile(latencies, 50), p90: percentile(latencies, 90) } : {}),
    },
    costUsd: {
      total: costTotal,
      byModel,
      byProvider,
    },
    beam: {
      maxBeamWidth,
      prunedPathCount,
      keptPathCount,
    },
    trust: {
      trustRoundCount,
      persistedEntryCount,
      ...(meanTrustDelta !== undefined ? { meanTrustMeanDelta: meanTrustDelta } : {}),
    },
  };
}
