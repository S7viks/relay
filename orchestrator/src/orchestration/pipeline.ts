import { betaMean } from "../domain/trust.js";
import { runConsensus } from "../consensus/engine.js";
import type { ConsensusMode } from "../consensus/types.js";
import {
  betaMeanPair,
  type TrustConsensusRole,
} from "../consensus/trust-update.js";
import { updateTrust } from "../consensus/abtc.js";
import { scorePaths, pruneBeam, pathIdForModel } from "../beam/path-explore.js";
import { planSubtaskRouting } from "../routing/plan.js";
import type { RoutingContext } from "../routing/types.js";
import type { TrustUpdateEvent } from "../domain/trust-events.js";
import { UNIFORM_PRIOR, type TrustRecord } from "../domain/trust.js";
import type {
  ModelCallResult,
  OrchestrationRequest,
  OrchestrationTrace,
  SubtaskExecutionTrace,
  TrustRoundTrace,
} from "../domain/task.js";
import { scoreAnswer } from "../evaluation/scorer.js";
import type { Logger } from "../observability/logger.js";
import { ObservationHub } from "../observability/hub.js";
import { OrchestrationEventNames } from "../observability/events.js";
import { MemoryTimelineSink } from "../observability/sinks.js";
import { summarizeOrchestrationTrace } from "../observability/metrics-summary.js";
import type { OrchestrationMetricsSummary } from "../observability/metrics-summary.js";
import type { OrchestrationEvent } from "../observability/events.js";
import type { ModelRegistryEntry } from "../domain/registry.js";
import { mergeOrchestratorConfig } from "./config-merge.js";
import { withRetry } from "./retry.js";
import type { OrchestratorConfig, OrchestratorDeps } from "./types.js";

export interface OrchestrationResult {
  trace: OrchestrationTrace;
  /** Final synthesized answer across subtasks. */
  answer: string;
  trustUpdates: TrustUpdateEvent[];
  /** Live event timeline for this run (not part of the public v1 contract body). */
  timeline: OrchestrationEvent[];
  metricsSummary: OrchestrationMetricsSummary;
}

function entryById(registry: ModelRegistryEntry[], id: string): ModelRegistryEntry | undefined {
  return registry.find((e) => e.modelId === id);
}

async function buildTrustMap(
  trustRepo: OrchestratorDeps["trust"],
  domain: string,
  modelIds: string[],
): Promise<Record<string, { record: TrustRecord | null; mean: number }>> {
  const out: Record<string, { record: TrustRecord | null; mean: number }> = {};
  for (const id of modelIds) {
    const rec = await trustRepo.getTrust(id, domain);
    const dist = rec?.distribution ?? UNIFORM_PRIOR;
    out[id] = { record: rec, mean: betaMean(dist) };
  }
  return out;
}

export class OrchestratorPipeline {
  constructor(private readonly deps: OrchestratorDeps) {}

