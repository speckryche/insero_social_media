-- 013_batch_scope.sql
-- Adds batches.scope, recording which half of the content mix a batch covers:
--   both     — all five categories (the default, and what every existing batch is)
--   company  — the four _speak categories only (Insero company page)
--   personal — personal_take only (Speck's personal profile)
--
-- Nullable on purpose: rows created before this column existed have no scope,
-- and the UI treats NULL the same as 'both'. Nothing backfills them.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS scope TEXT;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_scope_check;

ALTER TABLE batches ADD CONSTRAINT batches_scope_check
  CHECK (scope IS NULL OR scope IN ('both', 'company', 'personal'));
