-- Secure estimate status history writes and snapshot estimate-wide labor settings.
alter table public.estimates
  add column if not exists number_of_workers integer,
  add column if not exists average_hourly_wage_cents bigint,
  add column if not exists prep_person_hours_per_room numeric(10,2);

alter table public.estimates drop constraint if exists estimates_number_of_workers_check;
alter table public.estimates add constraint estimates_number_of_workers_check
  check (number_of_workers is null or number_of_workers > 0);
alter table public.estimates drop constraint if exists estimates_average_hourly_wage_check;
alter table public.estimates add constraint estimates_average_hourly_wage_check
  check (average_hourly_wage_cents is null or average_hourly_wage_cents > 0);
alter table public.estimates drop constraint if exists estimates_prep_person_hours_check;
alter table public.estimates add constraint estimates_prep_person_hours_check
  check (prep_person_hours_per_room is null or prep_person_hours_per_room >= 0);

update public.estimates e
set number_of_workers=r.worker_count,
    average_hourly_wage_cents=r.average_wage_cents,
    prep_person_hours_per_room=r.prep_person_hours
from (
  select distinct on (er.estimate_id)
    er.estimate_id,er.worker_count,er.average_wage_cents,er.prep_person_hours
  from public.estimate_rooms er
  order by er.estimate_id,er.sort_order,er.created_at,er.id
) r
where r.estimate_id=e.id
  and (e.number_of_workers is null
   or e.average_hourly_wage_cents is null
   or e.prep_person_hours_per_room is null);

create or replace function private.snapshot_estimate_labor_setup() returns trigger
language plpgsql set search_path=''
as $$
declare first_room jsonb;
begin
  if new.status='draft' and jsonb_typeof(new.draft_payload->'rooms')='array'
     and jsonb_array_length(new.draft_payload->'rooms')>0 then
    first_room:=new.draft_payload->'rooms'->0;
    new.number_of_workers:=nullif(first_room->>'workers','')::integer;
    new.average_hourly_wage_cents:=round(nullif(first_room->>'wageDollars','')::numeric*100);
    new.prep_person_hours_per_room:=nullif(first_room->>'prepHours','')::numeric;
  end if;
  return new;
end $$;

drop trigger if exists snapshot_estimate_labor_setup on public.estimates;
create trigger snapshot_estimate_labor_setup
before insert or update of draft_payload on public.estimates
for each row execute function private.snapshot_estimate_labor_setup();

create index if not exists estimate_status_history_estimate_changed_idx
  on public.estimate_status_history(estimate_id,changed_at desc);

drop policy if exists estimate_history_read on public.estimate_status_history;
create policy estimate_history_read
on public.estimate_status_history
for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.estimates e
    where e.id=estimate_status_history.estimate_id
      and e.company_id=estimate_status_history.company_id
      and private.is_company_member(e.company_id)
  )
);

drop policy if exists estimate_history_insert on public.estimate_status_history;
create policy estimate_history_insert
on public.estimate_status_history
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and changed_by=(select auth.uid())
  and exists (
    select 1 from public.estimates e
    where e.id=estimate_status_history.estimate_id
      and e.company_id=estimate_status_history.company_id
      and private.has_company_role(
        e.company_id,
        array['owner','admin','manager','estimator']::public.company_role[]
      )
  )
);

revoke all on public.estimate_status_history from anon;
revoke insert,update,delete,truncate,references,trigger on public.estimate_status_history from authenticated;
grant select,insert on public.estimate_status_history to authenticated;

create or replace function private.record_updated_draft_status() returns trigger
language plpgsql set search_path=''
as $$
begin
  if (select auth.uid()) is not null
     and old.status='draft' and new.status='draft'
     and new.updated_at is distinct from old.updated_at then
    insert into public.estimate_status_history(
      estimate_id,company_id,from_status,to_status,changed_by
    ) values (
      new.id,new.company_id,'draft','draft',(select auth.uid())
    );
  end if;
  return new;
end $$;

drop trigger if exists record_updated_draft_status on public.estimates;
create trigger record_updated_draft_status
after update on public.estimates
for each row execute function private.record_updated_draft_status();

-- The existing SECURITY INVOKER draft RPC remains atomic: estimate, rooms, and
-- history share one PostgreSQL transaction and now pass a parent-authorized policy.
-- The existing approval RPC remains narrowly authorized and server-recalculates v7.
