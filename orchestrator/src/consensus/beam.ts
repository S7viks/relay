/**
 * Keep top-k candidate ids by descending score (beam pruning).
 */
export function beamPrune(ids: string[], scores: Record<string, number>, width: number): string[] {
  const w = Math.max(1, Math.floor(width));
  return [...ids]
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    .slice(0, w);
}
