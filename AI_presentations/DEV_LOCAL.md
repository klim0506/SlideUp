# Локальный бэкенд (CLI на хосте)

Бэкенд и Celery запускаются на вашей машине, чтобы в PATH был `claude` и другие локальные утилиты. PostgreSQL и Redis по желанию остаются в Docker.

## 1. Инфраструктура в Docker

Из каталога `AI_presentations`:

```powershell
.\scripts\start-infra.ps1
```

Или вручную: `docker compose -f docker-compose.infra.yml up -d`

Порты по умолчанию: Postgres **5432**, Redis **6379**. Если занято — задайте `POSTGRES_PUBLISH_PORT` / `REDIS_PUBLISH_PORT` перед запуском compose.

Остановка: `docker compose -f docker-compose.infra.yml down`

## 2. Python и зависимости

```powershell
cd AI_presentations
.\scripts\new-venv.ps1
```

Если WeasyPrint ругается на GTK/Cairo под Windows — см. [документацию WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#windows) или ставьте зависимости через MSYS2/GTK.

## 3. Переменные окружения

Скопируйте `env.local.example` в `.env.local` и поправьте секреты. Скрипты `run-backend-local.ps1` и `run-celery-local.ps1` подхватят `.env.local` автоматически.

Важно для связи с контейнерами: `POSTGRES_HOST=127.0.0.1`, `REDIS_URL=redis://127.0.0.1:6379/0` (как в примере).

## 4. Запуск

Три терминала из `AI_presentations`:

1. Уже поднята infra (шаг 1).
2. `.\scripts\run-backend-local.ps1` — Django на `http://127.0.0.1:8000`.
3. `.\scripts\run-celery-local.ps1` — воркер очередей.

Фронт локально (прокси на бэкенд по умолчанию):

```powershell
cd frontend
npm install
npm run dev
```

Откройте `http://localhost:5173`.

## Режим генерации Claude

В админке можно выставить **Generation settings → Claude mode = CLI**, но для локального запуска удобнее переменные окружения (перекрывают админку):

- `GENERATION_CLAUDE_MODE=cli` — всегда вызывать бинарник на машине (`claude -p` и т.д.).
- `GENERATION_CLI_STRICT=true` — **не** переключаться на Anthropic API, если CLI не найден (иначе при наличии `ANTHROPIC_API_KEY` будет тихий fallback).

В `env.local.example` это уже прописано; скрипты `run-backend-local.ps1` / `run-celery-local.ps1` задают те же значения по умолчанию, если переменные не заданы.

Убедитесь, что в терминале, откуда запускаете Django, команда `claude` доступна (`where claude` в PowerShell).

## Полный стек в Docker

Прежний вариант без изменений: `docker compose up` в каталоге `AI_presentations` (бэкенд внутри образа, без вашего локального CLI).
