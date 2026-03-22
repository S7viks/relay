# Scripts

Run all scripts from the **repository root** (e.g. `.\scripts\test\integration.ps1` from PowerShell).

## Test scripts (`scripts/test/`)

| Script | Description |
|--------|-------------|
| `integration.ps1` | Integration tests: health, public/protected routes, CORS, v1/chat 401. Requires server on http://localhost:8080. Skips JWT/401 block when health reports `auth_disabled` or `database.connected: false`. |
| `quick.ps1` | Quick Ollama/reasoning test (reasoning/start). |
| `final.ps1` | 7-step pipeline test (query/smart). |
| `raw.ps1` | Raw output test for reasoning start and status. |
| `pipeline.ps1` | Simple pipeline test. |
| `ollama.ps1` | Ollama availability + GAIOL server + query test. |

## Report / metrics (`scripts/`)

| Script | Description |
|--------|-------------|
| `collect-report-metrics.ps1` | Writes `report-artifacts/health.json` and `monitoring-stats.json` (server must be running). See `docs/project-report-pack.md`. |
| `capture-report-screenshots.ps1` | Headless Chrome/Edge screenshots into `report-artifacts/screenshots/`. Builds and starts `web-server.exe` if needed; use `-NoStartServer` if already running. |

## Dev scripts (`scripts/dev/`)

| Script | Description |
|--------|-------------|
| `clean-start.ps1` | Stop any running server, remove *.exe, build, then run web-server.exe. Run from repo root. |

## Start/stop (root)

Start and stop the server from the repo root:

- `start.ps1`, `start.sh`, `start.bat` — start server
- `stop.ps1`, `stop.bat` — stop server
