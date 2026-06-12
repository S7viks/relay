import type { ChatMessage } from "../domain/messages.js";
import type { TraceId } from "../domain/ids.js";

export interface GenerateParams {
  traceId: TraceId;
  /** Registry remote name, e.g. gpt-4o-mini */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  _debug_faults?: {
    timeoutMs?: number;
    errorRate?: number;
    failCompletely?: boolean;
  };
}

export interface GenerateResult {
  text: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
  };
  raw?: unknown;
}

export interface HealthResult {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

/**
 * Provider adapters implement this contract only. Orchestration never branches on vendor IDs.
 */
export interface LLMProviderAdapter {
  readonly providerId: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
  health(): Promise<HealthResult>;
}
