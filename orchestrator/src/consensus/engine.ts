import type { ConsensusInput, ConsensusOutput } from "./types.js";
import { tokenJaccard } from "../routing/text-sim.js";

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

function agreementOf(texts: string[]): number {
  if (texts.length <= 1) return 1;
  const base = texts[0] ?? "";
  let acc = 0;
  for (let i = 1; i < texts.length; i++) {
    acc += tokenJaccard(base, texts[i] ?? "");
  }
  return acc / (texts.length - 1);
}

/**
 * Pure consensus aggregation over parallel model outputs.
 */
export function runConsensus(input: ConsensusInput): ConsensusOutput {
  const byId = new Map(input.candidates.map((c) => [c.modelId, c]));
  const ids = input.candidates.map((c) => c.modelId).filter((id) => !byId.get(id)?.error);

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
  const agreement = agreementOf(texts);

  const weightedText = weightedBlend(texts, ids, weights);
  const chosenText = byId.get(bestId)?.text ?? "";

  return {
    text: input.mode === "uniform" && texts.length > 1 ? weightedText : chosenText,
    chosenModelId: bestId,
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
