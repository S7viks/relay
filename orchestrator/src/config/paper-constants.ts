/**
 * Canonical hyperparameter values as reported in the paper and referee responses.
 * All experiments use these defaults unless explicitly overridden.
 *
 * Sources:
 *   - Referee #2 Comment #3 Table (Section 6.1): w_q, w_a, w_t, λ, θ_min, k, k_models
 *   - Eq. 3 (Algorithm 4): w_c, w_h, w_e
 *   - Section 4.3: λ, θ_min, Beta(1,1) prior
 */

// ── Composite scoring weights (Algorithm 3, ABTC) ────────────────────────────
/** Weight for EvaluateQuality signal in composite score. */
export const W_QUALITY = 0.5;
/** Weight for CrossModelAgreement signal in composite score. */
export const W_AGREEMENT = 0.3;
/** Weight for trust posterior mean in composite score. */
export const W_TRUST = 0.2;

// ── EvaluateQuality sub-weights (Referee #2 Comment #5) ──────────────────────
/** Weight for semantic relevance (cosine similarity) in EvaluateQuality. */
export const W_SEMANTIC = 0.4;
/** Weight for lexical coverage (unigram F1) in EvaluateQuality. */
export const W_LEXICAL = 0.3;
/** Weight for structural completeness in EvaluateQuality. */
export const W_STRUCTURAL = 0.3;

// ── Fitness function weights (Eq. 3, ComputeFitness) ─────────────────────────
/** Weight for CapMatch (Jaccard overlap of capabilities) in fitness. */
export const W_CAP = 0.4;
/** Weight for HistAcc (historical accuracy from performance tracker) in fitness. */
export const W_HIST_ACC = 0.4;
/** Weight for cost efficiency (1 - normalized per-token cost) in fitness. */
export const W_COST_EFF = 0.2;

// ── ABTC algorithm constants ──────────────────────────────────────────────────
/** Temporal decay factor λ. Effective memory window ≈ 1/(1-λ) = 50 interactions. */
export const LAMBDA = 0.98;
/** Minimum confidence threshold θ_min below which synthesis is triggered. */
export const THETA_MIN = 0.6;
/** Uniform Beta prior parameters for new models (Beta(1,1) = uniform on [0,1]). */
export const ALPHA_INIT = 1.0;
export const BETA_INIT = 1.0;

// ── Orchestration beam search ─────────────────────────────────────────────────
/** Beam width k: number of paths kept at each step of Algorithm 1. */
export const BEAM_WIDTH = 3;
/** k_models: maximum models selected per subtask by SelectDiverseTop. */
export const K_MODELS = 3;

// ── Derived constants ─────────────────────────────────────────────────────────
/** Decay parameter corresponding to λ for use in applyTrustPosteriorStep. */
export const DECAY = 1 - LAMBDA; // 0.02
/** Approximate convergence round: trust posteriors stabilize after ~2/(1-λ) queries. */
export const CONVERGENCE_ROUNDS = Math.ceil(2 / (1 - LAMBDA)); // ~100

// ── Static-Tuned ablation weights (Section 6.5 ablation study) ───────────────
/** Hand-tuned trust weights for Static-Tuned baseline (GPT-4, Gemini, others). */
export const STATIC_TUNED_WEIGHTS: Record<string, number> = {
  "gpt-4": 0.8,
  "gemini-pro": 0.7,
  default: 0.5,
};

// ── Sensitivity sweep ranges (paper Section 6.5) ─────────────────────────────
export const LAMBDA_SWEEP = [0.90, 0.95, 0.98, 0.99, 1.00] as const;
export const BEAM_WIDTH_SWEEP = [1, 2, 3, 4, 5] as const;
