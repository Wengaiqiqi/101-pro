[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$ResetLogs,
    [switch]$UseDocker
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$runRoot = Join-Path $repoRoot ".run"
$logRoot = Join-Path $runRoot "logs"
$pidFile = Join-Path $runRoot "pids.json"
$modeFile = Join-Path $runRoot "startup-mode.txt"
$commonScript = Join-Path $PSScriptRoot "lib\Startup.Common.ps1"

. $commonScript

$createdRecords = New-Object System.Collections.ArrayList
$newInfrastructureServices = @()
$records = @()
$dockerCommand = $null
$startupMode = if ($UseDocker) { "docker" } else { "local" }

function Remove-TrackedRecordByName {
    param([Parameter(Mandatory = $true)][string]$Name)
    $script:records = @($script:records | Where-Object { $_.name -ne $Name })
    Save-TrackedProcesses -PidFile $pidFile -Processes $script:records
}

function Resolve-HealthyTrackedService {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url
    )

    $record = $script:records | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if ($null -eq $record) {
        return $null
    }
    if ((Test-TrackedProcess -Record $record) -and (Test-HttpEndpoint -Url $Url)) {
        Write-StartupStep "$Name is already running; reusing PID $($record.pid)."
        return $record
    }

    if (Test-TrackedProcess -Record $record) {
        Write-StartupStep "$Name is recorded but unhealthy; restarting it."
        Stop-TrackedProcessTree -Record $record
    }
    Remove-TrackedRecordByName -Name $Name
    return $null
}

function Add-ProjectRecord {
    param([Parameter(Mandatory = $true)][object]$Record)
    [void]$createdRecords.Add($Record)
    $script:records = @($script:records | Where-Object { $_.name -ne $Record.name }) + @($Record)
    Save-TrackedProcesses -PidFile $pidFile -Processes $script:records
}

