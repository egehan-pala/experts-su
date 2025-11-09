-- Indexes and triggers for the Experts@SU data-service

BEGIN;

-- Indexes on the publications table for year and citations
CREATE INDEX IF NOT EXISTS idx_publications_year ON publications (year);
CREATE INDEX IF NOT EXISTS idx_publications_citations ON publications (citations);

-- Full-text search configuration: update the tsv column from title and abstract
CREATE OR REPLACE FUNCTION publications_tsv_trigger() RETURNS trigger AS $$
BEGIN
    NEW.tsv := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(NEW.abstract, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS publications_tsv_update ON publications;
CREATE TRIGGER publications_tsv_update
BEFORE INSERT OR UPDATE ON publications
FOR EACH ROW EXECUTE FUNCTION publications_tsv_trigger();

-- GIN index on the tsv column for fast full-text search
CREATE INDEX IF NOT EXISTS idx_publications_tsv ON publications USING GIN (tsv);

COMMIT;