-- Staging tables for the Experts@SU data-service

BEGIN;

CREATE TABLE IF NOT EXISTS stg_authors (
    source_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS stg_publications (
    source_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS stg_author_publications (
    source_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS etl_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

COMMIT;