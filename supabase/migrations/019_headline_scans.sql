-- 019_headline_scans.sql
-- Supports the "Scan headlines" step before batch generation.
--
-- 1. headline_scans stores one scan: everything the web search returned
--    (items) and the subset the user ticked in the dialog (picked). Only
--    picked items ever reach a prompt.
--
-- 2. posts.headline_* tags a post with the story it referenced, so batch
--    review can link straight to the source.
--
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS headline_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  -- Everything the scan found, across all three feeds.
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The subset the user picked. Stays [] until they tick something.
  picked JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS headline_scans_month_year_idx
  ON headline_scans (year, month, created_at DESC);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS headline_source_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS headline_text TEXT;
