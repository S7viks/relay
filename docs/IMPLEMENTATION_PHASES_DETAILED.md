# GAIOL: Implementation Phases — Maximum Granularity

This document breaks every phase from [IMPLEMENTATION_PHASES.md](IMPLEMENTATION_PHASES.md) into **smaller sub-steps** so each task is a single, concrete action. Use this when you want to tick off very small items. The numbering is **Phase.Step.Substep** (e.g. 2.3.4 = Phase 2, Step 2.3, Substep 4).

**Context and prerequisites** are the same as in IMPLEMENTATION_PHASES.md; read that file first for goals and dependencies.

---

# Phase 0: Repo and security (going public)

## 0.1 — Redact Supabase in docs

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.1.1 | Find all Supabase URLs | Grep repo for `supabase.co` and `sb_` in `.md` and config files. List every file. | List of files with potential secrets. |
| 0.1.2 | Replace in DATABASE_SETUP | In `DATABASE_SETUP.md`, replace real Supabase URL with `https://your-project-id.supabase.co` and anon key with `your-anon-key-here`. | No real URL/key in that file. |
| 0.1.3 | Replace in other docs | In every other file from 0.1.1, replace or redact the same way. | No real Supabase credentials in any committed file. |

## 0.2 — Audit for secrets

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.2.1 | Grep for secret patterns | Run grep for `sb_`, `sk-`, `api_key\s*=`, `secret\s*=`, `password\s*=` in `.md`, `.yaml`, `.json`, `.env.example`. | List of matches. |
| 0.2.2 | Remove or redact | In each matched file, remove real values or replace with placeholders. | No real secrets in tracked files. |
| 0.2.3 | Verify .gitignore | Ensure `.env`, `.env.local`, `.env.*.local` are in `.gitignore`. Add if missing. | `.env*` never committed. |

## 0.3 — Add LICENSE

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.3.1 | Choose license | Decide MIT or Apache 2.0. | Decision made. |
| 0.3.2 | Create LICENSE file | At repo root, create `LICENSE` with full text and current year + copyright holder. | `LICENSE` exists and is correct. |

## 0.4 — Create .env.example (app)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.4.1 | Create or open file | Create or open `.env.example` at repo root. | File exists. |
| 0.4.2 | Add Supabase vars | Add `SUPABASE_URL=`, `SUPABASE_ANON_KEY=` (or `NEXT_PUBLIC_*`) with comment: get from Supabase Dashboard. | Supabase vars documented. |
| 0.4.3 | Add GAIOL_ENCRYPTION_KEY | Add `GAIOL_ENCRYPTION_KEY=` with comment: for encrypting stored provider keys (e.g. 32-byte hex). | Encryption key documented. |
| 0.4.4 | Add optional app vars | Add optional `PORT`, session secret, etc. with short comments. | App-specific vars listed. |
| 0.4.5 | Add header comment | At top of file, add comment: "App only. Provider keys (OpenRouter, Gemini, HF) are added by users in the dashboard." | Clear that provider keys are not here. |

## 0.5 — Document CLI env (optional)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.5.1 | Add section or file | In `.env.example` add a section "CLI / benchmark only" or create `.env.example.cli`. | Place to document CLI vars. |
| 0.5.2 | List CLI vars | Add `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY` with comment: for cmd/benchmark, cmd/paper-metrics; not used by app server. | Clear which env is for CLI. |

## 0.6 — Public README

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 0.6.1 | Project name and tagline | Set or update project name and one-line description in README. | README has name and description. |
| 0.6.2 | Link QUICKSTART | Add link to QUICKSTART (or equivalent). | Link works. |
| 0.6.3 | Link benchmark docs | Add link to `eval/BENCHMARK_README.md` (or GAIOL submodule path). | Link works. |
| 0.6.4 | Research disclaimer | If applicable, add sentence: "Research / reference implementation; paper metrics require paid API access." | Disclaimer present. |

---

# Phase 1: Landing page and app shell

