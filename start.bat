@echo off
setlocal enabledelayedexpansion

REM GAIOL Web Server Start Script (Batch)
REM Change to script directory
cd /d "%~dp0"

echo.
echo ========================================
echo Starting GAIOL Web Server
echo ========================================
echo.

REM Run PowerShell script and capture exit code
powershell.exe -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

REM Always pause if there was an error
if %EXIT_CODE% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: Server failed to start!
    echo Exit code: %EXIT_CODE%
    echo ========================================
    echo.
    echo Common issues:
    echo   - Missing OPENROUTER_API_KEY in .env file
    echo   - Port 8080 already in use
    echo   - Build errors
    echo.
    pause
    exit /b %EXIT_CODE%
)

REM If successful, the PowerShell script will keep the window open
REM If we get here, something unexpected happened
pause
