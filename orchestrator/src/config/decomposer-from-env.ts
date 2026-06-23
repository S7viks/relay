import { HeuristicDecomposer, LlmDecomposer, type LlmInfer } from "../decomposition/engine.js";
import type { Decomposer } from "../decomposition/types.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import { googleApiKey, huggingFaceApiKey, openRouterApiKey } from "./env-keys.js";
import { newTraceId } from "../observability/trace.js";
import type { LLMProviderAdapter } from "../providers/contract.js";

function llmDecomposerEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = (env.GAIOL_LLM_DECOMPOSER ?? "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }
  if (flag === "1" || flag === "true" || flag === "on") {
    return true;
  }
  return Boolean(
    env.OPENAI_API_KEY?.trim() ||
      openRouterApiKey(env) ||
      env.ANTHROPIC_API_KEY?.trim() ||
      googleApiKey(env) ||
      env.GROQ_API_KEY?.trim() ||
      huggingFaceApiKey(env),
  );
}

function pickDecomposerModel(
  env: NodeJS.ProcessEnv,
  registry: ModelRegistryEntry[],
): ModelRegistryEntry | undefined {
  const preferred = (env.GAIOL_DECOMPOSER_MODEL ?? "").trim();
  if (preferred) {
    const match = registry.find((e) => e.modelId === preferred && e.available);
    if (match) return match;
  }
  return (
    registry.find((e) => e.available && e.providerId === "openai-compatible") ??
    registry.find((e) => e.available && e.providerId === "groq") ??
    registry.find((e) => e.available && e.providerId === "openrouter") ??
    registry.find((e) => e.available)
  );
}

/**
 * Production decomposer: LlmDecomposer when provider keys are configured (or
 * GAIOL_LLM_DECOMPOSER=1), otherwise HeuristicDecomposer.
 */
export function buildDecomposerFromEnv(
  env: NodeJS.ProcessEnv,
  adapters: Map<string, LLMProviderAdapter>,
  registry: ModelRegistryEntry[],
): Decomposer {
  if (!llmDecomposerEnabled(env)) {
    return new HeuristicDecomposer();
  }

  const entry = pickDecomposerModel(env, registry);
  if (!entry) {
    return new HeuristicDecomposer();
  }

  const adapter = adapters.get(entry.providerId);
  if (!adapter) {
    return new HeuristicDecomposer();
  }

  const infer: LlmInfer = async (prompt: string) => {
    const result = await adapter.generate({
      traceId: newTraceId(),
      model: entry.remoteName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxOutputTokens: 1024,
    });
    return result.text;
  };

  return new LlmDecomposer(infer);
}
