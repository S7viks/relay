# GAIOL — Codebase Internals

## Go Backend (`internal/`)

### `internal/auth`
Supabase-backed authentication and request identity.

| File | Purpose |
|---|---|
| `api.go` | `AuthAPI` wrapper: signup/signin/session refresh/get user/recover/update password/signout |
| `supabase.go` | Auth middleware (bearer/cookie → Supabase verify), token cache, `WithUser` / `GetUserFromContext`, `RequireAuth`, `OptionalAuth` |

### `internal/database`
Single data access boundary and multi-tenant context source.

| File | Purpose |
|---|---|
| `supabase.go` | Client lifecycle (NewClient, Init, HealthCheck), global accessors, tenant context helpers (WithTenant, GetTenantFromContext, EnsureTenantContext) |
| `tenant.go` | Tenant lookup/provision (GetTenantInfo, EnsureTenantInfo) |
| `tenant_settings.go` | Tenant settings read/upsert |
| `usage.go` | Usage and billing queries for tenant-scoped reporting |
| `audit.go` | Audit log insert/retrieval |
| `vector.go` | Supabase-backed vector query for RAG; insert path marked unimplemented |

### `internal/httpserver`
API and static web boundary; integration junction for almost every subsystem.

| File | Purpose |
|---|---|
| `register.go` | `Deps`, `InitConfigFromEnv`, full route map (`Register`), CORS, auth/no-auth branching, static serving |
| `handlers.go` | Core HTTP handlers: query, smart query, model APIs, auth/session, world model, settings/keys/usage/billing/activity, v1 chat |
| `ts_orchestrator.go` | Smart-query delegation to TS orchestrator + trace proxy endpoint |
| `register_test.go` | Route/mux behavior tests |

### `internal/keys`
Secure tenant credential and config management.

| File | Purpose |
|---|---|
| `crypto.go` | AES-GCM encrypt/decrypt (GAIOL_ENCRYPTION_KEY) |
| `provider_keys.go` | Per-tenant provider API key CRUD/load |
| `custom_providers.go` | Tenant custom provider metadata CRUD/load |
| `tenant_models.go` | Tenant model catalog CRUD/load |
| `gaiol_keys.go` | GAIOL API key issuance/list/revoke/validate (hashed token model) |

### `internal/models`
Model abstraction and provider execution backend.

| File | Purpose |
|---|---|
| `interface.go` | Core abstractions: `ModelAdapter`, `TaskType`, capabilities, cost model |
| `registry.go` | In-memory model catalog: registration, query APIs, provider-specific population |
| `router.go` | Strategy/task/cost-aware model routing and execution orchestration |
| `performance_tracker.go` | Tracks model metrics; cache refresh from DB |
| `embeddings.go` | Embedding interfaces for RAG compatibility |

**Adapters** (`internal/models/adapters/`):
- `openrouter.go`, `huggingface.go`, `ollama.go`, `gemini.go`, `anthropic.go`, `openai_compatible.go`
- `response_cleaner.go` — normalizes provider-specific output

### `internal/reasoning`
The core intelligence subsystem — the most important package.

| File | Purpose |
|---|---|
| `types.go` | Shared reasoning/session/step/output/event data types |
| `engine.go` | Session lifecycle and orchestration flow control |
| `orchestrator.go` | Parallel model execution, fast-fail bias, timeout protection, fallback chain (Ollama → HuggingFace), event emission |
| `decomposer.go` | Prompt decomposition (JSON extraction + fallback 7-step template) |
| `scorer.go` | Output scoring and weighted quality computation |
| `consensus.go` | Consensus selection logic over candidate outputs |
| `selector.go` | Final selection/composition helpers |
| `prompts.go` | Prompt wrapping/context trimming |
| `query.go` | Query model wrapper |
| `memory.go`, `cache.go` | Session/step/output memory handling + buffering |
| `world_model.go` | Knowledge/facts memory operations |
| `rag.go` | Retrieval augmentation with vector store + embedder |
| `events.go` | Event types/callback scaffolding for live updates |
| `handlers.go` | Reasoning API handlers consumed by HTTP server |
| `agent.go`, `agent_orchestrator.go` | Role-based/simple agent workflow abstractions |

