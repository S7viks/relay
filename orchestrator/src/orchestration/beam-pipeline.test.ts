import { describe, expect, it } from "vitest";
import { HeuristicDecomposer } from "../decomposition/engine.js";
import { createLogger } from "../observability/logger.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { InMemoryTraceRepository, InMemoryTrustRepository } from "../persistence/memory-store.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import { OrchestratorPipeline } from "./pipeline.js";

function diverseRegistry(): ModelRegistryEntry[] {
  return [
    {
      modelId: "m-high",
      providerId: "provider-a",
      remoteName: "m-high",
      capabilities: ["general"],
      costIndex: 0.2,
      latencyPriorMs: 50,
      accuracyPrior: 0.95,
      available: true,
    },
    {
      modelId: "m-mid",
      providerId: "provider-b",
      remoteName: "m-mid",
      capabilities: ["general"],
      costIndex: 0.3,
      latencyPriorMs: 60,
      accuracyPrior: 0.75,
      available: true,
    },
    {
      modelId: "m-low",
      providerId: "provider-c",
      remoteName: "m-low",
      capabilities: ["general"],
      costIndex: 0.5,
      latencyPriorMs: 80,
      accuracyPrior: 0.55,
      available: true,
    },
  ];
}

describe("OrchestratorPipeline beam + diversity", () => {
  it("explores multiple paths, prunes to beam, and records routing + path traces", async () => {
    const trust = new InMemoryTrustRepository();
    const traces = new InMemoryTraceRepository();
    const adapters = new Map([
      ["provider-a", new MockProviderAdapter({ providerId: "provider-a" })],
      ["provider-b", new MockProviderAdapter({ providerId: "provider-b" })],
      ["provider-c", new MockProviderAdapter({ providerId: "provider-c" })],
    ]);

    const orch = new OrchestratorPipeline({
      decomposer: new HeuristicDecomposer(),
      registry: diverseRegistry(),
      adapters,
      trust,
      traces,
      logger: createLogger("silent"),
      config: {
        consensusMode: "abtc",
        beamWidth: 2,
        maxParallelCalls: 3,
        abtc: { decay: 0.1, strength: 1 },
        retry: { retries: 0, baseDelayMs: 1 },
      },
    });

    const res = await orch.run({
      traceId: "beam-test-1",
      domain: "test",
      taskKind: "qa",
      objective: "alpha beta gamma objective phrase",
      messages: [{ role: "user", content: "alpha beta gamma objective phrase" }],
      explorePaths: true,
      beamWidth: 2,
    });

    const st = res.trace.subtasks[0];
    expect(st).toBeDefined();
    expect(st?.routedModelIds.length).toBeGreaterThanOrEqual(2);
    expect(st?.pathExploration).toBeDefined();
    expect(st?.pathExploration?.candidates.length).toBe(st?.routedModelIds.length);
    expect(st?.pathExploration?.pruning.beamWidth).toBe(2);
    expect(st?.pathExploration?.pruning.keptPathIds.length).toBeLessThanOrEqual(2);
    expect(st?.pathExploration?.pruning.discardedPathIds.length).toBeGreaterThanOrEqual(1);
    expect(st?.routingExplanation?.modelRankSnapshot.length).toBe(3);
    expect(st?.routingExplanation?.diversityRationale).toContain("diverse_round_robin");
    expect(st?.trustRound?.consensusMode).toBe("abtc");
    expect(st?.trustRound?.entries.every((e) => e.persisted)).toBe(true);

    const kept = st?.pathExploration?.candidates.filter((c) => c.kept) ?? [];
    expect(kept.length).toBe(st?.pathExploration?.pruning.keptPathIds.length);
    expect(st?.chosenModelId).toBeDefined();
    expect(st?.pathExploration?.winningPathId).toBe(`path:${st?.chosenModelId}`);
  });

  it("collapses to a single path when explorePaths is false", async () => {
    const adapters = new Map([
      ["provider-a", new MockProviderAdapter({ providerId: "provider-a" })],
      ["provider-b", new MockProviderAdapter({ providerId: "provider-b" })],
      ["provider-c", new MockProviderAdapter({ providerId: "provider-c" })],
    ]);
    const orch = new OrchestratorPipeline({
      decomposer: new HeuristicDecomposer(),
      registry: diverseRegistry(),
      adapters,
      trust: new InMemoryTrustRepository(),
      traces: new InMemoryTraceRepository(),
      logger: createLogger("silent"),
      config: {
        consensusMode: "uniform",
        beamWidth: 2,
        maxParallelCalls: 3,
        abtc: { decay: 0.1, strength: 1 },
        retry: { retries: 0, baseDelayMs: 1 },
      },
    });

    const res = await orch.run({
      traceId: "beam-test-2",
      domain: "test",
      taskKind: "qa",
      objective: "short",
      messages: [{ role: "user", content: "short" }],
      explorePaths: false,
    });

    const st = res.trace.subtasks[0];
    expect(st?.routedModelIds).toHaveLength(1);
    expect(st?.pathExploration?.pruning.discardedPathIds).toHaveLength(0);
    expect(st?.trustRound?.consensusMode).toBe("uniform");
    expect(st?.trustRound?.entries.every((e) => !e.persisted)).toBe(true);
  });
});
