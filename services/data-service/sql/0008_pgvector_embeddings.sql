-- Migration: Add pgvector extension for semantic search
-- This enables vector similarity search for finding experts by subject

-- Enable pgvector extension (requires pgvector-enabled PostgreSQL image)
CREATE EXTENSION IF NOT EXISTS vector;

-- Store precomputed author expertise embeddings
-- Each author gets one embedding representing their combined expertise
CREATE TABLE IF NOT EXISTS author_embeddings (
    author_id TEXT PRIMARY KEY REFERENCES authors(id) ON DELETE CASCADE,
    expertise_text TEXT,                    -- Source text used to generate embedding
    embedding vector(384),                  -- 384 dimensions for all-MiniLM-L6-v2 model
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create HNSW index for fast approximate nearest neighbor search
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for queries
CREATE INDEX IF NOT EXISTS author_embeddings_hnsw_idx 
ON author_embeddings USING hnsw (embedding vector_cosine_ops);

-- Add comment for documentation
COMMENT ON TABLE author_embeddings IS 'Precomputed vector embeddings for semantic expert search';
COMMENT ON COLUMN author_embeddings.embedding IS '384-dim embedding from all-MiniLM-L6-v2 sentence transformer';