**Tests**: `engine_test.go`, `orchestrator_test.go`, `handlers_buffer_test.go`, `testing.go`

### `internal/uaip`
Canonical protocol DTO layer across all adapters and orchestrators.

| File | Purpose |
|---|---|
| `message.go` | Full UAIP request/response schema and nested structures |
| `rag.go` | `Document` and `VectorStore` contracts |
| `constants.go` | Status/errors/task priority/tier constants |

### `internal/gaiol/`
Contracts and adapters for GAIOL-specific integrations.

- `modelresolve/resolve.go` — Model ID/provider constants; default model choices
- `contracts/provider.go` — `TextModelClient` interface
- `contracts/orchestration.go` — `ReasoningSessionRunner` bindings
- `orchestratorcontract/v1/types.go` — Versioned TS orchestrator wire schema
- `orchestratorcontract/v1/client.go` — HTTP client for `/v1/orchestrate` and traces
- `orchestratorcontract/v1/validate.go` — Contract-level request/response validation
- `orchestratorcontract/v1/trace_summary.go` — Trace summarization for observability

---

## TypeScript Orchestrator (`orchestrator/src/`)

### `api/server.ts`
Fastify server. Exposes:
- `GET /health`
- `POST /v1/orchestrate` — full orchestration pipeline
- `GET /v1/traces/:traceId` — trace + rebuilt timeline + metrics summary

### `orchestration/pipeline.ts`
Full run loop in order:
1. Decompose objective
2. Per-subtask: fetch trust state by model/domain
3. Routing plan with candidate pool and diversity rationale
4. Optional beam path exploration and pruning
5. Model invocation with retry and observability events
6. Consensus selection (supports `abtc`, `static`, `uniform`)
7. Trust posterior updates (ABTC with decay/strength parameters)
8. Trace persistence + metrics summary + replay timeline

### `routing/`
| File | Purpose |
|---|---|
| `scorer.ts` | Weighted score computation |
| `plan.ts` | Candidate selection plan (pool size + diversity) |
| `diversity.ts` | Provider-diverse round-robin selection |
| `engine.ts` | Simple route wrapper |
| `text-sim.ts` | Token Jaccard similarity helper |

### `consensus/`
| File | Purpose |
|---|---|
| `engine.ts` | Supports `uniform`, `static`, `abtc` consensus modes |
| `abtc.ts` | Beta trust math (mean/variance/decay/posterior update) |
| `trust-update.ts` | Converts consensus quality to trust signal + posterior step explanation |
| `beam.ts` | Top-k pruning helper |

### `persistence/`
| File | Purpose |
|---|---|
| `contracts.ts` | Repository interfaces (trust/session/trace/eval) |
| `memory-store.ts` | Default in-memory implementations |
| `file-trust-store.ts` | JSON-file trust repository (durable option) |

⚠️ **Important**: Server currently wires in-memory repos by default. Traces/trust are durable ONLY if you explicitly switch to `FileTrustRepository`.

### `observability/`
| File | Purpose |
|---|---|
| `events.ts` | Event names/phases/schema |
| `hub.ts` | Event fanout hub |
| `sinks.ts` | Memory timeline sink + pino sink + multi-sink |
| `trace.ts` | Trace ID generator |
| `metrics-summary.ts` | KPI aggregation from trace |
| `replay.ts` | Deterministic timeline reconstruction from persisted trace |
| `logger.ts` | Pino logger factory |

### `contract/v1/`
AJV-validated wire types for the Go ↔ TS interface:
- `wire-types.ts` — canonical snake_case contract types
- `map.ts` — domain ↔ v1 mapping
- `validate.ts` — AJV validators + `ContractValidationError`
- Schema files: `orchestrate-request.schema.json`, `orchestrate-response.schema.json`, `trust-update.schema.json`

