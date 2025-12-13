# Makefile for the Experts@SU data-service. Provides shortcuts for common
# development tasks such as installing dependencies, running tests,
# executing migrations and running ETL commands.

.PHONY: setup lint format test migrate run-collect test-api collect-all collect-filtered collect-strict full-run full-run-since full-run-filtered full-run-strict

# Install Python dependencies into the current environment.
setup:
	python3 -m pip install --upgrade pip
	python3 -m pip install -r requirements.txt
	python3 -m pip install -e .

# Run code linters. Ruff is used for static analysis and Black for
# code formatting; both run in check mode.
lint:
	ruff src tests
	black --check src tests

# Autoformat the codebase using Black. This modifies files in-place.
format:
	black src tests

# Run the unit tests.
test:
	pytest -q

# Apply SQL migrations to the database. Requires the DB_* environment
# variables to be set.
migrate:
	python3 sql/migrate.py

# Run the collection phase of the ETL pipeline. Accepts an optional
# SINCE argument to restrict the date range.
run-collect:
	python3 -m data_service.cli collect

# Test OpenAlex API without database connection
test-api:
	python3 -m data_service.cli test-api

# Collect ALL authors from OpenAlex without database
collect-all:
	python3 -m data_service.cli collect-all

# Collect with moderate filter: only researchers with 50+ citations
collect-filtered:
	python3 -m data_service.cli collect-all --min-citations 50

# Collect with strict filter: only established researchers
collect-strict:
	python3 -m data_service.cli collect-all --min-citations 100 --min-h-index 5

# Full run: fetch, clean, filter by date, save locally
# This is the production workflow you'll use after development
full-run:
	python3 -m data_service.cli full-run
