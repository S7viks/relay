import type { ConsensusMode } from "../../consensus/types.js";
import type { ChatMessage, ChatRole } from "../../domain/messages.js";
import type { TaskKind, OrchestrationRequest, OrchestrationTrace } from "../../domain/task.js";
import type { BetaTrust } from "../../domain/trust.js";
import type { BetaDistributionV1 } from "./wire-types.js";
import type { OrchestratorConfig } from "../../orchestration/types.js";
import type {
  ChatMessageV1,
  ConsensusModeV1,
  DecompositionV1,
  ModelCallV1,
  OrchestrateRequestV1,
  OrchestrateResponseV1,
  OrchestrationTraceV1,
  SubtaskSpecV1,
  SubtaskTraceV1,
  TaskConstraintsV1,
  TaskKindV1,
  TrustUpdateEventV1,
} from "./wire-types.js";
import type { TrustUpdateEvent } from "../../domain/trust-events.js";

function mapTaskKind(k: TaskKindV1): TaskKind {
  return k;
}

function mapRole(r: ChatMessageV1["role"]): ChatRole {
  return r;
}

export function orchestrateRequestV1ToDomain(v: OrchestrateRequestV1): OrchestrationRequest {
  return {
    traceId: v.trace_id,
    sessionHint: v.session_id,
    domain: v.domain,
    taskKind: mapTaskKind(v.task_kind),
    objective: v.objective,
    messages: v.messages.map(
      (m): ChatMessage => ({
        role: mapRole(m.role),
        content: m.content,
        ...(m.name !== undefined ? { name: m.name } : {}),
      }),
    ),
    constraints: mapConstraints(v.constraints),
    explorePaths: v.explore_paths,
    beamWidth: v.beam_width,
  };
}

function mapConstraints(c?: TaskConstraintsV1): OrchestrationRequest["constraints"] {
  if (!c) return undefined;
  return {
    maxCostUsd: c.max_cost_usd,
    maxLatencyMsPerCall: c.max_latency_ms_per_call,
    maxParallelCalls: c.max_parallel_calls,
    temperature: c.temperature,
    maxOutputTokens: c.max_output_tokens,
  };
}

export function consensusModeV1ToConfigPartial(mode?: ConsensusModeV1): Pick<OrchestratorConfig, "consensusMode"> | undefined {
  if (mode === undefined) return undefined;
  return { consensusMode: mode as ConsensusMode };
}

export function abtcDecayV1ToConfigPartial(decay?: number): Pick<OrchestratorConfig, "abtc"> | undefined {
  if (decay === undefined || !Number.isFinite(decay)) return undefined;
  const clamped = Math.min(0.99, Math.max(0.0, decay));
  return { abtc: { decay: clamped, strength: 1.5, participantStrength: 0.9 } };
}

export function orchestrationTraceToV1(t: OrchestrationTrace): OrchestrationTraceV1 {
  return {
    trace_id: t.traceId,
    domain: t.domain,
    started_at: t.startedAt,
    finished_at: t.finishedAt,
    decomposition: decompositionToV1(t.decomposition),
    subtasks: t.subtasks.map(subtaskTraceToV1),
  };
}

function decompositionToV1(d: OrchestrationTrace["decomposition"]): DecompositionV1 {
  return {
    subtasks: d.subtasks.map(subtaskSpecToV1),
    ...(d.rationale !== undefined ? { rationale: d.rationale } : {}),
  };
}

function subtaskSpecToV1(s: OrchestrationTrace["decomposition"]["subtasks"][number]): SubtaskSpecV1 {
  return {
    id: s.id,
    ...(s.parentId !== undefined ? { parent_id: s.parentId } : {}),
    title: s.title,
    description: s.description,
    task_kind: s.taskKind as TaskKindV1,
    ...(s.requiredCapabilities !== undefined
      ? { required_capabilities: s.requiredCapabilities }
      : {}),
  };
}

function betaToV1(b: BetaTrust): BetaDistributionV1 {
  return { alpha: b.alpha, beta: b.beta };
}

