# Makefile for the Experts@SU data-service. Provides shortcuts for common
# development tasks such as installing dependencies, running tests,
# executing migrations and running ETL commands.

.PHONY: setup lint format test migrate run-collect run-full

# Install Python dependencies into the current environment.
setup:
	python3 -m pip install --upgrade pip
	python3 -m pip install -r requirements.txt

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
	python sql/migrate.py

# Run the collection phase of the ETL pipeline. Accepts an optional
# SINCE argument to restrict the date range.
run-collect:
	python -m data_service.cli collect

# Run a full ETL pipeline: collect, clean and load. Accepts an
# optional SINCE argument.
run-full:
	python -m data_service.cli full-run