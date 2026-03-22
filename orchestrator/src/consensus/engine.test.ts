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

  it("uniform mode blends when multiple successes", () => {
    const out = runConsensus({
      mode: "uniform",
      domain: "geo",
      candidates,
      scores: { a: 0.6, b: 0.7 },
    });
    expect(out.text).toContain("a");
    expect(out.text).toContain("b");
  });

  it("static weights prefer configured models", () => {
    const out = runConsensus({
      mode: "static",
      domain: "geo",
      candidates,
      scores: { a: 0.9, b: 0.1 },
      staticWeights: { a: 0.1, b: 10 },
    });
    expect(out.chosenModelId).toBe("b");
  });

  it("abtc uses trust means", () => {
    const out = runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.5, b: 0.5 },
      trustMeans: { a: 0.1, b: 0.9 },
    });
    expect(out.chosenModelId).toBe("b");
  });

  it("abtc with exponent 1 matches legacy weighting for equal scores", () => {
    const out = runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.5, b: 0.5 },
      trustMeans: { a: 0.2, b: 0.8 },
      abtcConsensusExponent: 1,
    });
    expect(out.chosenModelId).toBe("b");
  });

  it("abtc exponent sharpens trust influence", () => {
    const lowTrustHighScore = runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.95, b: 0.4 },
      trustMeans: { a: 0.35, b: 0.65 },
      abtcConsensusExponent: 1,
    });
    const sharp = runConsensus({
      mode: "abtc",
      domain: "geo",
      candidates,
      scores: { a: 0.95, b: 0.4 },
      trustMeans: { a: 0.35, b: 0.65 },
      abtcConsensusExponent: 3,
    });
    expect(lowTrustHighScore.chosenModelId).toBe("a");
    expect(sharp.chosenModelId).toBe("b");
  });
});
