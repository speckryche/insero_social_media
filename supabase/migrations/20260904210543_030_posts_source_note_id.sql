alter table posts
  add column if not exists source_note_id uuid
  references real_life_notes(id) on delete set null;

create index if not exists posts_source_note_id_idx
  on posts (source_note_id) where source_note_id is not null;

comment on column posts.source_note_id is
  'The real-life note this post was generated from, if any. Set at batch generation time when the model returns a note_index. Null for headline-backed and evergreen posts.';
