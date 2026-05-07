# Локальный Django (CLI Claude доступен из PATH хоста).
# Требуется: Python venv с зависимостями, поднятая infra (start-infra.ps1).

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
if (-not $env:DJANGO_ALLOWED_HOSTS) { $env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1" }
# Локальный запуск: по умолчанию генерация через Claude CLI на хосте (можно переопределить в .env.local).
if (-not $env:GENERATION_CLAUDE_MODE) { $env:GENERATION_CLAUDE_MODE = "cli" }
if (-not $env:GENERATION_CLI_STRICT) { $env:GENERATION_CLI_STRICT = "true" }

if (Test-Path ".venv\Scripts\Activate.ps1") {
    .\.venv\Scripts\Activate.ps1
}

python manage.py migrate
python manage.py runserver 127.0.0.1:8000
