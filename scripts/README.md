# Scripts

Run all scripts from the **repository root** (e.g. `.\scripts\test\integration.ps1` from PowerShell).

## Test scripts (`scripts/test/`)

| Script | Description |
|--------|-------------|
| `integration.ps1` | Integration tests: health, public/protected routes, CORS, v1/chat 401. Requires server on http://localhost:8080. Skips JWT/401 block when health reports `auth_disabled` or `database.connected: false`. |
| `reasoning-start.ps1` | POST `/api/reasoning/start` smoke test (summary output). Use `-Raw` for full JSON. Optional `GAIOL_BASE_URL`. |
| `pipeline.ps1` | Simple pipeline test (`/api/query/smart`). |
| `ollama.ps1` | Ollama availability + GAIOL server + query test. |

## Dev scripts (`scripts/dev/`)

| Script | Description |
|--------|-------------|
| `clean-start.ps1` | Stop any running server, remove *.exe, build, then run web-server.exe. Run from repo root. |
| `stack-local.ps1` | Prints commands to run Go, TS orchestrator, and Vite dashboard in three terminals (does not start them). |

## Start/stop (root)

Start and stop the server from the repo root:

- `start.ps1`, `start.sh`, `start.bat` — start server
- `stop.ps1`, `stop.bat` — stop server
