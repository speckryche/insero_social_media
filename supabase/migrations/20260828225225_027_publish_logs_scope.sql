-- Distinguish LinkedIn company vs personal in the publish log.
-- Adds a nullable scope column rather than widening the platform CHECK,
-- so existing rows and the publisher's platform values stay valid.
alter table publish_logs
  add column if not exists scope text
  check (scope is null or scope in ('company', 'personal'));