  async run(
    req: OrchestrationRequest,
    opts?: { configOverride?: Partial<OrchestratorConfig> },
  ): Promise<OrchestrationResult> {
    const log = this.deps.logger.child({ traceId: req.traceId });
    const memorySink = new MemoryTimelineSink();
    const hub = new ObservationHub(log, [memorySink, ...(this.deps.observationSinks ?? [])]);
    let totalRetries = 0;

    const startedAt = new Date().toISOString();
    const cfg = mergeOrchestratorConfig(this.deps.config, opts?.configOverride);

    hub.emit({
      name: OrchestrationEventNames.orchestrationStarted,
      traceId: req.traceId,
      phase: "orchestration",
      payload: {
        domain: req.domain,
        taskKind: req.taskKind,
        explorePaths: Boolean(req.explorePaths),
        beamWidth: req.beamWidth ?? cfg.beamWidth,
        consensusMode: cfg.consensusMode,
      },
    });

    const decomposition = await this.deps.decomposer.decompose(req);
    hub.emit({
      name: OrchestrationEventNames.decompositionComplete,
      traceId: req.traceId,
      phase: "orchestration",
      payload: {
        subtaskCount: decomposition.subtasks.length,
        rationale: decomposition.rationale ?? null,
        subtaskIds: decomposition.subtasks.map((s) => s.id),
      },
    });

    const subtaskTraces: SubtaskExecutionTrace[] = [];
    const modelIds = this.deps.registry.map((e) => e.modelId);
    let spentUsd = 0;
    const trustUpdates: TrustUpdateEvent[] = [];

    for (const sub of decomposition.subtasks) {
      hub.emit({
        name: OrchestrationEventNames.subtaskStarted,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: { title: sub.title, taskKind: sub.taskKind },
      });
      const trustState = await buildTrustMap(this.deps.trust, req.domain, modelIds);
      const trustByModel = Object.fromEntries(
        Object.entries(trustState).map(([id, v]) => [id, v.record?.distribution ?? UNIFORM_PRIOR]),
      );

      const routingCtx: RoutingContext = {
        domain: req.domain,
        taskKind: sub.taskKind,
        subtask: sub,
        registry: this.deps.registry,
        trustByModel,
        weights: {
          accuracy: 0.35,
          latency: 0.2,
          cost: 0.2,
          availability: 0.15,
        },
      };

      const explore = Boolean(req.explorePaths);
      const beamW = explore ? Math.max(req.beamWidth ?? cfg.beamWidth, cfg.beamWidth) : 1;
      const maxPar =
        req.constraints?.maxParallelCalls !== undefined
          ? Math.min(cfg.maxParallelCalls, req.constraints.maxParallelCalls)
          : cfg.maxParallelCalls;

      const plan = planSubtaskRouting(routingCtx, {
        explorePaths: explore,
        beamWidth: beamW,
        maxParallelCalls: maxPar,
      });

      let selected = [...plan.candidateModelIds];
      if (cfg.maxCostUsdPerRequest !== undefined && spentUsd >= cfg.maxCostUsdPerRequest) {
        selected = selected.slice(0, 1);
      }

      hub.emit({
        name: OrchestrationEventNames.routingPlanned,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: {
          candidatePoolSize: plan.candidatePoolSize,
          beamWidth: beamW,
          diversityRationale: plan.diversityExplanation,
          candidateModelIds: selected,
        },
      });

      hub.emit({
        name: OrchestrationEventNames.modelBatchStarted,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: { modelIds: selected },
      });

      const calls = await this.invokeModels({
        log,
        hub,
        traceId: req.traceId,
        subtaskId: sub.id,
        req,
        subObjective: sub.description,
        selected,
        cfg,
        bumpRetries: () => {
          totalRetries += 1;
        },
      });

      for (const c of calls) {
        spentUsd += c.usage?.costUsd ?? 0;
      }

      const scoredPaths = scorePaths(sub.description, calls, scoreAnswer);
      const { kept, discarded } = pruneBeam(scoredPaths, beamW);
      const keptCalls = kept.map((p) => p.result);

      const scores: Record<string, number> = {};
      for (const p of scoredPaths) {
        scores[p.modelId] = p.score;
      }

      hub.emit({
        name: OrchestrationEventNames.subtaskCandidatesScored,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: { candidateCount: scoredPaths.length, scores },
      });
      hub.emit({
        name: OrchestrationEventNames.subtaskBeamPruned,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: {
          beamWidth: beamW,
          keptPathIds: kept.map((k) => k.pathId),
          discardedPathIds: discarded.map((d) => d.pathId),
        },
      });

      const trustMeans = Object.fromEntries(
        Object.entries(trustState).map(([id, v]) => [id, v.mean]),
      );
      const trustRecords = Object.fromEntries(
        Object.entries(trustState).map(([id, v]) => {
          const dist = v.record?.distribution ?? UNIFORM_PRIOR;
          return [id, { alpha: dist.alpha, beta: dist.beta }];
        }),
      );

      const consensusScores: Record<string, number> = {};
      for (const p of kept) {
        consensusScores[p.modelId] = p.score;
      }

      const consensus = await runConsensus({
        query: sub.description,
        mode: cfg.consensusMode,
        domain: req.domain,
        candidates: keptCalls,
        scores: consensusScores,
        staticWeights: cfg.staticWeights,
        trustMeans: trustMeansForMode(cfg.consensusMode, trustMeans),
        trustRecords: cfg.consensusMode === "abtc" ? trustRecords : undefined,
        abtcConsensusExponent:
          cfg.consensusMode === "abtc" ? cfg.abtc.consensusTrustExponent : undefined,
      });

      hub.emit({
        name: OrchestrationEventNames.subtaskConsensusComplete,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: {
          chosenModelId: consensus.chosenModelId,
          consensusTextLength: (consensus.text ?? "").length,
        },
      });

      const { trustRound, events } = await this.processTrustRound({
        traceId: req.traceId,
        sessionHint: req.sessionHint,
        domain: req.domain,
        subtaskId: sub.id,
        consensusMode: cfg.consensusMode,
        winnerModelId: consensus.chosenModelId,
        keptCalls,
        consensusScores,
        cfg,
      });
      trustUpdates.push(...events);

      hub.emit({
        name: OrchestrationEventNames.subtaskTrustRoundComplete,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "trust",
        payload: {
          consensusMode: trustRound.consensusMode,
          winnerModelId: trustRound.winnerModelId,
          decay: trustRound.decay,
          entryCount: trustRound.entries.length,
          persistedCount: trustRound.entries.filter((e) => e.persisted).length,
        },
      });

      const winningPathId = pathIdForModel(consensus.chosenModelId);

      subtaskTraces.push({
        subtaskId: sub.id,
        routedModelIds: selected,
        calls,
        scores,
        chosenModelId: consensus.chosenModelId,
        consensusText: consensus.text,
        trustRound,
        routingExplanation: {
          diversityRationale: plan.diversityExplanation,
          candidatePoolSize: plan.candidatePoolSize,
          beamWidth: beamW,
          modelRankSnapshot: plan.modelRankSnapshot,
        },
        pathExploration: {
          candidates: scoredPaths.map((p) => ({
            pathId: p.pathId,
            modelId: p.modelId,
            providerId: p.providerId,
            score: p.score,
            kept: kept.some((k) => k.pathId === p.pathId),
            textPreview: p.result.text.slice(0, 200),
          })),
          pruning: {
            beamWidth: beamW,
            keptPathIds: kept.map((k) => k.pathId),
            discardedPathIds: discarded.map((d) => d.pathId),
          },
          winningPathId,
        },
      });

      hub.emit({
        name: OrchestrationEventNames.subtaskComplete,
        traceId: req.traceId,
        subtaskId: sub.id,
        phase: "subtask",
        payload: { chosenModelId: consensus.chosenModelId },
      });
    }

    const answer = subtaskTraces.map((s) => s.consensusText ?? "").join("\n\n");
    const finishedAt = new Date().toISOString();
    const trace: OrchestrationTrace = {
      traceId: req.traceId,
      domain: req.domain,
      decomposition,
      subtasks: subtaskTraces,
      startedAt,
      finishedAt,
    };

    await this.deps.traces.append(trace);
    const metricsSummary = summarizeOrchestrationTrace(trace, { totalRetries });

    hub.emit({
      name: OrchestrationEventNames.orchestrationComplete,
      traceId: req.traceId,
      phase: "orchestration",
      payload: { finishedAt, subtaskCount: subtaskTraces.length, totalRetries },
    });

    log.info(
      { subtasks: subtaskTraces.length, totalRetries, durationMs: metricsSummary.durationMs },
      "orchestration_complete",
    );

    return {
      trace,
      answer,
      trustUpdates,
      timeline: memorySink.events,
      metricsSummary,
    };
  }

