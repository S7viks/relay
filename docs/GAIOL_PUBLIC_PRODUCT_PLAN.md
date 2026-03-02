# GAIOL: Plan to Go Public and Ship the Product

**Purpose:** One document that covers (1) going public safely, (2) multitenancy and authentication done properly, (3) a simple landing page, and (4) the core product: **users add their API keys → get one GAIOL API key → use it in their apps while we route across their models efficiently and avoid wasting cost.** Provider keys (OpenRouter, Gemini, HuggingFace) are **not** in the backend environment for the app; users add them only through the frontend, and the backend loads them from the database per tenant.

---

## What the user gets and does (recap)

| What they get | What they do |
|---------------|--------------|
| One (or more) GAIOL API key(s) to use in their own apps | Sign up and log in to GAIOL |
| Efficient use of their existing providers (we route cost- and quality-aware) | Add their provider API keys (OpenRouter, Gemini, HuggingFace, etc.) **in the app UI** — no backend env for these |
| A single integration point: their app talks only to GAIOL with one key | Create and copy a GAIOL API key; use it in their applications |
| A dashboard to manage keys and see usage | Manage their models (add/remove/change provider keys, create/revoke GAIOL keys) — no direct database access |

---

## Executive summary

- **Going public:** Redact credentials, add LICENSE, set README expectations.
- **App foundation:** Complete multitenancy (DB + RLS), finish auth (signup/login/session), protect all app routes.
- **Landing page:** Single page with value prop: "Using multiple AI APIs? We make sure you use them without wasting costs. One key for all your models."
- **Core product:** Users store provider keys (OpenRouter, Gemini, HuggingFace, etc.) in GAIOL; we issue them **one** API key; their applications call GAIOL with that key; we route requests across their connected providers efficiently (cost-aware, quality-aware, no duplicate spend).

---

## Data ownership and access

**The database is ours only.** GAIOL owns and operates the database (e.g. Supabase). Users do **not** get direct database access, connection strings, or schema control.

**What users can do:** Through the application only (UI and/or API), users can **add, remove, and change their models** — i.e.:

- Connect or disconnect **provider API keys** (OpenRouter, Gemini, HuggingFace, etc.).
- Create, name, or revoke **GAIOL API keys** they use in their apps.
- Optionally set **model preferences** (default model, cost vs quality) when we expose that in the app.

All of this is stored in **our** database, scoped by tenant; users never see or touch the database itself. They only manage their models and keys through the product.

---

## Where provider keys live: frontend only, not in app backend

**For the tenant-facing application, do not use OpenRouter, Gemini, or HuggingFace API keys from the backend environment.** The backend must not read `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, or `HUGGINGFACE_API_KEY` from `.env` (or server config) when serving tenant requests.

| Scope | Provider keys (OpenRouter, Gemini, HuggingFace) | Notes |
|-------|-------------------------------------------------|--------|
| **App (web + tenant API)** | **None in backend.** Users add keys only through the **frontend** (dashboard / Settings). Backend loads keys per tenant from the DB when handling a request. | Single-tenant flow: frontend sends key to backend over HTTPS → backend encrypts and stores in `provider_api_keys`; at inference time backend loads by `tenant_id` and builds the registry. |
| **CLI / benchmark / your tooling** | **Optional in env.** For eval, paper-metrics, or internal scripts (e.g. `cmd/benchmark`, `cmd/paper-metrics`), you may keep provider keys in `.env` so you can run benchmarks without going through the app. | Separate from the app. Do not use these env keys in the web server or tenant API path. |

**Backend .env for the app should contain only:** Supabase URL and anon key, optional `GAIOL_ENCRYPTION_KEY` for encrypting stored provider keys, and any app-level secrets (e.g. session signing). No OpenRouter/Gemini/HuggingFace keys there.

**Concrete tasks:** (1) Remove any code path in the web server / tenant API that reads provider keys from env. (2) Implement provider-key CRUD via authenticated API called from the frontend; store encrypted in DB. (3) At inference time, resolve tenant from GAIOL key or JWT, load that tenant’s provider keys from DB, build registry/router, then run the engine. (4) Optionally keep env-based provider keys only in the benchmark/eval CLI so your own runs still work.

---

# Part A: Going public (repo / open source)

## A.1 Security before any public repo

| # | Task | Detail |
|---|------|--------|
| A.1.1 | Redact Supabase credentials in docs | In `DATABASE_SETUP.md` (and any other docs): replace real Supabase URL and anon key with placeholders, e.g. `https://your-project.supabase.co`, `your-anon-key-here`. Never commit real keys. |
| A.1.2 | Audit for other secrets | Grep for `sb_`, `sk-`, `api_key\s*=`, tokens in markdown, config examples. Ensure `.env` and `.env.local` are in `.gitignore` and never committed. |
| A.1.3 | Document env in one place | Single `.env.example` at repo root. **For the app:** list only Supabase URL/key, `GAIOL_ENCRYPTION_KEY` (for encrypting stored provider keys), and app-level secrets (e.g. session). **Do not** list `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY` in the app example; those are user-provided and stored per tenant in the DB. Optionally a second `.env.example.cli` or a section in the same file for CLI/benchmark use only (your own provider keys for eval). |

