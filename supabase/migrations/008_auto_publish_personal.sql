-- 008_auto_publish_personal.sql
-- Adds the global toggle controlling whether the cron publisher also pushes
-- approved LinkedIn Personal posts automatically. When false (default),
-- approved personal posts appear on the Ready-to-Post page for manual
-- copy/share instead of being published by the scheduler.
-- Run this in the Supabase SQL Editor.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS auto_publish_personal BOOLEAN NOT NULL DEFAULT false;
