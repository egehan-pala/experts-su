#!/bin/bash

# ===================================================
#   Experts@SU - Quick Startup Script (macOS/Linux)
# ===================================================

# 1. Check Requirements
echo "[1/5] Checking Requirements..."
command -v docker >/dev/null 2>&1 || { echo "[ERROR] Docker is not installed. Aborting." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[ERROR] Python3 is not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[ERROR] npm is not installed. Aborting." >&2; exit 1; }
echo "Requirement checks passed."

# 2. Setup Environment Files
echo "[2/5] Setting up Environment Files..."
if [ ! -f "services/api-gateway/.env" ]; then
    echo "Creating .env for API Gateway..."
    cp "services/api-gateway/.env.example" "services/api-gateway/.env"
fi
if [ ! -f "services/data-service/.env" ]; then
    echo "Creating .env for Data Service..."
    cp "services/data-service/.env.example" "services/data-service/.env"
fi
echo "Environment files ready."

# 3. Install Dependencies
echo "[3/5] Installing Dependencies..."
echo "  - Installing API Gateway dependencies..."
cd services/api-gateway && python3 -m pip install -r requirements.txt
cd ../..

echo "  - Installing Data Service dependencies..."
cd services/data-service && python3 -m pip install -r requirements.txt && python3 -m pip install -e .
cd ../..

echo "  - Installing Web Frontend dependencies..."
cd services/web-frontend && npm install
cd ../..
echo "Dependencies installed."

# 4. Start Database
echo "[4/5] Starting Database (Docker)..."
cd infra/docker && docker-compose up -d db
cd ../..
echo "Database starting in background."

# 5. Start Services
echo "[5/5] Launching Services..."

# macOS specific: Use AppleScript to open new terminal windows
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  - Starting Backend (API Gateway) in new window..."
    osascript -e 'tell application "Terminal" to do script "cd \"'$(pwd)'/services/api-gateway\" && python3 -m uvicorn main:app --reload --port 8000"'

    echo "  - Starting Frontend (Web) in new window..."
    osascript -e 'tell application "Terminal" to do script "cd \"'$(pwd)'/services/web-frontend\" && npm run dev"'
else
    # Linux or other: Simple background processes (user might need to check logs)
    echo "  - Starting Backend and Frontend in background (Linux detected)..."
    (cd services/api-gateway && python3 -m uvicorn main:app --reload --port 8000) &
    (cd services/web-frontend && npm run dev) &
fi

echo "==================================================="
echo "  Startup Complete!" 
echo "  Backend: http://localhost:8000/docs"
echo "  Frontend: http://localhost:3000"
echo "==================================================="
