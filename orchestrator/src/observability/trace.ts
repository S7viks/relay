import { randomUUID } from "node:crypto";
import type { TraceId } from "../domain/ids.js";

export function newTraceId(): TraceId {
  return randomUUID();
}
