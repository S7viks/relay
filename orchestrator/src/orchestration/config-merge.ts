import type { OrchestratorConfig } from "./types.js";

/**
 * Shallow merge for per-request overrides without clobbering nested objects with undefined.
 */
export function mergeOrchestratorConfig(
  base: OrchestratorConfig,
  over?: Partial<OrchestratorConfig>,
): OrchestratorConfig {
  if (!over) return base;
  return {
    ...base,
    ...(over.consensusMode !== undefined ? { consensusMode: over.consensusMode } : {}),
    ...(over.beamWidth !== undefined ? { beamWidth: over.beamWidth } : {}),
    ...(over.maxParallelCalls !== undefined ? { maxParallelCalls: over.maxParallelCalls } : {}),
    ...(over.maxCostUsdPerRequest !== undefined ? { maxCostUsdPerRequest: over.maxCostUsdPerRequest } : {}),
    ...(over.staticWeights !== undefined ? { staticWeights: over.staticWeights } : {}),
    ...(over.abtc !== undefined ? { abtc: { ...base.abtc, ...over.abtc } } : {}),
    ...(over.retry !== undefined ? { retry: { ...base.retry, ...over.retry } } : {}),
  };
}
