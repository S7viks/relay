import { describe, expect, it } from "vitest";
import {
  applyTrustPosteriorStep,
  consensusTrustSignal,
  explainTrustSignal,
} from "./trust-update.js";
import { UNIFORM_PRIOR, betaMean } from "../domain/trust.js";

describe("consensusTrustSignal", () => {
  it("gives higher signal to winner than participant at same quality", () => {
    const q = 0.8;
    const w = consensusTrustSignal(q, "winner");
    const p = consensusTrustSignal(q, "participant");
    expect(w).toBeGreaterThan(p);
    expect(w).toBeCloseTo(0.9);
    expect(p).toBeCloseTo(0.4);
  });

  it("is deterministic for fixed inputs", () => {
    expect(consensusTrustSignal(0.3, "winner")).toBe(consensusTrustSignal(0.3, "winner"));
  });
});

describe("explainTrustSignal", () => {
  it("includes role and numeric hints", () => {
    const s = consensusTrustSignal(0.5, "participant");
    const ex = explainTrustSignal(0.5, "participant", s);
    expect(ex).toContain("participant");
    expect(ex).toContain("signal=");
  });
});

describe("applyTrustPosteriorStep", () => {
  it("initializes from uniform prior behavior via stored uniform", () => {
    const { posterior } = applyTrustPosteriorStep(UNIFORM_PRIOR, {
      decay: 0,
      strength: 2,
      signal: 0.8,
      uniformPrior: UNIFORM_PRIOR,
    });
    expect(posterior.alpha).toBeGreaterThan(UNIFORM_PRIOR.alpha);
  });

  it("decay pulls toward prior before observation", () => {
    const skewed = { alpha: 20, beta: 2 };
    const { afterDecay, posterior } = applyTrustPosteriorStep(skewed, {
      decay: 1,
      strength: 1,
      signal: 0.5,
      uniformPrior: UNIFORM_PRIOR,
    });
    expect(afterDecay.alpha).toBeCloseTo(UNIFORM_PRIOR.alpha);
    expect(posterior.alpha).toBeGreaterThan(afterDecay.alpha);
  });

  it("winner path increases mean vs participant path from same prior", () => {
    const prior = { alpha: 3, beta: 3 };
    const win = applyTrustPosteriorStep(prior, {
      decay: 0,
      strength: 2,
      signal: consensusTrustSignal(0.7, "winner"),
    });
    const lose = applyTrustPosteriorStep(prior, {
      decay: 0,
      strength: 2,
      signal: consensusTrustSignal(0.7, "participant"),
    });
    const mw = betaMean(win.posterior);
    const ml = betaMean(lose.posterior);
    expect(mw).toBeGreaterThan(ml);
  });
});

describe("domain separation (pure)", () => {
  it("posterior depends only on passed prior snapshot", () => {
    const d1 = applyTrustPosteriorStep(UNIFORM_PRIOR, {
      decay: 0,
      strength: 3,
      signal: 1,
    }).posterior;
    const d2 = applyTrustPosteriorStep({ alpha: 5, beta: 1 }, {
      decay: 0,
      strength: 3,
      signal: 0,
    }).posterior;
    expect(d1.alpha).not.toBe(d2.alpha);
  });
});

describe("stable repeated application", () => {
  it("same inputs yield same outputs", () => {
    const a = applyTrustPosteriorStep({ alpha: 2, beta: 2 }, {
      decay: 0.2,
      strength: 1.5,
      signal: 0.6,
    });
    const b = applyTrustPosteriorStep({ alpha: 2, beta: 2 }, {
      decay: 0.2,
      strength: 1.5,
      signal: 0.6,
    });
    expect(a.posterior).toEqual(b.posterior);
  });
});