## 1.1 — Decide frontend structure

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.1.1 | List options | Write down: (a) Multi-page HTML + minimal JS, (b) SPA with one index + JS routing. | Options clear. |
| 1.1.2 | Choose and document | Pick one; add 1–2 sentences to README or `docs/` describing the choice. | Decision documented. |
| 1.1.3 | Confirm server serves static | Ensure `cmd/web-server` (or main app) can serve static files from a directory (e.g. `web/` or `static/`). | Server config or code serves static. |

## 1.2 — Landing route

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.2.1 | Register GET / | In the web server, register `GET /` to return the landing page (no auth). | Route exists. |
| 1.2.2 | Create landing file | Create the HTML file (e.g. `index.html` or `landing.html`) that will be served at `/`. | File exists. |
| 1.2.3 | Wire route to file | Point `GET /` to serve that file (or render it). | Visiting `/` returns the page. |

## 1.3 — Landing content

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.3.1 | Hero headline | Add headline: e.g. "Using multiple AI APIs? Stop wasting spend." | Headline present. |
| 1.3.2 | Hero subhead | Add subhead: e.g. "One API key. We route across your models so you don't overpay or underuse." | Subhead present. |
| 1.3.3 | Value bullets | Add 3–4 bullets (e.g. Add keys once; Get one GAIOL key; Use everywhere; We optimize cost/quality). | Bullets present. |
| 1.3.4 | CTA button | Add button "Get your GAIOL key" or "Sign up free" linking to `/signup` or `/login`. | CTA links correctly. |
| 1.3.5 | Optional: How it works | If desired, add 3-step "How it works" (connect providers → get key → use in app). | Optional block done. |
| 1.3.6 | Footer | Add footer with links to Login, Docs (if any). | Footer present. |

## 1.4 — Landing styling

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.4.1 | Add or link CSS | Create a small CSS file or inline critical styles for landing. | Styles applied. |
| 1.4.2 | Desktop layout | Ensure headline, bullets, CTA are readable and aligned on desktop. | Looks good on desktop. |
| 1.4.3 | Mobile layout | Ensure the same content works on small screens (e.g. stack vertically, readable font). | Responsive. |

## 1.5 — Placeholder auth routes

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.5.1 | Register /login | Register `GET /login` (serve login page or 302 to dashboard if already logged in). | /login exists. |
| 1.5.2 | Register /signup | Register `GET /signup`. | /signup exists. |
| 1.5.3 | Register /dashboard | Register `GET /dashboard` (can 302 to login if not authenticated later). | /dashboard exists. |
| 1.5.4 | No 404 | Confirm navigating to these paths does not 404. | All return something. |

## 1.6 — Dashboard placeholder

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 1.6.1 | Create dashboard HTML | Create a minimal page with "Dashboard" and a "Logout" link. | Page content exists. |
| 1.6.2 | Serve at /dashboard | Wire `GET /dashboard` to serve this page. | /dashboard shows placeholder. |

---

# Phase 2: Authentication and protected routes

## 2.1 — Run auth schema

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.1.1 | Open Supabase SQL Editor | In Supabase project, open SQL Editor. | Ready to run SQL. |
| 2.1.2 | Run 001 migration | Paste and run `migrations/001_initial_schema.sql`. | No errors. |
| 2.1.3 | Verify tables | Confirm `organizations`, `user_profiles`, `api_queries` exist and trigger `on_auth_user_created` exists. | Schema in place. |
| 2.1.4 | Test signup creates profile | Create a test user via Supabase Auth; check that `user_profiles` has a row for that user. | Trigger works. |

## 2.2 — Signup page

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.2.1 | Create signup HTML | Create signup page with form container. | Markup exists. |
| 2.2.2 | Add email and password inputs | Add inputs for email and password (type=email, type=password). | Form has fields. |
| 2.2.3 | Add submit button | Add "Sign up" button. | Button present. |
| 2.2.4 | Wire to Supabase Auth | On submit, call Supabase Auth signup (from frontend or via backend proxy). | Signup request sent. |
| 2.2.5 | Handle success | On success, redirect to `/dashboard` or `/login` and store session if applicable. | Success path works. |
| 2.2.6 | Handle errors | Show error message (e.g. "Email already registered") from Supabase response. | Errors displayed. |

