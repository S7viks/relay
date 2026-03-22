import type { ConsensusMode, StaticWeightMap } from "../consensus/types.js";
import type { Decomposer } from "../decomposition/types.js";
import type { LLMProviderAdapter } from "../providers/contract.js";
import type { Logger } from "../observability/logger.js";
import type {
  EvaluationRepository,
  SessionRepository,
  TraceRepository,
  TrustRepository,
} from "../persistence/contracts.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import type { ObservationSink } from "../observability/sinks.js";

export interface OrchestratorConfig {
  consensusMode: ConsensusMode;
  staticWeights?: StaticWeightMap;
  abtc: {
    decay: number;
    strength: number;
    /** Strength for non-winning consensus participants (defaults to 0.6 * strength). */
    participantStrength?: number;
    /** Prior for decay pull (default Beta(1,1)). */
    uniformPrior?: { alpha: number; beta: number };
    /** Passed to consensus when mode is abtc (default 1 = legacy linear trust weights). */
    consensusTrustExponent?: number;
  };
  beamWidth: number;
  maxParallelCalls: number;
  maxCostUsdPerRequest?: number;
  retry: { retries: number; baseDelayMs: number };
}

export interface OrchestratorDeps {
  decomposer: Decomposer;
  registry: ModelRegistryEntry[];
  adapters: Map<string, LLMProviderAdapter>;
  trust: TrustRepository;
  traces: TraceRepository;
  sessions?: SessionRepository;
  evaluations?: EvaluationRepository;
  logger: Logger;
  config: OrchestratorConfig;
  /** Extra sinks (e.g. OTLP, file); pino structured logging is always enabled per run. */
  observationSinks?: ObservationSink[];
}
