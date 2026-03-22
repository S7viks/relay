import { decayTrust, updateTrustObservation } from "./abtc.js";
import { UNIFORM_PRIOR, betaMean, type BetaTrust } from "../domain/trust.js";

export type TrustConsensusRole = "winner" | "participant";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Maps consensus role + path quality into a Beta observation mean in [0,1].
 * Winner signals lean high; non-winning participants lean low (same quality → lower x).
 */
export function consensusTrustSignal(qualityScore: number, role: TrustConsensusRole): number {
  const q = clamp01(qualityScore);
  if (role === "winner") {
    return clamp01(0.5 + 0.5 * q);
  }
  return clamp01(0.5 * q);
}

export function explainTrustSignal(qualityScore: number, role: TrustConsensusRole, signal: number): string {
  const q = clamp01(qualityScore);
  if (role === "winner") {
    return `winner: signal=clamp01(0.5+0.5*quality) quality=${q.toFixed(4)} signal=${signal.toFixed(4)}`;
  }
  return `participant: signal=clamp01(0.5*quality) quality=${q.toFixed(4)} signal=${signal.toFixed(4)}`;
}

/**
 * Decay stored trust toward uniform prior, then apply a weighted Beta observation.
 * Pure; does not read/write persistence.
 */
export function applyTrustPosteriorStep(
  stored: BetaTrust,
  opts: {
    decay: number;
    strength: number;
    signal: number;
    uniformPrior?: BetaTrust;
  },
): { afterDecay: BetaTrust; posterior: BetaTrust } {
  const prior = opts.uniformPrior ?? UNIFORM_PRIOR;
  const afterDecay = decayTrust(stored, opts.decay, prior);
  const posterior = updateTrustObservation(afterDecay, opts.signal, opts.strength);
  return { afterDecay, posterior };
}

export function betaMeanPair(prior: BetaTrust, posterior: BetaTrust): { priorMean: number; posteriorMean: number } {
  return { priorMean: betaMean(prior), posteriorMean: betaMean(posterior) };
}
