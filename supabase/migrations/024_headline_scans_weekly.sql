-- 024_headline_scans_weekly.sql
-- Headline scans follow batches from a calendar month onto a Mon-Fri week.
-- week_start_date must be a Monday, matching batches_week_start_is_monday.
--
-- month/year are deliberately left NOT NULL and are still written alongside
-- the week. The scans already stored have no week to derive, and keeping both
-- columns populated means this migration can be applied without a backfill
-- and old rows keep reading. New code looks scans up by week_start_date.

ALTER TABLE headline_scans
  ADD COLUMN IF NOT EXISTS week_start_date DATE;

ALTER TABLE headline_scans
  DROP CONSTRAINT IF EXISTS headline_scans_week_start_is_monday;
ALTER TABLE headline_scans ADD CONSTRAINT headline_scans_week_start_is_monday
  CHECK (week_start_date IS NULL OR EXTRACT(ISODOW FROM week_start_date) = 1);

CREATE INDEX IF NOT EXISTS headline_scans_week_start_date_idx
  ON headline_scans (week_start_date);
