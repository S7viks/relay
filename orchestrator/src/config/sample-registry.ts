import type { ModelRegistryEntry } from "../domain/registry.js";

export function sampleRegistry(): ModelRegistryEntry[] {
  return [
    {
      modelId: "mock-fast",
      providerId: "mock",
      remoteName: "mock-fast",
      capabilities: ["general"],
      costIndex: 0.1,
      latencyPriorMs: 50,
      accuracyPrior: 0.55,
      available: true,
    },
    {
      modelId: "mock-strong",
      providerId: "mock",
      remoteName: "mock-strong",
      capabilities: ["reasoning", "general"],
      costIndex: 0.4,
      latencyPriorMs: 120,
      accuracyPrior: 0.7,
      available: true,
    },
    {
      modelId: "mock-code",
      providerId: "mock",
      remoteName: "mock-code",
      capabilities: ["code"],
      costIndex: 0.25,
      latencyPriorMs: 90,
      accuracyPrior: 0.62,
      available: true,
    },
  ];
}
