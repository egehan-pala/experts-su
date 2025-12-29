-- Add image_url column to authors table
ALTER TABLE authors ADD COLUMN IF NOT EXISTS image_url TEXT;
