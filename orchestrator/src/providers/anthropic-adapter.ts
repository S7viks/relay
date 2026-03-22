import type { ChatMessage } from "../domain/messages.js";
import type { GenerateParams, GenerateResult, HealthResult, LLMProviderAdapter } from "./contract.js";

export interface AnthropicAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function toAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      rest.push({ role: m.role, content: m.content });
      continue;
    }
    rest.push({ role: "user", content: `[${m.role}] ${m.content}` });
  }
  return {
    system: systemParts.length ? systemParts.join("\n") : undefined,
    messages: rest,
  };
}

export class AnthropicMessagesAdapter implements LLMProviderAdapter {
  readonly providerId = "anthropic";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: AnthropicAdapterConfig) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    const mapped = toAnthropicMessages(params.messages);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxOutputTokens ?? 1024,
        temperature: params.temperature,
        system: mapped.system,
        messages: mapped.messages,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${errText}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text =
      json.content?.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("") ?? "";
    return {
      text,
      latencyMs,
      usage: {
        promptTokens: json.usage?.input_tokens,
        completionTokens: json.usage?.output_tokens,
      },
    };
  }

  async health(): Promise<HealthResult> {
    return { ok: Boolean(this.apiKey), latencyMs: 0 };
  }
}