## A.2 Legal and expectations

| # | Task | Detail |
|---|------|--------|
| A.2.1 | Add LICENSE | Add a `LICENSE` file (e.g. MIT or Apache 2.0). Without it, default copyright applies and reuse is unclear. |
| A.2.2 | Public README | Root README: project name, one-line description, "research / reference implementation," link to paper if any. State that reproducing paper metrics requires paid API access and following benchmark docs. Link to QUICKSTART and `eval/BENCHMARK_README.md`. |
| A.2.3 | Contributing / code of conduct (optional) | CONTRIBUTING.md and CODE_OF_CONDUCT.md if you want contributions. |

---

# Part B: Multitenancy (done properly)

**Context:** One database, owned and operated by GAIOL. Tenants are isolated logically (RLS and tenant_id); users only manage their models via the app, not the DB.

## B.1 Database (already partially there)

Current state:

- `organizations`, `user_profiles` (with `organization_id`, `tenant_id`), `api_queries` exist.
- `handle_new_user()` creates a profile with `tenant_id = user.id` (single-tenant per user).
- RLS on `user_profiles`, `organizations`, `api_queries`.

What’s missing or to tighten:

| # | Task | Detail |
|---|------|--------|
| B.1.1 | Implement `GetTenantInfo` against DB | In `internal/database/tenant.go`: call Supabase (e.g. `get_tenant_context(user_uuid)` or query `user_profiles` + `organizations`) and return real `TenantID`, `UserID`, `OrgID`. Remove "TODO" and default-only path. |
| B.1.2 | Optional: org creation flow | If you want real multi-tenant orgs: table `organizations` is ready; add API + UI to create org, invite users, set `user_profiles.organization_id` and `tenant_id` (e.g. org-scoped). Can be Phase 2. |
| B.1.3 | Tenant on every request | Ensure every API that does work (reasoning, models, usage) resolves tenant from JWT (user id) via `GetTenantInfo` and scopes data by `tenant_id` (and optionally `organization_id`). |

## B.2 Row-level security (RLS)

| # | Task | Detail |
|---|------|--------|
| B.2.1 | Verify RLS policies | Confirm `api_queries` and any new tables (e.g. `provider_api_keys`, `gaiol_api_keys`) are only readable/writable by the tenant that owns the row (via `user_profiles.tenant_id` / `auth.uid()`). |
| B.2.2 | New tables (see Part D) | When adding tables for API keys and unified keys, define RLS so users see only their own org/tenant data. |

## B.3 Service layer

| # | Task | Detail |
|---|------|--------|
| B.3.1 | Tenant context in handlers | All authenticated handlers: extract user ID from JWT → call `GetTenantInfo` → attach `TenantContext` to request context so downstream code (reasoning, registry, billing) always has tenant. |
| B.3.2 | Usage writes | When logging usage (tokens, cost, model), always set `tenant_id` and optionally `organization_id` from `TenantContext`. |

---

# Part C: Authentication (done properly)

## C.1 Current state

- Supabase Auth: signup, signin, JWT.
- `internal/auth/api.go`: SignUp, SignIn, session handling.
- `internal/auth/supabase.go`: middleware that validates Bearer token (Supabase JWT).
- Web UI: login/signup in `_archive/web/`.

## C.2 Tasks

