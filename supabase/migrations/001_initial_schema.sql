-- Insero Social Hub - Initial Database Schema
-- Run this in the Supabase SQL Editor

-- ============================================
-- Table: batches
-- Represents a batch of 60 posts (2/day for 30 days)
-- ============================================
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active', 'completed')),
  total_posts INTEGER NOT NULL DEFAULT 60,
  approved_at TIMESTAMPTZ
);

-- ============================================
-- Table: posts
-- Individual social media posts within a batch
-- ============================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_number INTEGER NOT NULL CHECK (post_number BETWEEN 1 AND 60),
  scheduled_date DATE NOT NULL,
  scheduled_time_1 TIME NOT NULL,       -- morning post time
  scheduled_time_2 TIME NOT NULL,       -- afternoon post time
  time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'afternoon')),
  content_category TEXT NOT NULL CHECK (content_category IN (
    'did_you_know',
    'savings_story',
    'industry_tip',
    'myth_busting',
    'personal_take'
  )),
  linkedin_content TEXT,
  x_content TEXT,
  facebook_content TEXT,
  google_content TEXT,
  has_image BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  image_template_type TEXT CHECK (image_template_type IN (
    'stat_card',
    'tip_graphic',
    'quote_card',
    'comparison'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'edited',
    'approved',
    'scheduled',
    'published',
    'failed'
  )),
  linkedin_published BOOLEAN NOT NULL DEFAULT false,
  x_published BOOLEAN NOT NULL DEFAULT false,
  facebook_published BOOLEAN NOT NULL DEFAULT false,
  google_published BOOLEAN NOT NULL DEFAULT false,
  linkedin_post_id TEXT,
  x_post_id TEXT,
  facebook_post_id TEXT,
  google_post_id TEXT,
  published_at TIMESTAMPTZ,
  error_log TEXT
);

-- ============================================
-- Table: app_settings
-- Global application settings
-- ============================================
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday_morning_time TIME NOT NULL DEFAULT '08:00:00',
  weekday_afternoon_time TIME NOT NULL DEFAULT '13:00:00',
  weekend_morning_time TIME NOT NULL DEFAULT '09:00:00',
  weekend_afternoon_time TIME NOT NULL DEFAULT '15:00:00',
  posts_per_day INTEGER NOT NULL DEFAULT 2
);

-- Insert default settings row
INSERT INTO app_settings (weekday_morning_time, weekday_afternoon_time, weekend_morning_time, weekend_afternoon_time, posts_per_day)
VALUES ('08:00:00', '13:00:00', '09:00:00', '15:00:00', 2);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_posts_batch_id ON posts(batch_id);
CREATE INDEX idx_posts_scheduled_date ON posts(scheduled_date);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_batches_status ON batches(status);
