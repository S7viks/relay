import type { DomainTag, ModelId } from "./ids.js";

/** Beta-distributed trust: mean = alpha / (alpha + beta). */
export interface BetaTrust {
  alpha: number;
  beta: number;
}

export const UNIFORM_PRIOR: BetaTrust = { alpha: 1, beta: 1 };

export function betaMean(t: BetaTrust): number {
  const d = t.alpha + t.beta;
  if (d <= 0) return 0.5;
  return t.alpha / d;
}

export function betaVariance(t: BetaTrust): number {
  const a = t.alpha;
  const b = t.beta;
  const sum = a + b;
  if (sum <= 0) return 0.25;
  return (a * b) / (sum * sum * (sum + 1));
}

export interface ModelDomainTrustKey {
  modelId: ModelId;
  domain: DomainTag;
}

/** Serializable trust row for persistence. */
export interface TrustRecord extends ModelDomainTrustKey {
  distribution: BetaTrust;
  updatedAt: string;
}
