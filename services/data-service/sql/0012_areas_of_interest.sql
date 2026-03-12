-- Migration: 0012_areas_of_interest.sql
-- Add areas_of_interest column to authors table

BEGIN;

ALTER TABLE authors ADD COLUMN IF NOT EXISTS areas_of_interest TEXT;

COMMIT;
