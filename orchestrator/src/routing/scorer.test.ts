import { describe, expect, it } from "vitest";
import { rankModels } from "./scorer.js";
import type { RoutingContext } from "./types.js";

describe("routing scorer", () => {
  it("ranks higher accuracy and lower cost ahead", () => {
    const ctx: RoutingContext = {
      domain: "general",
      taskKind: "qa",
      subtask: {
        id: "s1",
        title: "t",
        description: "d",
        taskKind: "qa",
      },
      registry: [
        {
          modelId: "cheap",
          providerId: "mock",
          remoteName: "c",
          capabilities: ["general"],
          costIndex: 0.1,
          latencyPriorMs: 200,
          accuracyPrior: 0.5,
          available: true,
        },
        {
          modelId: "strong",
          providerId: "mock",
          remoteName: "s",
          capabilities: ["general"],
          costIndex: 0.9,
          latencyPriorMs: 200,
          accuracyPrior: 0.95,
          available: true,
        },
      ],
      trustByModel: {},
      weights: { accuracy: 0.9, latency: 0.05, cost: 0.05, availability: 0 },
    };
    const ranked = rankModels(ctx);
    expect(ranked[0]?.modelId).toBe("strong");
  });
});
