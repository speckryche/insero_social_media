-- Add content notes field for AI generation guidance
-- Run this in the Supabase SQL Editor

ALTER TABLE app_settings ADD COLUMN content_notes TEXT DEFAULT '';
