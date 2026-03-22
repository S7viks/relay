# Requires: Node 20+, Go 1.21+, orchestrator built (npm run build in orchestrator/)
$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root

Push-Location (Join-Path $root "orchestrator")
if (-not (Test-Path "dist/api/server.js")) {
  npm run build
}
Pop-Location

go test ./internal/integration -tags=integration -count=1 -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Optional benchmark (5 iterations):"
go test ./internal/integration -tags=integration -bench=BenchmarkGoTSOrchestrator_SmartQuery -benchtime=5x -run=^$
