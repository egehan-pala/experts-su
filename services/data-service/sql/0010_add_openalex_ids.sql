-- Add openalex_ids_json column to authors table
-- Stores all matched OpenAlex author IDs when multiple OA profiles
-- map to the same faculty member (e.g. Ayhan Bozkurt has 3 IDs)
ALTER TABLE authors ADD COLUMN IF NOT EXISTS openalex_ids_json TEXT;
