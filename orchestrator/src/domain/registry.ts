import type { ModelId, ProviderId } from "./ids.js";

export interface ModelRegistryEntry {
  modelId: ModelId;
  providerId: ProviderId;
  /** Provider-native model name passed to the adapter. */
  remoteName: string;
  capabilities: string[];
  /** Relative cost per 1k tokens (arbitrary scale; used for routing). */
  costIndex: number;
  /** Typical latency prior in ms (used for routing). */
  latencyPriorMs: number;
  /** Historical accuracy prior in [0,1] if known. */
  accuracyPrior?: number;
  available: boolean;
}
