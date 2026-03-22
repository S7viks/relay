import { beamPrune } from "../consensus/beam.js";
import type { ModelId } from "../domain/ids.js";
import type { RoutingContext } from "./types.js";
import { rankModels } from "./scorer.js";

export interface RouterDecision {
  modelIds: ModelId[];
  ranked: ReturnType<typeof rankModels>;
}

/**
 * Selects top models for a subtask; optional beam width limits parallelism.
 */
export function routeSubtask(ctx: RoutingContext, beamWidth: number): RouterDecision {
  const ranked = rankModels(ctx);
  const ids = ranked.map((r) => r.modelId);
  const scoreMap = Object.fromEntries(ranked.map((r) => [r.modelId, r.score]));
  const pruned = beamPrune(ids, scoreMap, beamWidth);
  return { modelIds: pruned, ranked };
}
