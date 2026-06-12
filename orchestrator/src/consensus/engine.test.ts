import { describe, expect, it } from "vitest";
import { runConsensus } from "./engine.js";

describe("runConsensus", () => {
  const candidates = [
    {
      modelId: "a",
      providerId: "mock",
      text: "Paris is the capital of France.",
      latencyMs: 10,
    },
    {
      modelId: "b",
      providerId: "mock",
      text: "Paris is France's capital city.",
      latencyMs: 12,
    },
  ];

  it("uniform mode blends when multiple successes", async () => {
    const out = await runConsensus({
      mode: "uniform",
      domain: "geo",
      candidates,
      scores: { a: 0.6, b: 0.7 },
    });
    expect(out.text).toContain("a");
    expect(out.text).toContain("b");
  });

  it("static weights prefer configured models", async () => {
    const out = await runConsensus({
      mode: "static",
      domain: "geo",
      candidates,
      scores: { a: 0.9, b: 0.1 },
      staticWeights: { a: 0.1, b: 10 },
    });
    expect(out.chosenModelId).toBe("b");
  });

  it("abtc uses trust means", async () => {
    const out = await runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.5, b: 0.5 },
      trustRecords: { a: { alpha: 1, beta: 9 }, b: { alpha: 9, beta: 1 } },
    });
    expect(out.chosenModelId).toBe("b");
  });

  it("abtc with exponent 1 matches legacy weighting for equal scores", async () => {
    const out = await runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.5, b: 0.5 },
      trustRecords: { a: { alpha: 2, beta: 8 }, b: { alpha: 8, beta: 2 } },
      abtcConsensusExponent: 1,
    });
    expect(out.chosenModelId).toBe("b");
  });

});
