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

  if (env.GROQ_API_KEY) {
    out.push({
      modelId: "groq-llama3-8b",
      providerId: "groq",
      remoteName: "llama-3.1-8b-instant",
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.1,
      latencyPriorMs: 300,
      accuracyPrior: 0.70,
      available: true,
    });
    out.push({
      modelId: "groq-gemma2-9b",
      providerId: "groq",
      remoteName: "gemma2-9b-it",
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.1,
      latencyPriorMs: 350,
      accuracyPrior: 0.68,
      available: true,
    });
    out.push({
      modelId: "groq-mixtral",
      providerId: "groq",
      remoteName: "mixtral-8x7b-32768",
      capabilities: ["general", "reasoning", "code"],
      costIndex: 0.15,
      latencyPriorMs: 400,
      accuracyPrior: 0.72,
      available: true,
    });
  }

  return out;
}

function hasAnyLiveProviderKey(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GOOGLE_API_KEY || env.GROQ_API_KEY);
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
