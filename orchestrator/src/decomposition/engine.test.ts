import { describe, expect, it } from "vitest";
import { HeuristicDecomposer } from "./engine.js";

describe("HeuristicDecomposer", () => {
  it("returns a single subtask for short objectives", async () => {
    const d = new HeuristicDecomposer();
    const r = await d.decompose({
      traceId: "t1",
      domain: "general",
      taskKind: "qa",
      objective: "What is 2+2?",
      messages: [],
    });
    expect(r.subtasks).toHaveLength(1);
    expect(r.subtasks[0]?.description).toContain("2+2");
  });

  it("splits multi-sentence objectives", async () => {
    const d = new HeuristicDecomposer();
    const r = await d.decompose({
      traceId: "t2",
      domain: "general",
      taskKind: "reasoning",
      objective: "First step. Second step! Third step?",
      messages: [],
    });
    expect(r.subtasks.length).toBeGreaterThanOrEqual(2);
  });
});