## 2.3 — Login page

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.3.1 | Create login HTML | Create login page with form. | Markup exists. |
| 2.3.2 | Add email and password inputs | Same as signup. | Form has fields. |
| 2.3.3 | Wire to Supabase Auth signin | On submit, call Supabase Auth signin. | Signin request sent. |
| 2.3.4 | On success: store tokens | Store access_token (and optionally refresh_token) in HTTP-only cookie or localStorage. | Tokens stored. |
| 2.3.5 | On success: redirect | Redirect to `/dashboard`. | Redirect works. |
| 2.3.6 | Handle errors | Show "Invalid email or password" or similar. | Errors displayed. |

## 2.4 — Session persistence

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.4.1 | Read token on app load | On dashboard (or app) load, read token from cookie or localStorage. | Token read. |
| 2.4.2 | Validate not expired | If token has expiry, check it; if expired, clear and treat as logged out. | Expiry checked. |
| 2.4.3 | Optional: refresh | If using refresh token, call Supabase refresh before expiry and update stored access token. | Refresh works or skipped. |

## 2.5 — Logout

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.5.1 | Clear local session | On logout click, clear cookie or localStorage (tokens). | Local state cleared. |
| 2.5.2 | Optional: Supabase sign-out | Call Supabase Auth sign-out API so server invalidates session. | Optional done. |
| 2.5.3 | Redirect to landing or login | After logout, redirect to `/` or `/login`. | Redirect works. |
| 2.5.4 | Add logout to dashboard | Ensure dashboard/nav has a visible logout control. | User can log out from dashboard. |

## 2.6 — Auth middleware (backend)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.6.1 | Define protected paths | List paths that require auth: e.g. `/api/*`, `/dashboard` (or all under a prefix). | List clear. |
| 2.6.2 | Extract token | In middleware, read `Authorization: Bearer <token>` or token from cookie. | Token extracted. |
| 2.6.3 | Verify JWT | Verify token with Supabase JWT secret (or Supabase API); extract user ID (sub claim). | User ID obtained. |
| 2.6.4 | Attach to context | Put user ID (and optionally full claims) in request context for downstream handlers. | Context has user. |
| 2.6.5 | Return 401 when invalid | If token missing or invalid, return 401 Unauthorized and do not call next handler. | 401 returned when not logged in. |

## 2.7 — Frontend guard

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.7.1 | Check session on dashboard load | When loading any dashboard route, check if valid session exists. | Check in place. |
| 2.7.2 | Redirect if no session | If no valid session, redirect to `/login`. | Unauthenticated user sent to login. |
| 2.7.3 | Apply to all dashboard routes | Ensure every dashboard sub-route (e.g. /dashboard/usage) is also guarded. | All protected. |

## 2.8 — Optional: password reset

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 2.8.1 | "Forgot password" link | Add link on login page to "Forgot password?" | Link present. |
| 2.8.2 | Reset flow | Implement flow (e.g. enter email → Supabase sends reset link → user sets new password). | Reset works or documented as skipped. |

---

# Phase 3: Multitenancy (tenant resolution and RLS)

## 3.1 — GetTenantInfo from DB

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.1.1 | Choose query method | Decide: call RPC `get_tenant_context(user_uuid)` or direct select from `user_profiles` where id = userID. | Method chosen. |
| 3.1.2 | Implement DB call | In `internal/database/tenant.go`, add code to call Supabase (RPC or PostgREST select). | Call implemented. |
| 3.1.3 | Map to TenantContext | Parse response into TenantContext{TenantID, UserID, OrgID}. Use COALESCE(tenant_id, id) for tenant_id if needed. | Struct filled. |
| 3.1.4 | Handle not found | If user has no profile row, return error or default tenant_id to userID (depending on trigger guarantee). | Edge case handled. |
| 3.1.5 | Remove TODO / default-only path | Remove or replace the existing TODO and default-only return with the DB-backed implementation. | GetTenantInfo uses DB. |

