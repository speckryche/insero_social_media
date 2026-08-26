-- 016_learn_from_edits.sql
-- Supports "Learn from my edits": comparing what the model wrote against what
-- Speck actually approved, and proposing additions to the Banned words and
-- Speck-isms lists.
--
-- 1. posts.original_* holds the model's first draft. New posts get it at
--    insert time. Existing rows are backfilled from current content, which is
--    correct today because nothing has been edited yet — run this before you
--    start editing, or those rows will simply show no diff.
--
-- 2. learn_runs logs every analysis so a re-run does not propose something
--    that was already shown and dismissed.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS original_linkedin_content TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS original_linkedin_personal_content TEXT;

UPDATE posts
SET original_linkedin_content = linkedin_content
WHERE original_linkedin_content IS NULL;

UPDATE posts
SET original_linkedin_personal_content = linkedin_personal_content
WHERE original_linkedin_personal_content IS NULL;

CREATE TABLE IF NOT EXISTS learn_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Everything the model proposed on this run, after filtering.
  proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The subset the user accepted. Stays [] until Accept is clicked.
  accepted JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS learn_runs_batch_id_idx ON learn_runs (batch_id);
