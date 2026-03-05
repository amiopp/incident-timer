# PCC Incident Timer (MVP)

## Architecture (brief)
- **Backend:** FastAPI + SQLAlchemy + Alembic
- **Frontend:** React + TypeScript + Vite
- **Database:** PostgreSQL
- **Realtime:** FastAPI WebSocket broadcast (`/ws`) with frontend fallback polling every 5s
- **Timer source of truth:** `started_at` generated on backend (UTC)

## Features covered
- Create incident quickly (`message` required, max 500 chars)
- Active incidents start **ORANGE** immediately
- Incident turns **RED** at elapsed `>= 15:00`
- Resolve incident with `resolved_at`, `duration_seconds`
- Dashboard shows:
  - 1 active incident full-screen
  - 2 active incidents split 50/50
  - if >2 active, show only 2 most recent + `+N more`
- History table with filters (`status`, `from`, `to`) sorted by `started_at desc`

## Project structure

```text
.
├─ backend/
│  ├─ app/
│  │  ├─ __init__.py
│  │  ├─ config.py
│  │  ├─ database.py
│  │  ├─ main.py
│  │  ├─ models.py
│  │  ├─ schemas.py
│  │  ├─ services.py
│  │  └─ websocket_manager.py
│  ├─ alembic/
│  │  ├─ env.py
│  │  ├─ script.py.mako
│  │  └─ versions/
│  │     └─ 0001_create_incidents.py
│  ├─ alembic.ini
│  ├─ Dockerfile
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ src/
│  │  ├─ pages/
│  │  │  ├─ DashboardPage.tsx
│  │  │  └─ HistoryPage.tsx
│  │  ├─ api.ts
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  │  ├─ styles.css
│  │  ├─ time.ts
│  │  └─ types.ts
│  ├─ index.html
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ tsconfig.node.json
│  ├─ vite.config.ts
│  └─ .env.example
├─ docker-compose.yml
└─ README.md
```

## API

### REST
- `POST /api/incidents` body `{ "message": "..." }`
- `GET /api/incidents/active`
- `POST /api/incidents/{id}/resolve`
- `GET /api/incidents/history?status=&from=&to=&limit=&offset=`

### WebSocket
- `WS /ws`
- Broadcast events:
  - `incident_created` payload `{ incident }`
  - `incident_resolved` payload `{ incident }`

## Database schema
Table: `incidents`
- `id` bigint PK
- `message` text
- `status` enum: `ACTIVE | RESOLVED`
- `started_at` timestamptz
- `resolved_at` timestamptz nullable
- `duration_seconds` int nullable
- `max_level_reached` enum: `ORANGE | RED | GREEN`
- `created_at` timestamptz

## Run locally (without Docker)

### 1) Start PostgreSQL
Use your local PostgreSQL instance and create DB:

```sql
CREATE DATABASE pcc_incident_timer;
```

### 2) Backend
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 3) Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open: `http://localhost:5173`

## Run with Docker Compose

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

## Notes
- Backend stores timestamps in UTC-aware fields.
- Frontend timer uses backend `started_at` as source of truth.
- Backend enforces RED level for overdue active incidents during reads/resolution.
