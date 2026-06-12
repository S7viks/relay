/**
 * Wire shapes for GAIOL orchestration contract v1 (JSON, snake_case).
 * Canonical schemas: orchestrator/contract/schemas/v1/*.schema.json
 */

export type TaskKindV1 =
  | "qa"
  | "code"
  | "summarization"
  | "reasoning"
  | "creative"
  | "tool_use"
  | "unknown";

export type ChatRoleV1 = "system" | "user" | "assistant" | "tool";

export type ConsensusModeV1 = "uniform" | "static" | "abtc";

export interface ChatMessageV1 {
  role: ChatRoleV1;
  content: string;
  name?: string;
}

export interface TaskConstraintsV1 {
  max_cost_usd?: number;
  max_latency_ms_per_call?: number;
  max_parallel_calls?: number;
  temperature?: number;
  max_output_tokens?: number;
}

export interface OrchestrateRequestV1 {
  schema_version: "1.0";
  trace_id: string;
  session_id?: string;
  domain: string;
  task_kind: TaskKindV1;
  objective: string;
  messages: ChatMessageV1[];
  constraints?: TaskConstraintsV1;
  explore_paths?: boolean;
  beam_width?: number;
  consensus_mode?: ConsensusModeV1;
  /** ABTC temporal decay (λ = 1 − abtc_decay). Overrides server default for this request only. */
  abtc_decay?: number;
}

export interface BetaDistributionV1 {
  alpha: number;
  beta: number;
}

export interface TrustUpdateEventV1 {
  schema_version: "1.0";
  event: "trust_updated";
  trace_id: string;
  session_id?: string;
  domain: string;
  model_id: string;
  provider_id: string;
  distribution: BetaDistributionV1;
  updated_at: string;
  subtask_id?: string;
  prior_distribution?: BetaDistributionV1;
  after_decay_distribution?: BetaDistributionV1;
  prior_mean?: number;
  posterior_mean?: number;
  decay?: number;
  strength?: number;
  signal?: number;
  role?: "winner" | "participant";
  explanation?: string;
}

export interface TrustRoundEntryTraceV1 {
  model_id: string;
  provider_id: string;
  domain: string;
  role: "winner" | "participant";
  prior: BetaDistributionV1;
  after_decay: BetaDistributionV1;
  posterior: BetaDistributionV1;
  prior_mean: number;
  posterior_mean: number;
  decay: number;
  strength: number;
  signal: number;
  explanation: string;
  persisted: boolean;
}

export interface TrustRoundTraceV1 {
  consensus_mode: ConsensusModeV1;
  winner_model_id: string;
  subtask_id: string;
  decay: number;
  strength_winner: number;
  strength_participant: number;
  consensus_trust_exponent?: number;
  entries: TrustRoundEntryTraceV1[];
}

export interface ModelCallV1 {
  model_id: string;
  provider_id: string;
  text: string;
  latency_ms: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost_usd?: number;
  };
  error?: string;
}

export interface PathCandidateTraceV1 {
  path_id: string;
  model_id: string;
  provider_id: string;
  score: number;
  kept: boolean;
  text_preview: string;
}

export interface BeamPruneTraceV1 {
  beam_width: number;
  kept_path_ids: string[];
  discarded_path_ids: string[];
}

export interface RoutingExplanationTraceV1 {
  diversity_rationale: string;
  candidate_pool_size: number;
  beam_width: number;
  model_rank_snapshot: Array<{
    model_id: string;
    provider_id: string;
    routing_score: number;
    breakdown: {
      accuracy: number;
      latency: number;
      cost: number;
      availability: number;
      capability_match: number;
    };
  }>;
}

export interface PathExplorationTraceV1 {
  candidates: PathCandidateTraceV1[];
  pruning: BeamPruneTraceV1;
  winning_path_id: string;
}

export interface SubtaskTraceV1 {
  subtask_id: string;
  routed_model_ids: string[];
  calls: ModelCallV1[];
  scores: Record<string, number>;
  chosen_model_id?: string;
  consensus_text?: string;
  path_exploration?: PathExplorationTraceV1;
  routing_explanation?: RoutingExplanationTraceV1;
  trust_round?: TrustRoundTraceV1;
}

export interface SubtaskSpecV1 {
  id: string;
  parent_id?: string;
  title: string;
  description: string;
  task_kind: TaskKindV1;
  required_capabilities?: string[];
}

export interface DecompositionV1 {
  subtasks: SubtaskSpecV1[];
  rationale?: string;
}

export interface OrchestrationTraceV1 {
  trace_id: string;
  domain: string;
  decomposition: DecompositionV1;
  subtasks: SubtaskTraceV1[];
  started_at: string;
  finished_at: string;
}

export interface OrchestrateResponseV1 {
  schema_version: "1.0";
  trace_id: string;
  session_id?: string;
  answer: string;
  trace: OrchestrationTraceV1;
  trust_updates: TrustUpdateEventV1[];
}
