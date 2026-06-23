import type { ModelRegistryEntry } from "../domain/registry.js";

type CatalogRow = Omit<ModelRegistryEntry, "available">;

/** Open-source / free-tier models on OpenRouter (aligned with Go registry). */
export const OPENROUTER_CATALOG: CatalogRow[] = [
  {
    modelId: "or-llama32-3b",
    providerId: "openrouter",
    remoteName: "meta-llama/llama-3.2-3b-instruct:free",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 700,
    accuracyPrior: 0.8,
  },
  {
    modelId: "or-mistral-7b",
    providerId: "openrouter",
    remoteName: "mistralai/mistral-7b-instruct:free",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 750,
    accuracyPrior: 0.82,
  },
  {
    modelId: "or-qwen2-7b",
    providerId: "openrouter",
    remoteName: "qwen/qwen-2-7b-instruct:free",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 800,
    accuracyPrior: 0.83,
  },
  {
    modelId: "or-gemini-flash",
    providerId: "openrouter",
    // OpenRouter free roster rotates; this router picks an available free model.
    remoteName: "openrouter/free",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 650,
    accuracyPrior: 0.88,
  },
  {
    modelId: "or-deepseek-r1",
    providerId: "openrouter",
    remoteName: "deepseek/deepseek-r1:free",
    capabilities: ["reasoning", "code", "general"],
    costIndex: 0.0,
    latencyPriorMs: 1200,
    accuracyPrior: 0.83,
  },
];

/** Open models on Hugging Face Inference (router.huggingface.co OpenAI API). */
export const HUGGINGFACE_CATALOG: CatalogRow[] = [
  {
    modelId: "hf-mistral-7b",
    providerId: "huggingface",
    remoteName: "mistralai/Mistral-7B-Instruct-v0.3",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 900,
    accuracyPrior: 0.78,
  },
  {
    modelId: "hf-gemma-2-2b",
    providerId: "huggingface",
    remoteName: "google/gemma-2-2b-it",
    capabilities: ["general", "reasoning"],
    costIndex: 0.0,
    latencyPriorMs: 600,
    accuracyPrior: 0.73,
  },
  {
    modelId: "hf-llama31-8b",
    providerId: "huggingface",
    remoteName: "meta-llama/Llama-3.1-8B-Instruct",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 850,
    accuracyPrior: 0.8,
  },
  {
    modelId: "hf-qwen25-7b",
    providerId: "huggingface",
    remoteName: "Qwen/Qwen2.5-7B-Instruct",
    capabilities: ["general", "reasoning", "code"],
    costIndex: 0.0,
    latencyPriorMs: 880,
    accuracyPrior: 0.79,
  },
];

export function catalogEntries(rows: CatalogRow[]): ModelRegistryEntry[] {
  return rows.map((row) => ({ ...row, available: true }));
}
