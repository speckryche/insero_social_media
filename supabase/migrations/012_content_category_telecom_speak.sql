-- 012_content_category_telecom_speak.sql
-- Switches posts.content_category to the Telecom-speak category set:
--   bill_speak, contract_speak, quote_speak, tech_speak, personal_take
--
-- The four legacy values (did_you_know, savings_story, industry_tip,
-- myth_busting) remain allowed on purpose. Existing rows keep their old
-- category, and ADD CONSTRAINT would fail validation against them otherwise.
-- Nothing here rewrites data — old batches are left exactly as they are.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_content_category_check;

ALTER TABLE posts ADD CONSTRAINT posts_content_category_check
  CHECK (content_category IN (
    -- current
    'bill_speak',
    'contract_speak',
    'quote_speak',
    'tech_speak',
    'personal_take',
    -- legacy, retained for existing rows only
    'did_you_know',
    'savings_story',
    'industry_tip',
    'myth_busting'
  ));
