/** Resolve provider API keys from env (supports common aliases). */

export function googleApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const key = (env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY ?? "").trim();
  return key || undefined;
}

export function huggingFaceApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const key = (env.HUGGINGFACE_API_KEY ?? env.HF_TOKEN ?? "").trim();
  return key || undefined;
}

export function openRouterApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const key = (env.OPENROUTER_API_KEY ?? "").trim();
  return key || undefined;
}

export function hasLiveProviderKeys(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.OPENAI_API_KEY?.trim() ||
      env.ANTHROPIC_API_KEY?.trim() ||
      googleApiKey(env) ||
      env.GROQ_API_KEY?.trim() ||
      openRouterApiKey(env) ||
      huggingFaceApiKey(env),
  );
}
