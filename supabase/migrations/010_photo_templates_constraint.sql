-- 010_photo_templates_constraint.sql
-- Expands the posts.image_template_type CHECK constraint to allow the four
-- new photo-based templates (photo_landscape, photo_tip, photo_stat,
-- photo_quote) alongside the original 8 canvas templates. Run this before
-- generating any batch that may assign a photo template.
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
    'checklist',
    'photo_landscape',
    'photo_tip',
    'photo_stat',
    'photo_quote'
  ));
