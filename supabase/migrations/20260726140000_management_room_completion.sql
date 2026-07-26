-- Company estimating defaults and approved-room completion tracking.
create table if not exists public.company_estimate_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  average_hourly_pay_cents bigint not null default 2500,
  project_overhead_percent numeric(5,2) not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_estimate_settings_pay_check check (average_hourly_pay_cents >= 0),
  constraint company_estimate_settings_overhead_check check (project_overhead_percent >= 0 and project_overhead_percent < 100)
);
insert into public.company_estimate_settings(company_id)
select id from public.companies
on conflict(company_id) do nothing;

alter table public.company_estimate_settings enable row level security;
drop policy if exists company_estimate_settings_read on public.company_estimate_settings;
create policy company_estimate_settings_read on public.company_estimate_settings
for select to authenticated
using ((select auth.uid()) is not null and private.is_company_member(company_id));
revoke all on public.company_estimate_settings from anon,authenticated;
grant select on public.company_estimate_settings to authenticated;

create or replace function public.update_company_estimate_settings(
  target_company uuid,
  average_pay_cents bigint,
  overhead_percent numeric
) returns public.company_estimate_settings
language plpgsql security definer set search_path=''
as $$
declare saved public.company_estimate_settings;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='P0001';
  end if;
  if not private.has_company_role(
    target_company,
    array['owner','admin','manager']::public.company_role[]
  ) then
    raise exception 'Manager permission required' using errcode='P0001';
  end if;
  if average_pay_cents < 0 or overhead_percent < 0 or overhead_percent >= 100 then
    raise exception 'Invalid management settings' using errcode='22023';
  end if;
  insert into public.company_estimate_settings(
    company_id,average_hourly_pay_cents,project_overhead_percent,updated_by
  ) values (
    target_company,average_pay_cents,overhead_percent,(select auth.uid())
  )
  on conflict(company_id) do update set
    average_hourly_pay_cents=excluded.average_hourly_pay_cents,
    project_overhead_percent=excluded.project_overhead_percent,
    updated_by=(select auth.uid()),
    updated_at=now()
  returning * into saved;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    target_company,(select auth.uid()),'estimate.management_settings_updated',
    'company_estimate_settings',target_company::text,
    jsonb_build_object(
      'average_hourly_pay_cents',average_pay_cents,
      'project_overhead_percent',overhead_percent
    )
  );
  return saved;
end $$;
revoke all on function public.update_company_estimate_settings(uuid,bigint,numeric) from public,anon;
grant execute on function public.update_company_estimate_settings(uuid,bigint,numeric) to authenticated;

alter table public.room_progress
  add column if not exists is_completed boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null;

update public.room_progress
set is_completed=true,
    completed_at=coalesce(updated_at,now()),
    completed_by=updated_by
where completion_percent=100 or status='completed';

insert into public.estimate_progress(estimate_id,company_id,updated_by)
select e.id,e.company_id,e.approved_by
from public.estimates e
where e.status='approved'
on conflict(estimate_id) do nothing;

insert into public.room_progress(room_id,estimate_id,company_id,updated_by)
select er.id,er.estimate_id,er.company_id,e.approved_by
from public.estimate_rooms er
join public.estimates e on e.id=er.estimate_id
where e.status='approved'
on conflict(room_id) do nothing;

create index if not exists estimate_rooms_estimate_sort_idx
  on public.estimate_rooms(estimate_id,sort_order,id);
create index if not exists room_progress_estimate_completed_idx
  on public.room_progress(estimate_id,is_completed,room_id);

