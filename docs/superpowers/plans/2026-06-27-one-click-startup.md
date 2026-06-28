# One-Click Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add double-click Windows commands that install missing dependencies and safely start or stop the complete local 101 Pro stack.

**Architecture:** Thin CMD launchers call PowerShell orchestration scripts. A shared PowerShell library owns prerequisite checks, PID records, port probing, logging, and process startup so start and stop use the same ownership rules. A standalone validation script parses every PowerShell file and checks launcher wiring without starting infrastructure.

**Tech Stack:** Windows CMD, PowerShell 5.1-compatible syntax, Docker Compose, Python, npm, JSON PID metadata.

---

### Task 1: Static Validation Harness

**Files:**
- Create: `scripts/Test-OneClickScripts.ps1`

- [ ] **Step 1: Write the failing validation script**

Create a script that requires `start.cmd`, `stop.cmd`, `scripts/start.ps1`, `scripts/stop.ps1`, and `scripts/lib/Startup.Common.ps1`; parses each PowerShell file with `System.Management.Automation.Language.Parser`; and verifies the CMD launchers contain `%~dp0scripts\start.ps1` or `%~dp0scripts\stop.ps1` plus `-ExecutionPolicy Bypass`.

```powershell
$requiredFiles = @(
    "start.cmd",
    "stop.cmd",
    "scripts/start.ps1",
    "scripts/stop.ps1",
    "scripts/lib/Startup.Common.ps1"
)

foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath))) {
        throw "Missing required file: $relativePath"
    }
}
```

- [ ] **Step 2: Run validation to verify it fails**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1`

Expected: nonzero exit with `Missing required file: start.cmd`.

- [ ] **Step 3: Commit the failing harness**

```powershell
git add scripts/Test-OneClickScripts.ps1
git commit -m "test: add startup script validation"
```

### Task 2: Shared Startup Utilities And Launchers

**Files:**
- Create: `scripts/lib/Startup.Common.ps1`
- Create: `start.cmd`
- Create: `stop.cmd`
- Modify: `.gitignore`

- [ ] **Step 1: Implement shared utilities**

Provide these functions with terminating errors and PowerShell 5.1-compatible types:

```powershell
function Assert-CommandAvailable([string]$Name, [string]$InstallHint)
function Assert-MinimumVersion([string]$Command, [version]$Minimum, [string[]]$VersionArguments)
function Test-TcpPort([string]$HostName, [int]$Port)
function Wait-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds)
function Test-HttpEndpoint([string]$Url)
function Wait-HttpEndpoint([string]$Url, [int]$TimeoutSeconds)
function Get-TrackedProcesses([string]$PidFile)
function Save-TrackedProcesses([string]$PidFile, [object[]]$Processes)
function Start-TrackedProcess([string]$Name, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory, [string]$LogDirectory)
function Test-TrackedProcess([object]$Record)
function Test-PortAvailableForProject([int]$Port, [object[]]$Records, [string]$ExpectedName)
```

`Start-TrackedProcess` uses `Start-Process -WindowStyle Hidden -PassThru` and separate `<name>.out.log` and `<name>.err.log` files. PID records contain `name`, `pid`, `started_at`, and `working_directory`.

- [ ] **Step 2: Add double-click wrappers**

`start.cmd` and `stop.cmd` resolve scripts with `%~dp0`, pass through arguments, preserve the exit code, and pause only on failure.

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
```

- [ ] **Step 3: Ignore generated runtime state**

Add `.run/`, `backend/.env`, `frontend/node_modules/`, `frontend/dist/`, and `node_modules/` to `.gitignore`.

- [ ] **Step 4: Run validation**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1`

Expected: failure now identifies missing `scripts/start.ps1`.

- [ ] **Step 5: Commit utilities and launchers**

```powershell
git add .gitignore start.cmd stop.cmd scripts/lib/Startup.Common.ps1
git commit -m "feat: add startup process utilities"
```

### Task 3: Start And Stop Orchestration

**Files:**
- Create: `scripts/start.ps1`
- Create: `scripts/stop.ps1`

- [ ] **Step 1: Implement start orchestration**

Add parameters `-SkipInstall`, `-NoBrowser`, and `-ResetLogs`. The script must:

```powershell
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$ResetLogs
)
```

Resolve the repository root, check Docker/Python/Node/npm versions, create `.run/logs`, preserve an existing `backend/.env`, hash dependency manifests into `.run/backend-deps.sha256` and `.run/frontend-deps.sha256`, start Compose services, wait for ports `5432` and `6379`, run `python -m alembic upgrade head`, then start FastAPI, Celery, and Vite through `Start-TrackedProcess`. Wait for `http://127.0.0.1:8000/api/health` and `http://127.0.0.1:5173`, persist `.run/pids.json`, print URLs, and open the frontend unless disabled.

On failure, stop only processes created in this invocation, stop Compose services only if this invocation started them, print log paths, and exit `1`.

- [ ] **Step 2: Implement stop orchestration**

Add parameter `-KeepInfrastructure`. Load `.run/pids.json`, validate each PID and start timestamp before calling `Stop-Process`, remove the PID file, and run `docker compose stop postgres redis` unless infrastructure should remain running.

```powershell
param([switch]$KeepInfrastructure)
```

- [ ] **Step 3: Run static validation**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1`

Expected: `One-click startup scripts passed static validation.`

- [ ] **Step 4: Verify safe prerequisite failure**

Run in the current environment: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -SkipInstall -NoBrowser`

Expected when Docker is absent: nonzero exit containing `Required command 'docker' was not found`, with no `.run/pids.json` and no application listeners created.

- [ ] **Step 5: Commit orchestration**

```powershell
git add scripts/start.ps1 scripts/stop.ps1
git commit -m "feat: add one-click project orchestration"
```

### Task 4: Documentation And Regression Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document one-click usage**

Add a `One-Click Start On Windows` section describing `start.cmd`, `stop.cmd`, generated `.run/logs`, first-run installation, required Docker Desktop, and PowerShell flags.

- [ ] **Step 2: Run script validation**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1`

Expected: pass.

- [ ] **Step 3: Run application regression tests**

Run backend: `cd backend; pytest -q`

Expected: all runnable backend tests pass.

Run frontend: `cd frontend; npm test`

Expected: all frontend tests pass when dependencies are available; otherwise use the verified temporary dependency mirror procedure and report the workspace restriction.

- [ ] **Step 4: Check repository state and commit**

Run: `git diff --check`

Expected: no whitespace errors.

```powershell
git add README.md scripts/Test-OneClickScripts.ps1
git commit -m "docs: add one-click startup instructions"
```

## Self-Review

- Spec coverage: launchers, dependency installation, Compose, migrations, three app processes, PID ownership, logs, health checks, flags, browser opening, and stop behavior are each assigned to a task.
- Placeholder scan: no deferred implementation markers remain.
- Type consistency: PID record fields and function names are consistent across start, stop, and validation tasks.
