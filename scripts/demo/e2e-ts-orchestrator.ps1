# End-to-end demo: TS orchestrator + Go web server + smart query + trace fetch.
# Run from repo root. Starts TS in a background job; you start Go in another terminal or adapt below.
$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

$orch = Join-Path $root "orchestrator"
if (-not (Test-Path (Join-Path $orch "dist/api/server.js"))) {
  Set-Location $orch
  npm run build
  Set-Location $root
}

$port = 8787
$env:ORCHESTRATOR_PORT = "$port"
$env:PORT = "$port"
$job = Start-Job -ScriptBlock {
  param($orchPath, $port)
  Set-Location $orchPath
  $env:ORCHESTRATOR_PORT = "$port"
  $env:PORT = "$port"
  node dist/api/server.js
} -ArgumentList $orch, $port

Start-Sleep -Seconds 2
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -Method Get
  if (-not $h.ok) { throw "TS health not ok" }
} catch {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -ErrorAction SilentlyContinue
  throw $_
}

Write-Host @"

TS orchestrator is running on http://127.0.0.1:$port

In another terminal (repo root), start Go with:

  set GAIOL_DISABLE_AUTH=1
  set GAIOL_TS_ORCHESTRATOR_URL=http://127.0.0.1:$port
  set GAIOL_USE_TS_ORCHESTRATOR=1
  go run ./cmd/web-server

Then:

  curl -s -X POST http://localhost:8080/api/query/smart -H "Content-Type: application/json" ^
    -d "{\"prompt\":\"Hello from GAIOL demo\",\"task\":\"qa\",\"strategy\":\"beam\"}"

Use metadata.trace_id from the JSON response:

  curl -s http://localhost:8080/api/orchestration/traces/<trace_id>

Stop the TS job: Stop-Job -Id $($job.Id); Remove-Job -Id $($job.Id)
"@

Write-Host "Background job Id: $($job.Id)"
