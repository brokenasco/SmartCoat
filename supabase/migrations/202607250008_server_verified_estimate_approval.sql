-- Recalculate draft totals from normalized estimate inputs at approval time.
-- This prevents browser-supplied calculation snapshots from becoming binding contracts.
create or replace function private.server_estimate_total(
  payload jsonb,
  target_margin_percent numeric
) returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  room jsonb;
  opening jsonb;
  length_feet numeric;
  width_feet numeric;
  height_feet numeric;
  gross_area numeric;
  opening_area numeric;
  net_area numeric;
  coats numeric;
  coverage numeric;
  waste_percent numeric;
  container_size numeric;
  container_quantity integer;
  required_quantity integer;
  price_per_container_cents numeric;
  worker_count integer;
  wage_cents numeric;
  prep_hours numeric;
  adjusted_coverage numeric;
  paint_cost numeric;
  labor_hours numeric;
  loaded_labor_cost numeric;
  direct_cost numeric;
  contractor_cost numeric;
  room_total numeric;
  estimate_total bigint := 0;
begin
  if jsonb_typeof(payload->'rooms') <> 'array'
     or jsonb_array_length(payload->'rooms') = 0 then
    raise exception 'At least one room is required';
  end if;
  if target_margin_percent < 0 or target_margin_percent >= 100 then
    raise exception 'Target gross margin must be from 0 through 99.99%%';
  end if;

  for room in select value from jsonb_array_elements(payload->'rooms')
  loop
    length_feet := nullif(room->>'length', '')::numeric;
    width_feet := nullif(room->>'width', '')::numeric;
    height_feet := nullif(room->>'height', '')::numeric;
    coats := nullif(room->>'coats', '')::numeric;
    coverage := nullif(room->>'coverage', '')::numeric;
    waste_percent := nullif(room->>'waste', '')::numeric;
    container_size := nullif(room->>'containerSizeGallons', '')::numeric;
    container_quantity := nullif(room->>'containerQuantity', '')::integer;
    price_per_container_cents := round(nullif(room->>'pricePerContainerDollars', '')::numeric * 100);
    worker_count := nullif(room->>'workers', '')::integer;
    wage_cents := round(nullif(room->>'wageDollars', '')::numeric * 100);
    prep_hours := nullif(room->>'prepHours', '')::numeric;

    if length_feet <= 0 or width_feet <= 0 or height_feet <= 0
       or coats < 1 or coats <> trunc(coats)
       or coverage <= 0 or waste_percent < 0 or waste_percent > 100
       or container_size <= 0 or container_quantity < 1
       or price_per_container_cents <= 0 or worker_count < 1
       or wage_cents <= 0 or prep_hours < 0 then
      raise exception 'Every room must have valid dimensions, labor, and paint pricing';
    end if;
    if coalesce(trim(room#>>'{paint,productName}'), '') = '' then
      raise exception 'Every room must have a selected paint product line';
    end if;

    gross_area := 2 * (length_feet + width_feet) * height_feet;
    opening_area := 0;
    for opening in
      select value from jsonb_array_elements(coalesce(room->'openings', '[]'::jsonb))
    loop
      if coalesce(nullif(opening->>'width', '')::numeric, 0) < 0
         or coalesce(nullif(opening->>'height', '')::numeric, 0) < 0
         or coalesce(nullif(opening->>'quantity', '')::integer, 1) < 0 then
        raise exception 'Opening dimensions and quantity cannot be negative';
      end if;
      opening_area := opening_area
        + coalesce(nullif(opening->>'width', '')::numeric, 0)
        * coalesce(nullif(opening->>'height', '')::numeric, 0)
        * coalesce(nullif(opening->>'quantity', '')::integer, 1);
    end loop;
    if opening_area > gross_area then
      raise exception 'Opening area exceeds gross wall area';
    end if;

    net_area := gross_area - opening_area;
    adjusted_coverage := net_area * coats * (1 + waste_percent / 100);
    required_quantity := ceil((adjusted_coverage / coverage) / container_size);
    container_quantity := greatest(required_quantity, container_quantity);
    paint_cost := price_per_container_cents * container_quantity;

    -- Waste changes material purchasing only. Labor follows net coated wall area.
    labor_hours := (net_area * coats / 150) + prep_hours;
    loaded_labor_cost := (labor_hours * wage_cents) * 1.20;
    direct_cost := paint_cost + loaded_labor_cost;
    contractor_cost := direct_cost * 1.15;
    room_total := contractor_cost / (1 - target_margin_percent / 100);
    estimate_total := estimate_total + round(room_total)::bigint;
  end loop;

  return estimate_total;
end
$$;

revoke all on function private.server_estimate_total(jsonb, numeric) from public, anon, authenticated;

create or replace function public.approve_estimate(target_estimate uuid) returns uuid
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  e public.estimates%rowtype;
  snapshot jsonb;
  project_id uuid;
  verified_total bigint;
  snapshot_digest text;
begin
  select * into e from public.estimates where id = target_estimate for update;
  if e.id is null or e.status <> 'draft' then
    raise exception 'Estimate must be a draft';
  end if;
  if not private.has_company_role(
    e.company_id,
    array['owner','admin','manager']::public.company_role[]
  ) then
    raise exception 'Manager permission required';
  end if;

  verified_total := private.server_estimate_total(e.draft_payload, e.target_margin_percent);
  if e.total_cents <> verified_total then
    raise exception 'Draft total is stale or invalid; save the draft again before approval';
  end if;

  snapshot := jsonb_build_object(
    'estimate', to_jsonb(e),
    'rooms', e.draft_payload->'rooms',
    'calculation', e.calculation_snapshot,
    'server_verified_total_cents', verified_total,
    'server_assumptions', jsonb_build_object(
      'production_rate_sqft_per_person_hour', 150,
      'labor_burden_percent', 20,
      'overhead_percent', 15,
      'formula_version', '4.0.0'
    )
  );
  snapshot_digest := encode(digest(snapshot::text, 'sha256'), 'hex');

  insert into public.estimate_approval_snapshots(
    estimate_id, company_id, snapshot, formula_version, approved_by, snapshot_hash
  ) values (
    e.id, e.company_id, snapshot, e.formula_version, auth.uid(), snapshot_digest
  );
  update public.estimates
  set status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      accepted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = e.id;
  insert into public.estimate_status_history(
    estimate_id, company_id, from_status, to_status, changed_by
  ) values (e.id, e.company_id, 'draft', 'approved', auth.uid());
  insert into public.projects(company_id, estimate_id, name, status, contract_snapshot)
  values (e.company_id, e.id, e.title, 'planned', snapshot)
  returning id into project_id;
  insert into public.estimate_progress(estimate_id, company_id, updated_by)
  values (e.id, e.company_id, auth.uid());
  insert into public.room_progress(room_id, estimate_id, company_id, updated_by)
  select id, e.id, e.company_id, auth.uid()
  from public.estimate_rooms
  where estimate_id = e.id;
  insert into public.audit_logs(
    company_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    e.company_id,
    auth.uid(),
    'estimate.approved',
    'estimate',
    e.id::text,
    jsonb_build_object(
      'snapshot_hash', snapshot_digest,
      'server_verified_total_cents', verified_total
    )
  );
  return project_id;
end
$$;

revoke all on function public.approve_estimate(uuid) from public, anon;
grant execute on function public.approve_estimate(uuid) to authenticated;
