import { pipeline } from '@xenova/transformers';
import { UNIFORM_PRIOR, betaMean, betaVariance, type BetaTrust } from "../domain/trust.js";
import {
  LAMBDA,
  ALPHA_INIT,
  BETA_INIT,
  THETA_MIN,
  W_QUALITY,
  W_AGREEMENT,
  W_TRUST,
} from "../config/paper-constants.js";

export { betaMean, betaVariance };
// Re-export under the legacy DEFAULT_* names so existing imports are unbroken.
export const DEFAULT_LAMBDA = LAMBDA;
export const DEFAULT_ALPHA_INIT = ALPHA_INIT;
export const DEFAULT_BETA_INIT = BETA_INIT;
export const DEFAULT_THETA_MIN = THETA_MIN;
export const DEFAULT_W_QUALITY = W_QUALITY;
export const DEFAULT_W_AGREEMENT = W_AGREEMENT;
export const DEFAULT_W_TRUST = W_TRUST;

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

let extractor: any = null;
export async function getEmbedding(text: string): Promise<number[]> {
    if (process.env.NODE_ENV === "test") {
        return [0.1, 0.2, 0.3]; // Mock embedding for tests to prevent timeouts
    }
    if (!extractor) {
        try {
            extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        } catch (e) {
            console.error("Failed to load embedding model:", e);
            return [];
        }
    }
    try {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch {
        return [];
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeLexicalCoverage(candidate: string, query: string): number {
  const queryTokens = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3)); // Pseudo TF-IDF
  const candidateTokens = new Set(candidate.toLowerCase().split(/\s+/).filter(Boolean));
  if (queryTokens.size === 0) return 1.0;
  let overlap = 0;
  for (const t of queryTokens) {
    if (candidateTokens.has(t)) overlap++;
  }
  const recall = overlap / queryTokens.size;
  const precision = overlap / (candidateTokens.size || 1);
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function computeStructuralCompleteness(candidate: string, queryLength: number): number {
  let score = 0.5;
  if (candidate.length > queryLength * 0.5) score += 0.2;
  if (candidate.length > queryLength * 1.5) score += 0.1;
  const markers = ["conclusion", "summary", "therefore", "in conclusion", "result", "thus"];
  const lower = candidate.toLowerCase();
  for (const m of markers) {
    if (lower.includes(m)) {
      score += 0.2;
      break;
    }
  }
  return Math.min(1.0, score);
}

export async function computeEvaluateQuality(candidate: string, query: string): Promise<number> {
  const embCandidate = await getEmbedding(candidate);
  const embQuery = await getEmbedding(query);
  
  let semantic = 0;
  if (embCandidate.length > 0 && embQuery.length > 0) {
    semantic = cosineSimilarity(embCandidate, embQuery);
  } else {
    semantic = tokenJaccard(candidate, query); // Fallback
  }
  
  const lexical = computeLexicalCoverage(candidate, query);
  const structural = computeStructuralCompleteness(candidate, query.length);
  
  // Weight: 0.4 semantic, 0.3 lexical, 0.3 structural. Base quality is unused per paper formulation but could be blended.
  return Math.max(0, Math.min(1, 0.4 * semantic + 0.3 * lexical + 0.3 * structural));
}

export async function crossModelAgreement(candidateContent: string, otherContents: string[]): Promise<number> {
  if (otherContents.length === 0) return 1.0;
  const embCandidate = await getEmbedding(candidateContent);
  if (embCandidate.length === 0) {
    const scores = otherContents.map((o) => tokenJaccard(candidateContent, o));
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  
  let sum = 0;
  for (const other of otherContents) {
    const embOther = await getEmbedding(other);
    if (embOther.length === 0) {
      sum += tokenJaccard(candidateContent, other);
    } else {
      sum += cosineSimilarity(embCandidate, embOther);
    }
  }
  return sum / otherContents.length;
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
