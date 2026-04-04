import type { ModelCallResult } from "../domain/task.js";

export type ConsensusMode = "uniform" | "static" | "abtc";

export interface StaticWeightMap {
  [modelId: string]: number;
}

export interface ConsensusInput {
  mode: ConsensusMode;
  domain: string;
  candidates: ModelCallResult[];
  scores: Record<string, number>;
  /** Required when mode === static */
  staticWeights?: StaticWeightMap;
  /** modelId -> Beta mean used as weight when mode === abtc */
  trustMeans?: Record<string, number>;
  /**
   * When mode === abtc, raise trust means to this power before normalizing (>=1 amplifies high-trust models).
   * Omitted or 1 preserves legacy weighting shape.
   */
  abtcConsensusExponent?: number;
  /** Optional trust state by model id for ABTC posterior updates. */
  trustRecords?: Record<string, { alpha: number; beta: number }>;
  /** Optional ABTC trust decay factor. */
  lambda?: number;
}

export interface ConsensusOutput {
  text: string;
  chosenModelId: string;
  weights: Record<string, number>;
  agreement: number;
  confidence?: number;
  winner?: { modelId: string; content: string };
  trustUpdates?: Record<string, { alpha: number; beta: number }>;
  notes?: string;
}
