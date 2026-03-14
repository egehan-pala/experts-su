@echo off
SETLOCAL EnableDelayedExpansion

echo ===================================================
echo   Experts@SU - Quick Startup Script
echo ===================================================

:: 1. Check Requirements
echo [1/5] Checking Requirements...
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not installed or not in PATH.
    pause
    exit /b 1
)
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    pause
    exit /b 1
)
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)
echo Requirement checks passed.

:: 2. Setup Environment Files
echo [2/5] Setting up Environment Files...
if not exist "services\api-gateway\.env" (
    echo Creating .env for API Gateway...
    copy "services\api-gateway\.env.example" "services\api-gateway\.env" >nul
)
if not exist "services\data-service\.env" (
    echo Creating .env for Data Service...
    copy "services\data-service\.env.example" "services\data-service\.env" >nul
)
echo Environment files ready.

:: 3. Install Dependencies
echo [3/5] Installing Dependencies...
echo   - Installing API Gateway dependencies...
pushd services\api-gateway
python -m pip install -r requirements.txt >nul
popd

echo   - Installing Data Service dependencies...
pushd services\data-service
python -m pip install -r requirements.txt >nul
python -m pip install -e . >nul
popd

echo   - Installing Web Frontend dependencies (this may take a while)...
pushd services\web-frontend
call npm install --no-audit --no-fund >nul
popd
echo Dependencies installed.

:: 4. Start Database
echo [4/5] Starting Database (Docker)...
pushd infra\docker
docker-compose up -d db
popd
echo Database starting in background.

:: 5. Start Services
echo [5/5] Launching Services...
echo   - Starting Backend (API Gateway) in new window...
start "Experts@SU - Backend" cmd /k "pushd services\api-gateway && python -m uvicorn main:app --reload --port 8000"

echo   - Starting Frontend (Web) in new window...
start "Experts@SU - Frontend" cmd /k "pushd services\web-frontend && npm run dev"

echo ===================================================
echo   Startup Complete! 
echo   Backend: http://localhost:8000/docs
echo   Frontend: http://localhost:3000
echo ===================================================
pause
