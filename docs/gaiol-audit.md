# GAIOL architecture audit and milestone map

**Scope:** Repository state as of this audit. Code is the source of truth; this doc is a map for planning, not a spec.

## What exists (implemented)

- **HTTP entrypoint:** `cmd/web-server/main.go` initializes adapters from env (no-auth) or empty registry + tenant keys (auth), attaches `internal/httpserver`.
- **Public / app API:** Routes in `internal/httpserver/register.go` — static UI, auth, `/api/query*`, `/api/reasoning/*`, `/v1/chat`, settings, usage, tenant models, world-model, agent workflow, monitoring.
- **Provider-agnostic model interface:** `internal/models/interface.go` defines `ModelAdapter` (full adapter surface: health, capabilities, `GenerateText`).
- **Registry and routing:** `internal/models/registry.go` (catalog + tenant registration), `internal/models/router.go` (strategy-based selection, `RouteAndExecute`).
- **Adapters:** `internal/models/adapters/` — OpenRouter, Ollama, HuggingFace, Gemini, Anthropic, OpenAI-compatible, custom OpenAI-compatible paths.
- **Request shape:** `internal/uaip` payloads for model calls.
- **Orchestration stack:** `internal/reasoning/engine.go` (`ReasoningEngine`), `orchestrator.go` (parallel steps, RAG hook), `decomposer.go` (prompt → steps), `scorer.go`, `composer.go`, `memory.go`, `cache.go`, `rag.go`, `events.go`.
- **Simpler call path:** `internal/reasoning/query.go` (`QueryModel`) for direct model ID → adapter → `GenerateText`.
- **Persistence / multi-tenancy:** `internal/database/*`, `internal/keys/*` (encrypted provider keys, GAIOL API keys, tenant models).
- **Auth:** `internal/auth/*` (Supabase/JWT context).
- **Observability:** `internal/monitoring/metrics.go`, handler hooks from reasoning API.
- **Frontend:** `web/js/api.js`, `main.js`, `ui.js`, dashboard and chat flows calling the above APIs.
- **TS orchestrator delegation (optional):** When `GAIOL_TS_ORCHESTRATOR_URL` and `GAIOL_USE_TS_ORCHESTRATOR` are set, `POST /api/query/smart` can call the Node/Fastify orchestrator over HTTP (contract v1) with fallback to the Go `ReasoningEngine`. Trace proxy: `GET /api/orchestration/traces/{id}`. See [gaiol-ts-orchestrator-wiring.md](./gaiol-ts-orchestrator-wiring.md).

## What is partial

- **ABTC / trust-weighted consensus:** `internal/reasoning/consensus.go` implements reconciliation strategies (majority, weighted, meta-agent); not ABTC-specific; tuning and product alignment TBD.
- **Retrieval / verification:** RAG exists (`rag.go`, vector store usage) but is optional and env/DB-dependent; no separate “verification” pipeline as a first-class layer.
- **Routing:** Learned quality via `PerformanceTracker` exists when DB is available; heuristics still hard-prefer Ollama/HF in `router.go` before strategy logic.
- **Documentation vs code:** Multiple `docs/*.md` files; verify against code when implementing features.

## What is missing (for the full GAIOL vision)

- Explicit **task graph / planner** separate from today’s decomposer + fixed pipeline narrative.
- **Consensus / ABTC** as specified product semantics (trust weights, aggregation guarantees), not only meta-agent merge.
- **Unified provider facade** consumed everywhere (today: `ModelAdapter` + scattered fallbacks and raw model ID strings).
- **First-class observability** spans (trace IDs across decompose → execute → consensus) beyond current metrics/events.
- **Contract tests** against a stable provider/orchestration interface (see `internal/gaiol/contracts` scaffold).

## Refactor later (not this milestone)

- Reduce **duplication** of system prompts (`prompts.go` vs inline strings in handlers/agents).
- Replace **magic model IDs** in `orchestrator.go`, `handlers.go`, `agent_orchestrator.go` with registry-driven defaults or tenant strategy only.
- Split **mega-handlers** (`internal/httpserver/handlers.go`) by domain.
- Move large **static model catalogs** out of `registry.go` or generate from config/API.

## Hardcoded / tightly coupled spots (watch list)

- **Provider names** — `router.go` uses `models.ProviderOllama` / `ProviderHuggingFace`; remaining literals live in adapters, `httpserver` tenant registry builder, and `keys/`.
- **Fallback model IDs** — defaults centralized in `modelresolve`; adapters (e.g. OpenRouter internal defaults) still carry provider-specific strings.
- **Direct adapter use** is appropriate when via `Registry` / `QueryModel`; avoid new call sites that bypass `GenerateText`.

## Thin abstraction layer (this milestone)

| Package | Role |
|--------|------|
| `internal/gaiol/contracts` | Stable **minimal** interfaces for future milestones: `TextModelClient` (subset of `ModelAdapter`), `ReasoningSessionRunner` (matches `*ReasoningEngine`). |

