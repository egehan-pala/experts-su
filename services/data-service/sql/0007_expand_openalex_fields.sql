-- Add comprehensive OpenAlex data fields to preserve all information
-- Migration: 0007_expand_openalex_fields.sql

BEGIN;

-- ======================================
-- AUTHORS TABLE - Add OpenAlex fields
-- ======================================

-- Statistics from OpenAlex
ALTER TABLE authors ADD COLUMN IF NOT EXISTS works_count INT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS cited_by_count INT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS h_index INT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS i10_index INT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS two_yr_mean_citedness FLOAT;

-- Institution details
ALTER TABLE authors ADD COLUMN IF NOT EXISTS last_known_institution TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS last_known_institution_country TEXT;

-- JSON fields for complex nested data
ALTER TABLE authors ADD COLUMN IF NOT EXISTS affiliations_json JSONB;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS topics_json JSONB;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS counts_by_year_json JSONB;

-- Dates from OpenAlex
ALTER TABLE authors ADD COLUMN IF NOT EXISTS openalex_created_date TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS openalex_updated_date TEXT;


-- ======================================
-- PUBLICATIONS TABLE - Add OpenAlex fields
-- ======================================

-- Publication date (full date, not just year)
ALTER TABLE publications ADD COLUMN IF NOT EXISTS publication_date TEXT;

-- Type information
ALTER TABLE publications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS type_crossref TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS is_oa BOOLEAN;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS is_retracted BOOLEAN;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS language TEXT;

-- Venue/Source details
ALTER TABLE publications ADD COLUMN IF NOT EXISTS venue_id TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS venue_issn TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS venue_type TEXT;

-- Bibliographic info
ALTER TABLE publications ADD COLUMN IF NOT EXISTS volume TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS issue TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS first_page TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS last_page TEXT;

-- URLs
ALTER TABLE publications ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS landing_page_url TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS oa_url TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS license TEXT;

-- Topics and concepts
ALTER TABLE publications ADD COLUMN IF NOT EXISTS primary_topic TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS topics_json JSONB;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS concepts_json JSONB;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS keywords_json JSONB;

-- Authorships (preserves full coauthor details)
ALTER TABLE publications ADD COLUMN IF NOT EXISTS authorships_json JSONB;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS author_count INT;

-- References
ALTER TABLE publications ADD COLUMN IF NOT EXISTS referenced_works_count INT;

-- Counts by year
ALTER TABLE publications ADD COLUMN IF NOT EXISTS counts_by_year_json JSONB;

-- Grants
ALTER TABLE publications ADD COLUMN IF NOT EXISTS grants_json JSONB;

-- Dates from OpenAlex
ALTER TABLE publications ADD COLUMN IF NOT EXISTS openalex_created_date TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS openalex_updated_date TEXT;


-- ======================================
-- TOPICS TABLE - Add more details
-- ======================================

ALTER TABLE topics ADD COLUMN IF NOT EXISTS openalex_id TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS level INT;


-- ======================================
-- PUBLICATION_TOPICS - Add score
-- ======================================

ALTER TABLE publication_topics ADD COLUMN IF NOT EXISTS topic_openalex_id TEXT;
ALTER TABLE publication_topics ADD COLUMN IF NOT EXISTS score FLOAT;


-- ======================================
-- AUTHOR_PUBLICATIONS - Add authorship details
-- ======================================

ALTER TABLE author_publications ADD COLUMN IF NOT EXISTS author_position TEXT;
ALTER TABLE author_publications ADD COLUMN IF NOT EXISTS is_corresponding BOOLEAN;
ALTER TABLE author_publications ADD COLUMN IF NOT EXISTS raw_affiliation TEXT;


-- ======================================
-- INDEXES for new fields
-- ======================================

CREATE INDEX IF NOT EXISTS idx_authors_h_index ON authors(h_index DESC);
CREATE INDEX IF NOT EXISTS idx_authors_works_count ON authors(works_count DESC);
CREATE INDEX IF NOT EXISTS idx_authors_cited_by_count ON authors(cited_by_count DESC);

CREATE INDEX IF NOT EXISTS idx_publications_type ON publications(type);
CREATE INDEX IF NOT EXISTS idx_publications_is_oa ON publications(is_oa);
CREATE INDEX IF NOT EXISTS idx_publications_language ON publications(language);

-- GIN indexes for JSONB columns for fast querying
CREATE INDEX IF NOT EXISTS idx_publications_authorships ON publications USING GIN(authorships_json);
CREATE INDEX IF NOT EXISTS idx_publications_topics ON publications USING GIN(topics_json);
CREATE INDEX IF NOT EXISTS idx_authors_affiliations ON authors USING GIN(affiliations_json);

COMMIT;
