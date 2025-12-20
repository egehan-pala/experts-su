.PHONY: dev db backend frontend

# Start all services
dev:
	@echo "Starting Experts@SU development environment..."
	@# Trap SIGINT (Ctrl+C) to kill all background processes
	@(trap 'kill 0' SIGINT; \
	echo "[1/3] Starting Database..."; \
	cd infra/docker && docker-compose up -d db; \
	echo "[2/3] Starting Backend (API Gateway)..."; \
	cd services/api-gateway && uvicorn main:app --reload --port 8000 & \
	echo "[3/3] Starting Frontend..."; \
	cd services/web-frontend && npm run dev & \
	wait)

# Individual tasks if needed
db:
	cd infra/docker && docker-compose up -d db

backend:
	cd services/api-gateway && uvicorn main:app --reload --port 8000

frontend:
	cd services/web-frontend && npm run dev
