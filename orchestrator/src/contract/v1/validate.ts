import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function schemaPath(name: string): string {
  return join(__dirname, "..", "..", "..", "contract", "schemas", "v1", name);
}

function loadJSON(path: string): object {
  return JSON.parse(readFileSync(path, "utf8")) as object;
}

let requestValidate: ValidateFunction | undefined;
let responseValidate: ValidateFunction | undefined;

function getRequestValidator(): ValidateFunction {
  if (!requestValidate) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    requestValidate = ajv.compile(loadJSON(schemaPath("orchestrate-request.schema.json")));
  }
  return requestValidate;
}

function getResponseValidator(): ValidateFunction {
  if (!responseValidate) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    responseValidate = ajv.compile(loadJSON(schemaPath("orchestrate-response.schema.json")));
  }
  return responseValidate;
}

export function validateOrchestrateRequestV1(data: unknown): asserts data is import("./wire-types.js").OrchestrateRequestV1 {
  const v = getRequestValidator();
  const ok = v(data);
  if (!ok) {
    throw new ContractValidationError("orchestrate_request_v1", v.errors);
  }
}

export function validateOrchestrateResponseV1(data: unknown): asserts data is import("./wire-types.js").OrchestrateResponseV1 {
  const v = getResponseValidator();
  const ok = v(data);
  if (!ok) {
    throw new ContractValidationError("orchestrate_response_v1", v.errors);
  }
}

export class ContractValidationError extends Error {
  constructor(
    readonly kind: string,
    readonly ajvErrors: ErrorObject[] | null | undefined,
  ) {
    super(ContractValidationError.format(kind, ajvErrors));
    this.name = "ContractValidationError";
  }

  private static format(kind: string, ajvErrors: ErrorObject[] | null | undefined): string {
    const parts = (ajvErrors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
    return `${kind} validation failed: ${parts.join("; ") || "unknown"}`;
  }
}
