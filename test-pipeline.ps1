# Quick Test - Verify 7-Step Pipeline
# This script sends a test query to verify the reasoning engine works

Write-Host "Testing GAIOL Reasoning Engine..." -ForegroundColor Cyan

# Wait for server to be ready
Start-Sleep -Seconds 2

# Test query
$body = @{
    prompt   = "What is 2+2?"
    strategy = "free_only"
    task     = "generate"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/api/query/smart" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 120
    
    Write-Host "`nSuccess!" -ForegroundColor Green
    Write-Host "Response: $($response.response)" -ForegroundColor White
    Write-Host "`nSession ID: $($response.metadata.session_id)" -ForegroundColor Yellow
    Write-Host "Steps Executed: $($response.metadata.steps_executed)" -ForegroundColor Yellow
    Write-Host "Total Cost: `$$($response.metadata.cost_info.total_cost)" -ForegroundColor Yellow
    
    if ($response.metadata.steps_executed -eq 7) {
        Write-Host "`n✅ 7-step pipeline is working!" -ForegroundColor Green
    }
    else {
        Write-Host "`n⚠️  Expected 7 steps, got $($response.metadata.steps_executed)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
}
