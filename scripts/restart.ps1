[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$ResetLogs,
    [switch]$UseDocker,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot "stop.ps1"
$startScript = Join-Path $PSScriptRoot "start.ps1"

Write-Host "[101 Pro] Restarting..." -ForegroundColor Cyan

# Step 1: Stop
Write-Host "[101 Pro] Stopping existing services..." -ForegroundColor Cyan
$stopArgs = @{ KeepInfrastructure = $UseDocker.IsPresent }
if ($Force) { $stopArgs.Force = $true }
& $stopScript @stopArgs
$stopExitCode = $LASTEXITCODE

if ($stopExitCode -ne 0 -and -not $Force) {
    Write-Host "[101 Pro] Stop failed. Use -Force to ignore stop errors." -ForegroundColor Red
    exit 1
}

# Step 2: Start
Write-Host "[101 Pro] Starting services..." -ForegroundColor Cyan
$startArgs = @{}
if ($SkipInstall) { $startArgs.SkipInstall = $true }
if ($NoBrowser) { $startArgs.NoBrowser = $true }
if ($ResetLogs) { $startArgs.ResetLogs = $true }
if ($UseDocker) { $startArgs.UseDocker = $true }
& $startScript @startArgs
exit $LASTEXITCODE
