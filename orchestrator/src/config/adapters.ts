import type { LLMProviderAdapter } from "../providers/contract.js";
import { AnthropicMessagesAdapter } from "../providers/anthropic-adapter.js";
import { GeminiGenerativeAdapter } from "../providers/gemini-adapter.js";
import { MockProviderAdapter } from "../providers/mock-adapter.js";
import { OpenAICompatibleAdapter } from "../providers/openai-adapter.js";

/**
 * Wires provider adapters from environment. Orchestration only sees the map.
 */
export function buildAdaptersFromEnv(env: NodeJS.ProcessEnv = process.env): Map<string, LLMProviderAdapter> {
  const m = new Map<string, LLMProviderAdapter>();
  m.set(new MockProviderAdapter().providerId, new MockProviderAdapter());

  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: openaiKey,
      baseUrl: env.OPENAI_BASE_URL,
    });
    m.set(a.providerId, a);
  }

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const a = new AnthropicMessagesAdapter({ apiKey: anthropicKey });
    m.set(a.providerId, a);
  }

  const googleKey = env.GOOGLE_API_KEY;
  if (googleKey) {
    const a = new GeminiGenerativeAdapter({ apiKey: googleKey });
    m.set(a.providerId, a);
  }

  const groqKey = env.GROQ_API_KEY;
  if (groqKey) {
    const a = new OpenAICompatibleAdapter({
      apiKey: groqKey,
      baseUrl: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      providerId: "groq",
    });
    m.set(a.providerId, a);
  }

  return m;
}
