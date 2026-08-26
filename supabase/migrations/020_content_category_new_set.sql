-- 020_content_category_new_set.sql
-- Switches posts.content_category to the current company set:
--   ai_speak, tech_speak, quote_speak, cost_speak, humor_speak, personal_take
--
-- Every previous value stays allowed. bill_speak and contract_speak are no
-- longer generated and are absent from every picker, but existing rows keep
-- their category — ADD CONSTRAINT would fail validation against them
-- otherwise. The pre-Telecom-speak values from migration 012 are retained for
-- the same reason. Nothing here rewrites data.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_content_category_check;

ALTER TABLE posts ADD CONSTRAINT posts_content_category_check
  CHECK (content_category IN (
    -- current
    'ai_speak',
    'tech_speak',
    'quote_speak',
    'cost_speak',
    'humor_speak',
    'personal_take',
    -- legacy, retained for existing rows only
    'bill_speak',
    'contract_speak',
    'did_you_know',
    'savings_story',
    'industry_tip',
    'myth_busting'
  ));
