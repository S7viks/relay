@echo off
REM GAIOL Web Server Start Script (Batch)
REM Simple wrapper to run the PowerShell script

powershell.exe -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
