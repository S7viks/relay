import type { RankedModel } from "./types.js";

/**
 * Deterministic provider-diverse selection: round-robin across providers, each round taking
 * the next-best model from that provider. Provider order follows descending top-model routing score.
 */
export function selectDiverseRankedModels(
  ranked: RankedModel[],
  k: number,
): { selected: RankedModel[]; explanation: string } {
  const kk = Math.max(0, Math.floor(k));
  if (ranked.length === 0 || kk === 0) {
    return { selected: [], explanation: "empty_ranking_or_zero_k" };
  }
  const cap = Math.min(kk, ranked.length);

  const groups = new Map<string, RankedModel[]>();
  for (const r of ranked) {
    const list = groups.get(r.providerId) ?? [];
    list.push(r);
    groups.set(r.providerId, list);
  }

  const providerOrder = [...groups.entries()]
    .sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0))
    .map(([pid]) => pid);

  const selected: RankedModel[] = [];
  let round = 0;
  while (selected.length < cap) {
    let progressed = false;
    for (const pid of providerOrder) {
      const g = groups.get(pid);
      if (!g || round >= g.length) continue;
      selected.push(g[round]!);
      progressed = true;
      if (selected.length >= cap) break;
    }
    if (!progressed) break;
    round++;
  }

  const explanation = `diverse_round_robin_by_provider order=${providerOrder.join(">")} picked=${selected.map((s) => s.modelId).join(",")}`;
  return { selected, explanation };
}
