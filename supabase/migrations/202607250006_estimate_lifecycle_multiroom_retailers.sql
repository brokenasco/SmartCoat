-- Estimate lifecycle, immutable approvals, multi-room persistence, progress, and retailer import framework.

alter table public.estimates
  add column if not exists formula_version text not null default '4.0.0',
  add column if not exists production_rate_snapshot numeric(10,2) not null default 150,
  add column if not exists labor_burden_percent_snapshot numeric(5,2) not null default 20,
  add column if not exists overhead_percent_snapshot numeric(5,2) not null default 15,
  add column if not exists margin_mode text not null default 'gross_margin' check (margin_mode in ('gross_margin','markup')),
  add column if not exists rounding_policy text not null default 'half_up_cent',
  add column if not exists draft_payload jsonb not null default '{"rooms":[]}'::jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists source_estimate_id uuid references public.estimates(id) on delete set null,
  add column if not exists revision_number integer not null default 0,
  add column if not exists revision_reason text;
create index if not exists estimates_company_status_updated_idx on public.estimates(company_id,status,updated_at desc,id);

alter table public.estimate_rooms
  alter column length_millifeet drop not null,
  alter column width_millifeet drop not null,
  alter column height_millifeet drop not null,
  add column if not exists worker_count integer check(worker_count is null or worker_count between 1 and 100),
  add column if not exists average_wage_cents integer check(average_wage_cents is null or average_wage_cents > 0),
  add column if not exists prep_person_hours numeric(10,2) check(prep_person_hours is null or prep_person_hours >= 0),
  add column if not exists gross_area_sqft numeric(12,3),
  add column if not exists opening_area_sqft numeric(12,3),
  add column if not exists net_area_sqft numeric(12,3),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.room_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  room_id uuid not null references public.estimate_rooms(id) on delete cascade,
  name text not null,
  kind text not null default 'window' check(kind in ('window','door','other')),
  width_millifeet integer not null check(width_millifeet >= 0),
  height_millifeet integer not null check(height_millifeet >= 0),
  quantity integer not null default 1 check(quantity between 1 and 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists room_openings_estimate_room_idx on public.room_openings(company_id,estimate_id,room_id,sort_order);

create table if not exists public.estimate_status_history (
  id bigint generated always as identity primary key,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  from_status public.estimate_status,
  to_status public.estimate_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  changed_at timestamptz not null default now()
);
create index if not exists estimate_status_history_idx on public.estimate_status_history(company_id,estimate_id,changed_at desc);

create table if not exists public.estimate_approval_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  snapshot jsonb not null,
  formula_version text not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  snapshot_hash text not null
);

