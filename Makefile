.PHONY: dev db backend frontend docker-up docker-down

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
