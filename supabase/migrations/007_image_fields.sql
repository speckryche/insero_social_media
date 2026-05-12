-- 007_image_fields.sql
-- Adds the AI-generated text fields that drive branded image rendering.
-- Each post with has_image = true gets these populated from Claude's JSON
-- response: a headline, supporting body text, and an optional stat
-- number/label pair that the canvas templates render.
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS image_headline    TEXT,
  ADD COLUMN IF NOT EXISTS image_body        TEXT,
  ADD COLUMN IF NOT EXISTS image_stat_number TEXT,
  ADD COLUMN IF NOT EXISTS image_stat_label  TEXT;
