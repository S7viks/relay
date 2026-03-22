# Capture report screenshots via headless Chromium (Chrome or Edge).
# Run from repo root: .\scripts\capture-report-screenshots.ps1
# Prerequisites: Google Chrome or Microsoft Edge installed.
# Optional: $env:GAIOL_BASE_URL = 'http://localhost:8080'
# Optional: -NoStartServer  if the server is already running

param(
    [switch]$NoStartServer
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$base = $env:GAIOL_BASE_URL
if (-not $base) { $base = "http://localhost:8080" }
$base = $base.TrimEnd("/")

$outDir = Join-Path $repoRoot "report-artifacts\screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Get-ChromiumExe {
    $candidates = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

function Wait-Health {
    param([int]$MaxSec = 45)
    $deadline = (Get-Date).AddSeconds($MaxSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Stop-ServerProcess {
    param($Proc)
    if ($Proc -and -not $Proc.HasExited) {
        Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

$serverProc = $null
if (-not $NoStartServer) {
    $up = Wait-Health -MaxSec 2
    if (-not $up) {
        if (-not (Test-Path (Join-Path $repoRoot "web-server.exe"))) {
            Write-Host "Building web-server.exe..."
            & go build -o web-server.exe ./cmd/web-server/
            if ($LASTEXITCODE -ne 0) { throw "go build failed" }
        }
        Write-Host "Starting web-server.exe (background)..."
        $serverProc = Start-Process -FilePath (Join-Path $repoRoot "web-server.exe") `
            -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
        if (-not (Wait-Health -MaxSec 45)) {
            Stop-ServerProcess $serverProc
            throw "Server did not become healthy at $base/health"
        }
        Write-Host "Server is up."
    } else {
        Write-Host "Server already responding at $base/health"
    }
} else {
    if (-not (Wait-Health -MaxSec 3)) {
        throw "No server at $base/health. Start the server or omit -NoStartServer."
    }
}

$chrome = Get-ChromiumExe
if (-not $chrome) {
    Stop-ServerProcess $serverProc
    throw "Could not find Google Chrome or Microsoft Edge under Program Files. Install one of them for headless screenshots."
}
Write-Host "Using: $chrome"

$captures = @(
    @{ Name = "01-health-json";    Url = "$base/health";                    W = 900;  H = 700 },
    @{ Name = "02-index-query-ui"; Url = "$base/";                         W = 1440; H = 1200 },
    @{ Name = "03-welcome";        Url = "$base/welcome";                  W = 1440; H = 1200 },
    @{ Name = "04-login";          Url = "$base/login";                    W = 1200; H = 900 },
    @{ Name = "05-dashboard";      Url = "$base/dashboard";                W = 1440; H = 1200 },
    @{ Name = "06-monitoring-json"; Url = "$base/api/monitoring/stats";    W = 900;  H = 700 }
)

foreach ($c in $captures) {
    $file = Join-Path $outDir ($c.Name + ".png")
    Write-Host "Screenshot $($c.Name) -> $file"
    $argList = @(
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=$($c.W),$($c.H)",
        "--virtual-time-budget=10000",
        "--screenshot=$file",
        $c.Url
    )
    $p = Start-Process -FilePath $chrome -ArgumentList $argList -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) {
        Write-Warning "Exit code $($p.ExitCode) for $($c.Name)"
    }
    if (-not (Test-Path $file)) {
        Write-Warning "Missing output: $file"
    }
}

Write-Host ""
Write-Host "Screenshots saved under: $outDir"
Write-Host "Also run: .\scripts\collect-report-metrics.ps1 (JSON snapshots)"

Stop-ServerProcess $serverProc
