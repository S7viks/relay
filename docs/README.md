# GAIOL Documentation

Entry points at repo root: [README.md](../README.md), [QUICKSTART.md](../QUICKSTART.md), [API.md](../API.md).

## Canonical reference (platform)

| Document | Purpose |
|----------|---------|
| [01-PROJECT-OVERVIEW.md](01-PROJECT-OVERVIEW.md) | Goals, scope, results, repo map |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | System architecture |
| [03-ALGORITHMS-AND-RESEARCH.md](03-ALGORITHMS-AND-RESEARCH.md) | Algorithms and manuscript reference |
| [04-CODEBASE-INTERNALS.md](04-CODEBASE-INTERNALS.md) | Packages and implementation map |
| [05-DATA-FLOW-AND-PATTERNS.md](05-DATA-FLOW-AND-PATTERNS.md) | Request and state flow |
| [06-QUICK-REFERENCE.md](06-QUICK-REFERENCE.md) | Glossary, commands, caveats |

## Getting started

| Document | Purpose |
|----------|---------|
| [database-setup.md](database-setup.md) | Supabase database and migrations |
| [LOCAL-DEV-STACK.md](LOCAL-DEV-STACK.md) | Go + TS orchestrator + Vite: ports, env, health, auth |
| [DASHBOARD.md](DASHBOARD.md) | React dashboard routes and API map |
| [DEMO-SCRIPT.md](DEMO-SCRIPT.md) | Chat → trace → trust demo steps |
| [FEATURE-FLAGS.md](FEATURE-FLAGS.md) | Env vars for TS delegation, CORS, auth |
| [authentication.md](authentication.md) | Auth endpoints and frontend usage |
| [ollama-setup.md](ollama-setup.md) | Optional Ollama setup |

## Architecture and routing

| Document | Purpose |
|----------|---------|
| [simplified-architecture.md](simplified-architecture.md) | Reasoning engine flow (decompose, beam, consensus) |
| [routing.md](routing.md) | Route registration and middleware |

## Operations

| Document | Purpose |
|----------|---------|
| [RUNBOOK.md](RUNBOOK.md) | Deploy, migrations, revoke key, health |

## TypeScript orchestrator

| Document | Purpose |
|----------|---------|
| [gaiol-ts-orchestrator-wiring.md](gaiol-ts-orchestrator-wiring.md) | Go bridge and TS orchestrator wiring |

## World model

| Document | Purpose |
|----------|---------|
| [world-model-implementation.md](world-model-implementation.md) | World model implementation |
| [world-model-quick-start.md](world-model-quick-start.md) | World model quick start |
| [world-model-verification.md](world-model-verification.md) | Verification steps |

## Archived docs and coursework assets

Planning checklists, product plans, report templates, and superseded narratives live under **`../_archive/`** (see `_archive/README.md`). They are intentionally excluded from the default documentation index.

The **pre-React static dashboard** (old `web/dashboard.html`, `chat.html`, and related JS) is preserved under **`../archive/web-legacy/`** (see `archive/web-legacy/README.md`); the live app is `dashboard/` + `dashboard/dist/` served at **`/`** (unified SPA; legacy `/dashboard/*` redirects to `/*`).