| # | Task | Detail |
|---|------|--------|
| C.2.1 | Restore / align web app with codebase | Bring a minimal web app out of `_archive` (or recreate) so the main server (`cmd/web-server` or equivalent) serves: landing, login, signup, dashboard. Use same auth API (Supabase) and env. |
| C.2.2 | Protected routes | All app routes except landing and auth (login/signup, password reset) require valid JWT. Return 401 if missing or invalid. |
| C.2.3 | Session persistence | Use HTTP-only cookie or front-end storage for access/refresh token; refresh before expiry so long-lived sessions work. |
| C.2.4 | Logout | Clear session (cookie/localStorage) and optionally call Supabase sign-out. |
| C.2.5 | Optional: email verification, password reset | Supabase supports these; wire links and flows if you want production-grade signup. |

---

# Part D: Core product — one API key for all their models

**Access model:** Users have no DB access. They only add, remove, and change their models (provider keys and preferences) via the app; everything is stored in our database.

## D.1 Value proposition (for landing and docs)

- **Problem:** Teams use multiple AI APIs (OpenRouter, OpenAI, Gemini, HuggingFace, etc.). Managing keys, routing, and cost per provider is messy; it’s easy to waste spend.
- **Solution:** Add your provider API keys once in GAIOL. We give you **one** GAIOL API key. Your applications call **only** GAIOL with that key. We route each request across your connected models efficiently (cost, quality, availability) so you don’t waste money and get the best outcome.

## D.2 High-level flow

1. User signs up / logs in (Part C).
2. User goes to "API keys" or "Settings": adds provider keys (OpenRouter, Gemini, HuggingFace, etc.) **via the frontend only**. Frontend sends keys to the backend over HTTPS; backend encrypts and stores them in `provider_api_keys` per tenant. **The backend does not use any provider keys from its own environment for tenant traffic.**
3. User requests "Create GAIOL API key" (or we auto-create one). We generate a **unified key** (opaque token or JWT) bound to that tenant.
4. User copies the GAIOL key into their app. Their app calls GAIOL’s inference API with `Authorization: Bearer <gaiol_key>`.
5. GAIOL gateway: validates GAIOL key → resolves tenant → **loads that tenant’s provider keys from the database** (never from env) → builds registry/router for that request → runs existing reasoning/orchestration (cost-aware, model selection) → returns response and logs usage to that tenant.

## D.2.1 Provider keys: frontend-only, backend loads from DB (detailed)

| # | Task | Detail |
|---|------|--------|
| D.2.1.1 | Remove provider keys from app backend env | In the web server and any tenant-facing API, remove all reads of `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY` from the environment. The app must not use env-based provider keys when serving tenant requests. |
| D.2.1.2 | Frontend: provider key entry | In the dashboard (or Settings), provide a form per provider (OpenRouter, Google/Gemini, HuggingFace): "Add key" with one input for the API key. On submit, frontend calls an authenticated API (e.g. `POST /api/settings/provider-keys`) with the key. Only the backend ever sees the raw key; it encrypts and stores it, returns success and optionally a key_hint (e.g. last 4 chars). |
| D.2.1.3 | Backend: store provider key API | Authenticated endpoint (JWT required): accept provider name and API key in body; validate tenant from JWT; encrypt key with `GAIOL_ENCRYPTION_KEY`; upsert into `provider_api_keys` (tenant_id, provider, encrypted_key, key_hint). Never log or return the raw key. |
| D.2.1.4 | Backend: list/remove provider keys | List: return for the tenant only provider name, key_hint, is_active, created_at. Remove: soft-delete or delete row for that tenant and provider. |
| D.2.1.5 | Backend: inference path uses DB keys only | When handling a request that needs models (e.g. inference endpoint with GAIOL key): (1) Resolve tenant from GAIOL key. (2) Load all active rows from `provider_api_keys` for that tenant. (3) Decrypt in memory and build adapters (OpenRouter, Gemini, HuggingFace) with those keys. (4) Build registry and router; run engine. (5) Do not cache raw keys long-term; short-lived per-request or short TTL cache keyed by tenant_id is acceptable. |
| D.2.1.6 | CLI/benchmark exception | For `cmd/benchmark`, `cmd/paper-metrics`, or other CLI tools used only by you for eval: you may continue to read provider keys from env (e.g. a separate `.env` or same file). Document that these are for local/benchmark use only and are not used by the app server. |

## D.3 Data model (new tables)

