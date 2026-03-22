import type { ModelCallResult } from "../domain/task.js";
import { scoreAnswer } from "./scorer.js";

export interface EvalExample {
  objective: string;
  expectedContains?: string[];
}

export function evaluateAgainstContains(
  ex: EvalExample,
  result: ModelCallResult,
): { pass: boolean; score: number; notes?: string } {
  const base = scoreAnswer(ex.objective, result.text);
  if (!ex.expectedContains?.length) {
    return { pass: base >= 0.2, score: base };
  }
  const missing = ex.expectedContains.filter((s) => !result.text.includes(s));
  const ok = missing.length === 0;
  return {
    pass: ok,
    score: ok ? Math.min(1, base + 0.2) : base * 0.5,
    notes: missing.length ? `missing: ${missing.join(", ")}` : undefined,
  };
}
