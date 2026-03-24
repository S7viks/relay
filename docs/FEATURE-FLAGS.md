# Feature flags and environment variables

Values that affect routing, orchestration, and dashboard behavior. For local three-process setup see [LOCAL-DEV-STACK.md](LOCAL-DEV-STACK.md).

## Go web server

| Variable | Effect |
|----------|--------|
| `GAIOL_DISABLE_AUTH` / `GAIOL_AUTH_DISABLED` / `DISABLE_AUTH` | No JWT; open `/api/*` stubs for local dev. |
| `GAIOL_TS_ORCHESTRATOR_URL` | Base URL for TS orchestrator (e.g. `http://127.0.0.1:8787`). Enables client for delegate + proxies. |
| `GAIOL_USE_TS_ORCHESTRATOR` | When true with URL set, `POST /api/query/smart` delegates to TS (except `strategy: go_reasoning`). |
| `GAIOL_TS_BEAM_WIDTH` | Beam width forwarded to TS v1 request (default 2). |
| `GAIOL_TS_CONSENSUS_MODE` | `abtc`, `uniform`, or `static`. |
| `GAIOL_TS_DOMAIN` | Domain tag (default `general`). |
| `GAIOL_TS_EXPLORE_PATHS` | Set `0` to disable explore paths. |
| `ALLOWED_ORIGINS` | CORS allowlist for browser calls to Go. |
| `PORT` | Listen port (default 8080). |

## TS orchestrator

| Variable | Effect |
|----------|--------|
| `ORCHESTRATOR_PORT` | Listen port (default 8787). |
| Adapter keys | See `orchestrator/src/config/adapters.ts` and registry env for model providers. |

## Dashboard (Vite)

| Variable | Effect |
|----------|--------|
| `VITE_API_BASE` | Optional absolute API base; leave empty to use dev proxy paths `/api`, `/health`. |

## Browser noise (not errors)

Chrome DevTools may request `GET /.well-known/appspecific/com.chrome.devtools.json`. That file is optional; **404 is normal** and is no longer logged at info level.

## Health / degradation

- If TS URL is unset: orchestration trace, trust, trace-ids, and eval proxies return **503** `ts_orchestrator_disabled`.
- Smart query still works via Go reasoning when delegate is off.
