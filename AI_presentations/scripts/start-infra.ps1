# Запуск только Postgres + Redis (порты на localhost для локального Django/Celery).
Set-Location $PSScriptRoot\..

docker compose -f docker-compose.infra.yml up -d
$pp = if ($env:POSTGRES_PUBLISH_PORT) { $env:POSTGRES_PUBLISH_PORT } else { "5432" }
$rp = if ($env:REDIS_PUBLISH_PORT) { $env:REDIS_PUBLISH_PORT } else { "6379" }
Write-Host "Infra готова: Postgres на порту $pp, Redis на порту $rp" -ForegroundColor Green