## 3.2 — EnsureTenantInfo

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.2.1 | Call GetTenantInfo | Ensure EnsureTenantInfo calls GetTenantInfo(ctx, userID). | No duplicate logic. |
| 3.2.2 | Default empty tenant_id | If returned tenant_id is empty, set to userID. | Single-tenant default. |

## 3.3 — Tenant in request context

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.3.1 | Define context key | Define a private type and key for TenantContext in context (e.g. in auth or database pkg). | Key defined. |
| 3.3.2 | Call GetTenantInfo after auth | In auth middleware, after validating JWT and getting user ID, call GetTenantInfo(ctx, userID). | Tenant fetched. |
| 3.3.3 | Attach to context | Store TenantContext in request context using the key. | Context has tenant. |
| 3.3.4 | Document for handlers | Add comment or doc: "Protected handlers can read TenantContext from context." | Downstream knows how to read. |

## 3.4 — Run 007 migration

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.4.1 | Open Supabase SQL Editor | Same as 2.1.1. | Ready. |
| 3.4.2 | Run 007 | Paste and run `migrations/007_api_keys_multitenant.sql`. | No errors. |
| 3.4.3 | Verify tables | Confirm `provider_api_keys` and `gaiol_api_keys` exist with indexes and RLS. | Tables and RLS exist. |

## 3.5 — Verify RLS

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.5.1 | Test as user A | Using Supabase client or SQL as user A (auth.uid()), insert/select in provider_api_keys with tenant_id = A's tenant. Should succeed. | A can access own rows. |
| 3.5.2 | Test cross-tenant | As user A, try to read a row with tenant_id = B's tenant. Should fail or return no rows. | Isolation verified. |
| 3.5.3 | Repeat for gaiol_api_keys | Same checks for gaiol_api_keys. | RLS verified for both tables. |

## 3.6 — Usage writes use tenant

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 3.6.1 | Find or add usage write | Locate where api_queries rows are inserted (or add stub in inference path for Phase 4). | Insert point identified. |
| 3.6.2 | Set tenant_id from context | Ensure tenant_id (and optional organization_id) are read from TenantContext and set on the insert. | All usage rows tenant-scoped. |

---

# Phase 4: Core product — keys and inference gateway

## 4.1 — Remove provider keys from app backend

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.1.1 | Grep for env reads | Grep codebase for OPENROUTER_API_KEY, GEMINI_API_KEY, HUGGINGFACE_API_KEY in app/server code. | List of usages. |
| 4.1.2 | Remove or guard each | Remove env read or guard with "only for CLI" so tenant-facing path never uses them. | No env provider keys on tenant path. |

## 4.2 — Encryption helper

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.2.1 | Add crypto package usage | Use Go crypto (e.g. aes, cipher) or a small lib; implement Encrypt(plaintext, key) and Decrypt(ciphertext, key). | Functions exist. |
| 4.2.2 | Use GAIOL_ENCRYPTION_KEY | Read key from env; derive or use as 32-byte for AES-GCM. Never log plaintext or key. | Encryption uses env key. |
| 4.2.3 | Unit test (optional) | Round-trip test: encrypt then decrypt returns original. | Helper verified. |

## 4.3 — Provider key store API

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.3.1 | Create route POST /api/settings/provider-keys | Register route; require auth middleware. | Route exists. |
| 4.3.2 | Parse body | Parse JSON: provider (string), api_key (string). Validate provider in allowed list (openrouter, google, huggingface). | Body validated. |
| 4.3.3 | Get tenant from context | Read TenantContext from request context; get tenant_id. | Tenant ID available. |
| 4.3.4 | Encrypt and key_hint | Encrypt api_key; compute key_hint (e.g. last 4 chars). | Encrypted + hint. |
| 4.3.5 | Upsert DB | Insert or update row in provider_api_keys (tenant_id, provider, encrypted_key, key_hint, is_active=true). | DB updated. |
| 4.3.6 | Return success | Return 200 with { "provider", "key_hint" }. Never return raw key. | API contract correct. |

## 4.4 — Provider key list/remove API

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.4.1 | GET /api/settings/provider-keys | Query provider_api_keys for tenant_id; return list of { provider, key_hint, is_active, created_at }. | List works. |
| 4.4.2 | DELETE /api/settings/provider-keys?provider=X | Delete (or soft-delete) row for tenant and provider. Return 204 or 200. | Remove works. |

