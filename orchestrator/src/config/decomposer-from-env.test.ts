import { describe, expect, it } from "vitest";
import { buildDecomposerFromEnv } from "./decomposer-from-env.js";
import { HeuristicDecomposer, LlmDecomposer } from "../decomposition/engine.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { sampleRegistry } from "./sample-registry.js";

describe("buildDecomposerFromEnv", () => {
  it("uses heuristic when LLM decomposer disabled", () => {
    const adapters = new Map([[new MockProviderAdapter().providerId, new MockProviderAdapter()]]);
    const d = buildDecomposerFromEnv({ GAIOL_LLM_DECOMPOSER: "0" }, adapters, sampleRegistry());
    expect(d).toBeInstanceOf(HeuristicDecomposer);
  });

  it("uses LlmDecomposer when explicitly enabled with keys", () => {
    const mock = new MockProviderAdapter();
    const adapters = new Map([[mock.providerId, mock]]);
    const registry = sampleRegistry();
    const d = buildDecomposerFromEnv(
      { GAIOL_LLM_DECOMPOSER: "1", OPENAI_API_KEY: "test-key" },
      adapters,
      registry,
    );
    expect(d).toBeInstanceOf(LlmDecomposer);
  });
});
