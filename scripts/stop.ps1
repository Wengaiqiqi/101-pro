[CmdletBinding()]
param(
    [switch]$KeepInfrastructure
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $repoRoot ".run"
$pidFile = Join-Path $runRoot "pids.json"
$modeFile = Join-Path $runRoot "startup-mode.txt"
$commonScript = Join-Path $PSScriptRoot "lib\Startup.Common.ps1"

. $commonScript

try {
    $startupMode = Read-TextFile -Path $modeFile
    $infrastructureStopped = $false
    $records = @(Get-TrackedProcesses -PidFile $pidFile)
    foreach ($record in $records) {
        if (-not (Test-TrackedProcess -Record $record)) {
            Write-StartupStep "$($record.name) is already stopped."
            continue
        }

        Write-StartupStep "Stopping $($record.name) (PID $($record.pid))..."
        Stop-TrackedProcessTree -Record $record
    }

    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        Remove-Item -LiteralPath $pidFile -Force
    }

    if ($startupMode -eq "docker" -and -not $KeepInfrastructure) {
        $dockerCommand = Get-Command "docker" -ErrorAction SilentlyContinue
        if ($null -eq $dockerCommand) {
            Write-Warning "Docker was not found; PostgreSQL and Redis could not be stopped."
        }
        else {
            Write-StartupStep "Stopping PostgreSQL and Redis..."
            Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "stop", "postgres", "redis") -WorkingDirectory $repoRoot -Description "Infrastructure shutdown"
            $infrastructureStopped = $true
        }
    }

    if (($startupMode -ne "docker" -or $infrastructureStopped) -and (Test-Path -LiteralPath $modeFile -PathType Leaf)) {
        Remove-Item -LiteralPath $modeFile -Force
    }

    Write-Host "101 Pro services are stopped." -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "101 Pro shutdown failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
