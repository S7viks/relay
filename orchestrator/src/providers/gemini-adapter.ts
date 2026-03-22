import type { ChatMessage } from "../domain/messages.js";
import type { GenerateParams, GenerateResult, HealthResult, LLMProviderAdapter } from "./contract.js";

export interface GeminiAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: m.content }] });
  }
  return {
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join("\n") }] }
      : undefined,
    contents,
  };
}

export class GeminiGenerativeAdapter implements LLMProviderAdapter {
  readonly providerId = "google-gemini";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: GeminiAdapterConfig) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = (cfg.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    const mapped = toGeminiContents(params.messages);
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body: Record<string, unknown> = {
      contents: mapped.contents,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
      },
    };
    if (mapped.systemInstruction) {
      body.systemInstruction = mapped.systemInstruction;
    }
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini error ${res.status}: ${errText}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      text,
      latencyMs,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount,
        completionTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }

  async health(): Promise<HealthResult> {
    return { ok: Boolean(this.apiKey), latencyMs: 0 };
  }
}
