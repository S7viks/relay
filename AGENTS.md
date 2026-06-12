# GAIOL — agent context (product focus)

Use this file as the primary project briefing. Ignore research papers, benchmarks, and archived UI unless the task explicitly mentions them.

## What this product is

**GAIOL** exposes **one API key** for callers. The backend routes work across **tenant-stored** provider keys (OpenRouter, Gemini, HuggingFace, etc.), with **Supabase** for auth and Postgres. The **dashboard** is a **Vite + React** SPA.

## What to work in (green paths)


| Area                              | Path              | Notes                                                    |
| --------------------------------- | ----------------- | -------------------------------------------------------- |
| HTTP server entry                 | `cmd/web-server/` | `go run cmd/web-server/main.go`                          |
| Backend logic                     | `internal/`       | Auth, DB, handlers, model adapters, orchestration glue   |
| Dashboard UI                      | `dashboard/`      | `npm ci && npm run dev` in `dashboard/`                  |
| TypeScript orchestrator (if used) | `orchestrator/`   | Fastify service; not always required for local dashboard |
| DB migrations                     | `migrations/`     | Apply per `docs/database-setup.md`                       |
| Env template                      | `.env.example`    | Supabase, encryption key, optional `GAIOL_DISABLE_AUTH`  |


## What to deprioritize unless asked

- `archive/` — legacy static dashboard
- `eval/`, benchmark scripts, LaTeX/paper assets — research / metrics
- `web/` — separate package; confirm README before changing

## Local dev (minimal)

1. `.env` from `.env.example` (Supabase + `GAIOL_ENCRYPTION_KEY`; see `QUICKSTART.md`).
2. Backend: `go run cmd/web-server/main.go` (default **:8080** per docs).
3. Dashboard: in `dashboard/`, `npm run dev`. For a **split** origin, set `VITE_API_BASE` to the API origin (see `dashboard/src/lib/apiBase.ts`).

## Deploy shape

- **Dashboard on Vercel:** root `vercel.json` builds `dashboard/` → `dashboard/dist`, SPA rewrites to `index.html`.
- **API** is a separate deploy (Fly/Railway/Render, etc.); production dashboard needs `VITE_API_BASE` at **build** time.

## Conventions for changes

- **Match existing patterns** in `internal/` and `dashboard/src/` (naming, error handling, no drive-by refactors).
- **Tenant isolation:** respect existing auth/DB boundaries; do not bypass RLS assumptions without an explicit security review task.
- **Secrets:** never commit keys; use env and encrypted key storage as implemented in `internal/keys/`.

## New repo / Cursor project seed

To start a **clean** repository and open it in Cursor, copy at least:

- `AGENTS.md` (this file)
- `.cursor/rules/gaiol-project.mdc`

Then add a minimal `README.md` (one paragraph + link to `QUICKSTART.md` if you keep it), `.env.example`, and the code directories you actually need (`cmd/`, `internal/`, `dashboard/`, `migrations/`).