create table if not exists public.estimate_progress (
  estimate_id uuid primary key references public.estimates(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'not_started' check(status in ('not_started','prep','in_progress','final_coat','touch_ups','completed','blocked')),
  completion_percent integer not null default 0 check(completion_percent between 0 and 100),
  expected_completion_date date,
  actual_start_date date,
  actual_completion_date date,
  progress_notes text,
  blockers text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_progress (
  room_id uuid primary key references public.estimate_rooms(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'not_started' check(status in ('not_started','prep','in_progress','final_coat','touch_ups','completed','blocked')),
  completion_percent integer not null default 0 check(completion_percent between 0 and 100),
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.retailer_data_sources (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.paint_retailers(id) on delete restrict,
  name text not null,
  source_type text not null check(source_type in ('official_api','affiliate_feed','partner_feed','licensed_file','approved_admin_import')),
  authorization_status text not null default 'pending_permission' check(authorization_status in ('pending_permission','authorized','revoked')),
  source_url text,
  terms_reference text,
  is_enabled boolean not null default false,
  freshness_hours integer not null default 168 check(freshness_hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(retailer_id,name),
  check(not is_enabled or authorization_status='authorized')
);
create table if not exists public.retailer_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.retailer_data_sources(id) on delete restrict,
  status text not null default 'queued' check(status in ('queued','running','completed','failed','quarantined')),
  parser_version text not null,
  records_received integer not null default 0,
  records_accepted integer not null default 0,
  records_rejected integer not null default 0,
  error_summary text,
  triggered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.retailer_import_errors (
  id bigint generated always as identity primary key,
  import_job_id uuid not null references public.retailer_import_jobs(id) on delete cascade,
  source_record_identifier text,
  error_code text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);
insert into public.retailer_data_sources(retailer_id,name,source_type,authorization_status,source_url,is_enabled)
select id, name || ' authorized administrative import', 'approved_admin_import', 'pending_permission', website_url, false
from public.paint_retailers where slug in ('lowes','home-depot')
on conflict(retailer_id,name) do nothing;

create or replace function private.assert_draft_estimate(target_estimate uuid) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.estimates e
    where e.id=target_estimate and e.status='draft'
      and private.has_company_role(e.company_id,array['owner','admin','manager','estimator']::public.company_role[])
  )
$$;
revoke all on function private.assert_draft_estimate(uuid) from public,anon;
grant execute on function private.assert_draft_estimate(uuid) to authenticated;

create or replace function private.protect_approved_estimate() returns trigger
language plpgsql set search_path=''
as $$
begin
  if old.status='approved' and (
    new.title is distinct from old.title or new.customer_id is distinct from old.customer_id
    or new.property_id is distinct from old.property_id or new.cost_cents is distinct from old.cost_cents
    or new.total_cents is distinct from old.total_cents or new.calculation_snapshot is distinct from old.calculation_snapshot
    or new.draft_payload is distinct from old.draft_payload or new.target_margin_percent is distinct from old.target_margin_percent
  ) then raise exception 'Approved estimate financial and scope data is immutable' using errcode='P0001'; end if;
  if old.status='approved' and new.status not in ('approved','archived','canceled') then
    raise exception 'Approved estimates cannot return to an editable state' using errcode='P0001';
  end if;
  return new;
end $$;
drop trigger if exists protect_approved_estimate on public.estimates;
create trigger protect_approved_estimate before update on public.estimates for each row execute function private.protect_approved_estimate();

create or replace function private.protect_approved_child() returns trigger
language plpgsql set search_path=''
as $$
declare target uuid := coalesce(new.estimate_id,old.estimate_id);
begin
  if exists(select 1 from public.estimates where id=target and status in ('approved','archived')) then
    raise exception 'Approved estimate detail is immutable' using errcode='P0001';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_approved_rooms on public.estimate_rooms;
create trigger protect_approved_rooms before insert or update or delete on public.estimate_rooms for each row execute function private.protect_approved_child();
drop trigger if exists protect_approved_openings on public.room_openings;
create trigger protect_approved_openings before insert or update or delete on public.room_openings for each row execute function private.protect_approved_child();
drop trigger if exists protect_approved_paint on public.estimate_paint_items;
create trigger protect_approved_paint before insert or update or delete on public.estimate_paint_items for each row execute function private.protect_approved_child();

create or replace function public.save_estimate_draft(
  target_estimate uuid, target_company uuid, draft_title text, payload jsonb,
  calculation jsonb, total_amount bigint, cost_amount bigint, margin_percent numeric
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare saved_id uuid; room jsonb; opening jsonb; saved_room uuid;
begin
  if not private.has_company_role(target_company,array['owner','admin','manager','estimator']::public.company_role[]) then raise exception 'Not authorized'; end if;
  if target_estimate is null then
    insert into public.estimates(company_id,title,status,total_cents,subtotal_cents,cost_cents,target_margin_percent,
      calculation_snapshot,draft_payload,formula_version,production_rate_snapshot,labor_burden_percent_snapshot,overhead_percent_snapshot,updated_by)
    values(target_company,coalesce(nullif(trim(draft_title),''),'Untitled draft'),'draft',greatest(total_amount,0),greatest(total_amount,0),greatest(cost_amount,0),margin_percent,
      calculation,payload,'4.0.0',150,20,15,auth.uid()) returning id into saved_id;
    insert into public.estimate_status_history(estimate_id,company_id,to_status,changed_by) values(saved_id,target_company,'draft',auth.uid());
  else
    update public.estimates set title=coalesce(nullif(trim(draft_title),''),title),total_cents=greatest(total_amount,0),
      subtotal_cents=greatest(total_amount,0),cost_cents=greatest(cost_amount,0),target_margin_percent=margin_percent,
      calculation_snapshot=calculation,draft_payload=payload,formula_version='4.0.0',production_rate_snapshot=150,
      labor_burden_percent_snapshot=20,overhead_percent_snapshot=15,updated_by=auth.uid(),updated_at=now()
    where id=target_estimate and company_id=target_company and status='draft' returning id into saved_id;
    if saved_id is null then raise exception 'Draft not found or locked'; end if;
    delete from public.estimate_rooms where estimate_id=saved_id;
  end if;
  for room in select value from jsonb_array_elements(coalesce(payload->'rooms','[]'::jsonb)) loop
    insert into public.estimate_rooms(company_id,estimate_id,name,sort_order,length_millifeet,width_millifeet,height_millifeet,
      worker_count,average_wage_cents,prep_person_hours,gross_area_sqft,opening_area_sqft,net_area_sqft,calculation_snapshot)
    values(target_company,saved_id,coalesce(room->>'name','Room'),coalesce((room->>'sortOrder')::integer,0),
      nullif(room->>'length','')::numeric*1000,nullif(room->>'width','')::numeric*1000,nullif(room->>'height','')::numeric*1000,
      nullif(room->>'workers','')::integer,round(nullif(room->>'wageDollars','')::numeric*100),nullif(room->>'prepHours','')::numeric,
      nullif(room#>>'{result,grossSurfaceAreaSqFt}','')::numeric,nullif(room#>>'{result,deductedOpeningAreaSqFt}','')::numeric,
      nullif(room#>>'{result,netPaintableAreaSqFt}','')::numeric,coalesce(room->'result','{}'::jsonb)) returning id into saved_room;
    for opening in select value from jsonb_array_elements(coalesce(room->'openings','[]'::jsonb)) loop
      insert into public.room_openings(company_id,estimate_id,room_id,name,kind,width_millifeet,height_millifeet,quantity,sort_order)
      values(target_company,saved_id,saved_room,coalesce(opening->>'name','Window'),coalesce(opening->>'kind','window'),
        coalesce(nullif(opening->>'width','')::numeric,0)*1000,coalesce(nullif(opening->>'height','')::numeric,0)*1000,
        coalesce(nullif(opening->>'quantity','')::integer,1),coalesce(nullif(opening->>'sortOrder','')::integer,0));
    end loop;
  end loop;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_company,auth.uid(),case when target_estimate is null then 'estimate.draft_created' else 'estimate.draft_updated' end,'estimate',saved_id::text,jsonb_build_object('room_count',jsonb_array_length(coalesce(payload->'rooms','[]'::jsonb))));
  return saved_id;
end $$;

create or replace function public.approve_estimate(target_estimate uuid) returns uuid
language plpgsql security definer set search_path=''
as $$
declare e public.estimates%rowtype; snapshot jsonb; project_id uuid;
begin
  select * into e from public.estimates where id=target_estimate for update;
  if e.id is null or e.status<>'draft' then raise exception 'Estimate must be a draft'; end if;
  if not private.has_company_role(e.company_id,array['owner','admin','manager']::public.company_role[]) then raise exception 'Manager permission required'; end if;
  if jsonb_array_length(coalesce(e.draft_payload->'rooms','[]'::jsonb))=0 then raise exception 'At least one room is required'; end if;
  if coalesce((e.calculation_snapshot->>'valid')::boolean,false)=false or e.total_cents<=0 then raise exception 'Every room must be valid before approval'; end if;
  snapshot=jsonb_build_object('estimate',to_jsonb(e),'rooms',e.draft_payload->'rooms','calculation',e.calculation_snapshot);
  insert into public.estimate_approval_snapshots(estimate_id,company_id,snapshot,formula_version,approved_by,snapshot_hash)
  values(e.id,e.company_id,snapshot,e.formula_version,auth.uid(),encode(digest(snapshot::text,'sha256'),'hex'));
  update public.estimates set status='approved',approved_at=now(),approved_by=auth.uid(),accepted_at=now(),updated_by=auth.uid(),updated_at=now() where id=e.id;
  insert into public.estimate_status_history(estimate_id,company_id,from_status,to_status,changed_by) values(e.id,e.company_id,'draft','approved',auth.uid());
  insert into public.projects(company_id,estimate_id,name,status,contract_snapshot) values(e.company_id,e.id,e.title,'planned',snapshot) returning id into project_id;
  insert into public.estimate_progress(estimate_id,company_id,updated_by) values(e.id,e.company_id,auth.uid());
  insert into public.room_progress(room_id,estimate_id,company_id,updated_by)
    select id,e.id,e.company_id,auth.uid() from public.estimate_rooms where estimate_id=e.id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata) values(e.company_id,auth.uid(),'estimate.approved','estimate',e.id::text,jsonb_build_object('snapshot_hash',encode(digest(snapshot::text,'sha256'),'hex')));
  return project_id;
end $$;
revoke all on function public.save_estimate_draft(uuid,uuid,text,jsonb,jsonb,bigint,bigint,numeric), public.approve_estimate(uuid) from public,anon;
grant execute on function public.save_estimate_draft(uuid,uuid,text,jsonb,jsonb,bigint,bigint,numeric), public.approve_estimate(uuid) to authenticated;

alter table public.room_openings enable row level security;
alter table public.estimate_status_history enable row level security;
alter table public.estimate_approval_snapshots enable row level security;
alter table public.estimate_progress enable row level security;
alter table public.room_progress enable row level security;
alter table public.retailer_data_sources enable row level security;
alter table public.retailer_import_jobs enable row level security;
alter table public.retailer_import_errors enable row level security;
create policy room_openings_access on public.room_openings for all to authenticated using(private.is_company_member(company_id) and (private.assert_draft_estimate(estimate_id) or private.is_company_member(company_id))) with check(private.assert_draft_estimate(estimate_id));
create policy estimate_history_read on public.estimate_status_history for select to authenticated using(private.is_company_member(company_id));
create policy approval_snapshots_read on public.estimate_approval_snapshots for select to authenticated using(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
create policy estimate_progress_read on public.estimate_progress for select to authenticated using(private.is_company_member(company_id));
create policy estimate_progress_update on public.estimate_progress for update to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy room_progress_read on public.room_progress for select to authenticated using(private.is_company_member(company_id));
create policy room_progress_update on public.room_progress for update to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy retailer_sources_admin_read on public.retailer_data_sources for select to authenticated
using(exists(select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));
create policy retailer_jobs_admin_read on public.retailer_import_jobs for select to authenticated
using(exists(select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));
create policy retailer_errors_admin_read on public.retailer_import_errors for select to authenticated
using(exists(select 1 from public.company_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));
grant select,insert,update,delete on public.room_openings to authenticated;
grant select on public.estimate_status_history,public.estimate_approval_snapshots to authenticated;
grant select,update on public.estimate_progress,public.room_progress to authenticated;
grant select on public.retailer_data_sources,public.retailer_import_jobs to authenticated;
grant select on public.retailer_import_errors to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Financial estimate tables are manager-only. Workers use the progress tables,
-- which contain no wage, burden, overhead, margin, or customer-price fields.
drop policy if exists estimates_read on public.estimates;
create policy estimates_manager_read on public.estimates for select to authenticated
using(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
drop policy if exists estimate_rooms_access on public.estimate_rooms;
create policy estimate_rooms_manager_access on public.estimate_rooms for all to authenticated
using(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]))
with check(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]) and private.assert_draft_estimate(estimate_id));
drop policy if exists estimate_paint_items_access on public.estimate_paint_items;
create policy estimate_paint_items_manager_access on public.estimate_paint_items for all to authenticated
using(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]))
with check(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]) and private.assert_draft_estimate(estimate_id));
drop policy if exists projects_read on public.projects;
create policy projects_manager_read on public.projects for select to authenticated
using(private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
