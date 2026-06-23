import { describe, expect, it } from "vitest";
import { buildAdaptersFromEnv } from "./adapters.js";
import { buildOrchestratorRegistry } from "./registry-from-env.js";

describe("buildOrchestratorRegistry", () => {
  it("returns mock registry when no provider keys are set", () => {
    const reg = buildOrchestratorRegistry({});
    expect(reg.every((e) => e.providerId === "mock")).toBe(true);
  });

  it("registers Groq models when GROQ_API_KEY is set", () => {
    const reg = buildOrchestratorRegistry({ GROQ_API_KEY: "gsk_test" });
    expect(reg.some((e) => e.providerId === "groq")).toBe(true);
    expect(reg.length).toBeGreaterThanOrEqual(3);
  });

  it("registers OpenRouter catalog when OPENROUTER_API_KEY is set", () => {
    const reg = buildOrchestratorRegistry({ OPENROUTER_API_KEY: "sk-or-test" });
    const or = reg.filter((e) => e.providerId === "openrouter");
    expect(or.length).toBe(5);
    expect(or.some((e) => e.remoteName.includes("llama-3.2-3b-instruct"))).toBe(true);
  });

  it("registers Hugging Face catalog when HUGGINGFACE_API_KEY is set", () => {
    const reg = buildOrchestratorRegistry({ HUGGINGFACE_API_KEY: "hf_test" });
    const hf = reg.filter((e) => e.providerId === "huggingface");
    expect(hf.length).toBe(4);
  });

  it("accepts GEMINI_API_KEY alias for Google Gemini", () => {
    const reg = buildOrchestratorRegistry({ GEMINI_API_KEY: "gemini-test" });
    expect(reg.some((e) => e.providerId === "google-gemini")).toBe(true);
  });

  it("combines Groq, OpenRouter, Hugging Face, and Gemini in one pool", () => {
    const reg = buildOrchestratorRegistry({
      GROQ_API_KEY: "gsk_test",
      OPENROUTER_API_KEY: "sk-or-test",
      HUGGINGFACE_API_KEY: "hf_test",
      GOOGLE_API_KEY: "google-test",
    });
    const providers = new Set(reg.map((e) => e.providerId));
    expect(providers.has("groq")).toBe(true);
    expect(providers.has("openrouter")).toBe(true);
    expect(providers.has("huggingface")).toBe(true);
    expect(providers.has("google-gemini")).toBe(true);
    expect(reg.length).toBeGreaterThanOrEqual(13);
  });
});

describe("buildAdaptersFromEnv", () => {
  it("wires openrouter and huggingface adapters", () => {
    const adapters = buildAdaptersFromEnv({
      OPENROUTER_API_KEY: "sk-or-test",
      HUGGINGFACE_API_KEY: "hf_test",
    });
    expect(adapters.has("openrouter")).toBe(true);
    expect(adapters.has("huggingface")).toBe(true);
  });
});
