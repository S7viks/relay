import type { ConsensusInput, ConsensusOutput } from "./types.js";
import {
  computePosteriorMean,
  computeCompositeScore,
  computeConfidence,
  crossModelAgreement,
  computeEvaluateQuality,
  updateTrust,
  DEFAULT_ALPHA_INIT,
  DEFAULT_BETA_INIT,
  DEFAULT_THETA_MIN,
  DEFAULT_LAMBDA,
} from "./abtc.js";

function normalizeWeights(raw: Record<string, number>): Record<string, number> {
  const vals = Object.values(raw);
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const keys = Object.keys(raw);
    const u = keys.length ? 1 / keys.length : 0;
    return Object.fromEntries(keys.map((k) => [k, u]));
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeQualityScore(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return 0;
  const mapped = raw > 1 ? raw / 10 : raw;
  return clamp01(mapped);
}

/**
 * Pure consensus aggregation over parallel model outputs.
 */
export async function runConsensus(input: ConsensusInput): Promise<ConsensusOutput> {
  const successful = input.candidates.filter((c) => !c.error);
  const byId = new Map(input.candidates.map((c) => [c.modelId, c]));
  const ids = successful.map((c) => c.modelId);

  if (ids.length === 0) {
    const first = input.candidates[0];
    return {
      text: first?.error ?? "",
      chosenModelId: first?.modelId ?? "none",
      weights: {},
      agreement: 0,
      notes: "no successful candidates",
    };
  }

  if (input.mode === "abtc") {
    const trustStore = { ...(input.trustRecords ?? {}) };
    const query = input.query ?? "";

    // compute EvaluateQuality and CrossModelAgreement asynchronously
    const scored = await Promise.all(successful.map(async (candidate) => {
      const prior = trustStore[candidate.modelId];
      const alpha = prior?.alpha ?? DEFAULT_ALPHA_INIT;
      const beta = prior?.beta ?? DEFAULT_BETA_INIT;
      const tauHat = computePosteriorMean(alpha, beta);
      
      const quality = await computeEvaluateQuality(candidate.text ?? "", query);
      
      const allOtherContents = successful
        .filter((other) => other.modelId !== candidate.modelId)
        .map((other) => other.text ?? "");
      const agreement = await crossModelAgreement(candidate.text ?? "", allOtherContents);
      
      const score = computeCompositeScore(quality, agreement, tauHat);
      return { candidate, score, alpha, beta, tauHat };
    }));

    scored.sort((a, b) => b.score - a.score);
    const allScores = scored.map((x) => x.score);
    const sigma = computeConfidence(allScores);

    const baseWinner = scored[0]!;
    let winner = baseWinner.candidate;
    if (sigma < DEFAULT_THETA_MIN && scored.length >= 2) {
      const top = scored.slice(0, Math.min(3, scored.length));
      winner = {
        ...baseWinner.candidate,
        text: `synthesized: ${top.map((x) => x.candidate.text ?? "").join(" | ")}`,
      };
    }

    const trustUpdates: Record<string, { alpha: number; beta: number }> = {};
    for (const entry of scored) {
      const isWinner = entry.candidate === baseWinner.candidate || entry.candidate.text === winner.text;
      const updated = updateTrust(entry.alpha, entry.beta, isWinner, input.lambda ?? DEFAULT_LAMBDA);
      trustStore[entry.candidate.modelId] = updated;
      trustUpdates[entry.candidate.modelId] = updated;
    }

    const winnerAgreement = await crossModelAgreement(
      winner.text ?? "",
      successful
        .filter((candidate) => candidate.modelId !== baseWinner.candidate.modelId)
        .map((candidate) => candidate.text ?? "")
    );

    const output: ConsensusOutput = {
      text: winner.text ?? "",
      chosenModelId: baseWinner.candidate.modelId,
      weights: normalizeWeights(
        Object.fromEntries(scored.map((entry) => [entry.candidate.modelId, Math.max(entry.score, 0)])),
      ),
      agreement: winnerAgreement,
      confidence: sigma,
      winner: { modelId: baseWinner.candidate.modelId, content: winner.text ?? "" },
      trustUpdates,
      notes: sigma < DEFAULT_THETA_MIN && scored.length >= 2 ? "synthesized top candidates" : undefined,
    };
    (output as ConsensusOutput & { scores: number[] }).scores = allScores;
    return output;
  }

  let weights: Record<string, number> = {};
  if (input.mode === "uniform") {
    for (const id of ids) weights[id] = 1;
  } else if (input.mode === "static") {
    const sw = input.staticWeights ?? {};
    for (const id of ids) weights[id] = sw[id] ?? 1;
  } else {
    const tm = input.trustMeans ?? {};
    const exp = input.abtcConsensusExponent ?? 1;
    for (const id of ids) {
      const m = tm[id];
      const base = m !== undefined && m > 0 ? m : betaFallbackFromScore(input.scores[id]);
      weights[id] = exp === 1 ? base : Math.pow(Math.max(1e-9, base), exp);
    }
  }

  weights = normalizeWeights(weights);

  let bestId = ids[0]!;
  let best = -Infinity;
  for (const id of ids) {
    const comb = (weights[id] ?? 0) * (input.scores[id] ?? 0);
    if (comb > best) {
      best = comb;
      bestId = id;
    }
  }

  const texts = ids.map((id) => byId.get(id)?.text ?? "");
  const chosenText = byId.get(bestId)?.text ?? "";
  const agreement = await crossModelAgreement(
    chosenText,
    ids.filter((id) => id !== bestId).map((id) => byId.get(id)?.text ?? ""),
  );

  const weightedText = weightedBlend(texts, ids, weights);

  return {
    text: input.mode === "uniform" && texts.length > 1 ? weightedText : chosenText,
    chosenModelId: bestId,
    winner: { modelId: bestId, content: chosenText },
    confidence: 0,
    weights,
    agreement,
  };
}

function betaFallbackFromScore(score: number | undefined): number {
  if (score === undefined || Number.isNaN(score)) return 0.5;
  return Math.min(1, Math.max(0.05, score));
}

function weightedBlend(texts: string[], ids: string[], weights: Record<string, number>): string {
  const parts: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const w = weights[id] ?? 0;
    if (w <= 0) continue;
    const t = texts[i] ?? "";
    parts.push(`[${id} w=${w.toFixed(2)}]\n${t}`);
  }
  return parts.join("\n\n---\n\n");
}
