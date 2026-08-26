-- 014_banned_words_speck_isms.sql
-- Two editable lists on app_settings, both plain text with one entry per line
-- (same shape as content_notes):
--   banned_words — injected into the system prompt for EVERY category
--   speck_isms   — injected into the personal_take prompt only
--
-- Both are seeded with starting values. The UPDATE only fills rows that are
-- still empty, so re-running this will not overwrite edits made in Settings.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS banned_words TEXT DEFAULT '';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS speck_isms TEXT DEFAULT '';

UPDATE app_settings
SET banned_words = $seed$genuinely
honestly
leverage
delve
journey
game-changer
excited to announce
grateful
humbled$seed$
WHERE banned_words IS NULL OR banned_words = '';

UPDATE app_settings
SET speck_isms = $seed$gives nicknames to tools and people he likes ("my BFF Claude")
over-the-top praise for things that impress him ("simply Amazing!")
calls himself a dummy or non-coder affectionately when AI does something cool
one exclamation point when something made his day
slightly run-on, texting rhythm$seed$
WHERE speck_isms IS NULL OR speck_isms = '';
