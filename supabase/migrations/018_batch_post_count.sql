-- 018_batch_post_count.sql
-- Adds batches.post_count — the batch size chosen in the Generate dialog
-- (10 / 20 / 30 / 40 / 50 / 60). Companion to batches.scope from migration 013.
--
-- The size is the exact post count for whichever scope was chosen: at size 30,
-- "Personal only" generates 30 personal posts and "Company only" generates 30
-- split across the four _speak categories. So post_count normally equals
-- batches.total_posts; they diverge only when the month has fewer time slots
-- than the requested size (a 28-day month caps a 60-post batch at 56).
--
-- Nullable: batches created before this column existed have no recorded size,
-- and the UI simply omits it for them. Nothing backfills.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS post_count INTEGER;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_post_count_check;

ALTER TABLE batches ADD CONSTRAINT batches_post_count_check
  CHECK (post_count IS NULL OR (post_count > 0 AND post_count <= 60));
