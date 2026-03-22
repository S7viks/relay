import type { DomainTag, ModelId, ProviderId, SubtaskId, TraceId } from "./ids.js";
import type { BetaTrust } from "./trust.js";

/** Emitted after ABTC persistence so cross-language callers can mirror trust state. */
export interface TrustUpdateEvent {
  traceId: TraceId;
  sessionHint?: string;
  domain: DomainTag;
  modelId: ModelId;
  providerId: ProviderId;
  distribution: BetaTrust;
  updatedAt: string;
  /** Additive metadata for observability (optional for backward compatibility). */
  subtaskId?: SubtaskId;
  priorDistribution?: BetaTrust;
  afterDecayDistribution?: BetaTrust;
  priorMean?: number;
  posteriorMean?: number;
  decay?: number;
  strength?: number;
  signal?: number;
  role?: "winner" | "participant";
  explanation?: string;
}
