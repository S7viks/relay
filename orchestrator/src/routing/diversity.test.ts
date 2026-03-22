import { describe, expect, it } from "vitest";
import { selectDiverseRankedModels } from "./diversity.js";
import type { RankedModel } from "./types.js";

function rm(
  modelId: string,
  providerId: string,
  score: number,
  breakdown: RankedModel["breakdown"],
): RankedModel {
  return { modelId, providerId, score, breakdown };
}

const b: RankedModel["breakdown"] = {
  accuracy: 0.5,
  latency: 0.5,
  cost: 0.5,
  availability: 1,
  capabilityMatch: 1,
};

describe("selectDiverseRankedModels", () => {
  it("round-robins across providers in score-major provider order", () => {
    const ranked: RankedModel[] = [
      rm("ollama-a", "ollama", 0.9, b),
      rm("ollama-b", "ollama", 0.85, b),
      rm("or-a", "openrouter", 0.7, b),
      rm("or-b", "openrouter", 0.65, b),
    ];
    const { selected, explanation } = selectDiverseRankedModels(ranked, 3);
    expect(explanation).toContain("diverse_round_robin");
    expect(selected.map((s) => s.modelId)).toEqual(["ollama-a", "or-a", "ollama-b"]);
  });

  it("respects k cap", () => {
    const ranked: RankedModel[] = [
      rm("a1", "p1", 1, b),
      rm("a2", "p1", 0.9, b),
      rm("b1", "p2", 0.8, b),
    ];
    const { selected } = selectDiverseRankedModels(ranked, 1);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.modelId).toBe("a1");
  });
});
