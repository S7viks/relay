import { UNIFORM_PRIOR, betaMean, betaVariance, type BetaTrust } from "../domain/trust.js";

export { betaMean, betaVariance };

/**
 * Pull pseudo-counts toward the uniform prior. `decay` in [0,1]; higher = more forgetting.
 */
export function decayTrust(t: BetaTrust, decay: number, prior: BetaTrust = UNIFORM_PRIOR): BetaTrust {
  const d = Math.min(1, Math.max(0, decay));
  return {
    alpha: prior.alpha + (1 - d) * (t.alpha - prior.alpha),
    beta: prior.beta + (1 - d) * (t.beta - prior.beta),
  };
}

/**
 * Online update after observing a graded outcome in [0,1].
 * `strength` scales how many pseudo-observations this round represents.
 */
export function updateTrustObservation(
  t: BetaTrust,
  outcome01: number,
  strength: number,
): BetaTrust {
  const x = Math.min(1, Math.max(0, outcome01));
  const s = Math.max(0, strength);
  return {
    alpha: t.alpha + s * x,
    beta: t.beta + s * (1 - x),
  };
}

/**
 * One ABTC round: decay old evidence, then incorporate new observation.
 */
export function abtcRound(
  prior: BetaTrust,
  outcome01: number,
  opts: { decay: number; strength: number; uniformPrior?: BetaTrust },
): BetaTrust {
  const decayed = decayTrust(prior, opts.decay, opts.uniformPrior ?? UNIFORM_PRIOR);
  return updateTrustObservation(decayed, outcome01, opts.strength);
}
