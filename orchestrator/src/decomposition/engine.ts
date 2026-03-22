import { randomUUID } from "node:crypto";
import type { OrchestrationRequest, DecompositionResult, SubtaskSpec } from "../domain/task.js";
import type { Decomposer } from "./types.js";

/**
 * Deterministic, fast baseline decomposer (no extra LLM call).
 * Replace with LLM-backed Decomposer without changing orchestration.
 */
export class HeuristicDecomposer implements Decomposer {
  async decompose(req: OrchestrationRequest): Promise<DecompositionResult> {
    const text = req.objective.trim();
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const subtasks: SubtaskSpec[] =
      sentences.length <= 1
        ? [
            {
              id: randomUUID(),
              title: "main",
              description: text || req.messages.map((m) => m.content).join("\n"),
              taskKind: req.taskKind,
            },
          ]
        : sentences.map((s, i) => ({
            id: randomUUID(),
            title: `step-${i + 1}`,
            description: s,
            taskKind: req.taskKind,
            requiredCapabilities: guessCaps(req.taskKind),
          }));

    return {
      subtasks,
      rationale: sentences.length <= 1 ? "single-step" : "sentence-split",
    };
  }
}

function guessCaps(kind: OrchestrationRequest["taskKind"]): string[] | undefined {
  if (kind === "code") return ["code"];
  if (kind === "reasoning") return ["reasoning"];
  return undefined;
}
