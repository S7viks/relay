import type { OrchestrationTrace } from "../domain/task.js";
import { OrchestrationEventNames } from "./events.js";
import type { OrchestrationEvent } from "./events.js";

/**
 * Rebuilds a deterministic event timeline from a persisted trace (no provider calls).
 * Use for inspection, diffing, and dashboard ingestion. Payloads are marked source=replay.
 */
export function rebuildTimelineFromTrace(trace: OrchestrationTrace): OrchestrationEvent[] {
  const out: OrchestrationEvent[] = [];
  const baseTs = trace.startedAt;

  const push = (e: Omit<OrchestrationEvent, "ts"> & { ts?: string }) => {
    out.push({
      ts: e.ts ?? baseTs,
      name: e.name,
      traceId: e.traceId,
      ...(e.subtaskId !== undefined ? { subtaskId: e.subtaskId } : {}),
      phase: e.phase,
      payload: { source: "replay", ...e.payload },
    });
  };

  push({
    name: OrchestrationEventNames.orchestrationStarted,
    traceId: trace.traceId,
    phase: "orchestration",
    payload: { domain: trace.domain, subtaskCount: trace.decomposition.subtasks.length },
  });

  push({
    name: OrchestrationEventNames.decompositionComplete,
    traceId: trace.traceId,
    phase: "orchestration",
    payload: {
      rationale: trace.decomposition.rationale ?? null,
      subtaskIds: trace.decomposition.subtasks.map((s) => s.id),
    },
  });

  for (const st of trace.subtasks) {
    push({
      name: OrchestrationEventNames.subtaskStarted,
      traceId: trace.traceId,
      subtaskId: st.subtaskId,
      phase: "subtask",
      payload: {},
    });

    if (st.routingExplanation) {
      push({
        name: OrchestrationEventNames.routingPlanned,
        traceId: trace.traceId,
        subtaskId: st.subtaskId,
        phase: "subtask",
        payload: {
          candidatePoolSize: st.routingExplanation.candidatePoolSize,
          beamWidth: st.routingExplanation.beamWidth,
          diversityRationale: st.routingExplanation.diversityRationale,
          candidateModelIds: st.routedModelIds,
        },
      });
    }

    push({
      name: OrchestrationEventNames.modelBatchStarted,
      traceId: trace.traceId,
      subtaskId: st.subtaskId,
      phase: "subtask",
      payload: { modelIds: st.routedModelIds },
    });

    for (const c of st.calls) {
      push({
        name: c.error ? OrchestrationEventNames.modelGenerateFailed : OrchestrationEventNames.modelGenerateSucceeded,
        traceId: trace.traceId,
        subtaskId: st.subtaskId,
        phase: "model",
        payload: {
          modelId: c.modelId,
          providerId: c.providerId,
          latencyMs: c.latencyMs,
          error: c.error ?? null,
          costUsd: c.usage?.costUsd ?? 0,
        },
      });
    }

    if (st.pathExploration) {
      push({
        name: OrchestrationEventNames.subtaskCandidatesScored,
        traceId: trace.traceId,
        subtaskId: st.subtaskId,
        phase: "subtask",
        payload: {
          candidateCount: st.pathExploration.candidates.length,
          scores: st.scores,
        },
      });
      push({
        name: OrchestrationEventNames.subtaskBeamPruned,
        traceId: trace.traceId,
        subtaskId: st.subtaskId,
        phase: "subtask",
        payload: {
          beamWidth: st.pathExploration.pruning.beamWidth,
          keptPathIds: st.pathExploration.pruning.keptPathIds,
          discardedPathIds: st.pathExploration.pruning.discardedPathIds,
        },
      });
    }

    push({
      name: OrchestrationEventNames.subtaskConsensusComplete,
      traceId: trace.traceId,
      subtaskId: st.subtaskId,
      phase: "subtask",
      payload: {
        chosenModelId: st.chosenModelId,
        consensusTextLength: (st.consensusText ?? "").length,
      },
    });

    if (st.trustRound) {
      push({
        name: OrchestrationEventNames.subtaskTrustRoundComplete,
        traceId: trace.traceId,
        subtaskId: st.subtaskId,
        phase: "trust",
        payload: {
          consensusMode: st.trustRound.consensusMode,
          winnerModelId: st.trustRound.winnerModelId,
          decay: st.trustRound.decay,
          entryCount: st.trustRound.entries.length,
          persistedCount: st.trustRound.entries.filter((e) => e.persisted).length,
        },
      });
    }

    push({
      name: OrchestrationEventNames.subtaskComplete,
      traceId: trace.traceId,
      subtaskId: st.subtaskId,
      phase: "subtask",
      payload: {},
    });
  }

  push({
    name: OrchestrationEventNames.orchestrationComplete,
    traceId: trace.traceId,
    phase: "orchestration",
    payload: { finishedAt: trace.finishedAt },
  });

  return out;
}

/**
 * Compares high-level decisions between a live timeline and a replay from the resulting trace.
 * Returns issues when counts or chosen models diverge (used in tests / CI).
 */
export function diffLiveTimelineVsReplay(
  live: OrchestrationEvent[],
  trace: OrchestrationTrace,
): string[] {
  const issues: string[] = [];
  const replay = rebuildTimelineFromTrace(trace);

  const liveWinners = live
    .filter((e) => e.name === OrchestrationEventNames.subtaskConsensusComplete)
    .map((e) => `${e.subtaskId}:${(e.payload as { chosenModelId?: string }).chosenModelId}`);
  const replayWinners = replay
    .filter((e) => e.name === OrchestrationEventNames.subtaskConsensusComplete)
    .map((e) => `${e.subtaskId}:${(e.payload as { chosenModelId?: string }).chosenModelId}`);

  if (liveWinners.length !== replayWinners.length) {
    issues.push(`consensus_event_count live=${liveWinners.length} replay=${replayWinners.length}`);
  }
  for (let i = 0; i < Math.min(liveWinners.length, replayWinners.length); i++) {
    if (liveWinners[i] !== replayWinners[i]) {
      issues.push(`winner_mismatch idx=${i} live=${liveWinners[i]} replay=${replayWinners[i]}`);
    }
  }
  return issues;
}
