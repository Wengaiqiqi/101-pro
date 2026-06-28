$script:StartupEncoding = New-Object System.Text.UTF8Encoding($false)

function Write-StartupStep {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[101 Pro] $Message" -ForegroundColor Cyan
}

function Assert-CommandAvailable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Required command '$Name' was not found. $InstallHint"
    }
    return $command
}

function Assert-MinimumVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][version]$Minimum,
        [Parameter(Mandatory = $true)][string[]]$VersionArguments
    )

    $versionOutput = (& $Command @VersionArguments 2>&1 | Select-Object -First 1).ToString()
    $match = [regex]::Match($versionOutput, "(\d+\.\d+(?:\.\d+)?)")
    if (-not $match.Success) {
        throw "Could not determine the version of '$Command' from: $versionOutput"
    }

    $actual = [version]$match.Groups[1].Value
    if ($actual -lt $Minimum) {
        throw "'$Command' $actual is too old. Version $Minimum or newer is required."
    }
    return $actual
}

function Test-PythonImports {
    param(
        [Parameter(Mandatory = $true)][string]$PythonCommand,
        [Parameter(Mandatory = $true)][string[]]$Modules
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        $importExpression = ($Modules | ForEach-Object { "import $_" }) -join "; "
        & $PythonCommand -c $importExpression 2>$null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Test-TcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne(300)) {
            return $false
        }
        $client.EndConnect($asyncResult)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Wait-TcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort -HostName $HostName -Port $Port) {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Timed out waiting for ${HostName}:$Port after $TimeoutSeconds seconds."
}

function Test-HttpEndpoint {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    }
    catch {
        return $false
    }
}

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpEndpoint -Url $Url) {
            return
        }
        Start-Sleep -Milliseconds 750
    }
    throw "Timed out waiting for $Url after $TimeoutSeconds seconds."
}

function Get-TrackedProcesses {
    param([Parameter(Mandatory = $true)][string]$PidFile)

    if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
        return @()
    }

    try {
        # Explicitly read as UTF-8 to handle paths with non-ASCII characters
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        $jsonString = [System.IO.File]::ReadAllText($PidFile, $utf8)
        $document = $jsonString | ConvertFrom-Json
        if ($null -eq $document.processes) {
            return @()
        }
        return @($document.processes)
    }
    catch {
        # If JSON is corrupted, return empty and let startup recreate
        Write-Warning "Could not parse '$PidFile' (may be corrupted). Starting fresh."
        return @()
    }
}

function Save-TrackedProcesses {
    param(
        [Parameter(Mandatory = $true)][string]$PidFile,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Processes
    )

    $parent = Split-Path -Parent $PidFile
    if (-not (Test-Path -LiteralPath $parent)) {
        [void](New-Item -ItemType Directory -Path $parent -Force)
    }

    $document = [ordered]@{
        version = 1
        updated_at = (Get-Date).ToUniversalTime().ToString("o")
        processes = @($Processes)
    }
    $jsonString = $document | ConvertTo-Json -Depth 6
    # PowerShell 5.1 ConvertTo-Json may not produce proper UTF-8.
    # Explicitly encode to UTF-8 bytes before writing.
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $bytes = $utf8.GetBytes($jsonString)
    [System.IO.File]::WriteAllBytes($PidFile, $bytes)
}

function Start-TrackedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$LogDirectory
    )

    if (-not (Test-Path -LiteralPath $LogDirectory)) {
        [void](New-Item -ItemType Directory -Path $LogDirectory -Force)
    }

    $stdoutPath = Join-Path $LogDirectory "$Name.out.log"
    $stderrPath = Join-Path $LogDirectory "$Name.err.log"
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    Start-Sleep -Milliseconds 150
    if ($process.HasExited) {
        throw "Process '$Name' exited immediately. Check '$stderrPath'."
    }

    return [pscustomobject][ordered]@{
        name = $Name
        pid = $process.Id
        started_at = $process.StartTime.ToUniversalTime().ToString("o")
        executable = $FilePath
        working_directory = $WorkingDirectory
        stdout_log = $stdoutPath
        stderr_log = $stderrPath
    }
}

