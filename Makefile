.PHONY: dev db backend frontend docker-up docker-down data-refresh data-reset

# Start all services
dev:
	@echo "Starting Experts@SU development environment..."
	@# Trap SIGINT (Ctrl+C) to kill all background processes
	@(trap 'kill 0' SIGINT; \
	echo "[1/3] Starting Database..."; \
	(cd infra/docker && docker-compose up -d db); \
	echo "[2/3] Starting Backend (API Gateway)..."; \
	$(MAKE) -C services/api-gateway dev & \
	echo "[3/3] Starting Frontend..."; \
	$(MAKE) -C services/web-frontend dev & \
	wait)

# Individual tasks
db:
	cd infra/docker && docker-compose up -d db

backend:
	$(MAKE) -C services/api-gateway dev

frontend:
	$(MAKE) -C services/web-frontend dev

# Docker: run everything in containers
docker-up:
	docker compose -f infra/docker/docker-compose.yml up --build

docker-down:
	docker compose -f infra/docker/docker-compose.yml down

# ─────────────────────────────────────────────────────────────────
# Weekly data refresh  (run MANUALLY – separate from docker-up)
#
#   make data-refresh   → fetch fresh data from OpenAlex into the
#                          existing DB, then rebuild embeddings.
#                          Safe to run while the app is live.
#
#   make data-reset     → DANGER: wipe the DB volume first, then
#                          run a full fresh ingest. Use this when
#                          you want a completely clean slate.
# ─────────────────────────────────────────────────────────────────
data-refresh:
	@echo "▶ Starting ETL data refresh pipeline..."
	@echo "  (This runs separately from the application – DB volume is shared)"
	docker compose -f infra/docker/docker-compose.etl.yml build
	docker compose -f infra/docker/docker-compose.etl.yml up -d db
	docker compose -f infra/docker/docker-compose.etl.yml run --rm migrate
	docker compose -f infra/docker/docker-compose.etl.yml run --rm data-pipeline
	docker compose -f infra/docker/docker-compose.etl.yml down

data-reset:
	@echo "⚠  WARNING: This will DELETE all existing data and re-ingest from scratch."
	@echo "   Press Ctrl+C within 5 seconds to abort..."
	@sleep 5
	@echo "▶ Stopping application containers..."
	-docker compose -f infra/docker/docker-compose.yml down
	@echo "▶ Removing DB volume..."
	docker volume rm docker_db_data || true
	@echo "▶ Running full ETL pipeline on empty DB..."
	docker compose -f infra/docker/docker-compose.etl.yml build
	docker compose -f infra/docker/docker-compose.etl.yml up -d db
	docker compose -f infra/docker/docker-compose.etl.yml run --rm migrate
	docker compose -f infra/docker/docker-compose.etl.yml run --rm data-pipeline
	docker compose -f infra/docker/docker-compose.etl.yml down
	@echo "✅ Data reset complete. Run 'make docker-up' to start the application."
