[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$ResetLogs
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$runRoot = Join-Path $repoRoot ".run"
$logRoot = Join-Path $runRoot "logs"
$pidFile = Join-Path $runRoot "pids.json"
$commonScript = Join-Path $PSScriptRoot "lib\Startup.Common.ps1"

. $commonScript

$createdRecords = New-Object System.Collections.ArrayList
$newInfrastructureServices = @()
$records = @()
$dockerCommand = $null

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
    $dockerCommand = Assert-CommandAvailable -Name "docker" -InstallHint "Install and start Docker Desktop."
    $pythonCommand = Assert-CommandAvailable -Name "python" -InstallHint "Install Python 3.11 or newer and add it to PATH."
    $nodeCommand = Assert-CommandAvailable -Name "node" -InstallHint "Install Node.js 20 or newer and add it to PATH."
    $npmCommand = Assert-CommandAvailable -Name "npm.cmd" -InstallHint "Install npm with Node.js 20 or newer."
    [void](Assert-MinimumVersion -Command $pythonCommand.Source -Minimum ([version]"3.11") -VersionArguments @("--version"))
    [void](Assert-MinimumVersion -Command $nodeCommand.Source -Minimum ([version]"20.0") -VersionArguments @("--version"))
    Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "version") -WorkingDirectory $repoRoot -Description "Docker Compose check"

    [void](New-Item -ItemType Directory -Path $logRoot -Force)
    if ($ResetLogs) {
        Get-ChildItem -LiteralPath $logRoot -File -ErrorAction SilentlyContinue | Remove-Item -Force
    }

    $envPath = Join-Path $backendRoot ".env"
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
        Copy-Item -LiteralPath (Join-Path $backendRoot ".env.example") -Destination $envPath
        Write-StartupStep "Created backend/.env from the example file."
    }

    $backendManifest = Join-Path $backendRoot "pyproject.toml"
    $backendHash = Get-ManifestHash -Path $backendManifest
    $backendStamp = Join-Path $runRoot "backend-deps.sha256"
    & $pythonCommand.Source -c "import alembic, celery, fastapi, sqlalchemy" 2>$null
    $backendImportsReady = $LASTEXITCODE -eq 0
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

    Write-StartupStep "Applying database migrations..."
    Invoke-CheckedCommand -FilePath $pythonCommand.Source -Arguments @("-m", "alembic", "upgrade", "head") -WorkingDirectory $backendRoot -Description "Database migration"

    $backendUrl = "http://127.0.0.1:8000/api/health"
    $frontendUrl = "http://127.0.0.1:5173"
    $backendRecord = Resolve-HealthyTrackedService -Name "backend" -Url $backendUrl
    if ($null -eq $backendRecord) {
        [void](Test-PortAvailableForProject -Port 8000 -Records $records -ExpectedName "backend")
        Write-StartupStep "Starting FastAPI..."
        $backendRecord = Start-TrackedProcess -Name "backend" -FilePath $pythonCommand.Source -Arguments @("-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000") -WorkingDirectory $backendRoot -LogDirectory $logRoot
        Add-ProjectRecord -Record $backendRecord
    }

    $celeryRecord = $records | Where-Object { $_.name -eq "celery" } | Select-Object -First 1
    if ($null -eq $celeryRecord) {
        Write-StartupStep "Starting Celery worker..."
        $celeryRecord = Start-TrackedProcess -Name "celery" -FilePath $pythonCommand.Source -Arguments @("-m", "celery", "-A", "app.tasks.celery_app:celery_app", "worker", "--loglevel=info", "--pool=solo") -WorkingDirectory $backendRoot -LogDirectory $logRoot
        Add-ProjectRecord -Record $celeryRecord
    }
    else {
        Write-StartupStep "Celery is already running; reusing PID $($celeryRecord.pid)."
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

    Write-Host ""
    Write-Host "101 Pro is running." -ForegroundColor Green
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

    foreach ($record in @($createdRecords)) {
        if (Test-TrackedProcess -Record $record) {
            Stop-TrackedProcessTree -Record $record
        }
    }
    if ($createdRecords.Count -gt 0) {
        $createdNames = @($createdRecords | ForEach-Object { $_.name })
        $records = @($records | Where-Object { $createdNames -notcontains $_.name })
        Save-TrackedProcesses -PidFile $pidFile -Processes $records
    }

    if ($newInfrastructureServices.Count -gt 0 -and $null -ne $dockerCommand) {
        try {
            Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments (@("compose", "stop") + $newInfrastructureServices) -WorkingDirectory $repoRoot -Description "Infrastructure cleanup"
        }
        catch {
            Write-Warning "Could not stop infrastructure started during this run."
        }
    }

    if (Test-Path -LiteralPath $logRoot) {
        Write-Host "Logs: $logRoot" -ForegroundColor Yellow
    }
    exit 1
}