| # | Task | Detail |
|---|------|--------|
| D.3.1 | `provider_api_keys` (per tenant) | Columns: `id`, `tenant_id`, `provider` (e.g. openrouter, google, huggingface), `encrypted_key`, `key_hint` (e.g. last 4 chars), `is_active`, `created_at`, `updated_at`. RLS: tenant can only CRUD own rows. Encrypt at rest (e.g. Supabase Vault or app-level with a server-side secret). |
| D.3.2 | `gaiol_api_keys` (unified keys) | Columns: `id`, `tenant_id`, `key_hash` (hash of the issued key, never store raw), `name` (e.g. "Production", "Staging"), `last_used_at`, `created_at`, optional `expires_at`, optional rate limit. RLS: tenant can only see/revoke own keys. See `migrations/007_api_keys_multitenant.sql`. |
| D.3.3 | Optional: `key_usage` or extend `api_queries` | Link each request to `gaiol_api_key_id` and `tenant_id` for per-key analytics and abuse detection. |

## D.4 Key storage and encryption

| # | Task | Detail |
|---|------|--------|
| D.4.1 | Encrypt provider keys at rest | Use a single server-side secret (e.g. `GAIOL_ENCRYPTION_KEY` or Supabase Vault) to encrypt/decrypt provider keys. Never log or return raw provider keys; only show key_hint. |
| D.4.2 | GAIOL key format | Issue a long random secret (e.g. `gaiol_<env>_<random>`) or a signed JWT (sub=tenant_id, scope=inference). Validate on each request and resolve tenant. |

## D.5 API gateway behavior

| # | Task | Detail |
|---|------|--------|
| D.5.1 | Unified inference endpoint | One entrypoint, e.g. `POST /v1/chat` or `POST /v1/reason` that accepts `Authorization: Bearer <gaiol_key>`. |
| D.5.2 | Resolve tenant from GAIOL key | Look up key (by hash or JWT) → get `tenant_id` → **load provider keys for that tenant from the database** (never from env) → build registry (OpenRouter, Gemini, HF, etc.) per request or with short-lived cache. |
| D.5.3 | Use existing engine | Pass the tenant-scoped registry/router into the existing reasoning engine; run decomposition, multi-model, ABTC, etc. No change to core algo; only the source of API keys (DB per tenant vs env). |
| D.5.4 | Log usage | Write to `api_queries` (and optional `key_usage`) with `tenant_id`, `gaiol_api_key_id`, model, tokens, cost, latency. |

## D.6 Dashboard / UX for keys

| # | Task | Detail |
|---|------|--------|
| D.6.1 | "Provider keys" page | List connected providers (OpenRouter, Gemini, HF, etc.); "Add key" per provider; show key_hint and "Connected"; "Remove". |
| D.6.2 | "GAIOL API key" page | "Create key" → show the key once (and warn to copy it); list existing keys (name, last used, created); "Revoke". |
| D.6.3 | Docs for developers | Short doc: "Use your GAIOL key: Authorization: Bearer <key>; endpoint POST /v1/...". Example curl and one code snippet. |

---

# Part E: Landing page

## E.1 Goal

Single, simple landing page that states the value prop and drives signup.

## E.2 Content (copy and structure)

| # | Element | Content / behavior |
|---|---------|---------------------|
| E.2.1 | Hero | Headline: e.g. "Using multiple AI APIs? Stop wasting spend." Subhead: "One API key. We route across your models so you don’t overpay or underuse." |
| E.2.2 | Value bullets | (1) Add your provider keys once. (2) Get one GAIOL key. (3) Use it everywhere. (4) We optimize cost and quality across your models. |
| E.2.3 | CTA | "Get your GAIOL key" or "Sign up free" → signup (or login). |
| E.2.4 | Optional | Short "How it works" (3 steps: connect providers → get one key → use in your app). Optional: link to docs. |
| E.2.5 | Footer | Link to login, docs, status (if any), privacy/terms (if any). |

## E.3 Tech

| # | Task | Detail |
|---|------|--------|
| E.3.1 | Single HTML (or one SPA route) | Landing is the default route `/`; no auth required. Clean, fast, mobile-friendly. |
| E.3.2 | No heavy deps | Prefer minimal CSS (or one small framework). Keep it light so it’s easy to maintain and fast. |

---

# Part F: Other things to make it useful

## F.1 Usage and cost visibility

| # | Task | Detail |
|---|------|--------|
| F.1.1 | Per-tenant usage | Dashboard: total requests, tokens, cost (by provider/model if possible). Use `api_queries` (and optional aggregates). |
| F.1.2 | Per-key usage | If you have multiple GAIOL keys, show usage per key (e.g. "Production" vs "Staging"). |
| F.1.3 | Simple export | Optional: CSV or JSON export of usage for billing/reconciliation. |

