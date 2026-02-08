-- Publishing activity log
-- Run this in the Supabase SQL Editor

CREATE TABLE publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'x', 'facebook', 'google')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  post_id_returned TEXT,
  error_message TEXT
);

CREATE INDEX idx_publish_logs_created_at ON publish_logs(created_at DESC);
CREATE INDEX idx_publish_logs_post_id ON publish_logs(post_id);
