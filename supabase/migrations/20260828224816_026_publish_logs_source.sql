alter table publish_logs
  add column if not exists source text not null default 'api'
  check (source in ('api', 'manual'));
