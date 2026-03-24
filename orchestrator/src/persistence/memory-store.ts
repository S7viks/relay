import type { SessionId, TraceId } from "../domain/ids.js";
import type { OrchestrationTrace } from "../domain/task.js";
import type { TrustRecord } from "../domain/trust.js";
import type {
  EvaluationLogRecord,
  EvaluationRepository,
  SessionRecord,
  SessionRepository,
  TraceRepository,
  TrustRepository,
} from "./contracts.js";

export class InMemoryTrustRepository implements TrustRepository {
  private readonly store = new Map<string, TrustRecord>();

  private key(modelId: string, domain: string) {
    return `${modelId}::${domain}`;
  }

  async getTrust(modelId: string, domain: string): Promise<TrustRecord | null> {
    return this.store.get(this.key(modelId, domain)) ?? null;
  }

  async upsertTrust(record: TrustRecord): Promise<void> {
    this.store.set(this.key(record.modelId, record.domain), record);
  }

  async listByDomain(domain: string): Promise<TrustRecord[]> {
    return [...this.store.values()].filter((r) => r.domain === domain);
  }

  async listAll(): Promise<TrustRecord[]> {
    return [...this.store.values()];
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<SessionId, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async get(id: SessionId): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }
}

export class InMemoryTraceRepository implements TraceRepository {
  private readonly traces = new Map<TraceId, OrchestrationTrace>();

  async append(trace: OrchestrationTrace): Promise<void> {
    this.traces.set(trace.traceId, trace);
  }

  async get(traceId: TraceId): Promise<OrchestrationTrace | null> {
    return this.traces.get(traceId) ?? null;
  }

  async listTraceIds(limit: number): Promise<TraceId[]> {
    const n = Math.max(1, Math.min(500, limit));
    const keys = [...this.traces.keys()];
    return keys.slice(-n);
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  readonly logs: EvaluationLogRecord[] = [];

  async append(log: EvaluationLogRecord): Promise<void> {
    this.logs.push(log);
  }
}
