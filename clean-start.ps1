# Quick Start Script - Forces Clean Rebuild

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GAIOL - Clean Build and Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill any running servers
Write-Host "Stopping any running servers..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -like "*web-server*" -or $_.ProcessName -like "*GAIOL*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Delete all executables to force rebuild
Write-Host "Cleaning old executables..." -ForegroundColor Yellow
Remove-Item -Path "*.exe" -Force -ErrorAction SilentlyContinue

# Build
Write-Host "Building GAIOL Web Server..." -ForegroundColor Cyan
go build -o web-server.exe ./cmd/web-server/main.go

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build successful!" -ForegroundColor Green
Write-Host ""

# Start server
Write-Host "Starting GAIOL Web Server..." -ForegroundColor Cyan
Write-Host "Access at: http://localhost:8080" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

.\web-server.exe
