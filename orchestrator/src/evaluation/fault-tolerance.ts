/**
 * Fault-tolerance evaluation harness (paper Section 6.6).
 *
 * Simulates realistic failure scenarios and reports quality score + success rate
 * under each condition:
 *   - Single-model API timeout
 *   - Dual-model unavailability
 *   - Intermittent error rates (p ∈ {0.1, 0.2, 0.3})
 *
 * Demonstrates graceful degradation: the system must still produce a valid
 * response when a subset of models fail.
 */

import { runConsensus } from "../consensus/engine.js";
import type { ModelCallResult } from "../domain/task.js";
import { computeEvaluateQuality } from "../consensus/abtc.js";

export interface FaultScenario {
  name: string;
  /** How many models are forced to fail (timeout/error). */
  failedModelCount: number;
  /** Probability [0,1] that any given model call fails independently. */
  intermittentErrorRate?: number;
}

export const FAULT_SCENARIOS: FaultScenario[] = [
  { name: "no-failure", failedModelCount: 0 },
  { name: "single-timeout", failedModelCount: 1 },
  { name: "dual-unavailable", failedModelCount: 2 },
  { name: "intermittent-10pct", failedModelCount: 0, intermittentErrorRate: 0.1 },
  { name: "intermittent-20pct", failedModelCount: 0, intermittentErrorRate: 0.2 },
  { name: "intermittent-30pct", failedModelCount: 0, intermittentErrorRate: 0.3 },
];

export interface FaultToleranceResult {
  scenario: string;
  successRate: number;
  meanQualityScore: number;
  sampleCount: number;
}

export interface FaultQuery {
  query: string;
  modelResponses: ModelCallResult[];
}

/**
 * Run fault-tolerance experiments over a set of test queries.
 *
 * @param queries  Pre-collected model responses (one set per query).
 * @param domain   Task domain for ABTC.
 * @param scenarios Failure scenarios to evaluate (defaults to FAULT_SCENARIOS).
 */
export async function runFaultToleranceEval(
  queries: FaultQuery[],
  domain = "general",
  scenarios: FaultScenario[] = FAULT_SCENARIOS,
): Promise<FaultToleranceResult[]> {
  const results: FaultToleranceResult[] = [];

  for (const scenario of scenarios) {
    let successes = 0;
    let totalQuality = 0;
    let count = 0;

    for (const q of queries) {
      const candidates = applyFailures(q.modelResponses, scenario);
      const successfulCount = candidates.filter((c) => !c.error).length;

      if (successfulCount === 0) {
        // Complete failure: no models available
        count++;
        continue;
      }

      try {
        const consensus = await runConsensus({
          query: q.query,
          mode: "abtc",
          domain,
          candidates,
          scores: {},
        });

        const quality = await computeEvaluateQuality(consensus.text, q.query);
        totalQuality += quality;
        successes++;
      } catch {
        // Consensus itself failed
      }

      count++;
    }

    results.push({
      scenario: scenario.name,
      successRate: count > 0 ? successes / count : 0,
      meanQualityScore: successes > 0 ? totalQuality / successes : 0,
      sampleCount: count,
    });
  }

  return results;
}

function applyFailures(
  responses: ModelCallResult[],
  scenario: FaultScenario,
): ModelCallResult[] {
  const out = [...responses];

  // Force specific count of models to fail (deterministically, first N models)
  for (let i = 0; i < Math.min(scenario.failedModelCount, out.length); i++) {
    out[i] = { ...out[i]!, text: "", error: "simulated_timeout", latencyMs: 0 };
  }

  // Apply independent intermittent error rate
  if (scenario.intermittentErrorRate && scenario.intermittentErrorRate > 0) {
    for (let i = scenario.failedModelCount; i < out.length; i++) {
      if (Math.random() < scenario.intermittentErrorRate) {
        out[i] = { ...out[i]!, text: "", error: "simulated_intermittent", latencyMs: 0 };
      }
    }
  }

  return out;
}

/**
 * Summarise fault-tolerance results as a text table for inclusion in paper.
 */
export function formatFaultToleranceTable(results: FaultToleranceResult[]): string {
  const header = "Scenario                 | Success Rate | Mean Quality | N";
  const sep = "-".repeat(65);
  const rows = results.map(
    (r) =>
      `${r.scenario.padEnd(24)} | ${(r.successRate * 100).toFixed(1).padStart(10)}% | ${r.meanQualityScore.toFixed(3).padStart(12)} | ${r.sampleCount}`,
  );
  return [header, sep, ...rows].join("\n");
}
