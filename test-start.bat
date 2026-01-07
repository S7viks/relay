@echo off
REM Quick test script to see server errors
cd /d "%~dp0"

echo Testing server startup...
echo.

REM Check for .env file
if not exist ".env" (
    echo ERROR: .env file not found!
    echo.
    pause
    exit /b 1
)

echo .env file found.
echo.

REM Try to run the server directly to see errors
if exist "web-server.exe" (
    echo Running web-server.exe directly...
    echo.
    web-server.exe
    echo.
    echo Server exited with code: %ERRORLEVEL%
) else (
    echo ERROR: web-server.exe not found!
    echo Run: .\start.ps1 -Build
    echo.
)

pause
