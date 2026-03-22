import type { DomainTag, ModelId } from "../domain/ids.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import type { SubtaskSpec, TaskKind } from "../domain/task.js";
import type { BetaTrust } from "../domain/trust.js";

export interface RoutingWeights {
  accuracy: number;
  latency: number;
  cost: number;
  availability: number;
}

export interface RoutingContext {
  domain: DomainTag;
  taskKind: TaskKind;
  subtask: SubtaskSpec;
  registry: ModelRegistryEntry[];
  trustByModel: Record<ModelId, BetaTrust>;
  /** Lower is better for latency/cost components. */
  weights: RoutingWeights;
}

export interface RankedModel {
  modelId: ModelId;
  providerId: string;
  score: number;
  breakdown: {
    accuracy: number;
    latency: number;
    cost: number;
    availability: number;
    capabilityMatch: number;
  };
}
