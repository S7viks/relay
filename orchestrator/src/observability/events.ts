import type { SubtaskId, TraceId } from "../domain/ids.js";

/** Stable, dot-separated names for log queries (e.g. evt:gaiol.subtask.routing_planned). */
export const OrchestrationEventNames = {
  orchestrationStarted: "gaiol.orchestration.started",
  decompositionComplete: "gaiol.orchestration.decomposition_complete",
  subtaskStarted: "gaiol.subtask.started",
  routingPlanned: "gaiol.subtask.routing_planned",
  modelBatchStarted: "gaiol.subtask.model_batch_started",
  modelGenerateStarted: "gaiol.model.generate_started",
  modelGenerateRetry: "gaiol.model.generate_retry_scheduled",
  modelGenerateSucceeded: "gaiol.model.generate_succeeded",
  modelGenerateFailed: "gaiol.model.generate_failed",
  modelSkipped: "gaiol.model.skipped",
  subtaskCandidatesScored: "gaiol.subtask.candidates_scored",
  subtaskBeamPruned: "gaiol.subtask.beam_pruned",
  subtaskConsensusComplete: "gaiol.subtask.consensus_complete",
  subtaskTrustRoundComplete: "gaiol.subtask.trust_round_complete",
  subtaskComplete: "gaiol.subtask.complete",
  orchestrationComplete: "gaiol.orchestration.complete",
} as const;

export type OrchestrationEventPhase = "orchestration" | "subtask" | "model" | "trust";

export interface OrchestrationEvent {
  name: string;
  ts: string;
  traceId: TraceId;
  subtaskId?: SubtaskId;
  phase: OrchestrationEventPhase;
  /** JSON-serializable; keep small for logs. */
  payload: Record<string, unknown>;
}
