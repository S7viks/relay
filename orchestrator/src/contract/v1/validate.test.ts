import { describe, expect, it } from "vitest";
import { validateOrchestrateRequestV1, ContractValidationError } from "./validate.js";
import { orchestrateRequestV1ToDomain, toOrchestrateResponseV1 } from "./map.js";
import { validateOrchestrateResponseV1 } from "./validate.js";
import type { OrchestrateRequestV1 } from "./wire-types.js";

const minimalRequest: OrchestrateRequestV1 = {
  schema_version: "1.0",
  trace_id: "550e8400-e29b-41d4-a716-446655440000",
  session_id: "sess-1",
  domain: "general",
  task_kind: "qa",
  objective: "Hello",
  messages: [{ role: "user", content: "Hello" }],
  consensus_mode: "abtc",
};

describe("contract v1 validation", () => {
  it("accepts a minimal valid request", () => {
    expect(() => validateOrchestrateRequestV1(structuredClone(minimalRequest))).not.toThrow();
  });

  it("rejects wrong schema_version", () => {
    const bad = { ...minimalRequest, schema_version: "2.0" };
    expect(() => validateOrchestrateRequestV1(bad)).toThrow(ContractValidationError);
  });

  it("maps request to domain and response round-trips schema", () => {
    validateOrchestrateRequestV1(minimalRequest);
    const domain = orchestrateRequestV1ToDomain(minimalRequest);
    expect(domain.traceId).toBe(minimalRequest.trace_id);
    expect(domain.sessionHint).toBe("sess-1");

    const out = toOrchestrateResponseV1({
      trace: {
        traceId: domain.traceId,
        domain: domain.domain,
        decomposition: { subtasks: [] },
        subtasks: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
      answer: "ok",
      trustUpdates: [],
    });
    expect(() => validateOrchestrateResponseV1(out)).not.toThrow();
  });
});