## F.2 Rate limiting and abuse

| # | Task | Detail |
|---|------|--------|
| F.2.1 | Rate limit per GAIOL key | e.g. N requests/minute per key (configurable per tenant or plan). Reject with 429 when exceeded. |
| F.2.2 | Optional per-tenant limits | Global cap per tenant (e.g. max spend or max requests/day) to avoid runaway cost. |

## F.3 Reliability and ops

| # | Task | Detail |
|---|------|--------|
| F.3.1 | Health endpoint | `GET /health` or `/ready`: returns 200 if app and DB (and optionally Supabase Auth) are reachable. |
| F.3.2 | Graceful shutdown | On SIGTERM, stop accepting new requests and drain in-flight. |
| F.3.3 | Logging | Structured logs (request id, tenant_id, key_id, latency, error). No provider keys or GAIOL keys in logs. |

## F.4 Documentation

| # | Task | Detail |
|---|------|--------|
| F.4.1 | Public API reference | Endpoints, request/response format, auth (GAIOL key in header), errors, rate limits. |
| F.4.2 | Quickstart | "Sign up → Add provider keys → Create GAIOL key → Call POST /v1/... with Bearer <key>." |
| F.4.3 | Runbook / ops | How to deploy, env vars, DB migrations, how to revoke a key or disable a tenant if needed. |

## F.5 Optional enhancements (later)

| # | Idea | Detail |
|---|------|--------|
| F.5.1 | Budget alerts | Notify user (email or in-app) when tenant usage exceeds a threshold. |
| F.5.2 | Model preferences | Let tenant set default model or cost/quality preference (already partly in engine; expose in UI). |
| F.5.3 | Audit log | Log sensitive actions (key created/revoked, provider key added/removed) for compliance. |
| F.5.4 | Teams / orgs | Multiple users per org, roles (admin can manage keys, member can only use). Builds on B.1.2. |

---

# Part G: Product pages — billing, usage, models, and core dashboard

To make the product good enough and actually useful, the app needs concrete screens beyond the landing and auth. Below: billing screen, usage screen (with graphs), models page(s), and other important pages.

---

## G.1 Dashboard home

| # | Element | Detail |
|---|---------|--------|
| G.1.1 | Purpose | First screen after login: at-a-glance state and shortcuts. |
| G.1.2 | Content | Summary cards: total requests (today / this month), total cost (this month), active GAIOL keys, connected providers. Short links to Usage, Billing, Models, API keys. Optional: last few requests or recent errors. |
| G.1.3 | Tech | Single dashboard route (e.g. `/dashboard`). Authenticated; data from `api_queries` aggregates and `provider_api_keys` / `gaiol_api_keys` counts. |

---

## G.2 Usage screen

| # | Element | Detail |
|---|---------|--------|
| G.2.1 | Purpose | Let the user see how much they’re using (requests, tokens, cost) over time and by dimension. |
| G.2.2 | Summary block | Period selector (today, 7d, 30d). Total requests, total tokens, total cost for the period. Optional: success vs error count. |
| G.2.3 | **Graph(s)** | **Time-series chart:** e.g. requests per day (or hour), cost per day, tokens per day. One chart or tabs (Requests / Cost / Tokens). X = time, Y = value. Use a small chart lib (e.g. Chart.js, ApexCharts) or lightweight SVG. |
| G.2.4 | Breakdown | Table or secondary chart: usage by **provider** (OpenRouter, Gemini, HuggingFace), by **model** (if logged), or by **GAIOL key** (if multiple keys). Enables “which key or provider is costing what.” |
| G.2.5 | Export | Button: “Export CSV” (or JSON) for the selected period (requests, tokens, cost, timestamp, model, key name). Backend: endpoint that returns CSV/JSON from `api_queries` (and optional aggregates) scoped to tenant. |
| G.2.6 | Route / API | Route e.g. `/dashboard/usage`. Backend: `GET /api/usage?from=&to=&group_by=day|provider|key` returning aggregates and time buckets for the frontend to graph. |

---

## G.3 Billing screen

