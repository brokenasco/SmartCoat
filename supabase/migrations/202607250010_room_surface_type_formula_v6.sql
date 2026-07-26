-- Formula v6 adds canonical room surface types and effective material coverage.
create or replace function private.surface_modifier(surface_key text) returns numeric
language sql immutable strict set search_path=''
as $$
  select case surface_key
    when 'bare_drywall' then 0.8 when 'concrete_block' then 0.65 when 'fine_stucco' then 0.75
    when 'heavy_orange_peel' then 0.85 when 'heavy_stucco' then 0.6 when 'knockdown_texture' then 0.85
    when 'light_orange_peel' then 0.95 when 'medium_orange_peel' then 0.9 when 'painted_brick' then 0.75
    when 'popcorn_ceiling' then 0.75 when 'rough_wood_or_cedar' then 0.7 when 'smooth_metal' then 1.0
    when 'smooth_previously_painted_drywall' then 1.0 when 'smooth_wood' then 0.9 when 'unpainted_brick' then 0.6
    else null end
$$;
revoke all on function private.surface_modifier(text) from public,anon,authenticated;

alter table public.estimate_rooms
  add column if not exists surface_type text not null default 'smooth_previously_painted_drywall',
  add column if not exists surface_modifier_snapshot numeric(5,3) not null default 1.0;
alter table public.estimate_rooms drop constraint if exists estimate_rooms_surface_type_check;
alter table public.estimate_rooms add constraint estimate_rooms_surface_type_check check(
  private.surface_modifier(surface_type) is not null
);

create or replace function private.snapshot_room_surface() returns trigger
language plpgsql set search_path=''
as $$
begin
  new.surface_type:=coalesce(nullif(new.calculation_snapshot->>'surfaceType',''),new.surface_type,'smooth_previously_painted_drywall');
  new.surface_modifier_snapshot:=private.surface_modifier(new.surface_type);
  if new.surface_modifier_snapshot is null then raise exception 'Unsupported surface type: %',new.surface_type; end if;
  return new;
end $$;
drop trigger if exists snapshot_room_surface on public.estimate_rooms;
create trigger snapshot_room_surface before insert or update of calculation_snapshot,surface_type
on public.estimate_rooms for each row execute function private.snapshot_room_surface();

create or replace function private.use_formula_v6_for_drafts() returns trigger
language plpgsql set search_path=''
as $$
begin
  if new.status='draft' then new.formula_version:='6.0.0'; end if;
  return new;
end $$;
drop trigger if exists use_formula_v6_for_drafts on public.estimates;
create trigger use_formula_v6_for_drafts before insert or update on public.estimates
for each row execute function private.use_formula_v6_for_drafts();

create or replace function private.server_estimate_total(payload jsonb,target_margin_percent numeric)
returns bigint language plpgsql stable set search_path=''
as $$
declare room jsonb; opening jsonb; l numeric; w numeric; h numeric; gross numeric; deducted numeric;
  net numeric; coats numeric; coverage numeric; container numeric; quantity integer; required integer;
  price numeric; workers integer; wage numeric; prep numeric; surface_key text; surface_modifier numeric;
  waste_factor numeric:=1/1.15; effective_coverage numeric; raw_gallons numeric; paint numeric;
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
    surface_key:=coalesce(nullif(room->>'surfaceType',''),'smooth_previously_painted_drywall');
    surface_modifier:=private.surface_modifier(surface_key);
    if surface_modifier is null then raise exception 'Unsupported surface type: %',surface_key; end if;
    if l<=0 or w<=0 or h<=0 or coats<1 or coats<>trunc(coats) or coverage<=0 or container<=0
      or quantity<1 or price<=0 or workers<1 or wage<=0 or prep<0 then
      raise exception 'Every room must have valid dimensions, labor, and paint pricing';
    end if;
    if coalesce(trim(room#>>'{paint,productName}'),'')='' then raise exception 'Every room must have a selected paint product line'; end if;
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
    effective_coverage:=coverage*surface_modifier*1.0*waste_factor;
    if effective_coverage<=0 then raise exception 'Effective coverage rate must be greater than zero'; end if;
    raw_gallons:=(net*coats)/effective_coverage;
    required:=ceil(raw_gallons/container); quantity:=greatest(required,quantity); paint:=price*quantity;
    labor_hours:=(net*coats/150)+prep; loaded_labor:=(labor_hours*wage)*1.20;
    direct:=paint+loaded_labor; internal_cost:=direct*1.15; total_internal:=total_internal+round(internal_cost);
  end loop;
  return round(total_internal/(1-target_margin_percent/100))::bigint;
end $$;
revoke all on function private.server_estimate_total(jsonb,numeric) from public,anon,authenticated;

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
      'waste_allowance_percent',15,'product_modifier',1,'coverage_model','effective_coverage',
      'formula_version','6.0.0','target_gross_margin_percent',e.target_margin_percent
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
    jsonb_build_object('snapshot_hash',snapshot_digest,'server_verified_total_cents',verified_total,'formula_version','6.0.0'));
  return project_id;
end $$;
revoke all on function public.approve_estimate(uuid) from public,anon;
grant execute on function public.approve_estimate(uuid) to authenticated;

-- Existing room rows retain the smooth painted drywall default. Existing approved snapshots are not modified.
