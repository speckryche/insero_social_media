-- Batches become a numbered list; calendar framing retired.
alter table batches add column if not exists batch_number integer;

-- Backfill existing batches in creation order.
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from batches
)
update batches b set batch_number = o.rn
from ordered o where b.id = o.id and b.batch_number is null;

create unique index if not exists batches_batch_number_key on batches (batch_number);

-- Posts no longer carry an assigned date or slot at generation time.
alter table posts alter column scheduled_date drop not null;
alter table posts alter column time_slot drop not null;