## 4.5 — GAIOL key create API

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.5.1 | Generate random key | Generate secure random (e.g. gaiol_ + 32 bytes hex). | Raw key created once. |
| 4.5.2 | Hash key | Hash with SHA-256 (or similar); store hash in gaiol_api_keys. Never store raw. | Hash stored. |
| 4.5.3 | Insert row | Insert tenant_id, key_hash, name (from body or "default"), created_at. | Row inserted. |
| 4.5.4 | Return raw key once | Response body include raw key only in create response; document "show once." | Client gets key once. |

## 4.6 — GAIOL key list/revoke API

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.6.1 | GET /api/gaiol-keys | Select id, name, last_used_at, created_at for tenant. Return JSON array. No key material. | List works. |
| 4.6.2 | DELETE /api/gaiol-keys/:id | Verify id belongs to tenant; delete or set inactive. Return 204. | Revoke works. |

## 4.7 — GAIOL key validation

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.7.1 | Extract Bearer token | From Authorization header, get token string. | Token extracted. |
| 4.7.2 | Hash and lookup | Hash token; query gaiol_api_keys where key_hash = hash and active. | Row found or not. |
| 4.7.3 | Return tenant_id | If found, return tenant_id; update last_used_at. If not, return 401. | Inference can resolve tenant. |

## 4.8 — Load provider keys by tenant

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.8.1 | Query active rows | Select from provider_api_keys where tenant_id = ? and is_active = true. | Rows loaded. |
| 4.8.2 | Decrypt each | Decrypt encrypted_key for each row. | Map[provider]api_key in memory. |
| 4.8.3 | Optional: cache | Add short TTL cache (e.g. 1–5 min) keyed by tenant_id to reduce DB+decrypt. | Optional cache in place. |

## 4.9 — Build registry from tenant keys

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.9.1 | Instantiate adapters | For each provider in map, create adapter: NewOpenRouterAdapter(..., key), NewGeminiAdapter(key), NewHuggingFaceAdapter(..., key). | Adapters created. |
| 4.9.2 | Call NewRegistry | Call existing NewRegistry(or, gemini, hf) with adapters (use dummy where key missing). | Registry built. |
| 4.9.3 | Register Gemini if present | If tenant has Google key, ensure Gemini is registered (per existing RegisterGemini or registry logic). | Registry has tenant's models. |

## 4.10 — Unified inference endpoint

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.10.1 | Create route POST /v1/chat or /v1/reason | Register route; do not use JWT auth — use GAIOL key only. | Route exists. |
| 4.10.2 | Validate GAIOL key | Use 4.7 to get tenant_id; 401 if invalid. | Tenant resolved. |
| 4.10.3 | Load keys and build registry | Use 4.8 and 4.9 to build registry for this tenant. | Registry ready. |
| 4.10.4 | Run engine | Call existing reasoning engine with tenant's registry; pass request body; get response. | Response returned. |
| 4.10.5 | Return response | Return engine response to client. | End-to-end works. |

## 4.11 — Log usage

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.11.1 | After inference success | Insert into api_queries: tenant_id, gaiol_api_key_id (if available), model_id, tokens_used, cost, processing_time_ms, success=true. | Row inserted. |
| 4.11.2 | On inference error | Insert with success=false and error_message if desired. | Errors logged. |
| 4.11.3 | Use tenant from context | Ensure tenant_id (and optional user_id) come from TenantContext set by GAIOL key validation. | Tenant set correctly. |

## 4.12 — CLI exception

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 4.12.1 | Confirm CLI reads env | Ensure cmd/benchmark and cmd/paper-metrics still use OPENROUTER_API_KEY etc. from env. | CLI unchanged for env. |
| 4.12.2 | Document | In README or .env.example, state that provider keys in env are for CLI/benchmark only. | Documented. |

---

# Phase 5: Dashboard shell and keys UI

