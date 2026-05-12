-- 006_per_platform_image_columns.sql
-- Adds per-platform image URL columns on posts. The image generator renders
-- a separate PNG per platform (different aspect ratios per LinkedIn, X,
-- Facebook, and Google Business) and writes the public Supabase Storage
-- URL into the matching column here.
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS linkedin_image_url TEXT,
  ADD COLUMN IF NOT EXISTS x_image_url        TEXT,
  ADD COLUMN IF NOT EXISTS facebook_image_url TEXT,
  ADD COLUMN IF NOT EXISTS google_image_url   TEXT;
