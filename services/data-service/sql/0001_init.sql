-- Initial schema for the Experts@SU data-service

BEGIN;

-- Core tables

CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    orcid TEXT,
    name TEXT NOT NULL,
    dept TEXT,
    email TEXT,
    ror_id TEXT,
    is_faculty BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publications (
    id TEXT PRIMARY KEY,
    doi TEXT,
    title TEXT,
    abstract TEXT,
    year INT,
    venue TEXT,
    citations INT DEFAULT 0,
    tsv tsvector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS author_publications (
    author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
    publication_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
    PRIMARY KEY (author_id, publication_id)
);

CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_topics (
    publication_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
    topic_id INT REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (publication_id, topic_id)
);

-- Co-author network table
CREATE TABLE IF NOT EXISTS coauthor_edges (
    author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    coauthor_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    edge_weight INT NOT NULL,
    PRIMARY KEY (author_id, coauthor_id)
);

-- Author metrics table (if materialized view isn't used)
CREATE TABLE IF NOT EXISTS author_metrics_yearly (
    author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    year INT NOT NULL,
    pub_count INT NOT NULL,
    citations_year INT NOT NULL,
    PRIMARY KEY (author_id, year)
);

COMMIT;