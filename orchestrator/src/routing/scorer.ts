import { betaMean, type BetaTrust } from "../domain/trust.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import type { SubtaskSpec } from "../domain/task.js";
import type { RankedModel, RoutingContext } from "./types.js";

// Paper Eq. 3 fitness weights: fitness = W_C*CapMatch + W_H*HistAcc + W_E*(1-cost)
const W_C = 0.4; // capability match weight
const W_H = 0.4; // historical accuracy weight
const W_E = 0.2; // cost efficiency weight

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function invNorm(x: number, max: number): number {
  if (max <= 0) return 1;
  return clamp01(1 - x / max);
}

/**
 * CapMatch: Jaccard overlap between model declared capabilities and task requirements.
 * Returns 1.0 when no capabilities are required (unconstrained task).
 */
function capabilityMatch(entry: ModelRegistryEntry, sub: SubtaskSpec): number {
  const req = sub.requiredCapabilities ?? [];
  if (req.length === 0) return 1;
  const caps = new Set(entry.capabilities);
  let hit = 0;
  for (const r of req) {
    if (caps.has(r)) hit++;
  }
  return hit / req.length;
}

/**
 * ComputeFitness per paper Eq. 3:
 *   fitness(m, t) = W_C * CapMatch(m, t) + W_H * HistAcc(m, type(t)) + W_E * (1 − ĉ_m)
 *
 * HistAcc is drawn from the performance tracker (entry.accuracyPrior) if available,
 * falling back to the Beta posterior mean from the trust store.
 * ĉ_m is the normalized per-token cost index (0 = cheapest, 1 = most expensive).
 * Unavailable models are filtered before scoring.
 */
export function scoreModel(ctx: RoutingContext, entry: ModelRegistryEntry): RankedModel {
  const trust: BetaTrust = ctx.trustByModel[entry.modelId] ?? { alpha: 1, beta: 1 };

  // HistAcc: use recorded accuracy prior if present; otherwise Beta posterior mean
  const histAcc = clamp01(entry.accuracyPrior ?? betaMean(trust));

  const maxCost = Math.max(
    1e-6,
    ...ctx.registry.map((e) => e.costIndex),
  );
  const maxLat = Math.max(
    1,
    ...ctx.registry.map((e) => e.latencyPriorMs),
  );

  const costEfficiency = invNorm(entry.costIndex, maxCost); // 1 - normalized cost
  const lat = invNorm(entry.latencyPriorMs, maxLat);        // kept for breakdown reporting
  const avail = entry.available ? 1 : 0;
  const cap = capabilityMatch(entry, ctx.subtask);

  // Core fitness function from Eq. 3
  const fitness = W_C * cap + W_H * histAcc + W_E * costEfficiency;

  // Latency is a secondary tie-breaker: applied as a small (<5%) scaling
  // factor so the primary fitness ordering is not disturbed.
  const latencyModifier = 1 + 0.05 * lat;
  const score = clamp01(fitness) * latencyModifier * avail;

  const breakdown = {
    accuracy: histAcc,
    latency: lat,
    cost: costEfficiency,
    availability: avail,
    capabilityMatch: cap,
  };

  return { modelId: entry.modelId, providerId: entry.providerId, score, breakdown };
}

export function rankModels(ctx: RoutingContext): RankedModel[] {
  return ctx.registry
    .filter((e) => e.available)
    .map((e) => scoreModel(ctx, e))
    .sort((a, b) => b.score - a.score);
}
