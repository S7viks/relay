import type { OrchestrationRequest } from "../domain/task.js";
import type { DecompositionResult } from "../domain/task.js";

export interface Decomposer {
  decompose(req: OrchestrationRequest): Promise<DecompositionResult>;
}
