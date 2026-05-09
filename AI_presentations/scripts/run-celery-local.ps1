# Локальный Celery worker (те же переменные, что и у Django).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$envFile = Join-Path (Get-Location) ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '\S') { return }
        $pair = $_ -split '=', 2
        if ($pair.Length -eq 2) {
            Set-Item -Path "Env:$($pair[0].Trim())" -Value $pair[1].Trim()
        }
    }
}

if (-not $env:POSTGRES_HOST) { $env:POSTGRES_HOST = "127.0.0.1" }
if (-not $env:POSTGRES_PORT) { $env:POSTGRES_PORT = "5432" }
if (-not $env:REDIS_URL) { $env:REDIS_URL = "redis://127.0.0.1:6379/0" }
if (-not $env:GENERATION_CLAUDE_MODE) { $env:GENERATION_CLAUDE_MODE = "cli" }
if (-not $env:GENERATION_CLI_STRICT) { $env:GENERATION_CLI_STRICT = "true" }

if (Test-Path ".venv\Scripts\Activate.ps1") {
    .\.venv\Scripts\Activate.ps1
}

celery -A slidegen worker -l info
