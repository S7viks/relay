import type { GenerateParams, GenerateResult, HealthResult, LLMProviderAdapter } from "./contract.js";

export interface MockAdapterOptions {
  fixedLatencyMs?: number;
  echoPrefix?: string;
  /** Defaults to "mock"; use distinct ids in tests for diversity-aware routing. */
  providerId?: string;
}

export class MockProviderAdapter implements LLMProviderAdapter {
  readonly providerId: string;

  constructor(private readonly opts: MockAdapterOptions = {}) {
    this.providerId = opts.providerId ?? "mock";
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const latency = this.opts.fixedLatencyMs ?? 2;
    const prefix = this.opts.echoPrefix ?? "[mock]";
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    const text = `${prefix} ${params.model}: ${lastUser?.content ?? ""}`;
    return {
      text,
      latencyMs: latency,
      usage: { promptTokens: 10, completionTokens: 20, costUsd: 0 },
    };
  }

  async health(): Promise<HealthResult> {
    return { ok: true, latencyMs: 0 };
  }
}
