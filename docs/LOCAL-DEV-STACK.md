# Local dev stack (Go + TypeScript orchestrator + Vite dashboard)

Authoritative runbook for **IN.M1**: running the Go HTTP API, the TS orchestrator, and the React dashboard together. Values below are verified from code in this repo (not from external docs alone).

## 1. Reproducible startup sequence

1. **Repository root** — Open a shell at the repo root (e.g. `c:\dev\GAIOL`). Ensure a `.env` exists if you use env-based config; `cmd/web-server/main.go` loads the first of `.env`, `../.env`, `../../.env` via `godotenv`.
2. **TS orchestrator (optional but required for trace proxy + delegated smart query)** — From repo root:
   - `cd orchestrator`
   - `npm install`
   - `npm run dev:api`  
   Listens on `ORCHESTRATOR_PORT` (default **8787**); see `orchestrator/src/config/env.ts` and `orchestrator/src/api/server.ts` (`main()`).
3. **Go web server** — From repo root (new terminal):
   - Set orchestration env if needed (see table below). Examples (PowerShell):
     - `$env:GAIOL_TS_ORCHESTRATOR_URL = 'http://127.0.0.1:8787'`
     - `$env:GAIOL_USE_TS_ORCHESTRATOR = '1'`  # only if you want `POST /api/query/smart` delegated to TS
     - `$env:GAIOL_DISABLE_AUTH = '1'`         # local UI without Supabase
   - `go run ./cmd/web-server`  
   Default listen port **8080** unless `PORT` is set (`cmd/web-server/main.go`).
4. **Vite dashboard** — From repo root (new terminal):
   - `cd dashboard`
   - `npm install`
   - `npm run dev`  
   Default **5173** (`dashboard/vite.config.ts`).

**Minimum URLs after step 4:** Go `http://localhost:8080`, orchestrator `http://localhost:8787`, dashboard UI **`http://localhost:5173/`** (Vite `base` is `/`).

## 2. Processes and default ports

| Service | Default URL | Start command (from repo root unless noted) |
|--------|-------------|-----------------------------------------------|
| Go API | `http://localhost:8080` | `go run ./cmd/web-server` |
| TS orchestrator | `http://localhost:8787` | `cd orchestrator && npm install && npm run dev:api` |
| Vite dashboard | `http://localhost:5173/` | `cd dashboard && npm install && npm run dev` |

## 3. How the dashboard reaches the backend

- **Vite dev server** proxies **`/api`**, **`/v1`**, and **`/health`** to **`http://localhost:8080`** (`dashboard/vite.config.ts`). The SPA is mounted at **`/`**; API calls from the app still use `/api/...` on the same origin.
- **Go → TS delegation** is not a Vite concern: the Go process calls the orchestrator using **`GAIOL_TS_ORCHESTRATOR_URL`** (see `cmd/web-server/main.go`). The TS service’s listen port is controlled only by **`ORCHESTRATOR_PORT`** on the Node process; keep that URL in sync with `GAIOL_TS_ORCHESTRATOR_URL`.
- **`GAIOL_USE_TS_ORCHESTRATOR`**: when truthy (`1`, `true`, `yes`, `y`, `on`) **and** `GAIOL_TS_ORCHESTRATOR_URL` is set, Go delegates `POST /api/query/smart` to TS (`internal/httpserver/ts_orchestrator.go`, `tryQuerySmartViaTSOrchestrator`). If delegation is off or TS is unreachable, Go falls back to its own reasoning path (delegate failure logs and returns false so the Go path runs).

## 4. Environment variables (matrix)

| Variable | Where | Purpose |
|----------|--------|---------|
| `PORT` | Go | Listen port; default `8080` (`cmd/web-server/main.go`). |
| `GAIOL_DISABLE_AUTH` | Go | Primary flag for no-auth local mode (with `GAIOL_AUTH_DISABLED` and `DISABLE_AUTH` as aliases — any one truthy disables auth) (`cmd/web-server/main.go`). There is **no** separate bare `AUTH_DISABLED` env in code. |
| `GAIOL_AUTH_DISABLED` | Go | Alias for disabling auth (same `envBool` union as above). |
| `DISABLE_AUTH` | Go | Alias for disabling auth (same union). |
| `GAIOL_TS_ORCHESTRATOR_URL` | Go | Base URL of the TS API (e.g. `http://127.0.0.1:8787`). Required for `TSOrchestrator` client; trace proxy returns 503 if unset (`cmd/web-server/main.go`, `internal/httpserver/ts_orchestrator.go`). |
| `GAIOL_USE_TS_ORCHESTRATOR` | Go | Truthy → delegate smart query to TS when URL is set (`cmd/web-server/main.go`, `tryQuerySmartViaTSOrchestrator`). |
| `GAIOL_TS_BEAM_WIDTH` | Go | Delegated request beam width; default `2` (`internal/httpserver/ts_orchestrator.go`). |
| `GAIOL_TS_CONSENSUS_MODE` | Go | `abtc`, `uniform`, or `static`; default `abtc`. |
| `GAIOL_TS_DOMAIN` | Go | Domain tag; default `general`. |
| `GAIOL_TS_EXPLORE_PATHS` | Go | Default on when unset; `0`/`false` turns off path exploration. |
| `ALLOWED_ORIGINS` | Go | Comma-separated allowed `Origin` values for CORS. If **unset**, `corsMiddleware` **reflects** the request `Origin` when present (dev-friendly); if set, only listed origins are allowed (`internal/httpserver/handlers.go`). |
| `LOG_LEVEL` | Go | Logging verbosity label; default `info` (`internal/httpserver/register.go`, `InitConfigFromEnv`). |
| `ORCHESTRATOR_PORT` | TS | Listen port for Fastify; default **8787** (`orchestrator/src/config/env.ts`). |
| Provider / DB vars | Go / TS | With auth on, Supabase/DB vars are required (`cmd/web-server/main.go`). TS adapters use orchestrator env (see `orchestrator/.env.example`). |