  private async processTrustRound(args: {
    traceId: string;
    sessionHint: string | undefined;
    domain: string;
    subtaskId: string;
    consensusMode: ConsensusMode;
    winnerModelId: string;
    keptCalls: ModelCallResult[];
    consensusScores: Record<string, number>;
    cfg: OrchestratorConfig;
  }): Promise<{ trustRound: TrustRoundTrace; events: TrustUpdateEvent[] }> {
    const {
      traceId,
      sessionHint,
      domain,
      subtaskId,
      consensusMode,
      winnerModelId,
      keptCalls,
      consensusScores: _consensusScores,
      cfg,
    } = args;

    const decay = cfg.abtc.decay;
    // strengthWinner/strengthParticipant kept for backward-compat trace fields
    const strengthWinner = cfg.abtc.strength;
    const strengthParticipant = cfg.abtc.participantStrength ?? cfg.abtc.strength * 0.6;
    const persist = consensusMode === "abtc";
    const events: TrustUpdateEvent[] = [];
    const entries: TrustRoundTrace["entries"] = [];

    for (const c of keptCalls) {
      if (c.error) continue;
      const role: TrustConsensusRole =
        winnerModelId !== "none" && c.modelId === winnerModelId ? "winner" : "participant";
      const isWinner = role === "winner";

      // Algorithm 3 (paper): binary update with temporal decay λ:
      //   α ← λ·α + 𝟙[m = m_w]   (reward winner)
      //   β ← λ·β + 𝟙[m ≠ m_w]   (penalise non-winner)
      // lambda = 1 - decay (decay ∈ (0,1) → lambda ∈ (0,1))
      const lambda = Math.min(1, Math.max(0, 1 - decay));
      const existing = await this.deps.trust.getTrust(c.modelId, domain);
      const stored = existing?.distribution ?? UNIFORM_PRIOR;
      const posterior = updateTrust(stored.alpha, stored.beta, isWinner, lambda);

      // afterDecay for trace purposes only (not persisted separately)
      const afterDecay = { alpha: lambda * stored.alpha, beta: lambda * stored.beta };
      const { priorMean, posteriorMean } = betaMeanPair(stored, posterior);

      // signal and explanation kept for observability (unchanged meaning)
      const signal = isWinner ? 1.0 : 0.0;
      const explanation = `binary: lambda=${lambda.toFixed(4)} isWinner=${isWinner} alpha: ${stored.alpha.toFixed(4)}->${posterior.alpha.toFixed(4)} beta: ${stored.beta.toFixed(4)}->${posterior.beta.toFixed(4)}`;

      const strength = isWinner ? strengthWinner : strengthParticipant;
      entries.push({
        modelId: c.modelId,
        providerId: c.providerId,
        domain,
        role,
        prior: stored,
        afterDecay,
        posterior,
        priorMean,
        posteriorMean,
        decay,
        strength,
        signal,
        explanation,
        persisted: persist,
      });

      if (persist) {
        const updatedAt = new Date().toISOString();
        await this.deps.trust.upsertTrust({
          modelId: c.modelId,
          domain,
          distribution: posterior,
          updatedAt,
        });
        events.push({
          traceId,
          ...(sessionHint !== undefined ? { sessionHint } : {}),
          domain,
          modelId: c.modelId,
          providerId: c.providerId,
          distribution: posterior,
          updatedAt,
          subtaskId,
          priorDistribution: stored,
          afterDecayDistribution: afterDecay,
          priorMean,
          posteriorMean,
          decay,
          strength,
          signal,
          role,
          explanation,
        });
      }
    }

    return {
      trustRound: {
        consensusMode,
        winnerModelId,
        subtaskId,
        decay,
        strengthWinner,
        strengthParticipant,
        consensusTrustExponent: cfg.abtc.consensusTrustExponent,
        entries,
      },
      events,
    };
  }

