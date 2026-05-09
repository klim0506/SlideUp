# Agents

## Cursor Cloud specific instructions

### Project overview

Slidegen (`AI_presentations/`) is an AI-powered presentation generator SaaS with a Django 5 + DRF backend and a React 18 + Vite + TypeScript frontend. See `AI_presentations/DEV_LOCAL.md` for full local setup instructions.

### Services

| Service | How to start | Port |
|---------|-------------|------|
| PostgreSQL 16 + Redis 7 | `docker compose -f AI_presentations/docker-compose.infra.yml up -d` | 5432, 6379 |
| Django backend | `source .venv/bin/activate && set -a && source .env.local && set +a && python manage.py runserver 0.0.0.0:8000` (from `AI_presentations/`) | 8000 |
| Celery worker | `source .venv/bin/activate && set -a && source .env.local && set +a && celery -A slidegen worker -l info` (from `AI_presentations/`) | — |
| Vite frontend | `npm run dev` (from `AI_presentations/frontend/`) | 5173 |

### Important caveats

- **Docker daemon** must be started manually: `sudo dockerd &>/tmp/dockerd.log &` — then fix socket permissions with `sudo chmod 666 /var/run/docker.sock`.
- **Environment variables**: source `AI_presentations/.env.local` before running Django/Celery (`set -a && source .env.local && set +a`). The `.env.local` is not auto-loaded by Django.
- **Migration conflicts**: the repo currently has conflicting migration branches in `apps.presentations`. Run `python manage.py makemigrations --merge --noinput` before `migrate` if you hit `Conflicting migrations detected`.
- **No automated tests** exist in the repo. Validation is via `python manage.py check`, `npx eslint .` (in `frontend/`), and `npx tsc -b` (in `frontend/`).
- **AI generation** requires either `ANTHROPIC_API_KEY` env var or the `claude` CLI binary in PATH. Without either, the backend starts fine but generation endpoints will fail.
- **Vite proxy**: the frontend dev server proxies `/api` requests to `http://127.0.0.1:8000` by default (configurable via `VITE_PROXY_TARGET`).
- **WeasyPrint** (PDF export) requires system libraries: `libcairo2`, `libpango-1.0-0`, `libpangocairo-1.0-0`, `libgdk-pixbuf-2.0-0`, `fonts-dejavu-core`. These are pre-installed in the Cloud VM snapshot.

### Lint / check commands

- **Backend**: `python manage.py check`
- **Frontend lint**: `cd AI_presentations/frontend && npx eslint .`
- **Frontend types**: `cd AI_presentations/frontend && npx tsc -b`
- **Frontend build**: `cd AI_presentations/frontend && npm run build`
