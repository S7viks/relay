# FINAL TEST - Send a query and verify 7-step pipeline
Write-Host "Waiting for server..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "`nSending test query..." -ForegroundColor Cyan

$body = @{
    prompt   = "Hello"
    strategy = "free_only"  
    task     = "generate"
} | ConvertTo-Json

try {
    Write-Host "Calling API..." -ForegroundColor Gray
    $response = Invoke-RestMethod -Uri "http://localhost:8080/api/query/smart" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 120 `
        -Verbose
    
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "SUCCESS!" -ForegroundColor Green  
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nFinal Response: $($response.response)" -ForegroundColor White
    Write-Host "`nSession ID: $($response.metadata.session_id)" -ForegroundColor Cyan
    Write-Host "Steps Executed: $($response.metadata.steps_executed)" -ForegroundColor Cyan
    Write-Host "Total Cost: `$$($response.metadata.cost_info.total_cost)" -ForegroundColor Cyan
    
    if ($response.metadata.steps_executed -eq 7) {
        Write-Host "`n✅✅✅ 7-STEP PIPELINE CONFIRMED! ✅✅✅" -ForegroundColor Green
    }
    else {
        Write-Host "`n⚠️  Steps executed: $($response.metadata.steps_executed)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "ERROR" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nThis likely means:" -ForegroundColor Yellow
    Write-Host "1. Server is still starting (wait 10 more seconds and try again)" -ForegroundColor Yellow
    Write-Host "2. OpenRouter API issues (check server logs)" -ForegroundColor Yellow
}
