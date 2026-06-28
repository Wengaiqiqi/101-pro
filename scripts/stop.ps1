[CmdletBinding()]
param(
    [switch]$KeepInfrastructure,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $repoRoot ".run"
$pidFile = Join-Path $runRoot "pids.json"
$modeFile = Join-Path $runRoot "startup-mode.txt"
$logRoot = Join-Path $runRoot "logs"
$commonScript = Join-Path $PSScriptRoot "lib\Startup.Common.ps1"

. $commonScript

$failedProcesses = @()

try {
    $startupMode = Read-TextFile -Path $modeFile
    $records = @(Get-TrackedProcesses -PidFile $pidFile)

    foreach ($record in $records) {
        if (-not (Test-TrackedProcess -Record $record)) {
            Write-StartupStep "$($record.name) (PID $($record.pid)) is already stopped."
            continue
        }

        Write-StartupStep "Stopping $($record.name) (PID $($record.pid))..."
        try {
            Stop-TrackedProcessTree -Record $record -GraceSeconds $(if ($Force) { 1 } else { 5 })
        }
        catch {
            $failedProcesses += $record
            Write-Warning "Could not stop $($record.name) (PID $($record.pid)): $($_.Exception.Message)"
        }
    }

    if ($failedProcesses.Count -eq 0 -and (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
        Remove-Item -LiteralPath $pidFile -Force
    }

    if ($startupMode -eq "docker" -and -not $KeepInfrastructure) {
        $dockerCommand = Get-Command "docker" -ErrorAction SilentlyContinue
        if ($null -eq $dockerCommand) {
            Write-Warning "Docker was not found; PostgreSQL and Redis could not be stopped."
        }
        else {
            Write-StartupStep "Stopping PostgreSQL and Redis..."
            try {
                Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "stop", "postgres", "redis") -WorkingDirectory $repoRoot -Description "Infrastructure shutdown"
            }
            catch {
                Write-Warning "Could not stop Docker infrastructure: $($_.Exception.Message)"
            }
        }
    }

    if (Test-Path -LiteralPath $modeFile -PathType Leaf) {
        Remove-Item -LiteralPath $modeFile -Force
    }

    if ($failedProcesses.Count -gt 0) {
        Write-Host ""
        Write-Host "101 Pro shutdown completed with errors." -ForegroundColor Yellow
        Write-Host "The following processes could not be stopped:" -ForegroundColor Yellow
        foreach ($proc in $failedProcesses) {
            Write-Host "  - $($proc.name) (PID $($proc.pid))" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "To force kill these processes, run:" -ForegroundColor Yellow
        foreach ($proc in $failedProcesses) {
            Write-Host "  taskkill /F /PID $($proc.pid) /T" -ForegroundColor Cyan
        }
        exit 1
    }

    Write-Host "101 Pro services are stopped." -ForegroundColor Green
    exit 0
}
catch {
    Write-Host ""
    Write-Host "101 Pro shutdown failed: $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path -LiteralPath $logRoot) {
        Write-Host "Logs: $logRoot" -ForegroundColor Yellow
    }
    exit 1
}