## 5.1 — Dashboard layout

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.1.1 | Create layout component or template | Create shared HTML structure or JS component for dashboard: sidebar or top bar. | Layout exists. |
| 5.1.2 | Add nav links | Links: Home (/dashboard), Usage (/dashboard/usage), Billing (/dashboard/billing), Models (/dashboard/models), API keys (/dashboard/api-keys), Settings (/dashboard/settings). | All links present. |
| 5.1.3 | Add user dropdown | User/account dropdown with "Logout" that calls logout and redirects. | Logout in shell. |
| 5.1.4 | Wrap all dashboard routes | Ensure every dashboard page uses this layout. | Consistent shell. |

## 5.2 — Dashboard home (minimal)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.2.1 | Summary card: requests | Display "Total requests" (placeholder or from API). | Card present. |
| 5.2.2 | Summary card: cost | Display "Total cost" (placeholder or from API). | Card present. |
| 5.2.3 | Summary card: GAIOL keys | Display count of GAIOL keys (from GET /api/gaiol-keys length). | Card present. |
| 5.2.4 | Summary card: providers | Display count of connected providers (from GET /api/settings/provider-keys). | Card present. |
| 5.2.5 | Shortcuts | Add links to Usage, Billing, Models, API keys. | Links work. |

## 5.3 — Models page (provider keys)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.3.1 | Fetch list | On load, GET /api/settings/provider-keys and store in state. | List loaded. |
| 5.3.2 | Render per provider | For OpenRouter, Google/Gemini, HuggingFace: show "Connected (…key_hint)" or "Not connected." | Status shown. |
| 5.3.3 | Add key form | "Add key" or "Change" opens form: one input (API key), submit button. | Form works. |
| 5.3.4 | Submit to API | On submit, POST /api/settings/provider-keys with provider and api_key; then refetch list. | Key added. |
| 5.3.5 | Remove button | "Remove" calls DELETE with provider; then refetch list. | Key removed. |

## 5.4 — API keys page (GAIOL keys)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.4.1 | Fetch list | GET /api/gaiol-keys on load. | List loaded. |
| 5.4.2 | Create key button | "Create key" opens modal or form (optional name). Submit POST /api/gaiol-keys. | Create triggered. |
| 5.4.3 | Show key once | After create, display returned key with "Copy" button and warning "We won't show again." | Key shown once. |
| 5.4.4 | List existing | Show table: name, last used, created; no key value. | Table correct. |
| 5.4.5 | Revoke | "Revoke" calls DELETE /api/gaiol-keys/:id; refetch list. | Revoke works. |

## 5.5 — Settings page (minimal)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.5.1 | Show email | Display user email (from auth/session). | Email shown. |
| 5.5.2 | Link to Models | Add link "Manage provider keys" to /dashboard/models. | Link works. |

## 5.6 — Mobile-friendly nav

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 5.6.1 | Collapsible sidebar or hamburger | On small viewport, hide full nav behind toggle; show menu on click. | Mobile nav works. |
| 5.6.2 | Touch-friendly | Buttons and links large enough for touch. | Usable on phone. |

---

# Phase 6: Usage, billing, and graphs

## 6.1 — GET /api/usage

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.1.1 | Parse query params | from, to (dates), group_by (day | provider | key). Default e.g. last 30 days. | Params parsed. |
| 6.1.2 | Query api_queries | Filter by tenant_id and created_at between from and to. | Rows fetched. |
| 6.1.3 | Aggregate summary | Sum requests, tokens, cost. | summary object. |
| 6.1.4 | Aggregate by_day | Group by date (day); sum per day. | by_day array. |
| 6.1.5 | Aggregate by_provider | Group by provider (or model); sum. | by_provider array. |
| 6.1.6 | Aggregate by_key | Group by gaiol_api_key_id (or key name); sum. | by_key array. |
| 6.1.7 | Return JSON | Return { summary, by_day, by_provider, by_key }. | API returns correct shape. |

## 6.2 — Usage page summary

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.2.1 | Period selector | Dropdown or buttons: Today, Last 7 days, Last 30 days. Set from/to accordingly. | Period selectable. |
| 6.2.2 | Call GET /api/usage | Fetch with chosen from/to. | Data loaded. |
| 6.2.3 | Display totals | Show total requests, total tokens, total cost for period. | Summary visible. |