try {
    Write-StartupStep "Checking platform prerequisites..."
    $pythonCommand = Assert-CommandAvailable -Name "python" -InstallHint "Install Python 3.11 or newer and add it to PATH."
    $nodeCommand = Assert-CommandAvailable -Name "node" -InstallHint "Install Node.js 20 or newer and add it to PATH."
    $npmCommand = Assert-CommandAvailable -Name "npm.cmd" -InstallHint "Install npm with Node.js 20 or newer."
    [void](Assert-MinimumVersion -Command $pythonCommand.Source -Minimum ([version]"3.11") -VersionArguments @("--version"))
    [void](Assert-MinimumVersion -Command $nodeCommand.Source -Minimum ([version]"20.0") -VersionArguments @("--version"))
    if ($UseDocker) {
        $dockerCommand = Assert-CommandAvailable -Name "docker" -InstallHint "Install and start Docker Desktop."
        Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "version") -WorkingDirectory $repoRoot -Description "Docker Compose check"
    }

    [void](New-Item -ItemType Directory -Path $logRoot -Force)
    if ($ResetLogs) {
        Get-ChildItem -LiteralPath $logRoot -File -ErrorAction SilentlyContinue | Remove-Item -Force
    }

    if ($UseDocker) {
        $env:IMPORT_QUEUE_MODE = "celery"
    }
    else {
        $sqlitePath = (Join-Path $runRoot "101-pro.db").Replace("\", "/")
        $env:DATABASE_URL = "sqlite:///$sqlitePath"
        $env:IMPORT_QUEUE_MODE = "local"
    }

    $envPath = Join-Path $backendRoot ".env"
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
        Copy-Item -LiteralPath (Join-Path $backendRoot ".env.example") -Destination $envPath
        Write-StartupStep "Created backend/.env from the example file."
    }

    $backendManifest = Join-Path $backendRoot "pyproject.toml"
    $backendHash = Get-ManifestHash -Path $backendManifest
    $backendStamp = Join-Path $runRoot "backend-deps.sha256"
    $backendImportsReady = Test-PythonImports -PythonCommand $pythonCommand.Source -Modules @("alembic", "celery", "fastapi", "sqlalchemy")
    $backendInstallNeeded = (-not $backendImportsReady) -or ((Read-TextFile -Path $backendStamp) -ne $backendHash)
    if ($backendInstallNeeded) {
        if ($SkipInstall) {
            throw "Backend dependencies are missing or outdated, but -SkipInstall was supplied."
        }
        Write-StartupStep "Installing backend dependencies..."
        Invoke-CheckedCommand -FilePath $pythonCommand.Source -Arguments @("-m", "pip", "install", "-e", ".[dev]") -WorkingDirectory $backendRoot -Description "Backend dependency installation"
        Write-TextFile -Path $backendStamp -Value $backendHash
    }
    else {
        Write-StartupStep "Backend dependencies are current."
    }

    $frontendManifest = Join-Path $frontendRoot "package.json"
    $frontendHash = Get-ManifestHash -Path $frontendManifest
    $frontendStamp = Join-Path $runRoot "frontend-deps.sha256"
    $viteCommand = Join-Path $frontendRoot "node_modules\.bin\vite.cmd"
    $frontendInstallNeeded = (-not (Test-Path -LiteralPath $viteCommand -PathType Leaf)) -or ((Read-TextFile -Path $frontendStamp) -ne $frontendHash)
    if ($frontendInstallNeeded) {
        if ($SkipInstall) {
            throw "Frontend dependencies are missing or outdated, but -SkipInstall was supplied."
        }
        Write-StartupStep "Installing frontend dependencies..."
        Invoke-CheckedCommand -FilePath $npmCommand.Source -Arguments @("install") -WorkingDirectory $frontendRoot -Description "Frontend dependency installation"
        Write-TextFile -Path $frontendStamp -Value $frontendHash
    }
    else {
        Write-StartupStep "Frontend dependencies are current."
    }

    $records = @(Get-TrackedProcesses -PidFile $pidFile | Where-Object { Test-TrackedProcess -Record $_ })
    Save-TrackedProcesses -PidFile $pidFile -Processes $records

    $previousMode = Read-TextFile -Path $modeFile
    if (-not $previousMode -and ($records | Where-Object { $_.name -eq "celery" })) {
        $previousMode = "docker"
    }
    if ($previousMode -and $previousMode -ne $startupMode) {
        Write-StartupStep "Switching runtime mode from $previousMode to $startupMode..."
        foreach ($record in $records) {
            if (Test-TrackedProcess -Record $record) {
                Stop-TrackedProcessTree -Record $record
            }
        }
        $records = @()
        Save-TrackedProcesses -PidFile $pidFile -Processes $records
    }
    else {
        $incompatibleWorkerName = if ($UseDocker) { "local-worker" } else { "celery" }
        $incompatibleWorker = $records | Where-Object { $_.name -eq $incompatibleWorkerName } | Select-Object -First 1
        if ($null -ne $incompatibleWorker -and (Test-TrackedProcess -Record $incompatibleWorker)) {
            Stop-TrackedProcessTree -Record $incompatibleWorker
        }
        $records = @($records | Where-Object { $_.name -ne $incompatibleWorkerName })
        Save-TrackedProcesses -PidFile $pidFile -Processes $records
    }

    if ($UseDocker) {
        Push-Location $repoRoot
        try {
            $runningBefore = @(& $dockerCommand.Source compose ps --status running --services 2>$null)
            if ($LASTEXITCODE -ne 0) {
                throw "Could not inspect Docker Compose services. Is Docker Desktop running?"
            }
        }
        finally {
            Pop-Location
        }

        foreach ($servicePort in @(
            @{ Service = "postgres"; Port = 5432 },
            @{ Service = "redis"; Port = 6379 }
        )) {
            if ((Test-TcpPort -HostName "127.0.0.1" -Port $servicePort.Port) -and ($runningBefore -notcontains $servicePort.Service)) {
                throw "Port $($servicePort.Port) is occupied, but Docker Compose service '$($servicePort.Service)' is not running."
            }
        }

        Write-StartupStep "Starting PostgreSQL and Redis..."
        Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "up", "-d", "postgres", "redis") -WorkingDirectory $repoRoot -Description "Infrastructure startup"
        $newInfrastructureServices = @(@("postgres", "redis") | Where-Object { $runningBefore -notcontains $_ })
        Wait-TcpPort -HostName "127.0.0.1" -Port 5432 -TimeoutSeconds 60
        Wait-TcpPort -HostName "127.0.0.1" -Port 6379 -TimeoutSeconds 60
    }

    # Schema managed by app startup (_ensure_schema)

    $backendUrl = "http://127.0.0.1:8000/api/health"
    $frontendUrl = "http://127.0.0.1:5173"
    $backendRecord = Resolve-HealthyTrackedService -Name "backend" -Url $backendUrl
    if ($null -eq $backendRecord) {
        [void](Test-PortAvailableForProject -Port 8000 -Records $records -ExpectedName "backend")
        Write-StartupStep "Starting FastAPI..."
        $backendRecord = Start-TrackedProcess -Name "backend" -FilePath $pythonCommand.Source -Arguments @("-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000") -WorkingDirectory $backendRoot -LogDirectory $logRoot
        Add-ProjectRecord -Record $backendRecord
    }

    if ($UseDocker) {
        $workerName = "celery"
        $workerLabel = "Celery worker"
        $workerArguments = @("-m", "celery", "-A", "app.tasks.celery_app:celery_app", "worker", "--loglevel=info", "--pool=solo")
    }
    else {
        $workerName = "local-worker"
        $workerLabel = "local import worker"
        $workerArguments = @("-m", "app.tasks.local_worker")
    }

    $workerRecord = $records | Where-Object { $_.name -eq $workerName } | Select-Object -First 1
    if ($null -eq $workerRecord) {
        Write-StartupStep "Starting $workerLabel..."
        $workerRecord = Start-TrackedProcess -Name $workerName -FilePath $pythonCommand.Source -Arguments $workerArguments -WorkingDirectory $backendRoot -LogDirectory $logRoot
        Add-ProjectRecord -Record $workerRecord
    }
    else {
        Write-StartupStep "$workerLabel is already running; reusing PID $($workerRecord.pid)."
    }

    $frontendRecord = Resolve-HealthyTrackedService -Name "frontend" -Url $frontendUrl
    if ($null -eq $frontendRecord) {
        [void](Test-PortAvailableForProject -Port 5173 -Records $records -ExpectedName "frontend")
        Write-StartupStep "Starting Vite..."
        $frontendRecord = Start-TrackedProcess -Name "frontend" -FilePath $npmCommand.Source -Arguments @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") -WorkingDirectory $frontendRoot -LogDirectory $logRoot
        Add-ProjectRecord -Record $frontendRecord
    }

    Write-StartupStep "Waiting for application health checks..."
    Wait-HttpEndpoint -Url $backendUrl -TimeoutSeconds 60
    Wait-HttpEndpoint -Url $frontendUrl -TimeoutSeconds 60
    Write-TextFile -Path $modeFile -Value $startupMode

    Write-Host ""
    Write-Host "101 Pro is running." -ForegroundColor Green
    Write-Host "Runtime mode: $startupMode"
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend health: $backendUrl"
    Write-Host "OpenAPI: http://127.0.0.1:8000/docs"
    Write-Host "Logs: $logRoot"

    if (-not $NoBrowser) {
        Start-Process $frontendUrl
    }
    exit 0
}
catch {
    Write-Host ""
    Write-Host "101 Pro startup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""

    # Clean up processes created during this run
    $cleanupFailures = @()
    foreach ($record in @($createdRecords)) {
        if (Test-TrackedProcess -Record $record) {
            try {
                Stop-TrackedProcessTree -Record $record
            }
            catch {
                $cleanupFailures += $record
            }
        }
    }
    if ($createdRecords.Count -gt 0) {
        $createdNames = @($createdRecords | ForEach-Object { $_.name })
        $records = @($records | Where-Object { $createdNames -notcontains $_.name })
        Save-TrackedProcesses -PidFile $pidFile -Processes $records
    }

    # Clean up Docker infrastructure if started
    if ($newInfrastructureServices.Count -gt 0 -and $null -ne $dockerCommand) {
        try {
            Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments (@("compose", "stop") + $newInfrastructureServices) -WorkingDirectory $repoRoot -Description "Infrastructure cleanup"
        }
        catch {
            Write-Warning "Could not stop infrastructure started during this run."
        }
    }

    # Show diagnostic info
    if (Test-Path -LiteralPath $logRoot) {
        Write-Host "Logs: $logRoot" -ForegroundColor Yellow
        $backendErrLog = Join-Path $logRoot "backend.err.log"
        if (Test-Path -LiteralPath $backendErrLog) {
            $lastLines = Get-Content -LiteralPath $backendErrLog -Tail 5 -ErrorAction SilentlyContinue
            if ($lastLines) {
                Write-Host ""
                Write-Host "Last backend error log entries:" -ForegroundColor Yellow
                foreach ($line in $lastLines) {
                    Write-Host "  $line" -ForegroundColor DarkGray
                }
            }
        }
    }

    if ($cleanupFailures.Count -gt 0) {
        Write-Host ""
        Write-Host "Warning: Could not clean up the following processes:" -ForegroundColor Yellow
        foreach ($proc in $cleanupFailures) {
            Write-Host "  - $($proc.name) (PID $($proc.pid))" -ForegroundColor Yellow
            Write-Host "    Manual cleanup: taskkill /F /PID $($proc.pid) /T" -ForegroundColor Cyan
        }
    }

    exit 1
}
