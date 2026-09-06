-- Migration 023 added batches_period_present back when a batch WAS a period
-- (a Mon-Fri week, or a month/year):
--     CHECK (week_start_date IS NOT NULL OR (month IS NOT NULL AND year IS NOT NULL))
--
-- Migration 025 redefined a batch as a numbered list and generate-batch/route.ts
-- deliberately stopped writing week_start_date / month / year. 025 never dropped
-- the constraint, so every new batch row violated it and generation returned 500
-- at step 1.
--
-- The constraint has no meaning under the new model: batch_number is the
-- identity. The two legacy rows keep their own period values (batch 1 has
-- month/year, batch 3 has week_start_date) and continue to render, so nothing
-- is orphaned by removing it.
--
-- batches_week_start_is_monday is left in place -- it is null-tolerant and still
-- correctly guards legacy week rows.

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_period_present;
