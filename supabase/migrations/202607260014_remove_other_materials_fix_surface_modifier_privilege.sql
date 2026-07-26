-- Remove legacy other-direct-material inputs from new calculations and restore
-- the narrow function privilege required by authenticated room snapshot writes.
grant execute on function private.surface_modifier(text) to authenticated;

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
    -- Keep the legacy column for historical compatibility, but new and edited
    -- drafts no longer accept or persist an other-materials value.
    new.other_direct_materials_cents:=0;
  end if;
  return new;
end $$;

create or replace function private.server_estimate_total(payload jsonb,target_margin_percent numeric)
returns bigint language plpgsql stable set search_path=''
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
  overhead:=round(project_direct*0.15)::bigint;
  project_internal:=project_direct+overhead;
  return round(project_internal/(1-target_margin_percent/100))::bigint;
end $$;
revoke all on function private.server_estimate_total(jsonb,numeric) from public,anon,authenticated;
