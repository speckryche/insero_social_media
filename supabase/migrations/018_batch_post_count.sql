-- 018_batch_post_count.sql
-- Adds batches.post_count — the batch size chosen in the Generate dialog
-- (10 / 20 / 30 / 40 / 50 / 60). Companion to batches.scope from migration 013.
--
-- This is the requested size, not the number of rows created. A scoped batch
-- takes its share of it: at size 30, "Company only" generates ~23 and
-- "Personal only" ~8, the same proportions a size-30 "Both" batch splits into.
-- batches.total_posts still holds the actual row count.
--
-- Nullable: batches created before this column existed have no recorded size,
-- and the UI simply omits it for them. Nothing backfills.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS post_count INTEGER;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_post_count_check;

ALTER TABLE batches ADD CONSTRAINT batches_post_count_check
  CHECK (post_count IS NULL OR (post_count > 0 AND post_count <= 60));
