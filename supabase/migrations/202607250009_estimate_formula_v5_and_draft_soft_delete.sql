-- Formula v5: protected 15% material waste, opening deduction controls, and recoverable draft deletion.
alter table public.estimates
  add column if not exists waste_rate_snapshot numeric(5,2) not null default 15 check (waste_rate_snapshot = 15),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists deletion_reason text;
create index if not exists estimates_active_status_updated_idx
  on public.estimates(company_id,status,updated_at desc) where deleted_at is null;

alter table public.room_openings
  add column if not exists subtract_from_paintable_area boolean not null default true,
  add column if not exists calculated_area_sqft numeric(12,3) generated always as
    ((width_millifeet::numeric / 1000) * (height_millifeet::numeric / 1000) * quantity) stored;
alter table public.room_openings drop constraint if exists room_openings_kind_check;
alter table public.room_openings add constraint room_openings_kind_check
  check(kind in ('window','door','archway','closet_opening','pass_through','other')) not valid;
alter table public.room_openings validate constraint room_openings_kind_check;

create or replace function public.delete_estimate_draft(target_estimate uuid, deletion_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare e public.estimates%rowtype;
begin
  select * into e from public.estimates where id=target_estimate for update;
  if e.id is null then raise exception 'Draft not found'; end if;
  if not private.has_company_role(e.company_id,array['owner','admin','manager']::public.company_role[]) then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(e.company_id,auth.uid(),'estimate.draft_delete_denied','estimate',e.id::text,jsonb_build_object('status',e.status));
    raise exception 'Manager permission required';
  end if;
  if e.status <> 'draft' then
    insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(e.company_id,auth.uid(),'estimate.draft_delete_denied','estimate',e.id::text,jsonb_build_object('status',e.status));
    raise exception 'Only draft estimates can be deleted';
  end if;
  if e.deleted_at is not null then raise exception 'Draft is already deleted'; end if;
  update public.estimates set deleted_at=now(),deleted_by=auth.uid(),
    deletion_reason=left(nullif(trim(deletion_note),''),500),updated_by=auth.uid(),updated_at=now()
  where id=e.id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(e.company_id,auth.uid(),'estimate.draft_deleted','estimate',e.id::text,jsonb_build_object('soft_delete',true));
  return e.id;
end $$;
revoke all on function public.delete_estimate_draft(uuid,text) from public,anon;
grant execute on function public.delete_estimate_draft(uuid,text) to authenticated;

create or replace function private.server_estimate_total(payload jsonb,target_margin_percent numeric)
returns bigint language plpgsql immutable set search_path=''
as $$
declare room jsonb; opening jsonb; l numeric; w numeric; h numeric; gross numeric; deducted numeric;
  net numeric; coats numeric; coverage numeric; container numeric; quantity integer; required integer;
  price numeric; workers integer; wage numeric; prep numeric; adjusted numeric; paint numeric;
  labor_hours numeric; loaded_labor numeric; direct numeric; internal_cost numeric; total_internal numeric:=0;
begin
  if jsonb_typeof(payload->'rooms')<>'array' or jsonb_array_length(payload->'rooms')=0 then raise exception 'At least one room is required'; end if;
  if target_margin_percent<0 or target_margin_percent>70 then raise exception 'Target gross margin must be from 0 through 70%%'; end if;
  for room in select value from jsonb_array_elements(payload->'rooms') loop
    l:=nullif(room->>'length','')::numeric; w:=nullif(room->>'width','')::numeric; h:=nullif(room->>'height','')::numeric;
    coats:=nullif(room->>'coats','')::numeric; coverage:=nullif(room->>'coverage','')::numeric;
    container:=nullif(room->>'containerSizeGallons','')::numeric; quantity:=nullif(room->>'containerQuantity','')::integer;
    price:=round(nullif(room->>'pricePerContainerDollars','')::numeric*100);
    workers:=nullif(room->>'workers','')::integer; wage:=round(nullif(room->>'wageDollars','')::numeric*100);
    prep:=nullif(room->>'prepHours','')::numeric;
    if l<=0 or w<=0 or h<=0 or coats<1 or coats<>trunc(coats) or coverage<=0 or container<=0
      or quantity<1 or price<=0 or workers<1 or wage<=0 or prep<0 then
      raise exception 'Every room must have valid dimensions, labor, and paint pricing';
    end if;
    if coalesce(trim(room#>>'{paint,productName}'),'')='' then raise exception 'Every room must have a selected paint product line'; end if;
    gross:=2*(l+w)*h; deducted:=0;
    for opening in select value from jsonb_array_elements(coalesce(room->'openings','[]'::jsonb)) loop
      if coalesce(nullif(opening->>'width','')::numeric,0)<0
        or coalesce(nullif(opening->>'height','')::numeric,0)<0
        or coalesce(nullif(opening->>'quantity','')::integer,1)<1 then
        raise exception 'Opening dimensions must be non-negative and quantity must be positive';
      end if;
      if coalesce((opening->>'subtractFromPaintableArea')::boolean,true) then
        deducted:=deducted+coalesce(nullif(opening->>'width','')::numeric,0)
          *coalesce(nullif(opening->>'height','')::numeric,0)
          *coalesce(nullif(opening->>'quantity','')::integer,1);
      end if;
    end loop;
    if deducted>gross then raise exception 'Opening area exceeds gross wall area'; end if;
    net:=gross-deducted;
    adjusted:=net*coats*1.15;
    required:=ceil((adjusted/coverage)/container);
    quantity:=greatest(required,quantity);
    paint:=price*quantity;
    labor_hours:=(net*coats/150)+prep;
    loaded_labor:=(labor_hours*wage)*1.20;
    direct:=paint+loaded_labor;
    internal_cost:=direct*1.15;
    total_internal:=total_internal+internal_cost;
  end loop;
  return round(total_internal/(1-target_margin_percent/100))::bigint;
end $$;
revoke all on function private.server_estimate_total(jsonb,numeric) from public,anon,authenticated;

create or replace function public.save_estimate_draft(
  target_estimate uuid,target_company uuid,draft_title text,payload jsonb,
  calculation jsonb,total_amount bigint,cost_amount bigint,margin_percent numeric
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare saved_id uuid; room jsonb; opening jsonb; saved_room uuid;
begin
  if not private.has_company_role(target_company,array['owner','admin','manager','estimator']::public.company_role[]) then raise exception 'Not authorized'; end if;
  if margin_percent<0 or margin_percent>70 then raise exception 'Target gross margin must be from 0 through 70%%'; end if;
  if target_estimate is null then
    insert into public.estimates(company_id,title,status,total_cents,subtotal_cents,cost_cents,target_margin_percent,
      calculation_snapshot,draft_payload,formula_version,production_rate_snapshot,labor_burden_percent_snapshot,
      overhead_percent_snapshot,waste_rate_snapshot,updated_by)
    values(target_company,coalesce(nullif(trim(draft_title),''),'Untitled draft'),'draft',greatest(total_amount,0),
      greatest(total_amount,0),greatest(cost_amount,0),margin_percent,calculation,payload,'5.0.0',150,20,15,15,auth.uid())
    returning id into saved_id;
    insert into public.estimate_status_history(estimate_id,company_id,to_status,changed_by) values(saved_id,target_company,'draft',auth.uid());
  else
    update public.estimates set title=coalesce(nullif(trim(draft_title),''),title),total_cents=greatest(total_amount,0),
      subtotal_cents=greatest(total_amount,0),cost_cents=greatest(cost_amount,0),target_margin_percent=margin_percent,
      calculation_snapshot=calculation,draft_payload=payload,formula_version='5.0.0',production_rate_snapshot=150,
      labor_burden_percent_snapshot=20,overhead_percent_snapshot=15,waste_rate_snapshot=15,
      updated_by=auth.uid(),updated_at=now()
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
  values(target_company,auth.uid(),case when target_estimate is null then 'estimate.draft_created' else 'estimate.draft_updated' end,
    'estimate',saved_id::text,jsonb_build_object('room_count',jsonb_array_length(coalesce(payload->'rooms','[]'::jsonb)),'formula_version','5.0.0'));
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
  verified_total:=private.server_estimate_total(e.draft_payload,e.target_margin_percent);
  if e.total_cents<>verified_total then raise exception 'Draft total is stale or invalid; save the draft again before approval'; end if;
  snapshot:=jsonb_build_object(
    'estimate',to_jsonb(e),'rooms',e.draft_payload->'rooms','calculation',e.calculation_snapshot,
    'server_verified_total_cents',verified_total,
    'server_assumptions',jsonb_build_object(
      'production_rate_sqft_per_person_hour',150,'labor_burden_percent',20,'overhead_percent',15,
      'paint_waste_percent',15,'formula_version','5.0.0','target_gross_margin_percent',e.target_margin_percent
    )
  );
  snapshot_digest:=encode(digest(snapshot::text,'sha256'),'hex');
  insert into public.estimate_approval_snapshots(estimate_id,company_id,snapshot,formula_version,approved_by,snapshot_hash)
  values(e.id,e.company_id,snapshot,e.formula_version,auth.uid(),snapshot_digest);
  update public.estimates set status='approved',approved_at=now(),approved_by=auth.uid(),accepted_at=now(),
    updated_by=auth.uid(),updated_at=now() where id=e.id;
  insert into public.estimate_status_history(estimate_id,company_id,from_status,to_status,changed_by)
  values(e.id,e.company_id,'draft','approved',auth.uid());
  insert into public.projects(company_id,estimate_id,name,status,contract_snapshot)
  values(e.company_id,e.id,e.title,'planned',snapshot) returning id into project_id;
  insert into public.estimate_progress(estimate_id,company_id,updated_by) values(e.id,e.company_id,auth.uid());
  insert into public.room_progress(room_id,estimate_id,company_id,updated_by)
    select id,e.id,e.company_id,auth.uid() from public.estimate_rooms where estimate_id=e.id;
  insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(e.company_id,auth.uid(),'estimate.approved','estimate',e.id::text,
    jsonb_build_object('snapshot_hash',snapshot_digest,'server_verified_total_cents',verified_total,'formula_version','5.0.0'));
  return project_id;
end $$;
revoke all on function public.approve_estimate(uuid) from public,anon;
grant execute on function public.approve_estimate(uuid) to authenticated;

-- Approved v4 records remain unchanged; new approvals include the v5 configuration in their immutable snapshot.
