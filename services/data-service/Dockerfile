# syntax=docker/dockerfile:1

# Multi-stage build for the Experts@SU data-service. The builder stage installs
# dependencies and runs tests; the runtime stage contains only the compiled
# application and its Python dependencies.

FROM python:3.11-slim AS builder
WORKDIR /app

# Do not write bytecode files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specification and install Python dependencies into the
# builder user's local site-packages. Installing into /root/.local keeps the
# global environment clean and makes copying easier in the next stage.
COPY requirements.txt requirements.txt
RUN pip install --user --no-cache-dir -r requirements.txt

# Copy source code into the image
COPY . .

# Run the unit tests during the build. Failing tests will prevent the
# image from building successfully, surfacing problems early.
RUN python -m pytest -q

# ---------------------------------------------------------------------------
# Runtime image
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy the installed site-packages from the builder stage. Because they
# were installed into /root/.local, we copy that directory and prepend it
# to the PATH so the executables (e.g. typer) are found.
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code and SQL migrations
COPY src src
COPY sql sql
COPY .env.example .env.example

# Default command executes the Typer CLI. Commands are passed via
# docker run arguments (e.g. `docker run ... collect`).
CMD ["python", "-m", "data_service.cli"]