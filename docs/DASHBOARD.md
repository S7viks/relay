# Dashboard (Vite) and API map

The React app in `dashboard/` uses Vite **`base: /dashboard/`**. Production: run `npm run build` in `dashboard/` so `dashboard/dist/` exists; Go serves the SPA at **`/dashboard/`** (assets under `/dashboard/assets/`).

- **Dev:** `npm run dev` then open **`http://localhost:5173/dashboard/`** (API still proxied to Go).
- **Behind Go:** open **`http://localhost:8080/dashboard/`** after building `dashboard/dist`.

| Page | Route | API calls |
|------|-------|-----------|
| Chat | `/chat` | `POST /api/query/smart` |
| Trace viewer | `/trace`, `/trace/:id` | `GET /api/orchestration/traces/:id` |
| Trust | `/trust` | `GET /api/orchestration/trust?domain=` |
| Models | `/models` | `GET /api/models` (optional `?q=` from Trust links) |
| Metrics | `/metrics` | `GET /api/orchestration/trace-ids`, `GET /api/orchestration/traces/:id` |
| History | `/history` | `GET /api/activity`, `GET /api/billing/history`; local chat history from Zustand |
| Settings | `/settings` | `GET/PUT /api/settings/preferences`, `GET /api/settings/provider-keys` |
| Eval | `/eval` | `POST /api/orchestration/eval/contains` |
| Health (shell) | — | `GET /health` (connectivity dot) |

Orchestration routes require `GAIOL_TS_ORCHESTRATOR_URL` on Go. See [FEATURE-FLAGS.md](FEATURE-FLAGS.md).
