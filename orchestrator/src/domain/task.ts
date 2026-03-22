import type { DomainTag, SubtaskId, TraceId } from "./ids.js";
import type { ChatMessage } from "./messages.js";
import type { BetaTrust } from "./trust.js";

export type TaskKind =
  | "qa"
  | "code"
  | "summarization"
  | "reasoning"
  | "creative"
  | "tool_use"
  | "unknown";

export interface TaskConstraints {
  maxCostUsd?: number;
  maxLatencyMsPerCall?: number;
  maxParallelCalls?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface OrchestrationRequest {
  traceId: TraceId;
  sessionHint?: string;
  domain: DomainTag;
  taskKind: TaskKind;
  objective: string;
  messages: ChatMessage[];
  constraints?: TaskConstraints;
  /** When true, router may fan out to multiple models per subtask. */
  explorePaths?: boolean;
  beamWidth?: number;
}

export interface SubtaskSpec {
  id: SubtaskId;
  parentId?: SubtaskId;
  title: string;
  description: string;
  taskKind: TaskKind;
  /** Routing hints for specialized models. */
  requiredCapabilities?: string[];
}

export interface DecompositionResult {
  subtasks: SubtaskSpec[];
  rationale?: string;
}

export interface ModelCallUsage {
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
}

export interface ModelCallResult {
  modelId: string;
  providerId: string;
  text: string;
  latencyMs: number;
  usage?: ModelCallUsage;
  raw?: unknown;
  error?: string;
}

/** One candidate reasoning path (single hop: one model output) for beam exploration. */
export interface PathCandidateTrace {
  pathId: string;
  modelId: string;
  providerId: string;
  score: number;
  /** False when pruned out of the beam. */
  kept: boolean;
  textPreview: string;
}

export interface BeamPruneTrace {
  beamWidth: number;
  keptPathIds: string[];
  discardedPathIds: string[];
}

export interface RoutingExplanationTrace {
  diversityRationale: string;
  candidatePoolSize: number;
  beamWidth: number;
  modelRankSnapshot: Array<{
    modelId: string;
    providerId: string;
    routingScore: number;
    breakdown: {
      accuracy: number;
      latency: number;
      cost: number;
      availability: number;
      capabilityMatch: number;
    };
  }>;
}

export interface PathExplorationTrace {
  candidates: PathCandidateTrace[];
  pruning: BeamPruneTrace;
  winningPathId: string;
}

export type ConsensusModeTrace = "uniform" | "static" | "abtc";

export interface TrustRoundEntryTrace {
  modelId: string;
  providerId: string;
  domain: string;
  role: "winner" | "participant";
  prior: BetaTrust;
  afterDecay: BetaTrust;
  posterior: BetaTrust;
  priorMean: number;
  posteriorMean: number;
  decay: number;
  strength: number;
  signal: number;
  explanation: string;
  /** True when this round wrote to the trust repository (ABTC mode). */
  persisted: boolean;
}

export interface TrustRoundTrace {
  consensusMode: ConsensusModeTrace;
  winnerModelId: string;
  subtaskId: SubtaskId;
  decay: number;
  strengthWinner: number;
  strengthParticipant: number;
  consensusTrustExponent?: number;
  entries: TrustRoundEntryTrace[];
}

export interface SubtaskExecutionTrace {
  subtaskId: SubtaskId;
  routedModelIds: string[];
  calls: ModelCallResult[];
  /** modelId -> score for every executed call (including pruned paths). */
  scores: Record<string, number>;
  chosenModelId?: string;
  consensusText?: string;
  pathExploration?: PathExplorationTrace;
  routingExplanation?: RoutingExplanationTrace;
  trustRound?: TrustRoundTrace;
}

export interface OrchestrationTrace {
  traceId: TraceId;
  domain: DomainTag;
  decomposition: DecompositionResult;
  subtasks: SubtaskExecutionTrace[];
  startedAt: string;
  finishedAt: string;
}
