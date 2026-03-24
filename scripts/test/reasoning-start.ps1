# POST /api/reasoning/start smoke test. Default: friendly step summary. Use -Raw for full JSON.
param(
    [switch]$Raw
)

$base = if ($env:GAIOL_BASE_URL) { $env:GAIOL_BASE_URL.TrimEnd('/') } else { 'http://localhost:8080' }

if ($Raw) {
    Write-Host "Reasoning start — raw JSON" -ForegroundColor Cyan
    $query = @{ prompt = 'Say hello' } | ConvertTo-Json
    $result = Invoke-RestMethod -Uri "$base/api/reasoning/start" -Method POST -Body $query -ContentType "application/json" -TimeoutSec 180
    Write-Host "`nRAW RESULT:" -ForegroundColor Yellow
    $result | ConvertTo-Json -Depth 10 | Write-Host
    Write-Host "`nNow checking status..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    $status = Invoke-RestMethod -Uri "$base/api/reasoning/status/$($result.session_id)" -TimeoutSec 30
    Write-Host "`nRAW STATUS:" -ForegroundColor Yellow
    $status | ConvertTo-Json -Depth 10 | Write-Host
    exit 0
}

Write-Host "=== Reasoning start (summary) ===" -ForegroundColor Cyan
$query = @{ prompt = 'Write hello world in Python' } | ConvertTo-Json
Write-Host "`nSubmitting query..." -ForegroundColor Yellow
Write-Host "(May take 30–60s — watch the server console.)" -ForegroundColor Gray

try {
    $result = Invoke-RestMethod -Uri "$base/api/reasoning/start" -Method POST -Body $query -ContentType "application/json" -TimeoutSec 180
    Write-Host "`n*** QUERY COMPLETED ***" -ForegroundColor Green
    Write-Host "Session ID: $($result.session_id)" -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    $status = Invoke-RestMethod -Uri "$base/api/reasoning/status/$($result.session_id)" -TimeoutSec 30
    Write-Host "`nSteps: $($status.steps_completed) / $($status.total_steps)" -ForegroundColor Cyan
    Write-Host "Status: $($status.status)" -ForegroundColor White
    if ($status.steps -and $status.steps.Count -gt 0) {
        foreach ($step in $status.steps) {
            Write-Host "`n--- Step: $($step.title) ---" -ForegroundColor Yellow
            if ($step.top_output -and $step.top_output.response) {
                $preview = $step.top_output.response.Substring(0, [Math]::Min(150, $step.top_output.response.Length))
                Write-Host "Model: $($step.top_output.model_id)" -ForegroundColor Cyan
                Write-Host "Response: $preview..." -ForegroundColor White
            }
            else {
                Write-Host "No output yet" -ForegroundColor Gray
            }
        }
    }
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
}
catch {
    Write-Host "`n*** FAILED ***" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Gray
}
