import type { ModelCallResult } from "../domain/task.js";

export interface ScoredPath {
  pathId: string;
  modelId: string;
  providerId: string;
  result: ModelCallResult;
  score: number;
}

/** Deterministic path id for a single-hop path (one model call). */
export function pathIdForModel(modelId: string): string {
  return `path:${modelId}`;
}

/**
 * Attach heuristic scores to each model result (pure).
 */
export function scorePaths(
  subtaskDescription: string,
  results: ModelCallResult[],
  scoreAnswer: (objective: string, answer: string) => number,
): ScoredPath[] {
  const paths: ScoredPath[] = [];
  for (const r of results) {
    const pathId = pathIdForModel(r.modelId);
    const score = r.error ? 0 : scoreAnswer(subtaskDescription, r.text);
    paths.push({
      pathId,
      modelId: r.modelId,
      providerId: r.providerId,
      result: r,
      score,
    });
  }
  return paths.sort(comparePaths);
}

function comparePaths(a: ScoredPath, b: ScoredPath): number {
  const ds = b.score - a.score;
  if (ds !== 0) return ds;
  return a.pathId.localeCompare(b.pathId);
}

/**
 * Keep top beamWidth paths by score; ties broken by pathId (deterministic).
 */
export function pruneBeam(paths: ScoredPath[], beamWidth: number): {
  kept: ScoredPath[];
  discarded: ScoredPath[];
} {
  const sorted = [...paths].sort(comparePaths);
  const w = Math.max(1, Math.floor(beamWidth));
  const kept = sorted.slice(0, Math.min(w, sorted.length));
  const keptIds = new Set(kept.map((p) => p.pathId));
  const discarded = sorted.filter((p) => !keptIds.has(p.pathId));
  return { kept, discarded };
}

/** Best path after pruning (non-empty kept). */
export function pickWinningPath(kept: ScoredPath[]): ScoredPath | undefined {
  if (kept.length === 0) return undefined;
  return [...kept].sort(comparePaths)[0];
}