| # | Element | Detail |
|---|---------|--------|
| G.3.1 | Purpose | Transparent view of cost: what they’re spending and where (GAIOL does not charge; cost is from their own providers). |
| G.3.2 | Current period | “This month” (or current billing window): total cost, breakdown by provider (OpenRouter $X, Gemini $Y, HuggingFace $Z). If we don’t have per-provider cost yet, show total and “by model” if available. |
| G.3.3 | **Billing history** | List or table of past periods (e.g. last 6 months): month, total cost, link or expand to see breakdown. Data from `api_queries` aggregated by month and optionally by provider. |
| G.3.4 | Clarification copy | Short note: “Costs are from your connected providers (OpenRouter, Google, etc.). GAIOL does not add markup; we only route and optimize.” Avoids confusion that we’re charging them. |
| G.3.5 | Optional: budget / alerts | If F.5.1 is implemented: set a monthly budget and show “Alert when usage exceeds $X.” Show current vs budget on this screen. |
| G.3.6 | Route / API | Route e.g. `/dashboard/billing`. Backend: `GET /api/billing/summary?period=month` and `GET /api/billing/history` for past periods. |

---

## G.4 Models page(s)

| # | Element | Detail |
|---|---------|--------|
| G.4.1 | Purpose | Single place to see and manage **connected providers** and, if we expose it, **model preferences** (default model, cost vs quality). |
| G.4.2 | “Provider keys” (connect providers) | Same as D.6.1: list of providers (OpenRouter, Google/Gemini, HuggingFace). Per row: provider name, status “Connected” (with key_hint) or “Not connected,” “Add key” / “Change” / “Remove.” Add/change opens a form (key input); submit calls backend to store encrypted. |
| G.4.3 | “Models available” (read-only) | After keys are connected, optional section: “Models you can use” — list of model IDs (or display names) that the registry exposes for this tenant (derived from connected adapters). Helps users know what they can request. Can be loaded from backend: `GET /api/models` (backend builds registry from tenant’s keys and returns public list of model IDs/names). |
| G.4.4 | Model preferences (optional) | If F.5.2 is in scope: dropdown or toggles for “Default model,” “Prefer cost vs quality.” Stored per tenant (e.g. `tenant_settings` or in existing table); engine reads when routing. |
| G.4.5 | Route | Route e.g. `/dashboard/models`. Combines “provider keys” management and optional “models available” + preferences. |

---

## G.5 API keys page (GAIOL keys)

| # | Element | Detail |
|---|---------|--------|
| G.5.1 | Purpose | Create, name, view, and revoke **GAIOL API keys** (the single key users use in their apps). |
| G.5.2 | Content | Same as D.6.2: “Create key” → show key once + “Copy” + warning to store securely; list existing keys: name, last used, created, “Revoke.” No raw key after creation; only key_hint or “Created on …” for identification. |
| G.5.3 | Route | Route e.g. `/dashboard/api-keys`. Backend: create (returns key once), list (metadata only), revoke. |

---

## G.6 Settings page

| # | Element | Detail |
|---|---------|--------|
| G.6.1 | Purpose | Account and app preferences in one place. |
| G.6.2 | Content | Profile: email (from auth), optional display name. Optional: timezone for usage/billing dates. Link to “Provider keys” (or redirect to Models page). Optional: notification prefs (e.g. budget alerts). |
| G.6.3 | Route | Route e.g. `/dashboard/settings`. |

---

## G.7 Activity / audit log (optional but useful)

| # | Element | Detail |
|---|---------|--------|
| G.7.1 | Purpose | Trust and compliance: “What happened in my account?” |
| G.7.2 | Content | Table: timestamp, action (e.g. “Provider key added (OpenRouter),” “GAIOL key created,” “GAIOL key revoked,” “Login”). No sensitive data (no keys). Paginated. |
| G.7.3 | Backend | Store in `audit_log` (tenant_id, action, metadata JSON, created_at) or append to existing table; RLS by tenant. `GET /api/activity` with limit/offset. |
| G.7.4 | Route | Route e.g. `/dashboard/activity`. Can be Phase 2. |

---

## G.8 Navigation and layout

| # | Element | Detail |
|---|---------|--------|
| G.8.1 | Shell | Shared dashboard shell: sidebar or top nav with links to Home, Usage, Billing, Models, API keys, Settings, (Activity). User/account dropdown (logout). |
| G.8.2 | Mobile | Shell works on small screens (collapse sidebar or hamburger). Usage and Billing graphs readable on mobile (responsive charts). |

---

## G.9 Backend APIs to support these pages

