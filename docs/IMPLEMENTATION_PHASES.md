# GAIOL: Phased Implementation Plan

This document breaks the [GAIOL Public Product Plan](GAIOL_PUBLIC_PRODUCT_PLAN.md) into **multiple smaller phases** with full context and **step-by-step** tasks. Each phase has a clear goal, prerequisites, and a "Done when" checklist. Execute phases in order; later phases depend on earlier ones.

**For an even finer breakdown** (sub-steps per step, e.g. 2.3.4 = Phase 2, Step 2.3, Substep 4), see **[IMPLEMENTATION_PHASES_DETAILED.md](IMPLEMENTATION_PHASES_DETAILED.md)**. That document turns every step below into multiple concrete sub-steps with their own "Done when" so you can tick off very small tasks.

---

## Context (read first)

- **Product:** Users add their provider API keys (OpenRouter, Gemini, HuggingFace) in the app; we give them one GAIOL API key; they use it in their apps; we route efficiently and avoid wasting cost. **Our database only;** users only add/remove/change their models via the app. **Provider keys are not in the backend env for the app** — users add them via the frontend; the backend loads them from the DB per tenant.
- **Stack:** Go backend (e.g. `cmd/web-server`), Supabase (auth + DB), frontend (e.g. HTML/JS from `_archive/web` or minimal SPA). Existing: auth API, tenant schema, reasoning engine, adapters (OpenRouter, Gemini, HuggingFace).
- **Reference:** Full scope and tables are in `GAIOL_PUBLIC_PRODUCT_PLAN.md` (Parts A–G). Migrations: `migrations/001_initial_schema.sql`, `migrations/007_api_keys_multitenant.sql`.

---

# Phase 0: Repo and security (going public)

**Goal:** Safe to open-source or share the repo: no secrets in docs, clear license, env documented. No runtime changes.

**Prerequisites:** None.

**Context:** Part A of the main plan. Ensures credentials are redacted and env is documented so app vs CLI usage is clear (app does not use provider keys from env).

---