function subtaskTraceToV1(s: OrchestrationTrace["subtasks"][number]): SubtaskTraceV1 {
  const base: SubtaskTraceV1 = {
    subtask_id: s.subtaskId,
    routed_model_ids: s.routedModelIds,
    calls: s.calls.map(modelCallToV1),
    scores: { ...s.scores },
    ...(s.chosenModelId !== undefined ? { chosen_model_id: s.chosenModelId } : {}),
    ...(s.consensusText !== undefined ? { consensus_text: s.consensusText } : {}),
  };
  if (s.routingExplanation !== undefined) {
    base.routing_explanation = {
      diversity_rationale: s.routingExplanation.diversityRationale,
      candidate_pool_size: s.routingExplanation.candidatePoolSize,
      beam_width: s.routingExplanation.beamWidth,
      model_rank_snapshot: s.routingExplanation.modelRankSnapshot.map((m) => ({
        model_id: m.modelId,
        provider_id: m.providerId,
        routing_score: m.routingScore,
        breakdown: {
          accuracy: m.breakdown.accuracy,
          latency: m.breakdown.latency,
          cost: m.breakdown.cost,
          availability: m.breakdown.availability,
          capability_match: m.breakdown.capabilityMatch,
        },
      })),
    };
  }
  if (s.pathExploration !== undefined) {
    base.path_exploration = {
      candidates: s.pathExploration.candidates.map((c) => ({
        path_id: c.pathId,
        model_id: c.modelId,
        provider_id: c.providerId,
        score: c.score,
        kept: c.kept,
        text_preview: c.textPreview,
      })),
      pruning: {
        beam_width: s.pathExploration.pruning.beamWidth,
        kept_path_ids: [...s.pathExploration.pruning.keptPathIds],
        discarded_path_ids: [...s.pathExploration.pruning.discardedPathIds],
      },
      winning_path_id: s.pathExploration.winningPathId,
    };
  }
  if (s.trustRound !== undefined) {
    base.trust_round = {
      consensus_mode: s.trustRound.consensusMode,
      winner_model_id: s.trustRound.winnerModelId,
      subtask_id: s.trustRound.subtaskId,
      decay: s.trustRound.decay,
      strength_winner: s.trustRound.strengthWinner,
      strength_participant: s.trustRound.strengthParticipant,
      ...(s.trustRound.consensusTrustExponent !== undefined
        ? { consensus_trust_exponent: s.trustRound.consensusTrustExponent }
        : {}),
      entries: s.trustRound.entries.map((e) => ({
        model_id: e.modelId,
        provider_id: e.providerId,
        domain: e.domain,
        role: e.role,
        prior: betaToV1(e.prior),
        after_decay: betaToV1(e.afterDecay),
        posterior: betaToV1(e.posterior),
        prior_mean: e.priorMean,
        posterior_mean: e.posteriorMean,
        decay: e.decay,
        strength: e.strength,
        signal: e.signal,
        explanation: e.explanation,
        persisted: e.persisted,
      })),
    };
  }
  return base;
}

function modelCallToV1(c: OrchestrationTrace["subtasks"][number]["calls"][number]): ModelCallV1 {
  const usage =
    c.usage === undefined
      ? undefined
      : {
          ...(c.usage.promptTokens !== undefined ? { prompt_tokens: c.usage.promptTokens } : {}),
          ...(c.usage.completionTokens !== undefined ? { completion_tokens: c.usage.completionTokens } : {}),
          ...(c.usage.costUsd !== undefined ? { cost_usd: c.usage.costUsd } : {}),
        };
  const hasUsage = usage && Object.keys(usage).length > 0;
  return {
    model_id: c.modelId,
    provider_id: c.providerId,
    text: c.text,
    latency_ms: c.latencyMs,
    ...(hasUsage ? { usage } : {}),
    ...(c.error !== undefined ? { error: c.error } : {}),
  };
}

export function trustUpdateToV1(e: TrustUpdateEvent): TrustUpdateEventV1 {
  return {
    schema_version: "1.0",
    event: "trust_updated",
    trace_id: e.traceId,
    ...(e.sessionHint !== undefined ? { session_id: e.sessionHint } : {}),
    domain: e.domain,
    model_id: e.modelId,
    provider_id: e.providerId,
    distribution: betaToV1(e.distribution),
    updated_at: e.updatedAt,
    ...(e.subtaskId !== undefined ? { subtask_id: e.subtaskId } : {}),
    ...(e.priorDistribution !== undefined ? { prior_distribution: betaToV1(e.priorDistribution) } : {}),
    ...(e.afterDecayDistribution !== undefined
      ? { after_decay_distribution: betaToV1(e.afterDecayDistribution) }
      : {}),
    ...(e.priorMean !== undefined ? { prior_mean: e.priorMean } : {}),
    ...(e.posteriorMean !== undefined ? { posterior_mean: e.posteriorMean } : {}),
    ...(e.decay !== undefined ? { decay: e.decay } : {}),
    ...(e.strength !== undefined ? { strength: e.strength } : {}),
    ...(e.signal !== undefined ? { signal: e.signal } : {}),
    ...(e.role !== undefined ? { role: e.role } : {}),
    ...(e.explanation !== undefined ? { explanation: e.explanation } : {}),
  };
}

export function toOrchestrateResponseV1(args: {
  trace: OrchestrationTrace;
  answer: string;
  trustUpdates: TrustUpdateEvent[];
  sessionId?: string;
}): OrchestrateResponseV1 {
  return {
    schema_version: "1.0",
    trace_id: args.trace.traceId,
    ...(args.sessionId !== undefined ? { session_id: args.sessionId } : {}),
    answer: args.answer,
    trace: orchestrationTraceToV1(args.trace),
    trust_updates: args.trustUpdates.map(trustUpdateToV1),
  };
}
