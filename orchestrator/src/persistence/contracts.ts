import type { SessionId, TraceId } from "../domain/ids.js";
import type { OrchestrationTrace } from "../domain/task.js";
import type { TrustRecord } from "../domain/trust.js";

export interface SessionRecord {
  id: SessionId;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationLogRecord {
  id: string;
  traceId: TraceId;
  createdAt: string;
  scores: Record<string, number>;
  pass: boolean;
  notes?: string;
}

export interface TrustRepository {
  getTrust(modelId: string, domain: string): Promise<TrustRecord | null>;
  upsertTrust(record: TrustRecord): Promise<void>;
  listByDomain(domain: string): Promise<TrustRecord[]>;
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  get(id: SessionId): Promise<SessionRecord | null>;
}

export interface TraceRepository {
  append(trace: OrchestrationTrace): Promise<void>;
  get(traceId: TraceId): Promise<OrchestrationTrace | null>;
}

export interface EvaluationRepository {
  append(log: EvaluationLogRecord): Promise<void>;
}
