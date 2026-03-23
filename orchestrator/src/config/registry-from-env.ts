import type { ModelRegistryEntry } from "../domain/registry.js";
import { sampleRegistry } from "./sample-registry.js";

/**
 * Registry entries for providers that have API keys in the environment.
 * Remote model names can be overridden per provider.
 */
function liveEntriesFromEnv(env: NodeJS.ProcessEnv): ModelRegistryEntry[] {
  const out: ModelRegistryEntry[] = [];

  if (env.OPENAI_API_KEY) {
    out.push({
      modelId: "openai-primary",
      providerId: "openai-compatible",
      remoteName: (env.OPENAI_ORCHESTRATOR_MODEL ?? "gpt-4o-mini").trim(),
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.35,
      latencyPriorMs: 900,
      accuracyPrior: 0.72,
      available: true,
    });
  }

  if (env.ANTHROPIC_API_KEY) {
    out.push({
      modelId: "anthropic-primary",
      providerId: "anthropic",
      remoteName: (env.ANTHROPIC_ORCHESTRATOR_MODEL ?? "claude-3-5-haiku-20241022").trim(),
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.38,
      latencyPriorMs: 950,
      accuracyPrior: 0.73,
      available: true,
    });
  }

  if (env.GOOGLE_API_KEY) {
    out.push({
      modelId: "gemini-primary",
      providerId: "google-gemini",
      remoteName: (env.GEMINI_ORCHESTRATOR_MODEL ?? "gemini-2.0-flash").trim(),
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.3,
      latencyPriorMs: 850,
      accuracyPrior: 0.71,
      available: true,
    });
  }

  return out;
}

function hasAnyLiveProviderKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GOOGLE_API_KEY);
}

/**
 * Mock registry when no provider keys; otherwise live-only so routing/consensus uses real models.
 */
export function buildOrchestratorRegistry(env: NodeJS.ProcessEnv = process.env): ModelRegistryEntry[] {
  const live = liveEntriesFromEnv(env);
  if (!hasAnyLiveProviderKey(env)) {
    return sampleRegistry();
  }
  return live;
}
