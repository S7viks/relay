import { tokenJaccard } from "../routing/text-sim.js";

/**
 * Cheap, deterministic quality proxy for routing/consensus loops (replace with judge model in production).
 */
export function scoreAnswer(objective: string, answer: string): number {
  const j = tokenJaccard(objective, answer);
  const len = Math.min(1, answer.length / 400);
  return clamp01(0.6 * j + 0.4 * len);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
