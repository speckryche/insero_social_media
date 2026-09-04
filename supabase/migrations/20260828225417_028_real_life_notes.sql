create table if not exists real_life_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null default current_date,
  content text not null,
  scope text not null check (scope in ('company', 'personal')),
  consumed boolean not null default false,
  consumed_at timestamptz,
  consumed_by_batch_id uuid references batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists real_life_notes_unconsumed_idx
  on real_life_notes (scope, note_date desc) where consumed = false;