### `providers/`
| File | Purpose |
|---|---|
| `contract.ts` | Adapter interface (generate, health, usage shape) |
| `mock-adapter.ts` | Deterministic test adapter |
| `openai-adapter.ts` | OpenAI HTTP mapping |
| `anthropic-adapter.ts` | Anthropic HTTP mapping |
| `gemini-adapter.ts` | Gemini HTTP mapping |

---

## Cross-Dependency Graph

```
httpserver ──────────────────────────────────────────────────┐
    │  imports                                                │
    ├── auth                                                  │
    ├── database ←── monitoring, keys, auth                  │
    ├── keys ──────── database                               │
    ├── models ──────── uaip, database                       │
    │   └── adapters ── uaip                                 │
    ├── reasoning ──────────────────────────────────────────►│
    │   ├── models                                           │
    │   ├── database                                         │
    │   ├── monitoring                                       │
    │   ├── uaip                                             │
    │   └── gaiol/modelresolve                               │
    ├── monitoring ── database                               │
    └── gaiol/orchestratorcontract/v1                        │
            ├── types                                        │
            ├── client (HTTP to TS orchestrator)             │
            └── validate                                     │
```

`httpserver` is the integration hub.  
`reasoning` is the intelligence core.  
`uaip` is the canonical DTO layer for all adapters.

---

## Database Schema (Migrations)

Applied in order:

| Migration | Purpose |
|---|---|
| `001_initial_schema.sql` | Core org/profile/query schema, RLS, policies, signup trigger, tenant context helper |
| `002_rag_init.sql` | `documents` table with pgvector embedding + match function |
| `002_reasoning_tables.sql` | `reasoning_sessions`, `reasoning_steps`, `reasoning_outputs` with RLS |
| `003_performance_init.sql` | `model_performance` + aggregate view `model_performance_agg` |
| `004_session_cost.sql` | Adds `total_cost` to reasoning sessions |
| `006_world_model.sql` | `world_model_facts` + full-text indexes |
| `007_api_keys_multitenant.sql` | Tenant provider keys + GAIOL API keys with RLS |
| `008_audit_usage_prefs.sql` | `audit_log`, `tenant_settings`, usage→api-key link |
| `009_custom_providers_models.sql` | Tenant custom provider/model catalog (BYOM) |

⚠️ **Schema Note**: `documents`, `model_performance`, and `world_model_facts` tables lack tenant columns in current migrations — they use app-level partitioning or are slated for future migration.

---

## Build & Run

### Go Backend
```bash
# Build
make build
# or: go build ./cmd/web-server

# Run (default port 8080)
make run
# or: PORT=8080 ./web-server

# Test
make test

# Docker
docker build -t gaiol .
docker run -p 8080:8080 gaiol
```

### TypeScript Orchestrator
```bash
cd orchestrator
npm install
npm run build
npm run dev:api     # Development server
npm test            # Vitest tests
node dist/cli/index.js  # CLI runner
```

### Frontend
```bash
npm run build  # Runs scripts/inject-gaiol-config.js only
```

### Windows (primary dev OS)
```
start.bat → start.ps1 → boots Go server (+ optional TS orchestrator)
stop.bat → stop.ps1
scripts/dev/clean-start.ps1  # Kill processes, clean rebuild, restart
```

---

## Environment Variables

```env
# Auth
GAIOL_DISABLE_AUTH=true          # Enable no-auth dev mode
GAIOL_AUTH_DISABLED=true         # Alternative flag
DISABLE_AUTH=true                # Alternative flag

# Database
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# Encryption
GAIOL_ENCRYPTION_KEY=...         # AES-GCM key for stored API keys

# Model providers (no-auth mode)
OPENROUTER_API_KEY=...
HUGGINGFACE_API_KEY=...
GEMINI_API_KEY=...

# TypeScript orchestrator
GAIOL_TS_ORCHESTRATOR_URL=http://localhost:3001
GAIOL_USE_TS_ORCHESTRATOR=true

# TS orchestrator beam/consensus tuning
GAIOL_BEAM_WIDTH=3
GAIOL_EXPLORE_PATHS=true
GAIOL_CONSENSUS_MODE=abtc        # abtc | static | uniform

# Server
PORT=8080
```
