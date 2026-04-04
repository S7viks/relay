import {
  computePosteriorMean,
  DEFAULT_LAMBDA,
  updateTrust,
} from "./abtc.js";
import { betaMean, type BetaTrust } from "../domain/trust.js";

export type TrustConsensusRole = "winner" | "participant";
export interface TrustUpdateEventPayload {
  type: "trust_update";
  modelId: string;
  domain: string;
  alphaBefore: number;
  betaBefore: number;
  alphaAfter: number;
  betaAfter: number;
  isWinner: boolean;
  lambda: number;
  posteriorMeanAfter: number;
}

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
    decay?: number;
    strength?: number;
    signal?: number;
    uniformPrior?: BetaTrust;
    isWinner?: boolean;
    lambda?: number;
    modelId?: string;
    domain?: string;
  },
): { afterDecay: BetaTrust; posterior: BetaTrust; event?: TrustUpdateEventPayload } {
  const derivedLambda =
    opts.lambda ??
    (opts.decay !== undefined ? clamp01(1 - opts.decay) : DEFAULT_LAMBDA);
  const signal = clamp01(opts.signal ?? (opts.isWinner ? 1 : 0));
  const isWinner = opts.isWinner ?? signal >= 0.5;
  const afterDecay: BetaTrust = {
    alpha: derivedLambda * stored.alpha,
    beta: derivedLambda * stored.beta,
  };
  const posterior = updateTrust(stored.alpha, stored.beta, isWinner, derivedLambda);
  if (!opts.modelId || !opts.domain) {
    return { afterDecay, posterior };
  }
  return {
    afterDecay,
    posterior,
    event: {
      type: "trust_update",
      modelId: opts.modelId,
      domain: opts.domain,
      alphaBefore: stored.alpha,
      betaBefore: stored.beta,
      alphaAfter: posterior.alpha,
      betaAfter: posterior.beta,
      isWinner,
      lambda: derivedLambda,
      posteriorMeanAfter: computePosteriorMean(posterior.alpha, posterior.beta),
    },
  };
}

export function createTrustUpdateEvent(args: {
  modelId: string;
  domain: string;
  alpha: number;
  beta: number;
  isWinner: boolean;
  lambda?: number;
}): TrustUpdateEventPayload {
  const lambda = args.lambda ?? DEFAULT_LAMBDA;
  const posterior = updateTrust(args.alpha, args.beta, args.isWinner, lambda);
  return {
    type: "trust_update",
    modelId: args.modelId,
    domain: args.domain,
    alphaBefore: args.alpha,
    betaBefore: args.beta,
    alphaAfter: posterior.alpha,
    betaAfter: posterior.beta,
    isWinner: args.isWinner,
    lambda,
    posteriorMeanAfter: computePosteriorMean(posterior.alpha, posterior.beta),
  };
}

export function betaMeanPair(prior: BetaTrust, posterior: BetaTrust): { priorMean: number; posteriorMean: number } {
  return { priorMean: betaMean(prior), posteriorMean: betaMean(posterior) };
}
