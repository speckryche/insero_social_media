-- 017_style_samples.sql
-- Adds app_settings.style_samples — recent personal posts Speck wrote or
-- rewrote himself, one per line (same shape as banned_words / speck_isms).
--
-- Injected into the personal_take prompt only, as a rhythm and word-choice
-- reference. The app caps the list at the 40 most recent entries and dedupes
-- on write, so it does not grow without bound.
--
-- Starts empty: entries are added from the "Learn from my edits" dialog, or
-- typed directly in Settings.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS style_samples TEXT DEFAULT '';

UPDATE app_settings
SET style_samples = ''
WHERE style_samples IS NULL;