## 6.3 — Usage page graph

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.3.1 | Add chart library | Include Chart.js or ApexCharts (or minimal SVG). | Lib included. |
| 6.3.2 | Use by_day data | Pass by_day to chart: X = date, Y = requests (or cost or tokens). | Chart renders. |
| 6.3.3 | Optional tabs | Tabs "Requests" / "Cost" / "Tokens" to switch Y axis. | Optional. |

## 6.4 — Usage page breakdown

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.4.1 | Table by provider | Table: provider, requests, tokens, cost from by_provider. | Table shown. |
| 6.4.2 | Table by key | Table: key name, requests, tokens, cost from by_key. | Table shown. |

## 6.5 — Export usage

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.5.1 | Backend: export endpoint | GET /api/usage/export?from=&to= or format=csv. Query api_queries; return CSV rows (date, requests, tokens, cost, provider, key_name). | CSV returned. |
| 6.5.2 | Frontend: Export button | Button "Export CSV" calls export URL and triggers download. | User can download. |

## 6.6 — GET /api/billing/summary

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.6.1 | Parse period=month | Current month start/end. | Dates set. |
| 6.6.2 | Sum cost for tenant | Sum cost from api_queries for tenant in period. | Total cost. |
| 6.6.3 | Break down by provider | Group by provider; sum cost. | by_provider. |
| 6.6.4 | Return JSON | { total_cost, by_provider: [ { provider, cost } ] }. | API works. |

## 6.7 — GET /api/billing/history

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.7.1 | Last 6–12 months | For each month, compute start/end. | Months defined. |
| 6.7.2 | Sum cost per month | Query api_queries per month for tenant; sum cost. | Per-month cost. |
| 6.7.3 | Return array | [ { month, total_cost, optional by_provider } ]. | API works. |

## 6.8 — Billing page

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.8.1 | This month section | Call GET /api/billing/summary?period=month; show total and table by provider. | Current period shown. |
| 6.8.2 | History section | Call GET /api/billing/history; show table or list of past months. | History shown. |
| 6.8.3 | Clarification copy | Add note: "Costs are from your connected providers. GAIOL does not add markup." | Copy present. |

## 6.9 — Wire dashboard home

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 6.9.1 | Replace placeholders | Use GET /api/usage (e.g. this month) for requests and cost on home. | Real data. |
| 6.9.2 | Keep links | Links to Usage and Billing still work. | Navigation correct. |

---

# Phase 7: Models list and polish

## 7.1 — GET /api/models

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.1.1 | Get tenant from context | Require auth; read TenantContext. | Tenant available. |
| 7.1.2 | Load provider keys | Same as inference: load and decrypt tenant's keys; build registry. | Registry built. |
| 7.1.3 | List model IDs | Call registry ListModels or equivalent; return id and display_name only. No keys. | List returned. |

## 7.2 — Models page list

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.2.1 | Call GET /api/models | On Models page load (or in a section), fetch models. | Data loaded. |
| 7.2.2 | Display "Models available" | Section with list of model IDs or names (read-only). | User sees what they can use. |

## 7.3 — Health endpoint

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.3.1 | Register GET /health | Return 200 and optionally { "status": "ok" }. | Route exists. |
| 7.3.2 | Optional: DB ping | If desired, ping Supabase; if DB down return 503. | Optional. |

## 7.4 — Rate limit (GAIOL key)

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.4.1 | Choose store | In-memory map key_id -> count + window, or Redis. | Store chosen. |
| 7.4.2 | Before inference | After resolving tenant from GAIOL key, check count for that key in current window (e.g. 1 min). | Check implemented. |
| 7.4.3 | If over limit | Return 429 Too Many Requests. | 429 returned. |
| 7.4.4 | Increment on request | After check, increment count for key. | Rate limit enforced. |

