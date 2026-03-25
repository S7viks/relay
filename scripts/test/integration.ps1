# GAIOL integration tests - run with server on http://localhost:8080
$base = "http://localhost:8080"
$passed = 0
$failed = 0

function Test-Endpoint {
    param($Name, $Method, $Uri, $Headers = @{}, $Body = $null, $ExpectStatus = 200, $ExpectBody = $null)
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            TimeoutSec = 10
            UseBasicParsing = $true
        }
        if ($Headers.Count -gt 0) { $params.Headers = $Headers }
        if ($Body -ne $null) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        $response = Invoke-WebRequest @params -ErrorAction Stop
        $statusOk = ($response.StatusCode -eq $ExpectStatus)
        $bodyOk = $true
        if ($ExpectBody) {
            $bodyOk = $response.Content -match $ExpectBody
        }
        if ($statusOk -and $bodyOk) {
            Write-Host "  PASS: $Name" -ForegroundColor Green
            $script:passed++
            return $response
        } else {
            Write-Host "  FAIL: $Name (status $($response.StatusCode), expected $ExpectStatus)" -ForegroundColor Red
            $script:failed++
            return $null
        }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq $ExpectStatus) {
            Write-Host "  PASS: $Name (got expected $ExpectStatus)" -ForegroundColor Green
            $script:passed++
            return $null
        }
        Write-Host "  FAIL: $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

Write-Host "`n=== GAIOL Integration Tests ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health
Write-Host "[1] Health and readiness"
Test-Endpoint -Name "GET /health" -Method GET -Uri "$base/health" -ExpectStatus 200 | Out-Null
$health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 5 -ErrorAction Stop
$authDisabledOnServer = $false
if ($health.auth_disabled -eq $true) { $authDisabledOnServer = $true }
$dbConnected = $false
if ($health.database.connected -eq $true) { $dbConnected = $true }
$expectJwtProtection = (-not $authDisabledOnServer) -and $dbConnected
if ($health.status -eq "healthy") {
    $dbInfo = "db.connected=$($health.database.connected)"
    if ($null -ne $health.database.reachable) { $dbInfo += ", db.reachable=$($health.database.reachable)" }
    Write-Host "  PASS: Health status healthy, models=$($health.models), $dbInfo" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  FAIL: Health status not healthy" -ForegroundColor Red
    $failed++
}

# 2. Public routes
Write-Host "`n[2] Public routes"
Test-Endpoint -Name "GET / (landing)" -Method GET -Uri "$base/" -ExpectStatus 200 -ExpectBody "GAIOL|landing" | Out-Null
Test-Endpoint -Name "GET /api/models" -Method GET -Uri "$base/api/models" -ExpectStatus 200 | Out-Null

# 3. Protected routes without auth -> 401 (only when Supabase auth + DB are enabled on server)
Write-Host "`n[3] Protected routes without auth (expect 401 when auth is enabled)"
if (-not $expectJwtProtection) {
    Write-Host "  SKIP: JWT protection not active (auth_disabled=$authDisabledOnServer, database.connected=$dbConnected)." -ForegroundColor Yellow
    Write-Host "        Use .env with Supabase and omit GAIOL_DISABLE_AUTH to test 401 on protected routes." -ForegroundColor Gray
} else {
    Test-Endpoint -Name "GET /api/settings/provider-keys" -Method GET -Uri "$base/api/settings/provider-keys" -ExpectStatus 401 | Out-Null
    Test-Endpoint -Name "POST /api/settings/gaiol-key/ensure" -Method POST -Uri "$base/api/settings/gaiol-key/ensure" -Body '{}' -ExpectStatus 401 | Out-Null
    Test-Endpoint -Name "GET /api/gaiol-keys" -Method GET -Uri "$base/api/gaiol-keys" -ExpectStatus 401 | Out-Null
    Test-Endpoint -Name "POST /api/query/smart" -Method POST -Uri "$base/api/query/smart" -Body '{"prompt":"hi"}' -ExpectStatus 401 | Out-Null
}

# 4. GAIOL-key-only endpoint (only when /v1/chat uses DB + key validation)
Write-Host "`n[4] GAIOL key endpoint (expect 401 without valid key when DB auth is on)"
if (-not $expectJwtProtection) {
    Write-Host "  SKIP: local no-auth / no-DB mode uses handleV1ChatLocal (no GAIOL key)." -ForegroundColor Yellow
} else {
    Test-Endpoint -Name "POST /v1/chat no auth" -Method POST -Uri "$base/v1/chat" -Body '{"prompt":"hi"}' -ExpectStatus 401 | Out-Null
    Test-Endpoint -Name "POST /v1/chat invalid key" -Method POST -Uri "$base/v1/chat" -Headers @{ Authorization = "Bearer gaiol_invalid" } -Body '{"prompt":"hi"}' -ExpectStatus 401 | Out-Null
}

# 5. CORS preflight
Write-Host "`n[5] CORS"
try {
    $r = Invoke-WebRequest -Uri "$base/api/models" -Method GET -UseBasicParsing -TimeoutSec 5
    if ($r.Headers["Access-Control-Allow-Origin"]) {
        Write-Host "  PASS: CORS headers present on GET" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  FAIL: CORS headers missing" -ForegroundColor Red
        $failed++
    }
} catch {
    Write-Host "  FAIL: CORS check $($_.Exception.Message)" -ForegroundColor Red
    $failed++
}

# 6. Method not allowed
Write-Host "`n[6] Method not allowed"
Test-Endpoint -Name "GET /v1/chat (method not allowed)" -Method GET -Uri "$base/v1/chat" -ExpectStatus 405 | Out-Null

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
if ($failed -gt 0) { exit 1 }
exit 0
