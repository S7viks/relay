import { describe, expect, it } from "vitest";
import { abtcRound, betaMean, betaVariance, decayTrust, updateTrustObservation } from "./abtc.js";
import { UNIFORM_PRIOR } from "../domain/trust.js";

describe("abtc", () => {
  it("betaMean matches textbook cases", () => {
    expect(betaMean({ alpha: 1, beta: 1 })).toBeCloseTo(0.5);
    expect(betaMean({ alpha: 3, beta: 1 })).toBeCloseTo(0.75);
  });

  it("decayTrust moves toward prior", () => {
    const t = { alpha: 10, beta: 2 };
    const d = decayTrust(t, 1, UNIFORM_PRIOR);
    expect(d.alpha).toBeCloseTo(UNIFORM_PRIOR.alpha);
    expect(d.beta).toBeCloseTo(UNIFORM_PRIOR.beta);
  });

  it("updateTrustObservation shifts mean toward outcome", () => {
    const t = UNIFORM_PRIOR;
    const hi = updateTrustObservation(t, 1, 5);
    expect(betaMean(hi)).toBeGreaterThan(betaMean(t));
    const lo = updateTrustObservation(t, 0, 5);
    expect(betaMean(lo)).toBeLessThan(betaMean(t));
  });

  it("abtcRound composes decay then observation", () => {
    const start = { alpha: 4, beta: 4 };
    const next = abtcRound(start, 0.9, { decay: 0.5, strength: 2 });
    expect(next.alpha).toBeGreaterThan(0);
    expect(next.beta).toBeGreaterThan(0);
    expect(betaVariance(next)).toBeLessThan(0.3);
  });
});
