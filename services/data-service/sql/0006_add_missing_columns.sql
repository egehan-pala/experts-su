-- Add phone to authors and pdf_url to publications
BEGIN;

ALTER TABLE authors ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS pdf_url TEXT;

COMMIT;