  private async invokeModels(args: {
    log: Logger;
    hub: ObservationHub;
    traceId: string;
    subtaskId: string;
    req: OrchestrationRequest;
    subObjective: string;
    selected: string[];
    cfg: OrchestratorConfig;
    bumpRetries: () => void;
  }): Promise<ModelCallResult[]> {
    const { req, subObjective, selected, cfg, hub, traceId, subtaskId, bumpRetries } = args;
    const messages = [
      ...req.messages,
      { role: "user" as const, content: `Subtask: ${subObjective}` },
    ];

    const tasks = selected.map((modelId) =>
      (async (): Promise<ModelCallResult> => {
        const entry = entryById(this.deps.registry, modelId);
        if (!entry) {
          hub.emit({
            name: OrchestrationEventNames.modelSkipped,
            traceId,
            subtaskId,
            phase: "model",
            payload: { modelId, reason: "unknown_model" },
          });
          return {
            modelId,
            providerId: "unknown",
            text: "",
            latencyMs: 0,
            error: "unknown_model",
          };
        }
        const adapter = this.deps.adapters.get(entry.providerId);
        if (!adapter) {
          hub.emit({
            name: OrchestrationEventNames.modelSkipped,
            traceId,
            subtaskId,
            phase: "model",
            payload: { modelId, providerId: entry.providerId, reason: "no_adapter" },
          });
          return {
            modelId,
            providerId: entry.providerId,
            text: "",
            latencyMs: 0,
            error: "no_adapter",
          };
        }
        hub.emit({
          name: OrchestrationEventNames.modelGenerateStarted,
          traceId,
          subtaskId,
          phase: "model",
          payload: { modelId, providerId: entry.providerId },
        });
        try {
          const res = await withRetry(
            () =>
              adapter.generate({
                traceId: req.traceId,
                model: entry.remoteName,
                messages,
                temperature: req.constraints?.temperature,
                maxOutputTokens: req.constraints?.maxOutputTokens,
                _debug_faults: req._debug_faults?.[modelId],
              }),
            {
              ...cfg.retry,
              onRetryScheduled: (info) => {
                bumpRetries();
                hub.emit({
                  name: OrchestrationEventNames.modelGenerateRetry,
                  traceId,
                  subtaskId,
                  phase: "model",
                  payload: {
                    modelId,
                    providerId: entry.providerId,
                    attempt: info.attempt,
                    maxAttempts: info.maxAttempts,
                    delayMs: info.delayMs,
                  },
                });
              },
            },
          );
          hub.emit({
            name: OrchestrationEventNames.modelGenerateSucceeded,
            traceId,
            subtaskId,
            phase: "model",
            payload: {
              modelId,
              providerId: entry.providerId,
              latencyMs: res.latencyMs,
              costUsd: res.usage?.costUsd ?? 0,
            },
          });
          return {
            modelId,
            providerId: entry.providerId,
            text: res.text,
            latencyMs: res.latencyMs,
            usage: {
              promptTokens: res.usage?.promptTokens,
              completionTokens: res.usage?.completionTokens,
              costUsd: res.usage?.costUsd,
            },
            raw: res.raw,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          args.log.warn({ modelId, err: msg }, "model_call_failed");
          hub.emit({
            name: OrchestrationEventNames.modelGenerateFailed,
            traceId,
            subtaskId,
            phase: "model",
            payload: { modelId, providerId: entry.providerId, error: msg },
          });
          return {
            modelId,
            providerId: entry.providerId,
            text: "",
            latencyMs: 0,
            error: msg,
          };
        }
      })(),
    );

    return Promise.all(tasks);
  }
}

function trustMeansForMode(mode: ConsensusMode, means: Record<string, number>): Record<string, number> | undefined {
  if (mode !== "abtc") return undefined;
  return means;
}
