import { UNIFORM_PRIOR, betaMean, betaVariance, type BetaTrust } from "../domain/trust.js";

export { betaMean, betaVariance };
export const DEFAULT_LAMBDA = 0.98;
export const DEFAULT_ALPHA_INIT = 1.0;
export const DEFAULT_BETA_INIT = 1.0;
export const DEFAULT_THETA_MIN = 0.6;
export const DEFAULT_W_QUALITY = 0.5;
export const DEFAULT_W_AGREEMENT = 0.3;
export const DEFAULT_W_TRUST = 0.2;

export function computePosteriorMean(alpha: number, beta: number): number {
  if (alpha + beta <= 0) return 0.5;
  return alpha / (alpha + beta);
}

export function updateTrust(
  alpha: number,
  beta: number,
  isWinner: boolean,
  lambda: number = DEFAULT_LAMBDA,
): { alpha: number; beta: number } {
  return {
    alpha: lambda * alpha + (isWinner ? 1.0 : 0.0),
    beta: lambda * beta + (isWinner ? 0.0 : 1.0),
  };
}

export function computePosteriorVariance(alpha: number, beta: number): number {
  const n = alpha + beta;
  if (n <= 0) return 0.25;
  return (alpha * beta) / (n * n * (n + 1));
}

export function computeCompositeScore(
  qualityScore: number,
  agreementScore: number,
  trustMean: number,
  wQ = DEFAULT_W_QUALITY,
  wA = DEFAULT_W_AGREEMENT,
  wT = DEFAULT_W_TRUST,
): number {
  return wQ * qualityScore + wA * agreementScore + wT * trustMean;
}

export function computeConfidence(scores: number[]): number {
  const total = scores.reduce((a, b) => a + b, 0);
  if (total <= 0 || scores.length === 0) return 0;
  const top = Math.max(...scores);
  return top / total;
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function crossModelAgreement(candidateContent: string, otherContents: string[]): number {
  if (otherContents.length === 0) return 1.0;
  const scores = otherContents.map((o) => tokenJaccard(candidateContent, o));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function decayTrust(t: BetaTrust, decay: number, prior: BetaTrust = UNIFORM_PRIOR): BetaTrust {
  const d = Math.min(1, Math.max(0, decay));
  return {
    alpha: prior.alpha + (1 - d) * (t.alpha - prior.alpha),
    beta: prior.beta + (1 - d) * (t.beta - prior.beta),
  };
}

export function updateTrustObservation(t: BetaTrust, outcome01: number, strength: number): BetaTrust {
  const x = Math.min(1, Math.max(0, outcome01));
  const s = Math.max(0, strength);
  return {
    alpha: t.alpha + s * x,
    beta: t.beta + s * (1 - x),
  };
}

export function abtcRound(
  prior: BetaTrust,
  outcome01: number,
  opts: { decay: number; strength: number; uniformPrior?: BetaTrust },
): BetaTrust {
  const decayed = decayTrust(prior, opts.decay, opts.uniformPrior ?? UNIFORM_PRIOR);
  return updateTrustObservation(decayed, outcome01, opts.strength);
}
