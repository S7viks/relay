# Saves live JSON snapshots for project reports (health + monitoring stats).
# Prerequisites: web server running (see QUICKSTART.md).
# Usage: from repo root: .\scripts\collect-report-metrics.ps1
# Optional: $env:GAIOL_BASE_URL = 'http://localhost:8080'

$ErrorActionPreference = "Stop"
$base = $env:GAIOL_BASE_URL
if (-not $base) { $base = "http://localhost:8080" }
$base = $base.TrimEnd("/")

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $repoRoot "report-artifacts"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$healthUrl = "$base/health"
$statsUrl = "$base/api/monitoring/stats"

Write-Host "GET $healthUrl"
try {
    $h = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 30
    $h.Content | Set-Content -Path (Join-Path $outDir "health.json") -Encoding utf8
    Write-Host "  -> report-artifacts/health.json"
} catch {
    Write-Warning "health failed: $_"
}

Write-Host "GET $statsUrl"
try {
    $s = Invoke-WebRequest -Uri $statsUrl -UseBasicParsing -TimeoutSec 30
    $s.Content | Set-Content -Path (Join-Path $outDir "monitoring-stats.json") -Encoding utf8
    Write-Host "  -> report-artifacts/monitoring-stats.json"
} catch {
    Write-Warning "monitoring/stats failed: $_"
}

Write-Host "Done. Add screenshots under report-artifacts/screenshots/ per docs/project-report-pack.md"
