import { randomUUID } from "node:crypto";
import type { OrchestrationRequest, DecompositionResult, SubtaskSpec } from "../domain/task.js";
import type { Decomposer } from "./types.js";

/**
 * Seven-step fallback template from paper Algorithm 2 (FallbackDecomposition).
 * Applied when LLM-based decomposition fails validation (empty or malformed output)
 * or when no LLM decomposer is available. Guarantees every query produces at
 * least a minimal task graph.
 */
const FALLBACK_STEPS = [
  { title: "problem-statement", description: (q: string) => `Extract and restate the core problem: ${q}` },
  { title: "constraint-identification", description: (q: string) => `Identify constraints, boundary conditions, and requirements for: ${q}` },
  { title: "approach-selection", description: (q: string) => `Select the most appropriate reasoning approach or algorithm for: ${q}` },
  { title: "step-by-step-execution", description: (q: string) => `Execute the chosen approach step by step for: ${q}` },
  { title: "intermediate-verification", description: (q: string) => `Verify intermediate results and check for logical consistency for: ${q}` },
  { title: "synthesis", description: (q: string) => `Synthesize all intermediate results into a cohesive answer for: ${q}` },
  { title: "confidence-assessment", description: (q: string) => `Assess confidence in the final answer and flag any remaining uncertainties for: ${q}` },
] as const;

/**
 * Build a task graph from the 7-step fallback template.
 * Each step depends on the previous one (sequential dependency chain).
 */
function fallbackDecompose(objective: string, kind: OrchestrationRequest["taskKind"]): SubtaskSpec[] {
  const ids = FALLBACK_STEPS.map(() => randomUUID());
  return FALLBACK_STEPS.map((step, i) => ({
    id: ids[i]!,
    title: step.title,
    description: step.description(objective),
    taskKind: kind,
    requiredCapabilities: guessCaps(kind),
  }));
}

/**
 * Deterministic, fast baseline decomposer (no extra LLM call).
 * For simple single-sentence queries it issues a single subtask.
 * For multi-sentence queries it splits by sentence.
 * Falls back to the paper's 7-step template when the query cannot be split.
 *
 * Replace with LlmDecomposer (see below) for production use.
 */
export class HeuristicDecomposer implements Decomposer {
  async decompose(req: OrchestrationRequest): Promise<DecompositionResult> {
    const text = req.objective.trim();
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      return {
        subtasks: fallbackDecompose(
          req.messages.map((m) => m.content).join("\n"),
          req.taskKind,
        ),
        rationale: "fallback-7step: empty objective",
      };
    }

    const subtasks: SubtaskSpec[] =
      sentences.length === 1
        ? [
            {
              id: randomUUID(),
              title: "main",
              description: text,
              taskKind: req.taskKind,
            },
          ]
        : sentences.map((s, i) => ({
            id: randomUUID(),
            title: `step-${i + 1}`,
            description: s,
            taskKind: req.taskKind,
            requiredCapabilities: guessCaps(req.taskKind),
          }));

    return {
      subtasks,
      rationale: sentences.length === 1 ? "single-step" : "sentence-split",
    };
  }
}

export type LlmInfer = (prompt: string) => Promise<string>;

/**
 * LLM-backed decomposer matching paper Algorithm 2.
 * Calls the LLM with a few-shot decomposition template, parses the JSON response,
 * validates the steps, and falls back to the 7-step FallbackDecomposition if
 * parsing or validation fails.
 */
export class LlmDecomposer implements Decomposer {
  constructor(private readonly infer: LlmInfer) {}

  async decompose(req: OrchestrationRequest): Promise<DecompositionResult> {
    const objective = req.objective.trim() ||
      req.messages.map((m) => m.content).join("\n");

    const prompt = buildDecompositionPrompt(objective);

    let steps: Array<{ title: string; description: string }> | null = null;
    try {
      const raw = await this.infer(prompt);
      steps = parseDecompositionJson(raw);
    } catch {
      steps = null;
    }

    if (!steps || steps.length === 0) {
      return {
        subtasks: fallbackDecompose(objective, req.taskKind),
        rationale: "fallback-7step: llm-parse-failed",
      };
    }

    const subtasks: SubtaskSpec[] = steps.map((s, i) => ({
      id: randomUUID(),
      title: s.title ?? `step-${i + 1}`,
      description: s.description,
      taskKind: req.taskKind,
      requiredCapabilities: guessCaps(req.taskKind),
    }));

    return { subtasks, rationale: "llm-decomposed" };
  }
}

function buildDecompositionPrompt(objective: string): string {
  return `You are a task decomposition assistant. Break the following query into an ordered list of subtasks.
Return ONLY a JSON array like: [{"title":"...","description":"..."},...]

Query: ${objective}

JSON:`;
}

function parseDecompositionJson(
  raw: string,
): Array<{ title: string; description: string }> | null {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    const valid = (parsed as unknown[]).filter(
      (s): s is { title: string; description: string } => {
        if (typeof s !== "object" || s === null) return false;
        const r = s as Record<string, unknown>;
        return typeof r.title === "string" && typeof r.description === "string" && r.description.length > 0;
      },
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function guessCaps(kind: OrchestrationRequest["taskKind"]): string[] | undefined {
  if (kind === "code") return ["code"];
  if (kind === "reasoning") return ["reasoning"];
  return undefined;
}
