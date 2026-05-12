-- 005_personal_post_columns.sql
-- Adds the LinkedIn Personal Profile content/approval/publish columns and
-- the per-post linkedin_company_approved flag used by the batch review UI.
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS linkedin_personal_content   TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_personal_approved  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_personal_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_personal_post_id   TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_personal_image_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_company_approved   BOOLEAN NOT NULL DEFAULT false;