function Test-TrackedProcess {
    param([Parameter(Mandatory = $true)][object]$Record)

    $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return $false
    }

    try {
        $recordedStart = [datetime]::Parse($Record.started_at).ToUniversalTime()
        $actualStart = $process.StartTime.ToUniversalTime()
        return [math]::Abs(($actualStart - $recordedStart).TotalSeconds) -lt 2
    }
    catch {
        return $false
    }
}

function Get-ChildProcessIds {
    param([Parameter(Mandatory = $true)][int]$ParentPid)

    $childPids = @()
    try {
        $output = & wmic process where "ParentProcessId=$ParentPid" get ProcessId 2>&1
        foreach ($line in $output) {
            if ($line -match '^\s*(\d+)\s*$') {
                $childPids += [int]$Matches[1]
            }
        }
    }
    catch {
        # wmic may fail; fall back to empty list
    }
    return $childPids
}

function Stop-ProcessTreeRobust {
    param(
        [Parameter(Mandatory = $true)][int]$Pid,
        [int]$GraceSeconds = 3
    )

    # Recursively collect all descendant PIDs
    $allPids = @($Pid)
    $queue = @($Pid)
    while ($queue.Count -gt 0) {
        $current = $queue[0]
        $queue = $queue[1..($queue.Count - 1)]
        $children = Get-ChildProcessIds -ParentPid $current
        foreach ($childPid in $children) {
            if ($childPid -ne 0 -and $allPids -notcontains $childPid) {
                $allPids += $childPid
                $queue += $childPid
            }
        }
    }

    # Kill leaf-first (reverse order) to avoid orphaning
    $taskkill = Get-Command "taskkill.exe" -ErrorAction SilentlyContinue
    for ($i = $allPids.Count - 1; $i -ge 0; $i--) {
        $targetPid = $allPids[$i]
        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if ($null -eq $proc) { continue }

        if ($null -ne $taskkill) {
            & $taskkill.Source /PID $targetPid /F 2>$null | Out-Null
        }
        else {
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        }
    }

    # Wait for root process to exit
    $deadline = (Get-Date).AddSeconds($GraceSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($null -eq (Get-Process -Id $Pid -ErrorAction SilentlyContinue)) {
            return $true
        }
        Start-Sleep -Milliseconds 200
    }
    return $false
}

function Stop-TrackedProcessTree {
    param(
        [Parameter(Mandatory = $true)][object]$Record,
        [int]$GraceSeconds = 5
    )

    if (-not (Test-TrackedProcess -Record $Record)) {
        return
    }

    $pid = [int]$Record.pid
    $stopped = Stop-ProcessTreeRobust -Pid $pid -GraceSeconds $GraceSeconds
    if (-not $stopped) {
        throw "Failed to stop process tree for PID $pid after $GraceSeconds seconds."
    }
}

function Test-PortAvailableForProject {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Records,
        [Parameter(Mandatory = $true)][string]$ExpectedName
    )

    if (-not (Test-TcpPort -HostName "127.0.0.1" -Port $Port)) {
        return $true
    }

    $ownedRecord = $Records | Where-Object { $_.name -eq $ExpectedName } | Select-Object -First 1
    if ($null -ne $ownedRecord -and (Test-TrackedProcess -Record $ownedRecord)) {
        return $true
    }

    throw "Port $Port is already in use by a process not owned by this project. Stop that process or change the project port."
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Description failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Get-ManifestHash {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return ""
    }
    return (Get-Content -LiteralPath $Path -Raw).Trim()
}

function Write-TextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )
    [System.IO.File]::WriteAllText($Path, $Value, $script:StartupEncoding)
}
