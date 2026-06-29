[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$UseDocker
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$runRoot = Join-Path $repoRoot ".run"

Write-Host "[101 Pro] Starting development environment..." -ForegroundColor Cyan

# ── Prerequisites ─────────────────────────────────────────────────
$pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) {
    throw "Python not found. Install Python 3.11+ and add to PATH."
}
$nodeCommand = Get-Command "node" -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    throw "Node.js not found. Install Node.js 20+ and add to PATH."
}

[void](New-Item -ItemType Directory -Path $runRoot -Force)

# ── Environment ──────────────────────────────────────────────────
if ($UseDocker) {
    $env:IMPORT_QUEUE_MODE = "celery"
} else {
    $sqlitePath = (Join-Path $runRoot "101-pro.db").Replace("\", "/")
    $env:DATABASE_URL = "sqlite:///$sqlitePath"
    $env:IMPORT_QUEUE_MODE = "local"
}

$envPath = Join-Path $backendRoot ".env"
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    Copy-Item -LiteralPath (Join-Path $backendRoot ".env.example") -Destination $envPath
    Write-Host "[101 Pro] Created backend/.env from example." -ForegroundColor Yellow
}

# ── Install dependencies ─────────────────────────────────────────
if (-not $SkipInstall) {
    $backendManifest = Join-Path $backendRoot "pyproject.toml"
    $backendStamp = Join-Path $runRoot "backend-deps.sha256"
    $currentHash = (Get-FileHash -LiteralPath $backendManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $savedHash = if (Test-Path -LiteralPath $backendStamp) { (Get-Content -LiteralPath $backendStamp -Raw).Trim() } else { "" }

    if ($currentHash -ne $savedHash) {
        Write-Host "[101 Pro] Installing backend dependencies..." -ForegroundColor Cyan
        Push-Location $backendRoot
        cmd /c "python -m pip install -e .[dev] 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
        Pop-Location
        [System.IO.File]::WriteAllText($backendStamp, $currentHash, [System.Text.UTF8Encoding]::new($false))
    }

    $frontendManifest = Join-Path $frontendRoot "package.json"
    $frontendStamp = Join-Path $runRoot "frontend-deps.sha256"
    $currentHash = (Get-FileHash -LiteralPath $frontendManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    $savedHash = if (Test-Path -LiteralPath $frontendStamp) { (Get-Content -LiteralPath $frontendStamp -Raw).Trim() } else { "" }
    $viteCmd = Join-Path $frontendRoot "node_modules\.bin\vite.cmd"

    if ($currentHash -ne $savedHash -or -not (Test-Path -LiteralPath $viteCmd)) {
        Write-Host "[101 Pro] Installing frontend dependencies..." -ForegroundColor Cyan
        Push-Location $frontendRoot
        cmd /c "npm install 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
        Pop-Location
        [System.IO.File]::WriteAllText($frontendStamp, $currentHash, [System.Text.UTF8Encoding]::new($false))
    }
}

# ── Database schema managed by app startup (_ensure_schema) ──────

# ── Launch backend, worker, and frontend in separate windows ──────
$backendCmdFile = Join-Path $repoRoot "backend.cmd"
$frontendCmdFile = Join-Path $repoRoot "frontend.cmd"
Start-Process "cmd.exe" -ArgumentList "/k `"$backendCmdFile`""

# Wait for backend to be ready
Write-Host "[101 Pro] Waiting for backend to start..." -ForegroundColor Cyan
$backendReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/docs" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch { }
}
if ($backendReady) {
    Write-Host "[101 Pro] Backend is ready!" -ForegroundColor Green
} else {
    Write-Host "[101 Pro] Backend may not be ready yet, continuing..." -ForegroundColor Yellow
}

if (-not $UseDocker) {
    Start-Process "cmd.exe" -ArgumentList "/k `"cd /d `"$backendRoot`" && title 101 Pro - Local Worker && python -m app.tasks.local_worker`""
    Start-Sleep -Milliseconds 500
}

Start-Process "cmd.exe" -ArgumentList "/k `"$frontendCmdFile`""

# ── Summary ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "[101 Pro] Development environment started!" -ForegroundColor Green
Write-Host "  Backend:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  Frontend: http://127.0.0.1:5173" -ForegroundColor White
Write-Host "  API Docs: http://127.0.0.1:8000/docs" -ForegroundColor White
if (-not $UseDocker) {
    Write-Host "  Worker:   local import worker (separate window)" -ForegroundColor White
}
Write-Host ""
Write-Host "Backend, worker, and frontend are running in separate windows." -ForegroundColor Yellow
Write-Host "Close those windows or press Ctrl+C there to stop." -ForegroundColor Yellow
Write-Host ""

# Open browser
Start-Process "http://127.0.0.1:5173"
