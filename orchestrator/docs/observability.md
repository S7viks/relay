# Observability and trace replay

## Event timeline (live)

Each `OrchestratorPipeline.run()` builds an in-memory `timeline: OrchestrationEvent[]` alongside the persisted `OrchestrationTrace`. Normal HTTP responses (`POST /v1/orchestrate`) are unchanged; use the pipeline programmatically if you need the live timeline in-process.

Structured logs use the same stable event names (`evt` field) as the timeline entries, with `traceId`, optional `subtaskId`, `phase`, and `payload`.

## Metrics summary

`metricsSummary` on the pipeline result (and `metrics_summary` on the debug endpoint) is derived from the completed trace via `summarizeOrchestrationTrace`, plus `totalRetries` from the live run when available.

## Replay (no provider calls)

`rebuildTimelineFromTrace(trace)` produces a deterministic timeline from a stored trace. Payloads include `source: "replay"` so consumers can distinguish them from live events.

Use `diffLiveTimelineVsReplay(liveTimeline, trace)` in tests to assert consensus winners match between live and replay.

## HTTP: inspect a stored run

After a successful orchestration, traces are appended to the in-memory repository used by the dev server:

`GET /v1/traces/:traceId`

Returns JSON: `trace`, `timeline_rebuilt`, `metrics_summary`. Returns `404` with `{ "error": "not_found" }` if the id is unknown.
