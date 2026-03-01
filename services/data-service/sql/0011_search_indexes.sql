-- Search-related indexes and tables
-- pg_trgm for fuzzy name search, faculty_aliases, faculty_chunks for embeddings

BEGIN;

-- ==========================================
-- 1. Enable pg_trgm extension for fuzzy matching
-- ==========================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================
-- 2. Normalized name column on authors
-- ==========================================
ALTER TABLE authors ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- Populate normalized_name from existing names (lowercase, stripped accents)
-- This will be maintained by the loader going forward
UPDATE authors SET normalized_name = LOWER(
    TRANSLATE(
        name,
        'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ',
        'AAAAAAACEEEEIIIIDNOOOOOOUUUUYPsaaaaaaceeeeiiiidnoooooouuuuybyAaAaAaCcCcCcCcDdDdEeEeEeEeEeGgGgGgGgHhHhIiIiIiIiIiIiJjKkkLlLlLlLlLlNnNnNnNnNOoOoOoOoRrRrRrSsSsSsSsTtTtTtUuUuUuUuUuUuWwYyYZzZzZzs'
    )
) WHERE normalized_name IS NULL;

-- btree index for exact/prefix lookups
CREATE INDEX IF NOT EXISTS idx_authors_normalized_name 
    ON authors(normalized_name);

-- Trigram index for fuzzy matching on display name
CREATE INDEX IF NOT EXISTS idx_authors_name_trgm 
    ON authors USING GIN (name gin_trgm_ops);

-- ==========================================
-- 3. Faculty aliases table
-- ==========================================
CREATE TABLE IF NOT EXISTS faculty_aliases (
    id SERIAL PRIMARY KEY,
    faculty_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    UNIQUE(faculty_id, alias)
);

-- Trigram index on aliases for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_aliases_trgm 
    ON faculty_aliases USING GIN (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_aliases_faculty 
    ON faculty_aliases(faculty_id);

-- ==========================================
-- 4. Chunk-level embeddings table
-- ==========================================
CREATE TABLE IF NOT EXISTS faculty_chunks (
    id SERIAL PRIMARY KEY,
    faculty_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,           -- 'publication', 'profile', 'topics'
    source_id TEXT,                      -- publication ID if applicable
    chunk_text TEXT NOT NULL,
    chunk_hash TEXT NOT NULL,            -- MD5 for dedup
    year INT,                           -- publication year (for recency boost)
    venue TEXT,                         -- publication venue
    publication_title TEXT,             -- for explanation snippets
    metadata_json JSONB,
    embedding vector(384),              -- 384 dimensions for MiniLM-L6-v2
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chunk_hash)
);

CREATE INDEX IF NOT EXISTS idx_chunks_faculty 
    ON faculty_chunks(faculty_id);

CREATE INDEX IF NOT EXISTS idx_chunks_source 
    ON faculty_chunks(source_type, source_id);

-- HNSW index for fast vector search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
    ON faculty_chunks USING hnsw (embedding vector_cosine_ops);

COMMIT;
