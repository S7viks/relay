# GAIOL Web Server Start Script
# This script starts the GAIOL web server with proper environment configuration

param(
    [switch]$Build,
    [switch]$NoBuild,
    [switch]$Help
)

if ($Help) {
    Write-Host "GAIOL Web Server Start Script"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\start.ps1              - Start (builds if web-server.exe missing or older than Go sources)"
    Write-Host "  .\start.ps1 -Build       - Force rebuild before starting"
    Write-Host "  .\start.ps1 -NoBuild     - Skip build even if sources are newer (faster restart)"
    Write-Host "  .\start.ps1 -Help        - Show this help message"
    Write-Host ""
    exit 0
}

# Change to script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Starting GAIOL Web Server..." -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists and load it
if (Test-Path ".env") {
    Write-Host "Loading environment variables from .env file..." -ForegroundColor Green
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -and $value) {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
} else {
    Write-Host "Warning: No .env file found. Using environment variables or defaults." -ForegroundColor Yellow
    Write-Host "Create a .env file with your API keys for full functionality." -ForegroundColor Yellow
}

$disableAuthVal = @(
    $env:GAIOL_DISABLE_AUTH,
    $env:GAIOL_AUTH_DISABLED,
    $env:DISABLE_AUTH
) | Where-Object { $_ -match '^(?i)(1|true|yes|y|on)$' }
if ($disableAuthVal) {
    Write-Host "Note: Auth/database are OFF (no-auth env flag set). Remove GAIOL_DISABLE_AUTH and aliases from .env for Supabase sign-in." -ForegroundColor Yellow
}

# API keys: with auth/database, users add OpenRouter/Gemini/etc. in the app (Dashboard > Models).
# OPENROUTER_API_KEY in .env is only for no-auth local mode (GAIOL_DISABLE_AUTH=1). Not required otherwise.
if (-not $env:SUPABASE_URL -and -not $env:NEXT_PUBLIC_SUPABASE_URL) {
    Write-Host "Warning: Supabase credentials not set - authentication features will be disabled" -ForegroundColor Yellow
}

# Check if server is already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "Server is already running on port 8080." -ForegroundColor Yellow
    $health = $response.Content | ConvertFrom-Json
    Write-Host "  Status: $($health.status), Auth disabled: $($health.auth_disabled), Models: $($health.models)"
    if ($health.database) {
        Write-Host "  Database: connected=$($health.database.connected) reachable=$($health.database.reachable) service_role=$($health.database.using_service_role)"
    }
    Write-Host ""
    Write-Host "To restart: stop the existing process (Task Manager or close its window), then run this script again." -ForegroundColor Gray
    Write-Host "Access at: http://localhost:8080" -ForegroundColor Green
    exit 0
} catch {
    # Server is not running, continue
}

# Build from repo root when exe is missing, -Build, or any cmd/*.go / internal/*.go is newer than web-server.exe
$needsBuild = $false
if ($Build) {
    $needsBuild = $true
} elseif (-not $NoBuild) {
    if (-not (Test-Path "web-server.exe")) {
        $needsBuild = $true
    } else {
        $exeTime = (Get-Item "web-server.exe").LastWriteTimeUtc
        $goFiles = @()
        if (Test-Path "cmd") { $goFiles += Get-ChildItem -Path "cmd" -Recurse -Filter "*.go" -File -ErrorAction SilentlyContinue }
        if (Test-Path "internal") { $goFiles += Get-ChildItem -Path "internal" -Recurse -Filter "*.go" -File -ErrorAction SilentlyContinue }
        foreach ($f in $goFiles) {
            if ($f.LastWriteTimeUtc -gt $exeTime) {
                $needsBuild = $true
                break
            }
        }
    }
}

if ($needsBuild) {
    Write-Host "Building web server..." -ForegroundColor Cyan
    go build -o web-server.exe ./cmd/web-server/
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host ""
}

# Start the server (run from repo root; UI is served from dashboard/dist when built)
Write-Host "Starting web server..." -ForegroundColor Cyan
Write-Host ""

$process = Start-Process -FilePath ".\web-server.exe" -WorkingDirectory $scriptPath -NoNewWindow -PassThru

# Wait a moment for server to start
Start-Sleep -Seconds 3

# Check if server started successfully
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 3
    $health = $response.Content | ConvertFrom-Json
    
    Write-Host "GAIOL Web Server is running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Server Status:" -ForegroundColor Cyan
    Write-Host "  Status: $($health.status)"
    Write-Host "  Auth disabled (local no-DB mode): $($health.auth_disabled)"
    Write-Host "  Models loaded: $($health.models)"
    Write-Host "  Free models: $($health.free_models)"
    if ($health.database) {
        Write-Host "  Database connected: $($health.database.connected)"
        if ($null -ne $health.database.reachable) {
            Write-Host "  PostgREST reachable: $($health.database.reachable)"
        }
        if ($null -ne $health.database.using_service_role) {
            Write-Host "  DB using service role: $($health.database.using_service_role)"
        }
    }
    Write-Host ""
    Write-Host "Access the application at: http://localhost:8080" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    
    # Wait for process to exit
    $process.WaitForExit()
} catch {
    Write-Host "Server failed to start or is not responding" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