## Phase 0 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 0.1 | Redact Supabase in docs | In `DATABASE_SETUP.md` and any other markdown under the repo: replace real Supabase URL and anon key with placeholders (`https://your-project-id.supabase.co`, `your-anon-key-here`). | No real Supabase URL/key appears in any committed file. |
| 0.2 | Audit for secrets | Grep repo for `sb_`, `sk-`, `api_key\s*=`, token-like strings in `.md`, `.yaml`, `.json`, example configs. Remove or redact. Confirm `.env`, `.env.local`, `.env.*.local` are in `.gitignore`. | No secrets in tracked files; .env* ignored. |
| 0.3 | Add LICENSE | Add `LICENSE` at repo root (e.g. MIT or Apache 2.0). | LICENSE file exists and is correct. |
| 0.4 | Create .env.example (app) | At repo root, create or update `.env.example`. Include only: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_*`), `GAIOL_ENCRYPTION_KEY` (comment: for encrypting stored provider keys), optional `PORT`/session secrets. **Do not** include `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY`. Add short comments: "App only; provider keys are added by users in the dashboard." | App .env.example has no provider key vars. |
| 0.5 | Document CLI env (optional) | In same file (as a section) or in `.env.example.cli`: list `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY` with comment "For CLI/benchmark only (e.g. cmd/benchmark, cmd/paper-metrics). Not used by the app server." | Clear which env is for app vs CLI. |
| 0.6 | Public README | Update root README: project name, one-line description, link to QUICKSTART and `eval/BENCHMARK_README.md`. If applicable: "Research / reference implementation; paper metrics require paid API access." | README is accurate and points to key docs. |

**Phase 0 Done when:** All steps above complete; repo has no committed secrets; LICENSE and .env.example are in place; README updated.

---

# Phase 1: Landing page and app shell

**Goal:** A public landing page and a minimal app structure (routes, static or SPA) so we have somewhere to add auth and dashboard next.

**Prerequisites:** Phase 0 done (optional but recommended).

**Context:** Part E of the main plan. Landing is the first thing users see; the app shell is the container for login, signup, and later the dashboard.

---

## Phase 1 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 1.1 | Decide frontend structure | Choose: (a) Multi-page HTML + minimal JS, or (b) SPA (e.g. one index.html + JS routing). Ensure the main server (e.g. `cmd/web-server`) can serve static files and route `/` to landing. | Decision documented (e.g. in README or plan). |
| 1.2 | Landing route | Implement or configure so `GET /` returns the landing page (no auth required). | Visiting `/` shows landing. |
| 1.3 | Landing content | Add hero (headline e.g. "Using multiple AI APIs? Stop wasting spend."; subhead "One API key. We route across your models so you don't overpay or underuse."), 3–4 value bullets, CTA button "Get your GAIOL key" or "Sign up free" that links to signup (or login). Optional: short "How it works" (3 steps). Footer: login, docs links. | Copy and layout match plan. |
| 1.4 | Landing styling | Minimal CSS so the page is readable and looks acceptable on desktop and mobile. Prefer minimal deps. | Page is presentable and responsive. |
| 1.5 | Placeholder auth routes | Ensure routes exist (or are reserved) for `/login`, `/signup`, `/dashboard` (can 302 to login if not authenticated). No need to implement auth yet; just routing/placeholders. | Navigating to these paths doesn’t 404. |
| 1.6 | Dashboard placeholder | Add a minimal dashboard route (e.g. `/dashboard`) that for now can show "Dashboard" and a logout link. It will be protected in Phase 2 and filled in Phase 5–6. | `/dashboard` loads a simple page. |

**Phase 1 Done when:** Landing page is live at `/`, CTA goes to signup/login; dashboard placeholder exists; no secrets in frontend.

---

# Phase 2: Authentication and protected routes

**Goal:** Users can sign up, log in, and access protected routes with a valid session. Dashboard and all app pages except landing and auth require login.

**Prerequisites:** Phase 1 done; Supabase project created; env has Supabase URL and anon key.

**Context:** Part C of the main plan. Uses existing `internal/auth` (Supabase); we wire the frontend and enforce JWT on protected routes.

---

## Phase 2 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 2.1 | Run auth schema | Ensure `migrations/001_initial_schema.sql` has been run in Supabase (organizations, user_profiles, api_queries, RLS, trigger `on_auth_user_created`). | New signups get a row in `user_profiles`. |
| 2.2 | Signup page | Build signup page (e.g. `/signup`): form (email, password). On submit, call Supabase Auth signup (or your backend proxy to it). Show errors (e.g. email taken). On success, redirect to dashboard or login. | User can create an account. |
| 2.3 | Login page | Build login page (e.g. `/login`): form (email, password). On submit, call Supabase Auth signin. On success, store access token (and optionally refresh token) in HTTP-only cookie or localStorage; redirect to dashboard. | User can log in. |
| 2.4 | Session persistence | After login, persist session (cookie or localStorage). On app load, if token exists and is not expired, consider user logged in; optionally refresh token before expiry. | Session survives refresh. |
| 2.5 | Logout | Implement logout: clear session (cookie/localStorage), optionally call Supabase sign-out. Add logout to dashboard/nav. | User can log out. |
| 2.6 | Auth middleware (backend) | In the web server, add middleware that for protected routes (e.g. `/api/*`, `/dashboard`) checks for valid JWT (Bearer token or cookie). If missing or invalid, return 401. If valid, extract user ID and attach to request context. | Protected API/dashboard return 401 when not logged in. |
| 2.7 | Frontend guard | For dashboard (and later all dashboard sub-routes), if no valid session, redirect to `/login`. | Unauthenticated user cannot see dashboard. |
| 2.8 | Optional: password reset | If desired: "Forgot password" link and flow using Supabase Auth recovery. | Optional; document if skipped. |

**Phase 2 Done when:** Signup, login, logout work; dashboard is only accessible when logged in; backend rejects unauthenticated requests to protected endpoints.

---

# Phase 3: Multitenancy (tenant resolution and RLS)

**Goal:** Every authenticated request has a tenant; tenant comes from the DB; RLS is verified for existing and new tables. No product feature yet — only foundation.

**Prerequisites:** Phase 2 done; DB has `user_profiles` with `tenant_id`.

**Context:** Part B of the main plan. Tenant is the unit of isolation; we need it before storing provider keys or GAIOL keys per tenant.

---

## Phase 3 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 3.1 | GetTenantInfo from DB | In `internal/database/tenant.go`: implement `GetTenantInfo(ctx, userID)` by calling Supabase (e.g. RPC `get_tenant_context(user_uuid)` or query `user_profiles` where `id = userID`). Return `TenantContext{TenantID, UserID, OrgID}`. Remove TODO and default-only path; use real DB. | GetTenantInfo returns DB-backed tenant. |
| 3.2 | EnsureTenantInfo | Ensure `EnsureTenantInfo` uses `GetTenantInfo` and, if tenant_id is empty, defaults to user ID. No other logic change. | Consistent with single-tenant-per-user. |
| 3.3 | Tenant in request context | In auth middleware (or first handler for protected routes), after validating JWT and getting user ID: call `GetTenantInfo(ctx, userID)` and attach `TenantContext` to `context.Context` (e.g. with a private key). Document that downstream code must read tenant from context. | Every protected request has tenant in context. |
| 3.4 | Run 007 migration | Run `migrations/007_api_keys_multitenant.sql` in Supabase. Creates `provider_api_keys` and `gaiol_api_keys` with RLS. | Tables exist; RLS policies applied. |
| 3.5 | Verify RLS | Manually or with a short test: confirm that a user can only read/write rows where `tenant_id` matches their profile. Check `api_queries`, `provider_api_keys`, `gaiol_api_keys`. | RLS restricts data by tenant. |
| 3.6 | Usage writes use tenant | Wherever the app writes to `api_queries` (or will write), ensure `tenant_id` (and optionally `organization_id`) are set from `TenantContext`. If no writes exist yet, add a comment or stub in the inference path (Phase 4) to set tenant on insert. | All usage rows are tenant-scoped. |

**Phase 3 Done when:** Tenant is resolved from DB on every authenticated request; 007 tables exist with RLS; usage writes (current or planned) use tenant from context.

---

# Phase 4: Core product — keys and inference gateway

**Goal:** Users can add provider keys via the app (stored encrypted); we issue GAIOL keys; the inference endpoint accepts a GAIOL key, loads tenant’s provider keys from DB, runs the engine, and logs usage. **No provider keys in app backend env.**

**Prerequisites:** Phase 3 done; encryption key in env (`GAIOL_ENCRYPTION_KEY`).

**Context:** Part D of the main plan. This is the core: one GAIOL key per tenant, provider keys only from DB.

---

## Phase 4 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 4.1 | Remove provider keys from app backend | In the web server and any tenant-facing API code, remove reads of `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY` from the environment. Ensure no code path used for tenant inference uses env provider keys. | App never uses env for provider keys on tenant path. |
| 4.2 | Encryption helper | Implement encrypt/decrypt for provider keys using `GAIOL_ENCRYPTION_KEY` (e.g. AES-GCM). Use it only in backend; never log or return raw keys. | Helper exists; keys encrypted at rest. |
| 4.3 | Provider key store API | Authenticated endpoint `POST /api/settings/provider-keys` (or similar): body `{ "provider": "openrouter" \| "google" \| "huggingface", "api_key": "..." }`. Resolve tenant from JWT; encrypt key; upsert `provider_api_keys` (tenant_id, provider, encrypted_key, key_hint). Return success and key_hint (e.g. last 4 chars). Never return raw key. | Frontend can add a provider key. |
| 4.4 | Provider key list/remove API | `GET /api/settings/provider-keys`: return for tenant only provider, key_hint, is_active, created_at. `DELETE /api/settings/provider-keys?provider=openrouter`: delete or soft-delete row for that tenant and provider. | Frontend can list and remove keys. |
| 4.5 | GAIOL key create API | Authenticated `POST /api/gaiol-keys`: body optional `{ "name": "Production" }`. Generate secure random key (e.g. `gaiol_` + 32 bytes hex); hash it (e.g. SHA-256); store hash in `gaiol_api_keys` with tenant_id, name. Return raw key **once** in response (never store raw). Frontend must show "Copy and store; we won't show again." | User can create a GAIOL key and get it once. |
| 4.6 | GAIOL key list/revoke API | `GET /api/gaiol-keys`: return id, name, last_used_at, created_at (no key material). `DELETE /api/gaiol-keys/:id`: revoke (delete or mark inactive). | User can list and revoke keys. |
| 4.7 | GAIOL key validation | Helper or middleware: given `Authorization: Bearer <token>`, hash token and look up in `gaiol_api_keys`; if found and active, return tenant_id. Update `last_used_at`. | Inference can resolve tenant from GAIOL key. |
| 4.8 | Load provider keys by tenant | Function: given tenant_id, load all active rows from `provider_api_keys`; decrypt in memory; return map[provider]api_key. Used only when handling inference. Optional: short TTL cache keyed by tenant_id (e.g. 1–5 min) to avoid DB + decrypt on every request. | Backend can build adapters from DB keys. |
| 4.9 | Build registry from tenant keys | Given decrypted provider keys, instantiate OpenRouter, Gemini, HuggingFace adapters (reuse existing adapter constructors); call `NewRegistry(or, gemini, hf)` (or equivalent); register Gemini if tenant has Google key. No env fallback. | Registry is per-tenant from DB. |
| 4.10 | Unified inference endpoint | Implement `POST /v1/chat` or `POST /v1/reason` (or align with existing UAIP). Require `Authorization: Bearer <gaiol_key>`. Validate GAIOL key → get tenant_id → load provider keys → build registry/router → run existing reasoning engine with that registry → return response. | One endpoint works with GAIOL key only. |
| 4.11 | Log usage | After each inference, insert into `api_queries`: tenant_id, user_id (if available), gaiol_api_key_id (if available), model_id, tokens_used, cost, processing_time_ms, success, created_at. Use tenant from context. | Every request is logged for usage/billing. |
| 4.12 | CLI exception | Ensure `cmd/benchmark` and `cmd/paper-metrics` (if used) still read provider keys from env for your own runs. They must not be used by the web server. Document in README or .env.example. | CLI can still run with env keys. |

**Phase 4 Done when:** User can add provider keys via API; create/list/revoke GAIOL keys; call inference with GAIOL key only; backend uses only DB for provider keys; usage is logged per tenant.

---

# Phase 5: Dashboard shell and keys UI

**Goal:** Authenticated users see a dashboard with navigation and can manage provider keys and GAIOL keys in the UI. No usage/billing graphs yet — just shell and key management.

**Prerequisites:** Phase 4 done (APIs for provider keys and GAIOL keys exist).

**Context:** Part D.6 and start of Part G (shell, Models page, API keys page).

---

## Phase 5 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 5.1 | Dashboard layout | Add shared dashboard layout: sidebar or top nav with links to Home, Usage, Billing, Models, API keys, Settings. User/account dropdown with logout. Same layout wraps all dashboard pages. | All dashboard routes use same shell. |
| 5.2 | Dashboard home (minimal) | Dashboard home route (e.g. `/dashboard`): show summary cards — total requests (e.g. from API), total cost, number of GAIOL keys, number of connected providers. Use placeholder data or real API. Links to Usage, Billing, Models, API keys. | Home shows at-a-glance and links. |
| 5.3 | Models page — provider keys | Page `/dashboard/models`: list providers (OpenRouter, Google/Gemini, HuggingFace). Per provider: status "Connected" (with key_hint) or "Not connected"; "Add key" / "Change" / "Remove." Add/Change: form with one input (API key); submit to `POST /api/settings/provider-keys`. List from `GET /api/settings/provider-keys`. | User can add/remove provider keys in UI. |
| 5.4 | API keys page — GAIOL keys | Page `/dashboard/api-keys`: "Create key" button; on submit call `POST /api/gaiol-keys`; show returned key once with "Copy" and warning. List existing keys from `GET /api/gaiol-keys` (name, last used, created); "Revoke" calls DELETE. | User can create and revoke GAIOL keys in UI. |
| 5.5 | Settings page (minimal) | Page `/dashboard/settings`: show email (from auth); optional display name. Link to "Manage provider keys" (e.g. to Models page). | Basic settings exist. |
| 5.6 | Mobile-friendly nav | Ensure nav/shell works on small screens (collapsible sidebar or hamburger). | Dashboard usable on mobile. |

**Phase 5 Done when:** Dashboard has shell and nav; home shows summary and links; user can manage provider keys and GAIOL keys from the UI; settings page exists.

---

# Phase 6: Usage, billing, and graphs

**Goal:** Usage screen with summary and time-series graph(s); billing screen with current period and history. Backend APIs for usage and billing aggregates.

**Prerequisites:** Phase 4 (usage logged to `api_queries`); Phase 5 (dashboard shell).

**Context:** Part G.2 (Usage), G.3 (Billing), G.9 (APIs).

---

## Phase 6 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 6.1 | GET /api/usage | Backend: `GET /api/usage?from=&to=&group_by=day|provider|key`. Query `api_queries` for tenant; aggregate by time bucket (day/hour), by provider, by gaiol_api_key_id. Return JSON: e.g. `{ "summary": { "requests", "tokens", "cost" }, "by_day": [ { "date", "requests", "tokens", "cost" } ], "by_provider": [ ... ], "by_key": [ ... ] }`. | Frontend can fetch usage for a range. |
| 6.2 | Usage page — summary | Page `/dashboard/usage`: period selector (today, 7d, 30d). Display total requests, total tokens, total cost for selected period. Fetch from `/api/usage`. | Summary block works. |
| 6.3 | Usage page — graph | Add time-series chart: X = date, Y = requests (or cost, or tokens). Use Chart.js, ApexCharts, or similar. Data from `by_day` (or by_hour). Optional: tabs for Requests / Cost / Tokens. | Graph shows trend over time. |
| 6.4 | Usage page — breakdown | Table or secondary chart: usage by provider, by GAIOL key. Data from `by_provider`, `by_key`. | User can see what’s costing what. |
| 6.5 | Export usage | Button "Export CSV": call `GET /api/usage/export?from=&to=` (or same endpoint with `format=csv`). Backend returns CSV of rows (date, requests, tokens, cost, provider, key name) for tenant. | User can download CSV. |
| 6.6 | GET /api/billing/summary | Backend: `GET /api/billing/summary?period=month`. Return current month (or period) total cost and breakdown by provider for tenant. | Billing summary API works. |
| 6.7 | GET /api/billing/history | Backend: `GET /api/billing/history`. Return last 6 (or 12) months: month, total cost, optional breakdown by provider. | Billing history API works. |
| 6.8 | Billing page | Page `/dashboard/billing`: "This month" section with total and by-provider from summary API. "History" section with table/list from history API. Short note: "Costs are from your connected providers. GAIOL does not add markup." | Billing screen is clear and accurate. |
| 6.9 | Wire dashboard home | Replace placeholder on dashboard home with real counts from usage summary (e.g. this month requests/cost) and link to Usage and Billing. | Home shows real data. |

**Phase 6 Done when:** Usage page has summary, graph, breakdown, and export; billing page has current period and history; backend APIs for usage and billing are implemented and used.

---

# Phase 7: Models list and polish

**Goal:** Optional "models available" on Models page; GET /api/models; health endpoint; rate limiting (basic); docs and quickstart. Optional: activity/audit log.

**Prerequisites:** Phase 4 (registry built from tenant keys); Phase 5–6 done.

**Context:** Part G.4.3 (models available), F.2 (rate limits), F.3 (health, logging), F.4 (docs).

---

## Phase 7 — Steps

| Step | Task | Detail | Done when |
|------|------|--------|-----------|
| 7.1 | GET /api/models | Backend: for authenticated tenant, load provider keys, build registry (same as inference path but read-only), return list of model IDs (and optional display names) the tenant can use. No keys in response. | Frontend can show "Models you can use." |
| 7.2 | Models page — list | On `/dashboard/models`, add section "Models available": call `GET /api/models` and display list (read-only). Helps user know what they can request. | Models page shows available models. |
| 7.3 | Health endpoint | `GET /health` or `GET /ready`: return 200 if app is up; optional: check DB (and Supabase Auth) reachable. No secrets in response. | Load balancer or ops can ping health. |
| 7.4 | Rate limit (GAIOL key) | For inference endpoint: rate limit per GAIOL key (e.g. 60 req/min per key). Return 429 when exceeded. Use in-memory or Redis. Configurable later. | Abuse is limited per key. |
| 7.5 | Logging | Ensure structured logs for inference: request_id, tenant_id, key_id, latency, error. Never log raw provider or GAIOL keys. | Logs are safe and useful. |
| 7.6 | Public API reference | Document in `docs/API.md` or README: inference endpoint, auth (Bearer GAIOL key), request/response format, errors, rate limits. | Developers can integrate. |
| 7.7 | Quickstart | Short doc: "Sign up → Add provider keys (Models) → Create GAIOL key (API keys) → Call POST /v1/... with Authorization: Bearer <key>." Include example curl and one code snippet. | New users can follow steps. |
| 7.8 | Optional: audit log | If desired: table `audit_log` (tenant_id, action, metadata, created_at); write on key add/remove, GAIOL key create/revoke, login. `GET /api/activity`. Page `/dashboard/activity` with table. RLS by tenant. | Optional; Phase 2 if skipped. |

**Phase 7 Done when:** Models page shows available models; health endpoint exists; rate limiting and logging in place; API docs and quickstart written.

---

# Phase summary table

| Phase | Name | Delivers |
|-------|------|----------|
| 0 | Repo and security | No secrets in repo; LICENSE; .env.example (app vs CLI); README |
| 1 | Landing and shell | Landing at `/`; placeholder auth/dashboard routes |
| 2 | Auth and protected routes | Signup, login, logout; session; protected dashboard and API |
| 3 | Multitenancy | GetTenantInfo from DB; tenant in context; 007 migration; RLS verified |
| 4 | Core product | No provider keys in app env; provider + GAIOL key APIs; inference with GAIOL key; usage logging |
| 5 | Dashboard and keys UI | Shell, home, Models page (provider keys), API keys page, Settings |
| 6 | Usage and billing | Usage API + page (summary, graph, breakdown, export); Billing API + page (summary, history) |
| 7 | Models list and polish | GET /api/models; models list on Models page; health; rate limit; logging; API docs; quickstart; optional activity |

---

# Dependency graph (concise)

- **Phase 0** → (optional for 1)  
- **Phase 1** → **Phase 2** (auth needs routes)  
- **Phase 2** → **Phase 3** (tenant needs auth)  
- **Phase 3** → **Phase 4** (keys and inference need tenant)  
- **Phase 4** → **Phase 5** (keys UI needs APIs)  
- **Phase 5** → **Phase 6** (usage/billing UI needs shell)  
- **Phase 4** → **Phase 6** (usage/billing need usage data from 4.11)  
- **Phase 5, 6** → **Phase 7** (polish builds on existing pages and APIs)

---

# Checklist (all phases)

- [ ] **0:** Redact docs; LICENSE; .env.example (app no provider keys); README  
- [ ] **1:** Landing at `/`; CTA; dashboard placeholder  
- [ ] **2:** Signup; login; logout; session; protected routes  
- [ ] **3:** GetTenantInfo from DB; tenant in context; 007 migration; RLS  
- [ ] **4:** Provider key APIs; GAIOL key APIs; inference with GAIOL key only; usage logging; no provider keys in app env  
- [ ] **5:** Dashboard shell; home; Models page (provider keys); API keys page; Settings  
- [ ] **6:** Usage API + page (summary, graph, breakdown, export); Billing API + page (summary, history)  
- [ ] **7:** GET /api/models; models list; health; rate limit; logging; API docs; quickstart; optional activity  

This phased plan breaks the full implementation into smaller, ordered steps with full context and clear "Done when" criteria. Use it alongside [GAIOL_PUBLIC_PRODUCT_PLAN.md](GAIOL_PUBLIC_PRODUCT_PLAN.md) for detailed tables and product pages (Part G).
