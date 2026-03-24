# Go web app and TypeScript orchestrator (production wiring)

## Overview

The Go web server can delegate `POST /api/query/smart` to the TypeScript orchestrator over **HTTP** using the existing **v1 contract** (`internal/gaiol/orchestratorcontract/v1`). The in-process Go reasoning engine remains the default when delegation is off or when the TS call fails (automatic fallback).

## Configuration

| Variable | Meaning |
|----------|---------|
| `GAIOL_TS_ORCHESTRATOR_URL` | Base URL of the TS service (e.g. `http://127.0.0.1:8787`). Trailing slashes are trimmed. |
| `GAIOL_USE_TS_ORCHESTRATOR` | When `1`/`true`/`yes`/`on`, smart queries use the TS orchestrator when the URL is set. |
| `GAIOL_TS_EXPLORE_PATHS` | Default `on` when unset. Set to `0`/`false` to disable beam-style path exploration for delegated calls. |
| `GAIOL_TS_BEAM_WIDTH` | Beam width for delegated calls (default `2`). |
| `GAIOL_TS_CONSENSUS_MODE` | `abtc` (default), `uniform`, or `static`. |
| `GAIOL_TS_DOMAIN` | Orchestration domain tag (default `general`). |

## API behavior (unchanged routes)

- **Routes and required fields** for existing clients are unchanged.
- **Optional response fields** when delegation succeeds: `orchestration`, `orchestration_trace`, `orchestration_trust_updates`, `orchestration_metrics`, and `metadata.engine` / `metadata.trace_id`.
- **Per-request opt-out**: send `"strategy": "go_reasoning"` to force the Go reasoning path even if TS delegation is enabled.

## Trace and metrics proxy

`GET /api/orchestration/traces/{trace_id}` forwards to the TS service `GET /v1/traces/{trace_id}` and returns the JSON bundle (`trace`, `timeline_rebuilt`, `metrics_summary`). Returns `503` if no TS client is configured.

- `GET /api/orchestration/trust` → TS `GET /v1/trust` (optional `?domain=`).
- `GET /api/orchestration/trace-ids` → TS `GET /v1/traces?limit=` (recent trace ids).
- `POST /api/orchestration/eval/contains` → TS `POST /v1/eval/contains` (contains-based eval on an answer string).

## Operations layout

Typical production: run the TS orchestrator as a sidecar or internal service on a stable port, set `GAIOL_TS_ORCHESTRATOR_URL` to that base URL, and enable `GAIOL_USE_TS_ORCHESTRATOR`. The Go app does not embed Node; it only speaks HTTP.

## Tests and smoke

- Default `go test ./...` does **not** run the full stack (no Node).
- Build the orchestrator (`cd orchestrator && npm run build`), then:

```text
go test ./internal/integration -tags=integration -count=1 -v
```

- Benchmark (same prerequisites):

```text
go test ./internal/integration -tags=integration -bench=BenchmarkGoTSOrchestrator_SmartQuery -benchtime=5x
```

- PowerShell helper: `scripts/test/go-ts-orchestrator-integration.ps1`

## Demo

See `scripts/demo/e2e-ts-orchestrator.ps1` for a minimal local flow: start TS, start Go with env vars, and `curl` smart query plus trace proxy.