| # | API | Purpose |
|---|-----|--------|
| G.9.1 | `GET /api/usage` | Aggregates for usage screen: by time range, group_by day/provider/key; time buckets for graphs. |
| G.9.2 | `GET /api/billing/summary`, `GET /api/billing/history` | Billing screen: current period summary, past periods. |
| G.9.3 | `GET /api/models` | List models available to tenant (from their connected provider keys). |
| G.9.4 | Provider keys | Already in Part D: add, list, remove. |
| G.9.5 | GAIOL keys | Already in Part D: create, list, revoke. |
| G.9.6 | `GET /api/activity` | Optional: audit log entries for activity page. |

---

## G.10 Implementation order for Part G

1. Dashboard home (G.1) and shell/nav (G.8).  
2. Usage screen (G.2) with summary + one time-series graph (e.g. requests or cost over time); then breakdown by provider/key; then export.  
3. Billing screen (G.3): current period + history.  
4. Models page (G.4): provider keys management + optional “models available.”  
5. API keys page (G.5) if not already under D.6.  
6. Settings (G.6).  
7. Activity (G.7) when you add audit logging.

---

# Implementation order (suggested)

**For a step-by-step breakdown with full context and "Done when" criteria, see [IMPLEMENTATION_PHASES.md](IMPLEMENTATION_PHASES.md).** It splits work into Phase 0 (repo/security) through Phase 7 (models list and polish), each with numbered steps.

High-level order below:

1. **Going public** (Part A): redact secrets, add LICENSE, README; document app .env (no provider keys) vs CLI .env (optional provider keys for benchmark).  
2. **Landing page** (Part E): single page with value prop and CTA.  
3. **Auth** (Part C): ensure login/signup/session and protected routes work with current codebase.  
4. **Multitenancy** (Part B): implement `GetTenantInfo` from DB; tenant on every request; RLS verified.  
5. **Core product** (Part D): tables for provider keys and GAIOL keys; encryption; **remove provider keys from app backend env**; implement provider-key CRUD API (frontend calls it to add/remove keys); gateway loads tenant keys from DB only and builds registry; usage logging.  
6. **Dashboard and product pages** (Part G): Dashboard home + shell/nav; **Usage screen** (summary + **graph** over time, breakdown by provider/key, export); **Billing screen** (current period, history, clarification copy); **Models page** (provider keys + optional models available + preferences); **API keys page** (GAIOL key create/list/revoke); **Settings**; optional **Activity** when audit log exists. Backend APIs: usage aggregates, billing summary/history, models list.  
7. **Docs and polish** (F.4, F.2, F.3): API reference, quickstart, rate limits, health, logging.

---

# Checklist summary

- [ ] A: Redact credentials; add LICENSE; public README; .env.example for app (no provider keys) and optional CLI.  
- [ ] B: GetTenantInfo from DB; tenant on every request; RLS for new tables.  
- [ ] C: Login/signup/session; protected routes; optional email/password reset.  
- [ ] D: Tables (provider_api_keys, gaiol_api_keys); encrypt provider keys; **no provider keys in app backend env**; **frontend-only provider key entry**; backend store/list/remove API; inference path loads keys from DB only; issue/validate GAIOL key; gateway → tenant registry → engine → usage.  
- [ ] E: Landing page (value prop, CTA, optional how-it-works).  
- [ ] F: Rate limits; health; logging; API docs and quickstart.  
- [ ] G: **Billing screen**; **Usage screen with graph**; **Models page**; dashboard home; API keys page; Settings; nav/shell; optional Activity; backend APIs for usage, billing, models.

---

# Summary

This plan gets you to a single landing page, proper multitenancy and auth, and the core product: one GAIOL API key per tenant that uses **their** provider keys (added only via the frontend, stored encrypted in our DB) efficiently without wasting cost. The backend never uses OpenRouter/Gemini/HuggingFace keys from its environment for tenant traffic; it loads them from the database per tenant. CLI/benchmark tooling may still use env-based provider keys for your own eval runs.

**Product pages (Part G)** make the app actually useful: **billing screen** (current cost, history, “costs are from your providers”), **usage screen** (summary + **time-series graph**, breakdown by provider/key, export), **models page** (connect providers, see models available, optional preferences), **dashboard home**, **API keys page**, **Settings**, and optional **Activity** (audit log). Shared nav/shell and backend APIs for usage, billing, and models support these screens.
