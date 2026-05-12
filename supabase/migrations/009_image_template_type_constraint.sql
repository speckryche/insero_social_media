-- 009_image_template_type_constraint.sql
-- Expands the posts.image_template_type CHECK constraint to allow all 8
-- template types the image generator and batch generator actually use.
-- Migration 001 only permitted the original 4 (stat_card, tip_graphic,
-- quote_card, comparison); without this fix, batch inserts that assign any
-- of the newer 4 templates fail with a check-constraint violation.
-- Run this in the Supabase SQL Editor.

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_image_template_type_check;

ALTER TABLE posts ADD CONSTRAINT posts_image_template_type_check
  CHECK (image_template_type IN (
    'stat_card',
    'tip_graphic',
    'quote_card',
    'comparison',
    'savings_highlight',
    'myth_buster',
    'did_you_know',
    'checklist'
  ));
