export function readNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const v = env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadOrchestratorPort(env: NodeJS.ProcessEnv = process.env): number {
  return readNumber(env, "ORCHESTRATOR_PORT", 8787);
}