## 7.5 — Logging

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.5.1 | Add request_id | Generate or read request ID; add to log lines. | request_id in logs. |
| 7.5.2 | Log tenant_id, key_id | Log tenant and key (not raw key). | Safe identifiers. |
| 7.5.3 | Log latency and error | Log duration and error message if failed. Never log raw keys. | Logs useful and safe. |

## 7.6 — Public API reference

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.6.1 | Create docs/API.md | Document inference endpoint URL and method. | File exists. |
| 7.6.2 | Document auth | "Authorization: Bearer <GAIOL_KEY>." | Auth documented. |
| 7.6.3 | Document request/response | Body format, response format, status codes. | Contract documented. |
| 7.6.4 | Document errors and rate limits | 401, 429, 5xx and when they occur. | Errors documented. |

## 7.7 — Quickstart

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.7.1 | Write steps | "1. Sign up. 2. Add provider keys (Models). 3. Create GAIOL key (API keys). 4. Call POST /v1/... with Bearer <key>." | Steps written. |
| 7.7.2 | Add curl example | Example curl with placeholder key and body. | curl works. |
| 7.7.3 | Add code snippet | One snippet (e.g. Node or Python) showing request with Bearer key. | Snippet present. |

## 7.8 — Optional: audit log

| Id | Substep | Action | Done when |
|----|---------|--------|-----------|
| 7.8.1 | Create audit_log table | tenant_id, action (string), metadata (JSONB), created_at. RLS by tenant. | Table exists. |
| 7.8.2 | Write on key events | On provider key add/remove, GAIOL key create/revoke, login: insert row. | Events logged. |
| 7.8.3 | GET /api/activity | Return paginated list for tenant. | API works. |
| 7.8.4 | Page /dashboard/activity | Table: timestamp, action. | Page works. |

---

# Master checklist (all sub-steps)

Use this to tick off every small task. Phase.Step.Substep format.

**Phase 0:** 0.1.1–0.1.3, 0.2.1–0.2.3, 0.3.1–0.3.2, 0.4.1–0.4.5, 0.5.1–0.5.2, 0.6.1–0.6.4  
**Phase 1:** 1.1.1–1.1.3, 1.2.1–1.2.3, 1.3.1–1.3.6, 1.4.1–1.4.3, 1.5.1–1.5.4, 1.6.1–1.6.2  
**Phase 2:** 2.1.1–2.1.4, 2.2.1–2.2.6, 2.3.1–2.3.6, 2.4.1–2.4.3, 2.5.1–2.5.4, 2.6.1–2.6.5, 2.7.1–2.7.3, 2.8.1–2.8.2  
**Phase 3:** 3.1.1–3.1.5, 3.2.1–3.2.2, 3.3.1–3.3.4, 3.4.1–3.4.3, 3.5.1–3.5.3, 3.6.1–3.6.2  
**Phase 4:** 4.1.1–4.1.2, 4.2.1–4.2.3, 4.3.1–4.3.6, 4.4.1–4.4.2, 4.5.1–4.5.4, 4.6.1–4.6.2, 4.7.1–4.7.3, 4.8.1–4.8.3, 4.9.1–4.9.3, 4.10.1–4.10.5, 4.11.1–4.11.3, 4.12.1–4.12.2  
**Phase 5:** 5.1.1–5.1.4, 5.2.1–5.2.5, 5.3.1–5.3.5, 5.4.1–5.4.5, 5.5.1–5.5.2, 5.6.1–5.6.2  
**Phase 6:** 6.1.1–6.1.7, 6.2.1–6.2.3, 6.3.1–6.3.3, 6.4.1–6.4.2, 6.5.1–6.5.2, 6.6.1–6.6.4, 6.7.1–6.7.3, 6.8.1–6.8.3, 6.9.1–6.9.2  
**Phase 7:** 7.1.1–7.1.3, 7.2.1–7.2.2, 7.3.1–7.3.2, 7.4.1–7.4.4, 7.5.1–7.5.3, 7.6.1–7.6.4, 7.7.1–7.7.3, 7.8.1–7.8.4 (optional)

This document provides maximum granularity for execution. Use [IMPLEMENTATION_PHASES.md](IMPLEMENTATION_PHASES.md) for phase-level overview and dependencies.
