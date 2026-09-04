alter table headline_scans
  add column if not exists scope text not null default 'company'
  check (scope in ('company', 'personal'));
