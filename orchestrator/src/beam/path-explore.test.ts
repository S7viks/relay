import { describe, expect, it } from "vitest";
import { pathIdForModel, pruneBeam, scorePaths } from "./path-explore.js";
import type { ModelCallResult } from "../domain/task.js";

const mk = (modelId: string, text: string, err?: string): ModelCallResult => ({
  modelId,
  providerId: "p",
  text,
  latencyMs: 1,
  ...(err ? { error: err } : {}),
});

describe("path-explore", () => {
  it("pathIdForModel is stable", () => {
    expect(pathIdForModel("m1")).toBe("path:m1");
  });

  it("scorePaths sorts by score desc then path id", () => {
    const paths = scorePaths("objective text", [mk("z", "objective match"), mk("a", "other")], (_o, t) =>
      t.includes("objective") ? 1 : 0,
    );
    expect(paths[0]?.modelId).toBe("z");
    expect(paths[1]?.modelId).toBe("a");
  });

  it("pruneBeam keeps top beamWidth by score", () => {
    const paths = scorePaths("obj", [mk("m1", "obj"), mk("m2", "obj long"), mk("m3", "x")], (_o, t) => t.length * 0.1);
    const { kept, discarded } = pruneBeam(paths, 2);
    expect(kept).toHaveLength(2);
    expect(discarded).toHaveLength(1);
    const keptIds = new Set(kept.map((k) => k.pathId));
    for (const d of discarded) {
      expect(keptIds.has(d.pathId)).toBe(false);
    }
  });
});
