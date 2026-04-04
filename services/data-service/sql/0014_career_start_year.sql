-- Add career_start_year to authors (nullable — only populated when ORCID is available)
ALTER TABLE authors
    ADD COLUMN IF NOT EXISTS career_start_year INT;