## 5. Health checks (operators)

Use these to verify each process is up.

| URL | Handler / implementation | Typical response shape |
|-----|---------------------------|-------------------------|
| `GET http://localhost:8080/health` | `mux.HandleFunc("/health", cors(d.handleHealth))` in `internal/httpserver/register.go`; body from `handleHealth` in `internal/httpserver/handlers.go` | JSON: `status`, `models`, `version`, `time`, **`auth_disabled`**, `database` (`connected`, `reachable`, …). |
| `GET http://localhost:8787/health` | Fastify `app.get("/health", async () => ({ ok: true }))` in `orchestrator/src/api/server.ts` | JSON: `{ "ok": true }`. |

**Dashboard / CORS:** Go attaches `corsMiddleware` to `/health` so browser `fetch` from another origin (e.g. Vercel or `localhost:5173` with a configured origin) can work (`internal/httpserver/register.go` comment + `corsMiddleware` in `internal/httpserver/handlers.go`). The TS orchestrator **does not** register CORS headers in code; **`curl` or server-side checks** are appropriate for `:8787/health`. The Vite app does not proxy to 8787; it only proxies to Go.

## 6. Auth: disabled mode vs JWT (Supabase)

**Disabled (local):** Any of `GAIOL_DISABLE_AUTH`, `GAIOL_AUTH_DISABLED`, or `DISABLE_AUTH` truthy → no DB, stubs for auth routes, `LocalTenantMiddleware` injects a synthetic tenant/user (`cmd/web-server/main.go`, `internal/httpserver/handlers.go`). `/health` includes `"auth_disabled": true`.

**Enabled:** Database required at startup. `auth.AuthMiddleware` validates the Supabase session by calling Supabase’s **`/auth/v1/user`** with the bearer token (preferred path in `internal/auth/supabase.go`), not a locally decoded JWT secret.

**React `dashboard/`:** The SPA reads **`auth_disabled`** from **`GET /health`**, stores tokens in **`localStorage`** (`gaiol_access_token`, `gaiol_refresh_token`), and sends **`Authorization: Bearer`** on API calls via `dashboard/src/lib/api.ts` / `auth.ts`. Sign-in and sign-up use `dashboard/src/lib/authApi.ts`.

## 7. CORS expectations (summary)

- **Go:** `Access-Control-Allow-Headers` includes `Content-Type, Authorization`; credentialed requests need a concrete `Access-Control-Allow-Origin` (not `*`) — implemented by echoing origin when `ALLOWED_ORIGINS` is unset (`internal/httpserver/handlers.go`).
- **TS:** No CORS plugin in `orchestrator/src/api/server.ts`; browser calls from `localhost:5173` directly to `localhost:8787` are not supported unless you add CORS or proxy those routes through Go.

## 8. Gaps found (code vs earlier doc claims)

1. **`GET /api/orchestration/trust`** and **`POST /api/orchestration/eval/contains`** are **not** registered on the Go mux (`internal/httpserver/register.go`). TS exposes `/v1/trust` and `/v1/eval/contains` (`orchestrator/src/api/server.ts`), but the Vite proxy sends `/v1/*` to **Go**, which only registers **`/v1/chat`**. Dashboard features that need TS trust/eval must be wired via new Go proxies, a Vite proxy target change, or TS CORS — not yet present.
2. **Trace proxy:** `GET /api/orchestration/traces/:id` is implemented and returns **503** with `ts_orchestrator_disabled` when `GAIOL_TS_ORCHESTRATOR_URL` is not configured (`internal/httpserver/ts_orchestrator.go`).

---

See [API.md](../API.md) for the full HTTP reference. For TS–Go contract details, see [docs/gaiol-ts-orchestrator-wiring.md](gaiol-ts-orchestrator-wiring.md).
