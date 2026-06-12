import { tokenJaccard } from "../routing/text-sim.js";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Cheap, deterministic quality proxy used in routing/consensus loops.
 * Uses token-level Jaccard overlap + length heuristic.
 * Suitable for fast beam pruning; replace with LlmJudgeScorer for final evaluation.
 */
export function scoreAnswer(objective: string, answer: string): number {
  const j = tokenJaccard(objective, answer);
  const len = Math.min(1, answer.length / 400);
  return clamp01(0.6 * j + 0.4 * len);
}

/**
 * Per-response quality dimensions matching the paper's LLM-as-judge rubric
 * (Section 6.1 / Appendix B of the revised manuscript).
 * Each dimension is scored in [0, 1]:
 *   0.0 = completely fails, 0.5 = partially meets, 1.0 = fully meets the criterion.
 */
export interface QualityDimensions {
  /** Relevance: how directly and fully the answer addresses the query. */
  relevance: number;
  /** Coherence: logical consistency and fluency of the answer. */
  coherence: number;
  /** Completeness: coverage of all required sub-questions and aspects. */
  completeness: number;
  /** Accuracy: factual correctness given available context. */
  accuracy: number;
  /** Creativity: novel synthesis, insightful reframing, or original connections. */
  creativity: number;
}

/** Aggregated evaluation result. */
export interface EvaluationResult {
  dimensions: QualityDimensions;
  /** Overall quality score: mean of all five dimensions. */
  overallScore: number;
  justification?: string;
}

// Dimension weights are equal in the paper's rubric (simple mean).
const DIM_WEIGHT = 1 / 5;

export function aggregateDimensions(d: QualityDimensions): number {
  return clamp01(
    DIM_WEIGHT * d.relevance +
    DIM_WEIGHT * d.coherence +
    DIM_WEIGHT * d.completeness +
    DIM_WEIGHT * d.accuracy +
    DIM_WEIGHT * d.creativity,
  );
}

/**
 * Heuristic approximation of the 5-dimension rubric.
 * Used when an LLM judge is not available (offline evaluation, unit tests).
 *
 * NOTE: this is a structural stand-in. Production use should wire up
 * LlmJudgeScorer with the verbatim rubric prompts from Appendix B.
 */
export function heuristicEvaluation(query: string, answer: string): EvaluationResult {
  const relevance = clamp01(tokenJaccard(query, answer) * 1.5);
  const completeness = clamp01(answer.length / Math.max(1, query.length * 3));
  const coherence = heuristicCoherence(answer);
  const accuracy = relevance; // proxy: answers that overlap with query are likely accurate
  const creativity = heuristicCreativity(answer);

  const dimensions: QualityDimensions = { relevance, coherence, completeness, accuracy, creativity };
  return {
    dimensions,
    overallScore: aggregateDimensions(dimensions),
    justification: "heuristic-approximation",
  };
}

function heuristicCoherence(answer: string): number {
  if (answer.length < 20) return 0.2;
  const sentences = answer.split(/[.!?]+/).filter(Boolean).length;
  const avgLen = answer.length / Math.max(1, sentences);
  // Sentences between 40-120 chars indicate structured prose
  return clamp01(avgLen > 40 && avgLen < 200 ? 0.7 + 0.3 * Math.min(1, avgLen / 120) : 0.4);
}

function heuristicCreativity(answer: string): number {
  const markers = [
    "however", "alternatively", "on the other hand", "notably", "surprisingly",
    "in contrast", "one approach", "another perspective", "consider", "insight",
  ];
  const lower = answer.toLowerCase();
  const hits = markers.filter((m) => lower.includes(m)).length;
  return clamp01(0.3 + 0.1 * hits);
}

/**
 * Evaluation rubric prompts (verbatim, as deposited in the public repository).
 * Pass these to an LLM judge to reproduce the paper's automated evaluation.
 */
export const RUBRIC_SYSTEM_PROMPT = `You are an impartial evaluator of AI-generated responses. Score the response on five dimensions using the rubric below. Return a JSON object with keys: relevance, coherence, completeness, accuracy, creativity, justification.

Rubric (0.0 = fails criterion, 0.5 = partially meets, 1.0 = fully meets):
- relevance: 0.0=completely off-topic, 0.5=partially addresses query, 1.0=directly and fully addresses all aspects
- coherence: 0.0=internally contradictory, 0.5=mostly consistent with minor gaps, 1.0=fully consistent and well-structured
- completeness: 0.0=ignores major aspects, 0.5=addresses main aspects but misses some, 1.0=covers all required aspects
- accuracy: 0.0=clearly factually wrong, 0.5=mostly correct with minor errors, 1.0=factually correct and grounded
- creativity: 0.0=no novel synthesis, 0.5=conventional but adequate framing, 1.0=insightful reframing or novel connections`;

export const RUBRIC_USER_TEMPLATE = (query: string, response: string) =>
  `Query: ${query}\n\nResponse: ${response}\n\nJSON scores:`;

/**
 * LLM-as-judge scorer matching the paper's evaluation protocol.
 * Wire up with any LLM adapter that implements (prompt: string) => Promise<string>.
 */
export class LlmJudgeScorer {
  constructor(private readonly judge: (systemPrompt: string, userPrompt: string) => Promise<string>) {}

  async score(query: string, answer: string): Promise<EvaluationResult> {
    const raw = await this.judge(RUBRIC_SYSTEM_PROMPT, RUBRIC_USER_TEMPLATE(query, answer));
    const dims = parseLlmDimensions(raw);
    if (!dims) {
      return heuristicEvaluation(query, answer);
    }
    return {
      dimensions: dims,
      overallScore: aggregateDimensions(dims),
      justification: raw.slice(0, 300),
    };
  }
}

function parseLlmDimensions(raw: string): QualityDimensions | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const get = (k: string): number => clamp01(Number(obj[k] ?? 0.5));
    return {
      relevance: get("relevance"),
      coherence: get("coherence"),
      completeness: get("completeness"),
      accuracy: get("accuracy"),
      creativity: get("creativity"),
    };
  } catch {
    return null;
  }
}
