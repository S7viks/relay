import { betaMean, type BetaTrust } from "../domain/trust.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import type { SubtaskSpec } from "../domain/task.js";
import type { RankedModel, RoutingContext, RoutingWeights } from "./types.js";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function invNorm(x: number, max: number): number {
  if (max <= 0) return 1;
  return clamp01(1 - x / max);
}

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

const DEFAULT_WEIGHTS: RoutingWeights = {
  accuracy: 0.35,
  latency: 0.2,
  cost: 0.2,
  availability: 0.15,
};

/**
 * Pure routing score for one registry entry. Higher is better.
 */
export function scoreModel(ctx: RoutingContext, entry: ModelRegistryEntry): RankedModel {
  const w = { ...DEFAULT_WEIGHTS, ...ctx.weights };
  const trust: BetaTrust = ctx.trustByModel[entry.modelId] ?? { alpha: 1, beta: 1 };
  const acc = entry.accuracyPrior ?? betaMean(trust);

  const maxLat = Math.max(
    1,
    ...ctx.registry.map((e) => e.latencyPriorMs),
  );
  const maxCost = Math.max(
    1e-6,
    ...ctx.registry.map((e) => e.costIndex),
  );

  const lat = invNorm(entry.latencyPriorMs, maxLat);
  const cost = invNorm(entry.costIndex, maxCost);
  const avail = entry.available ? 1 : 0;
  const cap = capabilityMatch(entry, ctx.subtask);

  const breakdown = {
    accuracy: acc,
    latency: lat,
    cost,
    availability: avail,
    capabilityMatch: cap,
  };

  const base =
    w.accuracy * acc +
    w.latency * lat +
    w.cost * cost +
    w.availability * avail;

  const score = base * (0.5 + 0.5 * cap);

  return { modelId: entry.modelId, providerId: entry.providerId, score, breakdown };
}

export function rankModels(ctx: RoutingContext): RankedModel[] {
  return ctx.registry
    .filter((e) => e.available)
    .map((e) => scoreModel(ctx, e))
    .sort((a, b) => b.score - a.score);
}
