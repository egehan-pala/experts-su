# Experts@SU

A research expert discovery platform for Sabancı University. Browse faculty members, explore co-authorship networks, citation impact maps, SDG contributions, and semantic search across all published research.

## Architecture

```
experts-su/
├── services/
│   ├── api-gateway/        # FastAPI backend (port 8000)
│   ├── web-frontend/       # Next.js frontend (port 3000)
│   ├── data-service/       # ETL pipeline + SQL migrations
│   ├── embedding-service/  # Vector embeddings for semantic search
│   ├── search-service/     # Search query processing
│   └── viz-service/        # Visualization data endpoints
├── infra/
│   └── docker/             # Docker Compose + init scripts
├── scripts/                # Utility scripts
└── Makefile                # Build & run commands
```

| Service | Tech | Port |
|---------|------|------|
| Database | PostgreSQL 15 + pgvector | 5432 |
| API Gateway | Python / FastAPI | 8000 |
| Frontend | Next.js 15 (React 19) | 3000 |

---

## Quick Start (Docker) — Recommended

Run the entire stack with a single command. Works on **Windows, macOS, and Linux**.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### Run

```bash
# Clone the repository
git clone <repo-url>
cd experts-su

# Start all services (db, migrations, api, frontend)
make docker-up
```

This will:
1. Start a PostgreSQL database with pgvector
2. Run all SQL migrations and seed data
3. Build and start the FastAPI API gateway
4. Build and start the Next.js frontend

Once ready, open:
- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **API:** [http://localhost:8000](http://localhost:8000)

### Stop

```bash
make docker-down
```

> **Note:** Database data persists in a Docker volume (`db_data`). To fully reset, run:
> ```bash
> docker compose -f infra/docker/docker-compose.yml down -v
> ```

---

## Local Development (without full Docker)

For faster iteration during development, run the database in Docker and the app services natively.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the database)
- [Python 3.11+](https://www.python.org/)
- [Node.js 20+](https://nodejs.org/) and npm

### 1. Set up environment variables

```bash
# API Gateway
cp services/data-service/.env.example services/api-gateway/.env
# Edit services/api-gateway/.env if needed (defaults work with the Docker db)
```

### 2. Install dependencies

```bash
# Backend
cd services/api-gateway
pip install -r requirements.txt
cd ../..

# Frontend
cd services/web-frontend
npm install --legacy-peer-deps
cd ../..
```

### 3. Start everything

```bash
make dev
```

This starts the database (Docker), API gateway, and frontend concurrently. Press `Ctrl+C` to stop all.

You can also start services individually:

```bash
make db         # Database only
make backend    # API gateway only
make frontend   # Frontend only
```

### 4. Run database migrations

```bash
cd services/data-service
python sql/migrate.py
```

---

## Environment Variables

### API Gateway (`services/api-gateway/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `experts_su` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `password` | Database password |

### Frontend (`services/web-frontend`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API base URL (set automatically in Docker) |

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services locally (db in Docker, app natively) |
| `make docker-up` | Start everything in Docker containers |
| `make docker-down` | Stop all Docker containers |
| `make db` | Start only the database |
| `make backend` | Start only the API gateway |
| `make frontend` | Start only the frontend |
