import { describe, expect, it } from "vitest";
import { HeuristicDecomposer } from "../decomposition/engine.js";
import { createLogger } from "../observability/logger.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { InMemoryTraceRepository, InMemoryTrustRepository } from "../persistence/memory-store.js";
import { sampleRegistry } from "../config/sample-registry.js";
import { OrchestratorPipeline } from "./pipeline.js";
import { betaMean } from "../domain/trust.js";
import { UNIFORM_PRIOR } from "../domain/trust.js";
import { diffLiveTimelineVsReplay } from "../observability/replay.js";
import { OrchestrationEventNames } from "../observability/events.js";

describe("OrchestratorPipeline", () => {
  it("runs end-to-end with mock provider and updates ABTC trust", async () => {
    const trust = new InMemoryTrustRepository();
    const traces = new InMemoryTraceRepository();
    const mock = new MockProviderAdapter();
    const orch = new OrchestratorPipeline({
      decomposer: new HeuristicDecomposer(),
      registry: sampleRegistry(),
      adapters: new Map([[mock.providerId, mock]]),
      trust,
      traces,
      logger: createLogger("silent"),
      config: {
        consensusMode: "abtc",
        beamWidth: 3,
        maxParallelCalls: 3,
        abtc: { decay: 0.1, strength: 2 },
        retry: { retries: 0, baseDelayMs: 1 },
      },
    });

    const res = await orch.run({
      traceId: "trace-pipe-1",
      domain: "test",
      taskKind: "qa",
      objective: "Hello world.",
      messages: [{ role: "user", content: "Hello world." }],
      explorePaths: true,
    });

    expect(res.answer.length).toBeGreaterThan(0);
    expect(Array.isArray(res.trustUpdates)).toBe(true);
    expect(res.trustUpdates.length).toBeGreaterThan(0);
    expect(res.trustUpdates.some((u) => u.explanation?.includes("isWinner") || u.explanation?.includes("winner"))).toBe(true);
    expect(res.trace.subtasks[0]?.trustRound?.entries.length).toBeGreaterThan(0);
    expect(res.trace.subtasks[0]?.trustRound?.decay).toBe(0.1);
    const stored = await trust.getTrust("mock-fast", "test");
    expect(stored).not.toBeNull();
    expect(betaMean(stored?.distribution ?? UNIFORM_PRIOR)).toBeGreaterThan(0);

    expect(res.timeline.length).toBeGreaterThan(0);
    expect(res.metricsSummary.traceId).toBe("trace-pipe-1");
    expect(res.metricsSummary.subtaskCount).toBe(res.trace.subtasks.length);
    expect(diffLiveTimelineVsReplay(res.timeline, res.trace)).toEqual([]);
    expect(res.timeline.some((e) => e.name === OrchestrationEventNames.orchestrationStarted)).toBe(
      true,
    );
  });
});
