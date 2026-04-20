#!/usr/bin/env bash
# ------------------------------------------------------------------
# init.sh – Run database migrations and seed data.
# Executed as a one-shot init container before the API gateway starts.
# ------------------------------------------------------------------
set -euo pipefail

echo "=== [init] Running SQL migrations ==="
cd /app/data-service
python3 sql/migrate.py

echo "=== [init] Seeding news feeds ==="
cd /app/api-gateway
python3 seed_news_feeds.py

echo "=== [init] Done ==="
