-- 021_content_category_pots_speak.sql
-- Adds pots_speak to posts.content_category and retires humor_speak.
--
-- humor_speak stays in the allowed list as a legacy value: it is no longer
-- generated and is absent from every picker, but rows created while it was
-- live keep their category, and ADD CONSTRAINT would fail validation against
-- them otherwise. Same reasoning as bill_speak and contract_speak in 020.
-- Nothing here rewrites data.
--
-- NOTE: this constraint was already applied by hand. This file exists so the
-- repo's migration history matches the database.
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
    'pots_speak',
    'personal_take',
    -- legacy, retained for existing rows only
    'humor_speak',
    'bill_speak',
    'contract_speak',
    'did_you_know',
    'savings_story',
    'industry_tip',
    'myth_busting'
  ));
