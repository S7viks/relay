import type { LLMProviderAdapter } from "../providers/contract.js";
import { AnthropicMessagesAdapter } from "../providers/anthropic-adapter.js";
import { GeminiGenerativeAdapter } from "../providers/gemini-adapter.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { OpenAICompatibleAdapter } from "../providers/openai-adapter.js";
import { googleApiKey, huggingFaceApiKey, openRouterApiKey } from "./env-keys.js";

/**
 * Wires provider adapters from environment. Orchestration only sees the map.
 */
export function buildAdaptersFromEnv(env: NodeJS.ProcessEnv = process.env): Map<string, LLMProviderAdapter> {
  const m = new Map<string, LLMProviderAdapter>();
  m.set(new MockProviderAdapter().providerId, new MockProviderAdapter());

  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: openaiKey,
      baseUrl: env.OPENAI_BASE_URL,
    });
    m.set(a.providerId, a);
  }

  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    const a = new AnthropicMessagesAdapter({ apiKey: anthropicKey });
    m.set(a.providerId, a);
  }

  const geminiKey = googleApiKey(env);
  if (geminiKey) {
    const a = new GeminiGenerativeAdapter({ apiKey: geminiKey });
    m.set(a.providerId, a);
  }

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: groqKey,
      baseUrl: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      providerId: "groq",
    });
    m.set(a.providerId, a);
  }

  const orKey = openRouterApiKey(env);
  if (orKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: orKey,
      baseUrl: (env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").trim(),
      providerId: "openrouter",
      extraHeaders: {
        "HTTP-Referer": (env.OPENROUTER_HTTP_REFERER ?? "https://gaiol.local").trim(),
        "X-Title": (env.OPENROUTER_APP_TITLE ?? "GAIOL").trim(),
      },
    });
    m.set(a.providerId, a);
  }

  const hfKey = huggingFaceApiKey(env);
  if (hfKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: hfKey,
      baseUrl: (env.HUGGINGFACE_BASE_URL ?? "https://router.huggingface.co/v1").trim(),
      providerId: "huggingface",
    });
    m.set(a.providerId, a);
  }

  return m;
}
