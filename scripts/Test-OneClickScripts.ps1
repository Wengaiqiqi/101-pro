$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
    "start.cmd",
    "stop.cmd",
    "scripts/start.ps1",
    "scripts/stop.ps1",
    "scripts/lib/Startup.Common.ps1"
)

foreach ($relativePath in $requiredFiles) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Missing required file: $relativePath"
    }
}

$powerShellFiles = @(
    "scripts/start.ps1",
    "scripts/stop.ps1",
    "scripts/lib/Startup.Common.ps1",
    "scripts/Test-OneClickScripts.ps1"
)

foreach ($relativePath in $powerShellFiles) {
    $tokens = $null
    $parseErrors = $null
    $fullPath = Join-Path $repoRoot $relativePath
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $fullPath,
        [ref]$tokens,
        [ref]$parseErrors
    )
    if ($parseErrors.Count -gt 0) {
        $messages = ($parseErrors | ForEach-Object { $_.Message }) -join "; "
        throw "PowerShell parse errors in ${relativePath}: $messages"
    }
}

$startLauncher = Get-Content -LiteralPath (Join-Path $repoRoot "start.cmd") -Raw
$stopLauncher = Get-Content -LiteralPath (Join-Path $repoRoot "stop.cmd") -Raw

if ($startLauncher -notmatch [regex]::Escape('%~dp0scripts\start.ps1')) {
    throw "start.cmd does not resolve scripts\start.ps1 relative to the repository root"
}
if ($stopLauncher -notmatch [regex]::Escape('%~dp0scripts\stop.ps1')) {
    throw "stop.cmd does not resolve scripts\stop.ps1 relative to the repository root"
}
if ($startLauncher -notmatch [regex]::Escape('-ExecutionPolicy Bypass')) {
    throw "start.cmd must use ExecutionPolicy Bypass"
}
if ($stopLauncher -notmatch [regex]::Escape('-ExecutionPolicy Bypass')) {
    throw "stop.cmd must use ExecutionPolicy Bypass"
}

$startScript = Get-Content -LiteralPath (Join-Path $repoRoot "scripts/start.ps1") -Raw
$stopScript = Get-Content -LiteralPath (Join-Path $repoRoot "scripts/stop.ps1") -Raw
$commonScript = Get-Content -LiteralPath (Join-Path $repoRoot "scripts/lib/Startup.Common.ps1") -Raw

foreach ($requiredFlag in @("SkipInstall", "NoBrowser", "ResetLogs")) {
    if ($startScript -notmatch "\[switch\]\s*\`$$requiredFlag") {
        throw "scripts/start.ps1 is missing -$requiredFlag"
    }
}
if ($startScript -notmatch "\[switch\]\s*\`$UseDocker") {
    throw "scripts/start.ps1 is missing -UseDocker"
}
if ($startScript -notmatch [regex]::Escape('$env:IMPORT_QUEUE_MODE = "local"')) {
    throw "Local startup must select the local import queue"
}
if ($startScript -notmatch 'Start-TrackedProcess\s+-Name\s+\$workerName') {
    throw "Startup must launch the selected import worker"
}
$dockerGuardIndex = $startScript.IndexOf('if ($UseDocker)')
$dockerLookupIndex = $startScript.IndexOf('Assert-CommandAvailable -Name "docker"')
if ($dockerGuardIndex -lt 0 -or $dockerLookupIndex -lt $dockerGuardIndex) {
    throw "Docker must only be required inside the -UseDocker branch"
}
if ($stopScript -notmatch "\[switch\]\s*\`$KeepInfrastructure") {
    throw "scripts/stop.ps1 is missing -KeepInfrastructure"
}
if ($stopScript -notmatch [regex]::Escape('startup-mode.txt')) {
    throw "Shutdown must read the recorded startup mode"
}
if ($stopScript -notmatch '\$startupMode\s+-eq\s+"docker"') {
    throw "Shutdown must stop infrastructure only for Docker mode"
}
if ($commonScript -notmatch "Start-Process[\s\S]*-WindowStyle\s+Hidden") {
    throw "Startup.Common.ps1 must start background processes with hidden windows"
}

. (Join-Path $repoRoot "scripts/lib/Startup.Common.ps1")
$pythonCommand = Get-Command "python" -ErrorAction Stop
if (Test-PythonImports -PythonCommand $pythonCommand.Source -Modules @("definitely_missing_101_pro_module")) {
    throw "Missing Python imports must return false"
}

Write-Host "One-click startup scripts passed static validation." -ForegroundColor Green