Existing implementations are unchanged; `*reasoning.ReasoningEngine` is asserted to implement `ReasoningSessionRunner` at compile time.

## Milestone 2 (model ID / provider resolution)

**Added** `internal/gaiol/modelresolve`:

- `LookupRegisteredModel` — `GetModel(raw)` then `GetModel("openrouter:"+raw)` (same as former `/api/query` and `/api/query/model` logic; no free-model fallback).
- `LookupRegisteredModelOrFree` — same as above, then first `FindFreeModels()` entry (former `QueryModel` behavior).
- Named defaults: `DefaultReasoningStarterModelIDs`, `DefaultDynamicRouteFailureModelID`, `DefaultConsensusMetaModelID`, `DefaultAgentWorkflowModelID`, `QualifiedOpenRouter`, `HuggingFaceFallbackModelName`, `ScorerQuerySlug`, and helpers `OrderedFreeModelIDsForDecomposer`, `IsOllamaProvider`, `DecomposerPriorityHint`.
- Provider key constants `ProviderOllama`, `ProviderOpenRouter`, etc. (aligned with registry `ModelMetadata.Provider` strings).

**Wired call sites:** `reasoning/query.go`, `reasoning/handlers.go`, `reasoning/orchestrator.go`, `reasoning/decomposer.go`, `reasoning/scorer.go`, `reasoning/consensus.go`, `reasoning/engine.go`, `reasoning/agent_orchestrator.go`, `httpserver/handlers.go` (`handleQuery`, `handleQueryModel`).

**Intentionally unchanged:** `internal/models/router.go` uses `string(models.ProviderOllama)` / `ProviderHuggingFace` from `interface.go` to avoid an import cycle (`models` must not import `modelresolve`). Tenant-only `v1/chat` paths still use a single `GetModel` on the tenant registry (no openrouter-prefix fallback).

**Tests:** `internal/gaiol/modelresolve/resolve_test.go` covers lookup and ordering helpers.

**Concurrency:** `ExecuteStep` fixed a race where two successful goroutines could `close(doneChan)` twice (surfaced when running `TestParallelExecutionGrouping`); first-success now closes under mutex guard only once.

## Go / TypeScript orchestration boundary (contract v1)

**Goal:** One versioned JSON contract for cross-language orchestration so Go and `orchestrator/` evolve without duplicating field names or re-deriving shapes by hand.

**Canonical artifacts**

- JSON Schema (draft 2020-12): `orchestrator/contract/schemas/v1/orchestrate-request.schema.json`, `orchestrate-response.schema.json`, `trust-update.schema.json` (trust events are also embedded in the response schema).
- TypeScript: `orchestrator/src/contract/v1/` — wire types (`wire-types.ts`), Go↔domain mappers (`map.ts`), Ajv validation (`validate.ts`). The Fastify route `POST /v1/orchestrate` accepts **legacy** camelCase bodies (unchanged) or **`schema_version: "1.0"`** snake_case envelopes; v1 responses are validated before send.
- Go: `internal/gaiol/orchestratorcontract/v1` — DTOs (`types.go`), `Client` for `POST /v1/orchestrate` (`client.go`), lightweight validators after JSON decode (`validate.go`). Tests compile the same JSON Schema files from disk and validate representative fixtures (`schema_test.go`); `client_test.go` proves request/response handling against an `httptest` server.

**Shared identifiers (wire)**

- `trace_id`, optional `session_id`, `domain`, `task_kind`, `consensus_mode` (`uniform` \| `static` \| `abtc`), per-call `model_id` / `provider_id` in traces, and ABTC `trust_updates[]` with `distribution.alpha` / `distribution.beta`.

**Operational note:** Point `internal/gaiol/orchestratorcontract/v1.Client` at the Node service base URL (for example the host and port from `ORCHESTRATOR_PORT` in `orchestrator/.env.example`). No Go `main` wiring in this milestone; callers opt in via the client when the TS service is deployed.

## Recommended milestone sequence (after this audit)

1. **Normalize model IDs and defaults** — Milestone 2 added `modelresolve` + wiring; tenant `v1/chat` single-lookup path unchanged on purpose.
2. **Provider facade adoption** — new code depends on `contracts.TextModelClient` or `ModelAdapter` only through registry/router; add tests with fake `TextModelClient`.
3. **Orchestration boundaries** — optional pipeline interface wrapping decompose → orchestrate → compose; keep `ReasoningEngine` as reference implementation.
4. **RAG / verification** — explicit “retrieve then answer” and optional checker step behind interfaces.
5. **Consensus / ABTC** — new package or extend `consensus.go` with trust-weighted aggregation; do not block earlier milestones.

## Related docs

- `docs/architecture.md`, `docs/simplified-architecture.md` — narrative architecture (verify against code).
- `API.md` — HTTP contract for `/v1/chat` and related endpoints.
