-- Platform token storage for OAuth refresh flows
-- Run this in the Supabase SQL Editor

CREATE TABLE platform_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed LinkedIn row so we can update it later
INSERT INTO platform_tokens (platform) VALUES ('linkedin');
INSERT INTO platform_tokens (platform) VALUES ('google');

-- Add author_type setting to app_settings
ALTER TABLE app_settings ADD COLUMN linkedin_author_type TEXT NOT NULL DEFAULT 'organization'
  CHECK (linkedin_author_type IN ('organization', 'person'));
