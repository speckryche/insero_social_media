-- 015_enabled_platforms.sql
-- Adds app_settings.enabled_platforms — which publishing platforms are switched
-- on. Defaults to LinkedIn only.
--
-- This is a toggle, not a removal: every publisher, prompt rule, and UI panel
-- for X / Facebook / Google still exists. A platform that is not in this list
-- is skipped at generation, hidden in review, and not published to.
--
-- LinkedIn is always treated as enabled by the app regardless of what is
-- stored here, so it cannot be switched off by accident.
--
-- The UPDATE only fills rows that are still empty, so re-running this will not
-- overwrite choices made in Settings.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS enabled_platforms JSONB DEFAULT '["linkedin"]'::jsonb;

UPDATE app_settings
SET enabled_platforms = '["linkedin"]'::jsonb
WHERE enabled_platforms IS NULL;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_enabled_platforms_check;

ALTER TABLE app_settings ADD CONSTRAINT app_settings_enabled_platforms_check
  CHECK (enabled_platforms IS NULL OR jsonb_typeof(enabled_platforms) = 'array');
