# GAIOL — Architecture & System Design

## Architectural Pattern

GAIOL follows a **layered microservices architecture** organized into five tiers:

```
┌─────────────────────────────────────────────────────┐
│               Presentation Layer                     │
│   (Web UI: chat, dashboard, history, settings)      │
├─────────────────────────────────────────────────────┤
│                  API Gateway                         │
│    (HTTP routing, auth middleware, rate limiting)   │
├─────────────────────────────────────────────────────┤
│               Business Logic Layer                   │
│  (Reasoning engine, orchestration, RAG, consensus)  │
├─────────────────────────────────────────────────────┤
│               Data Access Layer                      │
│  (Multi-tenant storage, vector ops, conn pooling)   │
├─────────────────────────────────────────────────────┤
│            External Integration Layer                │
│  (Gemini, HuggingFace, OpenRouter, Ollama adapters) │
└─────────────────────────────────────────────────────┘
```

---

## OS Analogy Mapping

GAIOL is explicitly designed with an OS-abstraction philosophy:

| OS Primitive | GAIOL Equivalent | Status |
|---|---|---|
| Process scheduling | Model orchestration + task decomposition | Evaluated |
| Inter-process communication | Universal AI Protocol Layer | Implemented |
| Memory management | Session state + conversation history | Implemented* |
| File system / storage | Vector store + knowledge base | Implemented |
| Access control | RBAC + multi-tenant isolation | Implemented |
| Virtual memory / shared state | Continuous world model | Designed† |
| Distributed file system | Federated data mesh | Designed† |
| Security policy enforcement | Cross-org governance engine | Designed† |

*Session-level state only — not a planning-literature world model.  
†Architectural provision; empirical evaluation deferred to future work.

---

## Hybrid Runtime: Go + TypeScript

GAIOL has **two orchestration engines** that can operate together or independently:

### Go Backend (primary)
- Entry: `cmd/web-server/main.go`
- Serves all HTTP routes, static web assets
- Contains the Go reasoning orchestrator (`internal/reasoning/`)
- Handles auth, database, model registry, RAG

### TypeScript Orchestrator (optional, advanced)
- Entry: `orchestrator/src/api/server.ts` (Fastify)
- Activated via env vars: `GAIOL_TS_ORCHESTRATOR_URL` + `GAIOL_USE_TS_ORCHESTRATOR`
- Provides more sophisticated pipeline: beam search, ABTC trust, observability traces
- Go delegates to TS via `/api/query/smart` → `/v1/orchestrate`
- Exception: `strategy=go_reasoning` forces local Go path

### Delegation Logic
```
Request to /api/query/smart
    │
    ├── TSOrchestratorDelegate && TSOrchestrator != nil?
    │       YES → Build v1 contract → POST /v1/orchestrate → return normalized response
    │       NO  → Use internal Go reasoning orchestrator
    │
    └── strategy=go_reasoning → Always use Go path (bypass TS)
```

---

## Authentication Modes

The backend supports two modes, controlled by env flags:

### Auth Mode (production)
- `GAIOL_DISABLE_AUTH=false` (default)
- Requires Supabase client
- Tenant-defined models at runtime (empty registry at startup)
- Full RBAC + row-level security
- Per-tenant API key management

### No-Auth Mode (development)
- `GAIOL_DISABLE_AUTH=true` / `GAIOL_AUTH_DISABLED=true` / `DISABLE_AUTH=true`
- Local tenant middleware
- Models auto-loaded from env (OpenRouter/HuggingFace/Gemini keys)
- Ollama availability probe at startup
- Suitable for local development without Supabase

---

## HTTP Route Architecture

### Public / Page Routes
- `GET /` → landing
- `GET /health` → health check
- `GET /login`, `/signup`, `/reset-password`, `/terms`, `/dashboard`, `/welcome`, `/chat`

### Model Discovery
- `GET /api/models/free` → free model list
- `GET /api/models` → all available models
- `GET /api/models/:provider` → provider-specific models

### Core AI / Reasoning
- `POST /api/query` → simple query
- `POST /api/query/smart` → smart query (may delegate to TS orchestrator)
- `POST /api/query/model` → specific model query
- `POST /api/reasoning/start` → begin reasoning session
- `GET /api/reasoning/status/:id` → session status
- `WS /api/reasoning/ws` → live reasoning event stream
- `GET /api/orchestration/traces/:id` → proxy to TS trace endpoint

### World Model
- `GET /api/world-model/facts`
- `POST /api/world-model/store`
- `POST /api/world-model/search`

### Dashboard / Operations
- `/api/settings/*` → provider settings, model settings, preferences
- `/api/gaiol-keys*` → API key CRUD
- `/api/usage*` → usage reporting + export
- `/api/billing/*` → billing summary + history
- `GET /api/activity` → activity log

### Chat (v1)
- `POST /v1/chat` → chat endpoint

---

## Database (Supabase)

- PostgreSQL with Row Level Security (RLS)
- Multi-tenant: every query injects organizational context
- Key tables:
  - `profiles` / `organizations` — identity + tenant
  - `api_queries` — query history linked to API keys
  - `reasoning_sessions`, `reasoning_steps`, `reasoning_outputs` — session hierarchy
  - `documents` — pgvector embeddings for RAG
  - `model_performance`, `model_performance_agg` — performance tracker
  - `world_model_facts` — world model storage with full-text index
  - `audit_log`, `tenant_settings` — governance + config
  - `provider_keys`, `gaiol_api_keys` — encrypted credential store
  - `custom_providers`, `tenant_models` — BYOM (bring your own model)

---

## Frontend Architecture

Pure vanilla JS/CSS/HTML — no framework. Script-order-sensitive, window-global exports.

### Key JS Modules
| File | Responsibility |
|---|---|
| `api.js` | HTTP wrapper + token lifecycle |
| `auth.js` | Auth UX (login/signup/logout/session) |
| `state.js` | Central app state + local persistence |
| `main.js` | App startup + query submission (reasoning-first) |
| `reasoning-bundle.js` | Reasoning session start + WebSocket + viz (single script) |
| `reasoning-component.js` | Embedded reasoning timeline rendering |
| `ui.js` | Heavy DOM rendering layer |
| `dashboard.js` | Dashboard controller |
| `models.js` | Model loading/filtering/selection |
| `history.js` | History persistence/render/replay |

### Query Submission Flow
```
handleQuerySubmit()
    → executeReasoningQuery()
        → POST /api/reasoning/start
        → Subscribe to WebSocket /api/reasoning/ws
        → Show decomposition/progress events
        → Display final output on reasoning_end
        → Persist history
```

---

## Provider Adapters

All adapters implement the `ModelAdapter` interface and conform to the UAIP (Universal AI Protocol) schema.

| Provider | Adapter | Notes |
|---|---|---|
| OpenRouter | `openrouter.go` | Single endpoint to dozens of models |
| HuggingFace | `huggingface.go` | Cloud-hosted and on-prem endpoints |
| Ollama | `ollama.go` | Local model server, availability-probed at startup |
| Gemini | `gemini.go` | Google Gemini |
| Anthropic | `anthropic.go` | Claude models |
| OpenAI-compatible | `openai_compatible.go` | Generic OpenAI-spec endpoint |

A shared `response_cleaner.go` normalizes provider-specific output artifacts before consensus.
