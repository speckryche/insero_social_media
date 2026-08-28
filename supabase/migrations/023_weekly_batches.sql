-- 023_weekly_batches.sql
-- 022 is intentionally unused: reserved for the deferred image-system
-- rebuild. See docs/image-system-notes.md.
-- Batches move from a calendar month to a single Mon-Fri week.
-- A week is identified by week_start_date, which must be a Monday.
-- month/year stay for the batches that already exist but are no longer
-- written, so they become nullable and a batch must carry one period or
-- the other.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS week_start_date DATE;

ALTER TABLE batches ALTER COLUMN month DROP NOT NULL;
ALTER TABLE batches ALTER COLUMN year  DROP NOT NULL;

-- Five weekdays at two posts a day.
ALTER TABLE batches ALTER COLUMN total_posts SET DEFAULT 10;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_week_start_is_monday;
ALTER TABLE batches ADD CONSTRAINT batches_week_start_is_monday
  CHECK (week_start_date IS NULL OR EXTRACT(ISODOW FROM week_start_date) = 1);

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_period_present;
ALTER TABLE batches ADD CONSTRAINT batches_period_present
  CHECK (week_start_date IS NOT NULL OR (month IS NOT NULL AND year IS NOT NULL));

CREATE INDEX IF NOT EXISTS batches_week_start_date_idx
  ON batches (week_start_date);
