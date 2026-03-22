import type { RankedModel, RoutingContext } from "./types.js";
import { rankModels } from "./scorer.js";
import { selectDiverseRankedModels } from "./diversity.js";

export interface RoutingPlan {
  /** Models selected for this subtask (candidate pool before beam prune). */
  candidateModelIds: string[];
  ranked: RankedModel[];
  diversityExplanation: string;
  candidatePoolSize: number;
  beamWidth: number;
  modelRankSnapshot: Array<{
    modelId: string;
    providerId: string;
    routingScore: number;
    breakdown: RankedModel["breakdown"];
  }>;
}

/**
 * Pure routing plan: how many models to try, and which ids, with diversity across providers.
 */
export function planSubtaskRouting(
  ctx: RoutingContext,
  opts: { explorePaths: boolean; beamWidth: number; maxParallelCalls: number },
): RoutingPlan {
  const ranked = rankModels(ctx);
  const bw = Math.max(1, Math.floor(opts.beamWidth));

  let poolSize: number;
  if (!opts.explorePaths) {
    poolSize = 1;
  } else {
    const want = Math.max(bw * 2, bw);
    poolSize = Math.min(want, opts.maxParallelCalls, ranked.length);
  }

  const { selected, explanation } = selectDiverseRankedModels(ranked, poolSize);

  return {
    candidateModelIds: selected.map((s) => s.modelId),
    ranked,
    diversityExplanation: explanation,
    candidatePoolSize: poolSize,
    beamWidth: bw,
    modelRankSnapshot: ranked.map((r) => ({
      modelId: r.modelId,
      providerId: r.providerId,
      routingScore: r.score,
      breakdown: r.breakdown,
    })),
  };
}
