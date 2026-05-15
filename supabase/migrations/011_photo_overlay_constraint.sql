-- 011_photo_overlay_constraint.sql
-- Expands the posts.image_template_type CHECK to include the two new
-- photo-overlay templates (full-bleed photo + one-side gradient + brand
-- content in the solid zone).
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
    'photo_quote',
    'photo_overlay_right',
    'photo_overlay_left'
  ));
