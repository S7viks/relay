import type { GenerateParams, GenerateResult, HealthResult, LLMProviderAdapter } from "./contract.js";

export interface OpenAIAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  providerId?: string;
  /** Merged into every request (e.g. OpenRouter HTTP-Referer / X-Title). */
  extraHeaders?: Record<string, string>;
}

/**
 * Minimal OpenAI-compatible chat completions client (no SDK required).
 */
export class OpenAICompatibleAdapter implements LLMProviderAdapter {
  readonly providerId: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  constructor(cfg: OpenAIAdapterConfig) {
    this.providerId = cfg.providerId ?? "openai-compatible";
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.extraHeaders = cfg.extraHeaders ?? {};
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...this.extraHeaders,
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxOutputTokens,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI-compatible error ${res.status}: ${errText}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text,
      latencyMs,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  }

  async health(): Promise<HealthResult> {
    const started = Date.now();
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.authHeaders(),
      });
      return { ok: res.ok, latencyMs: Date.now() - started, detail: res.statusText };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, latencyMs: Date.now() - started, detail: msg };
    }
  }
}
