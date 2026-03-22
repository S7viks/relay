import { describe, expect, it } from "vitest";
import type { OrchestrationTrace } from "../domain/task.js";
import { UNIFORM_PRIOR } from "../domain/trust.js";
import { OrchestrationEventNames } from "./events.js";
import { rebuildTimelineFromTrace } from "./replay.js";

function minimalTrace(): OrchestrationTrace {
  return {
    traceId: "t-replay-1",
    domain: "test",
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:01.000Z",
    decomposition: {
      subtasks: [{ id: "s1", title: "one", description: "d", taskKind: "qa" }],
      rationale: "r",
    },
    subtasks: [
      {
        subtaskId: "s1",
        routedModelIds: ["m1"],
        calls: [
          {
            modelId: "m1",
            providerId: "p1",
            text: "ok",
            latencyMs: 10,
            usage: { costUsd: 0.01 },
          },
        ],
        scores: { m1: 0.9 },
        chosenModelId: "m1",
        consensusText: "ok",
        trustRound: {
          consensusMode: "abtc",
          winnerModelId: "m1",
          subtaskId: "s1",
          decay: 0.1,
          strengthWinner: 1,
          strengthParticipant: 0.5,
          consensusTrustExponent: 1,
          entries: [
            {
              modelId: "m1",
              providerId: "p1",
              domain: "test",
              role: "winner",
              prior: UNIFORM_PRIOR,
              afterDecay: UNIFORM_PRIOR,
              posterior: UNIFORM_PRIOR,
              priorMean: 0.5,
              posteriorMean: 0.55,
              decay: 0.1,
              strength: 1,
              signal: 0.5,
              explanation: "x",
              persisted: true,
            },
          ],
        },
        routingExplanation: {
          diversityRationale: "rr",
          candidatePoolSize: 1,
          beamWidth: 1,
          modelRankSnapshot: [],
        },
        pathExploration: {
          candidates: [
            {
              pathId: "path:m1",
              modelId: "m1",
              providerId: "p1",
              score: 0.9,
              kept: true,
              textPreview: "ok",
            },
          ],
          pruning: {
            beamWidth: 1,
            keptPathIds: ["path:m1"],
            discardedPathIds: [],
          },
          winningPathId: "path:m1",
        },
      },
    ],
  };
}

describe("rebuildTimelineFromTrace", () => {
  it("emits deterministic ordered events marked as replay", () => {
    const tl = rebuildTimelineFromTrace(minimalTrace());
    expect(tl.length).toBeGreaterThan(5);
    expect(tl.every((e) => e.payload.source === "replay")).toBe(true);
    expect(tl[0]?.name).toBe(OrchestrationEventNames.orchestrationStarted);
    expect(tl[tl.length - 1]?.name).toBe(OrchestrationEventNames.orchestrationComplete);
    const consensus = tl.filter((e) => e.name === OrchestrationEventNames.subtaskConsensusComplete);
    expect(consensus).toHaveLength(1);
    expect((consensus[0]?.payload as { chosenModelId?: string }).chosenModelId).toBe("m1");
  });
});