create table if not exists public.estimate_room_progress_history (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.estimate_rooms(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  previous_completed_state boolean not null,
  new_completed_state boolean not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create index if not exists estimate_room_progress_history_lookup_idx
  on public.estimate_room_progress_history(company_id,estimate_id,room_id,changed_at desc);
alter table public.estimate_room_progress_history enable row level security;
drop policy if exists estimate_room_progress_history_read on public.estimate_room_progress_history;
create policy estimate_room_progress_history_read
on public.estimate_room_progress_history for select to authenticated
using (
  (select auth.uid()) is not null
  and private.has_company_role(
    company_id,
    array['owner','admin','manager','estimator']::public.company_role[]
  )
);
revoke all on public.estimate_room_progress_history from anon,authenticated;
grant select on public.estimate_room_progress_history to authenticated;

drop policy if exists estimate_progress_update on public.estimate_progress;
drop policy if exists room_progress_update on public.room_progress;
revoke update on public.estimate_progress,public.room_progress from authenticated;

create or replace function public.set_room_completion_status(
  target_room uuid,
  completed boolean
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  target_progress public.room_progress%rowtype;
  estimate_status public.estimate_status;
  previous_state boolean;
  completed_count integer;
  room_count integer;
  percent integer;
  completed_time timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='P0001';
  end if;
  select rp.* into target_progress
  from public.room_progress rp
  join public.estimates e on e.id=rp.estimate_id and e.company_id=rp.company_id
  where rp.room_id=target_room
  for update of rp;
  if target_progress.room_id is null then
    raise exception 'Room progress not found' using errcode='P0001';
  end if;
  select status into estimate_status
  from public.estimates
  where id=target_progress.estimate_id;
  if estimate_status<>'approved' then
    raise exception 'Only approved estimates support room completion' using errcode='P0001';
  end if;
  if not private.has_company_role(
    target_progress.company_id,
    array['owner','admin','manager','estimator']::public.company_role[]
  ) then
    raise exception 'Not authorized' using errcode='P0001';
  end if;
  previous_state:=target_progress.is_completed;
  completed_time:=case when completed then now() else null end;
  update public.room_progress set
    is_completed=completed,
    completed_at=completed_time,
    completed_by=case when completed then (select auth.uid()) else null end,
    completion_percent=case when completed then 100 else 0 end,
    status=case when completed then 'completed' else 'not_started' end,
    updated_by=(select auth.uid()),
    updated_at=now()
  where room_id=target_room;
  if previous_state is distinct from completed then
    insert into public.estimate_room_progress_history(
      room_id,estimate_id,company_id,previous_completed_state,new_completed_state,changed_by
    ) values (
      target_room,target_progress.estimate_id,target_progress.company_id,
      previous_state,completed,(select auth.uid())
    );
  end if;
  select count(*)::integer,count(*) filter(where is_completed)::integer
  into room_count,completed_count
  from public.room_progress
  where estimate_id=target_progress.estimate_id;
  percent:=case when room_count=0 then 0 else round(completed_count::numeric/room_count*100)::integer end;
  update public.estimate_progress set
    completion_percent=percent,
    status=case when room_count>0 and completed_count=room_count then 'completed'
      when completed_count>0 then 'in_progress' else 'not_started' end,
    actual_start_date=case when completed_count>0 then coalesce(actual_start_date,current_date) else null end,
    actual_completion_date=case when room_count>0 and completed_count=room_count then current_date else null end,
    updated_by=(select auth.uid()),
    updated_at=now()
  where estimate_id=target_progress.estimate_id;
  return jsonb_build_object(
    'room_id',target_room,
    'is_completed',completed,
    'completed_at',completed_time,
    'completed_rooms',completed_count,
    'total_rooms',room_count,
    'completion_percentage',percent
  );
end $$;
revoke all on function public.set_room_completion_status(uuid,boolean) from public,anon;
grant execute on function public.set_room_completion_status(uuid,boolean) to authenticated;

create or replace function public.update_estimate_progress_notes(
  target_estimate uuid,
  notes text
) returns void
language plpgsql security definer set search_path=''
as $$
declare target_company uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode='P0001';
  end if;
  select company_id into target_company
  from public.estimates
  where id=target_estimate and status='approved' and deleted_at is null;
  if target_company is null then
    raise exception 'Approved estimate not found' using errcode='P0001';
  end if;
  if not private.has_company_role(
    target_company,
    array['owner','admin','manager','estimator']::public.company_role[]
  ) then
    raise exception 'Not authorized' using errcode='P0001';
  end if;
  update public.estimate_progress set
    progress_notes=left(notes,5000),
    updated_by=(select auth.uid()),
    updated_at=now()
  where estimate_id=target_estimate;
end $$;
revoke all on function public.update_estimate_progress_notes(uuid,text) from public,anon;
grant execute on function public.update_estimate_progress_notes(uuid,text) to authenticated;

create or replace function private.server_estimate_total(
  payload jsonb,
  target_margin_percent numeric,
  project_overhead_percent numeric
) returns bigint language plpgsql stable set search_path=''
as $$
declare room jsonb; opening jsonb; l numeric; w numeric; h numeric; gross numeric; deducted numeric;
  net numeric; coats numeric; container numeric; required integer;
  price numeric; workers integer; wage numeric; prep numeric; surface_key text; surface_modifier numeric;
  effective_coverage numeric; raw_gallons numeric; paint numeric; labor_hours numeric; loaded_labor numeric;
  room_direct numeric; project_direct bigint:=0; overhead bigint; project_internal bigint;
  brand text; color_code text;
begin
  if jsonb_typeof(payload->'rooms')<>'array' or jsonb_array_length(payload->'rooms')=0 then raise exception 'At least one room is required'; end if;
  if target_margin_percent<0 or target_margin_percent>70 then raise exception 'Target gross margin must be from 0 through 70%%'; end if;
  if project_overhead_percent<0 or project_overhead_percent>=100 then raise exception 'Project overhead must be from 0 through 99.99%%'; end if;
  for room in select value from jsonb_array_elements(payload->'rooms') loop
    l:=nullif(room->>'length','')::numeric; w:=nullif(room->>'width','')::numeric; h:=nullif(room->>'height','')::numeric;
    coats:=nullif(room->>'coats','')::numeric;
    container:=nullif(room->>'containerSizeGallons','')::numeric;
    price:=round(nullif(room->>'pricePerContainerDollars','')::numeric*100);
    workers:=nullif(room->>'workers','')::integer; wage:=round(nullif(room->>'wageDollars','')::numeric*100);
    prep:=nullif(room->>'prepHours','')::numeric;
    brand:=coalesce(nullif(trim(room->>'paintBrand'),''),nullif(trim(room#>>'{paint,brandName}'),''));
    color_code:=coalesce(nullif(trim(room->>'paintColorCode'),''),nullif(trim(room#>>'{paint,colorCode}'),''));
    surface_key:=coalesce(nullif(room->>'surfaceType',''),'smooth_previously_painted_drywall');
    surface_modifier:=private.surface_modifier(surface_key);
    if surface_modifier is null then raise exception 'Unsupported surface type: %',surface_key; end if;
    if l<=0 or w<=0 or h<=0 or coats<1 or coats<>trunc(coats) or container<=0
      or price<=0 or workers<1 or wage<=0 or prep<0 then
      raise exception 'Every room must have valid dimensions, labor, and paint pricing';
    end if;
    if brand is null then raise exception 'Every room must have a paint brand'; end if;
    if color_code is null then raise exception 'Every room must have a paint color code'; end if;
    gross:=2*(l+w)*h; deducted:=0;
    for opening in select value from jsonb_array_elements(coalesce(room->'openings','[]'::jsonb)) loop
      if coalesce(nullif(opening->>'width','')::numeric,0)<0 or coalesce(nullif(opening->>'height','')::numeric,0)<0
        or coalesce(nullif(opening->>'quantity','')::integer,1)<1 then raise exception 'Invalid opening'; end if;
      if coalesce((opening->>'subtractFromPaintableArea')::boolean,true) then
        deducted:=deducted+coalesce(nullif(opening->>'width','')::numeric,0)
          *coalesce(nullif(opening->>'height','')::numeric,0)*coalesce(nullif(opening->>'quantity','')::integer,1);
      end if;
    end loop;
    if deducted>gross then raise exception 'Opening area exceeds gross wall area'; end if;
    net:=gross-deducted;
    effective_coverage:=375*surface_modifier/1.15;
    raw_gallons:=(net*coats)/effective_coverage;
    required:=ceil(raw_gallons/container);
    paint:=price*required;
    labor_hours:=(net*coats/150)+prep;
    loaded_labor:=(labor_hours*wage)*1.20;
    room_direct:=paint+loaded_labor;
    project_direct:=project_direct+round(room_direct)::bigint;
  end loop;
  overhead:=round(project_direct*project_overhead_percent/100)::bigint;
  project_internal:=project_direct+overhead;
  return round(project_internal/(1-target_margin_percent/100))::bigint;
end $$;
revoke all on function private.server_estimate_total(jsonb,numeric,numeric) from public,anon,authenticated;

create or replace function public.save_estimate_draft(
  target_estimate uuid, target_company uuid, draft_title text, payload jsonb,
  calculation jsonb, total_amount bigint, cost_amount bigint, margin_percent numeric
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare saved_id uuid; room jsonb; opening jsonb; saved_room uuid; settings_overhead numeric;
begin
  if not private.has_company_role(target_company,array['owner','admin','manager','estimator']::public.company_role[]) then raise exception 'Not authorized'; end if;
  if margin_percent<0 or margin_percent>70 then raise exception 'Target gross margin must be from 0 through 70%%'; end if;
  if target_estimate is null then
    select coalesce(project_overhead_percent,15) into settings_overhead
    from public.company_estimate_settings where company_id=target_company;
    settings_overhead:=coalesce(settings_overhead,15);
    insert into public.estimates(company_id,title,status,total_cents,subtotal_cents,cost_cents,target_margin_percent,
      calculation_snapshot,draft_payload,formula_version,production_rate_snapshot,labor_burden_percent_snapshot,
      overhead_percent_snapshot,waste_rate_snapshot,updated_by)
    values(target_company,coalesce(nullif(trim(draft_title),''),'Untitled draft'),'draft',greatest(total_amount,0),
      greatest(total_amount,0),greatest(cost_amount,0),margin_percent,calculation,payload,'7.0.0',150,20,
      settings_overhead,15,(select auth.uid()))
    returning id into saved_id;
    insert into public.estimate_status_history(estimate_id,company_id,to_status,changed_by) values(saved_id,target_company,'draft',(select auth.uid()));
  else
    update public.estimates set title=coalesce(nullif(trim(draft_title),''),title),total_cents=greatest(total_amount,0),
      subtotal_cents=greatest(total_amount,0),cost_cents=greatest(cost_amount,0),target_margin_percent=margin_percent,
      calculation_snapshot=calculation,draft_payload=payload,formula_version='7.0.0',production_rate_snapshot=150,
      labor_burden_percent_snapshot=20,waste_rate_snapshot=15,
      updated_by=(select auth.uid()),updated_at=now()
    where id=target_estimate and company_id=target_company and status='draft' and deleted_at is null returning id into saved_id;
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
      insert into public.room_openings(company_id,estimate_id,room_id,name,kind,width_millifeet,height_millifeet,quantity,sort_order,subtract_from_paintable_area)
      values(target_company,saved_id,saved_room,coalesce(opening->>'name','Opening'),coalesce(opening->>'kind','window'),
        coalesce(nullif(opening->>'width','')::numeric,0)*1000,coalesce(nullif(opening->>'height','')::numeric,0)*1000,
        coalesce(nullif(opening->>'quantity','')::integer,1),coalesce(nullif(opening->>'sortOrder','')::integer,0),
        coalesce((opening->>'subtractFromPaintableArea')::boolean,true));
    end loop;
  end loop;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_company,(select auth.uid()),case when target_estimate is null then 'estimate.draft_created' else 'estimate.draft_updated' end,
    'estimate',saved_id::text,jsonb_build_object('room_count',jsonb_array_length(coalesce(payload->'rooms','[]'::jsonb)),'formula_version','7.0.0'));
  return saved_id;
end $$;

create or replace function public.approve_estimate(target_estimate uuid) returns uuid
language plpgsql security definer set search_path='extensions'
as $$
declare e public.estimates%rowtype; snapshot jsonb; project_id uuid; verified_total bigint; snapshot_digest text;
begin
  select * into e from public.estimates where id=target_estimate for update;
  if e.id is null or e.status<>'draft' or e.deleted_at is not null then raise exception 'Estimate must be an active draft'; end if;
  if not private.has_company_role(e.company_id,array['owner','admin','manager']::public.company_role[]) then raise exception 'Manager permission required'; end if;
  verified_total:=private.server_estimate_total(e.draft_payload,e.target_margin_percent,e.overhead_percent_snapshot);
  if e.total_cents<>verified_total then raise exception 'Draft total is stale or invalid; save the draft again before approval'; end if;
  snapshot:=jsonb_build_object(
    'estimate',to_jsonb(e),'rooms',e.draft_payload->'rooms','calculation',e.calculation_snapshot,
    'server_verified_total_cents',verified_total,
    'server_assumptions',jsonb_build_object(
      'production_rate_sqft_per_person_hour',150,'labor_burden_percent',20,
      'overhead_percent',e.overhead_percent_snapshot,
      'base_coverage_sqft_per_gallon',375,'waste_allowance_percent',15,'product_modifier',1,
      'coverage_model','effective_coverage','project_cost_model','aggregate_then_overhead_then_margin',
      'formula_version','7.0.0','target_gross_margin_percent',e.target_margin_percent
    )
  );
  snapshot_digest:=encode(digest(snapshot::text,'sha256'),'hex');
  insert into public.estimate_approval_snapshots(estimate_id,company_id,snapshot,formula_version,approved_by,snapshot_hash)
  values(e.id,e.company_id,snapshot,e.formula_version,(select auth.uid()),snapshot_digest);
  update public.estimates set status='approved',approved_at=now(),approved_by=(select auth.uid()),accepted_at=now(),
    updated_by=(select auth.uid()),updated_at=now() where id=e.id;
  insert into public.estimate_status_history(estimate_id,company_id,from_status,to_status,changed_by)
  values(e.id,e.company_id,'draft','approved',(select auth.uid()));
  insert into public.projects(company_id,estimate_id,name,status,contract_snapshot)
  values(e.company_id,e.id,e.title,'planned',snapshot) returning id into project_id;
  insert into public.estimate_progress(estimate_id,company_id,updated_by) values(e.id,e.company_id,(select auth.uid()));
  insert into public.room_progress(room_id,estimate_id,company_id,updated_by)
    select id,e.id,e.company_id,(select auth.uid()) from public.estimate_rooms where estimate_id=e.id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(e.company_id,(select auth.uid()),'estimate.approved','estimate',e.id::text,
    jsonb_build_object('snapshot_hash',snapshot_digest,'server_verified_total_cents',verified_total,'formula_version','7.0.0','overhead_percent',e.overhead_percent_snapshot));
  return project_id;
end $$;

create or replace function private.protect_approved_estimate() returns trigger
language plpgsql set search_path=''
as $$
begin
  if old.status='approved' and (
    new.title is distinct from old.title or new.customer_id is distinct from old.customer_id
    or new.property_id is distinct from old.property_id or new.cost_cents is distinct from old.cost_cents
    or new.total_cents is distinct from old.total_cents or new.calculation_snapshot is distinct from old.calculation_snapshot
    or new.draft_payload is distinct from old.draft_payload or new.target_margin_percent is distinct from old.target_margin_percent
    or new.average_hourly_wage_cents is distinct from old.average_hourly_wage_cents
    or new.overhead_percent_snapshot is distinct from old.overhead_percent_snapshot
    or new.production_rate_snapshot is distinct from old.production_rate_snapshot
    or new.labor_burden_percent_snapshot is distinct from old.labor_burden_percent_snapshot
    or new.waste_rate_snapshot is distinct from old.waste_rate_snapshot
  ) then raise exception 'Approved estimate financial and scope data is immutable' using errcode='P0001'; end if;
  if old.status='approved' and new.status not in ('approved','archived','canceled') then
    raise exception 'Approved estimates cannot return to an editable state' using errcode='P0001';
  end if;
  return new;
end $$;

revoke all on function public.save_estimate_draft(uuid,uuid,text,jsonb,jsonb,bigint,bigint,numeric),public.approve_estimate(uuid) from public,anon;
grant execute on function public.save_estimate_draft(uuid,uuid,text,jsonb,jsonb,bigint,bigint,numeric),public.approve_estimate(uuid) to authenticated;
drop function if exists private.server_estimate_total(jsonb,numeric);
