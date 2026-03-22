import { describe, expect, it } from "vitest";
import type { OrchestrationTrace } from "../domain/task.js";
import { summarizeOrchestrationTrace } from "./metrics-summary.js";

function traceForMetrics(): OrchestrationTrace {
  return {
    traceId: "t-metrics",
    domain: "d",
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:00:02.000Z",
    decomposition: { subtasks: [{ id: "s1", title: "t", description: "", taskKind: "qa" }] },
    subtasks: [
      {
        subtaskId: "s1",
        routedModelIds: ["a", "b"],
        calls: [
          {
            modelId: "a",
            providerId: "pa",
            text: "",
            latencyMs: 100,
            error: "fail",
          },
          {
            modelId: "b",
            providerId: "pb",
            text: "ok",
            latencyMs: 200,
            usage: { costUsd: 0.02 },
          },
        ],
        scores: { a: 0, b: 1 },
        chosenModelId: "b",
        consensusText: "ok",
        routingExplanation: {
          diversityRationale: "",
          candidatePoolSize: 2,
          beamWidth: 2,
          modelRankSnapshot: [],
        },
        pathExploration: {
          candidates: [],
          pruning: {
            beamWidth: 2,
            keptPathIds: ["path:b"],
            discardedPathIds: ["path:a"],
          },
          winningPathId: "path:b",
        },
      },
    ],
  };
}

describe("summarizeOrchestrationTrace", () => {
  it("aggregates latency, cost, success, beam, and honors totalRetries override", () => {
    const t = traceForMetrics();
    const s0 = summarizeOrchestrationTrace(t);
    expect(s0.totalModelCalls).toBe(2);
    expect(s0.successfulModelCalls).toBe(1);
    expect(s0.failedModelCalls).toBe(1);
    expect(s0.costUsd.total).toBeCloseTo(0.02);
    expect(s0.costUsd.byModel.b).toBeCloseTo(0.02);
    expect(s0.latencyMs.max).toBe(200);
    expect(s0.beam.prunedPathCount).toBe(1);
    expect(s0.totalRetries).toBe(0);

    const s1 = summarizeOrchestrationTrace(t, { totalRetries: 3 });
    expect(s1.totalRetries).toBe(3);
  });
});
