/**
 * Hyperparameter sensitivity analysis harness (paper Section 6.5).
 *
 * Sweeps λ ∈ {0.90, 0.95, 0.98, 0.99, 1.00} and beam width k ∈ {1,2,3,4,5}
 * to characterise the quality-vs-latency trade-off reported in the paper.
 *
 * Usage:
 *   const results = await runLambdaSweep(runAbtcRound, benchmarkQueries);
 *   const bwResults = await runBeamWidthSweep(runOrchestration, benchmarkQueries);
 */

import { LAMBDA_SWEEP, BEAM_WIDTH_SWEEP } from "../config/paper-constants.js";
import {
  DEFAULT_ALPHA_INIT,
  DEFAULT_BETA_INIT,
  updateTrust,
  computeCompositeScore,
  computeEvaluateQuality,
  crossModelAgreement,
  computePosteriorMean,
} from "../consensus/abtc.js";

export interface SweepQuery {
  query: string;
  /** Ground-truth answer (for accuracy measurement) or null for open-ended. */
  groundTruth?: string;
}

export interface ModelResponse {
  modelId: string;
  text: string;
}

/** Result for a single (lambda, domain) cell. */
export interface LambdaSweepCell {
  lambda: number;
  domain: string;
  meanQualityScore: number;
  roundCount: number;
}

/**
 * Sweep λ values and report per-domain mean quality score.
 * `runModels` should call the actual model adapters and return parallel responses.
 */
export async function runLambdaSweep(
  queries: SweepQuery[],
  runModels: (query: string) => Promise<ModelResponse[]>,
  domain = "general",
): Promise<LambdaSweepCell[]> {
  const results: LambdaSweepCell[] = [];

  for (const lambda of LAMBDA_SWEEP) {
    const alphas: Record<string, number> = {};
    const betas: Record<string, number> = {};
    let totalQuality = 0;

    for (const q of queries) {
      const responses = await runModels(q.query);
      if (responses.length === 0) continue;

      const scored = await Promise.all(
        responses.map(async (r) => {
          const alpha = alphas[r.modelId] ?? DEFAULT_ALPHA_INIT;
          const beta = betas[r.modelId] ?? DEFAULT_BETA_INIT;
          const tau = computePosteriorMean(alpha, beta);
          const quality = await computeEvaluateQuality(r.text, q.query);
          const others = responses.filter((x) => x.modelId !== r.modelId).map((x) => x.text);
          const agreement = await crossModelAgreement(r.text, others);
          const score = computeCompositeScore(quality, agreement, tau);
          return { modelId: r.modelId, score, quality };
        }),
      );

      scored.sort((a, b) => b.score - a.score);
      const winner = scored[0]!;
      totalQuality += winner.quality;

      for (const s of scored) {
        const isWinner = s.modelId === winner.modelId;
        const prev = updateTrust(
          alphas[s.modelId] ?? DEFAULT_ALPHA_INIT,
          betas[s.modelId] ?? DEFAULT_BETA_INIT,
          isWinner,
          lambda,
        );
        alphas[s.modelId] = prev.alpha;
        betas[s.modelId] = prev.beta;
      }
    }

    results.push({
      lambda,
      domain,
      meanQualityScore: queries.length > 0 ? totalQuality / queries.length : 0,
      roundCount: queries.length,
    });
  }

  return results;
}

export interface BeamWidthSweepCell {
  beamWidth: number;
  domain: string;
  meanQualityScore: number;
  meanLatencyMs: number;
}

/**
 * Sweep beam width k and report quality-vs-latency trade-off.
 * `runOrchestration` should run the full pipeline with the given beam width.
 */
export async function runBeamWidthSweep(
  queries: SweepQuery[],
  runOrchestration: (query: string, beamWidth: number) => Promise<{ text: string; latencyMs: number }>,
  domain = "general",
): Promise<BeamWidthSweepCell[]> {
  const results: BeamWidthSweepCell[] = [];

  for (const bw of BEAM_WIDTH_SWEEP) {
    let totalQuality = 0;
    let totalLatency = 0;
    let count = 0;

    for (const q of queries) {
      const start = Date.now();
      const res = await runOrchestration(q.query, bw);
      const latency = Date.now() - start;
      const quality = await computeEvaluateQuality(res.text, q.query);
      totalQuality += quality;
      totalLatency += res.latencyMs > 0 ? res.latencyMs : latency;
      count++;
    }

    results.push({
      beamWidth: bw,
      domain,
      meanQualityScore: count > 0 ? totalQuality / count : 0,
      meanLatencyMs: count > 0 ? totalLatency / count : 0,
    });
  }

  return results;
}

/**
 * Generate ABTC trust posterior convergence curves (paper Section 6.4).
 * Returns τ̂_m per domain after each round for all models.
 */
export async function abtcConvergenceCurve(
  queries: SweepQuery[],
  runModels: (query: string) => Promise<ModelResponse[]>,
  lambda: number,
): Promise<Array<{ round: number; modelId: string; posteriorMean: number }>> {
  const alphas: Record<string, number> = {};
  const betas: Record<string, number> = {};
  const curve: Array<{ round: number; modelId: string; posteriorMean: number }> = [];

  for (let round = 0; round < queries.length; round++) {
    const q = queries[round]!;
    const responses = await runModels(q.query);
    if (responses.length === 0) continue;

    const scored = await Promise.all(
      responses.map(async (r) => {
        const alpha = alphas[r.modelId] ?? DEFAULT_ALPHA_INIT;
        const beta = betas[r.modelId] ?? DEFAULT_BETA_INIT;
        const tau = computePosteriorMean(alpha, beta);
        const quality = await computeEvaluateQuality(r.text, q.query);
        const others = responses.filter((x) => x.modelId !== r.modelId).map((x) => x.text);
        const agreement = await crossModelAgreement(r.text, others);
        const score = computeCompositeScore(quality, agreement, tau);
        return { modelId: r.modelId, score };
      }),
    );

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0]!;

    for (const s of scored) {
      const isWinner = s.modelId === winner.modelId;
      const prev = updateTrust(
        alphas[s.modelId] ?? DEFAULT_ALPHA_INIT,
        betas[s.modelId] ?? DEFAULT_BETA_INIT,
        isWinner,
        lambda,
      );
      alphas[s.modelId] = prev.alpha;
      betas[s.modelId] = prev.beta;

      curve.push({
        round: round + 1,
        modelId: s.modelId,
        posteriorMean: computePosteriorMean(prev.alpha, prev.beta),
      });
    }
  }

  return curve;
}
