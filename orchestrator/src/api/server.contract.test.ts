import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";
import { validateOrchestrateResponseV1 } from "../contract/v1/validate.js";

describe("POST /v1/orchestrate contract v1", () => {
  it("returns a schema-valid v1 response when schema_version is 1.0", async () => {
    const { app } = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/v1/orchestrate",
        headers: { "content-type": "application/json" },
        payload: {
          schema_version: "1.0",
          trace_id: "22222222-2222-2222-2222-222222222222",
          session_id: "cli-session",
          domain: "general",
          task_kind: "qa",
          objective: "Say hi.",
          messages: [{ role: "user", content: "Say hi." }],
          consensus_mode: "abtc",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as unknown;
      validateOrchestrateResponseV1(body);
      const o = body as { schema_version: string; trust_updates: unknown[] };
      expect(o.schema_version).toBe("1.0");
      expect(Array.isArray(o.trust_updates)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
