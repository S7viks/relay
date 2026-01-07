# GAIOL Web Server Start Script
# This script starts the GAIOL web server with proper environment configuration

param(
    [switch]$Build,
    [switch]$Help
)

if ($Help) {
    Write-Host "GAIOL Web Server Start Script"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\start.ps1           - Start the server (builds if needed)"
    Write-Host "  .\start.ps1 -Build    - Force rebuild before starting"
    Write-Host "  .\start.ps1 -Help     - Show this help message"
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

# Set required environment variables (use existing or defaults)
if (-not $env:OPENROUTER_API_KEY) {
    Write-Host "Warning: OPENROUTER_API_KEY not set" -ForegroundColor Yellow
}

if (-not $env:SUPABASE_URL -and -not $env:NEXT_PUBLIC_SUPABASE_URL) {
    Write-Host "Warning: Supabase credentials not set - authentication features will be disabled" -ForegroundColor Yellow
}

# Check if server is already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "Warning: Server is already running on port 8080!" -ForegroundColor Yellow
    Write-Host "   Stop the existing server first, or use a different port." -ForegroundColor Yellow
    Write-Host ""
    $health = $response.Content | ConvertFrom-Json
    Write-Host "Current server status:" -ForegroundColor Cyan
    Write-Host "  Status: $($health.status)"
    Write-Host "  Models: $($health.models)"
    Write-Host "  Database: $($health.database.connected)"
    Write-Host ""
    Write-Host "Access at: http://localhost:8080" -ForegroundColor Green
    exit 0
} catch {
    # Server is not running, continue
}

# Check if binary exists, build if needed or if -Build flag is set
if ($Build -or -not (Test-Path "web-server.exe")) {
    Write-Host "Building web server..." -ForegroundColor Cyan
    go build -o web-server.exe ./cmd/web-server/main.go
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host ""
}

# Start the server
Write-Host "Starting web server..." -ForegroundColor Cyan
Write-Host ""

$process = Start-Process -FilePath ".\web-server.exe" -NoNewWindow -PassThru

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
    Write-Host "  Models loaded: $($health.models)"
    Write-Host "  Free models: $($health.free_models)"
    if ($health.database) {
        Write-Host "  Database: $($health.database.connected)"
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
