-- Production estimator repair: searchable code key, DC-001 source correction,
-- and immutable manual-container pricing snapshots. Additive and data-preserving.

create or replace function private.normalize_paint_search_code(value text) returns text
language sql immutable strict security invoker set search_path=''
as $$
  select regexp_replace(private.normalize_paint_identifier(value), '[ -]+', '', 'g')
$$;
revoke all on function private.normalize_paint_search_code(text) from public, anon;
grant execute on function private.normalize_paint_search_code(text) to authenticated;

alter table public.paint_colors
  add column if not exists search_color_code text
  generated always as (private.normalize_paint_search_code(primary_color_code)) stored;
alter table public.paint_color_aliases
  add column if not exists search_alias_code text
  generated always as (private.normalize_paint_search_code(alias_code)) stored;

create index if not exists paint_colors_brand_search_code_idx
  on public.paint_colors(brand_id, search_color_code);
create index if not exists paint_colors_active_search_code_idx
  on public.paint_colors(search_color_code)
  where is_active and not is_discontinued;
create index if not exists paint_color_alias_search_code_idx
  on public.paint_color_aliases(search_alias_code);

alter table public.estimate_paint_items
  add column if not exists is_manual_entry boolean not null default false,
  add column if not exists product_type_snapshot text,
  add column if not exists project_use_snapshot public.paint_scope,
  add column if not exists container_volume_snapshot numeric(10,4),
  add column if not exists container_volume_unit_snapshot text,
  add column if not exists container_gallons_snapshot numeric(10,6),
  add column if not exists container_quantity_snapshot integer,
  add column if not exists price_per_container_cents_snapshot bigint,
  add column if not exists gallons_purchased_snapshot numeric(10,3),
  add column if not exists excess_gallons_snapshot numeric(10,3),
  add column if not exists price_availability_snapshot text,
  add column if not exists notes_snapshot text;

alter table public.estimate_paint_items
  drop constraint if exists estimate_paint_items_container_volume_positive,
  add constraint estimate_paint_items_container_volume_positive
    check(container_volume_snapshot is null or container_volume_snapshot > 0),
  drop constraint if exists estimate_paint_items_container_gallons_positive,
  add constraint estimate_paint_items_container_gallons_positive
    check(container_gallons_snapshot is null or container_gallons_snapshot > 0),
  drop constraint if exists estimate_paint_items_container_quantity_positive,
  add constraint estimate_paint_items_container_quantity_positive
    check(container_quantity_snapshot is null or container_quantity_snapshot > 0),
  drop constraint if exists estimate_paint_items_container_price_nonnegative,
  add constraint estimate_paint_items_container_price_nonnegative
    check(price_per_container_cents_snapshot is null or price_per_container_cents_snapshot >= 0);

insert into public.paint_data_sources(
  brand_id, source_name, source_type, source_url, authorization_status,
  license_reference, usage_notes, expected_update_frequency, is_enabled,
  last_successful_sync_at, last_attempted_sync_at
)
select
  b.id,
  'Behr official color detail manual verification',
  'approved_manual_import',
  'https://www.behr.com/colors/color-detail/dc-001',
  'approved_manual_import',
  'Official Behr color-detail page verified 2026-07-25',
  'Emergency factual color correction sourced from the official manufacturer page. This does not authorize bulk scraping or retailer price collection.',
  'Manual re-verification annually',
  true,
  now(),
  now()
from public.paint_brands b
where b.name='Behr'
on conflict(brand_id, source_name) do update set
  source_url=excluded.source_url,
  authorization_status=excluded.authorization_status,
  license_reference=excluded.license_reference,
  usage_notes=excluded.usage_notes,
  is_enabled=true,
  last_successful_sync_at=now(),
  last_attempted_sync_at=now(),
  updated_at=now();

insert into public.paint_colors(
  brand_id, primary_color_code, color_name, hex_value,
  red_value, green_value, blue_value, lrv, color_family,
  interior_recommended, exterior_recommended, is_active, is_discontinued,
  external_color_id, source_id, source_last_seen_at, source_updated_at
)
select
  b.id, 'DC-001', 'Whipped Cream', '#F6F5EF',
  246, 245, 239, 91, 'White',
  true, true, true, false,
  'DC-001', s.id, now(), now()
from public.paint_brands b
join public.paint_data_sources s
  on s.brand_id=b.id and s.source_name='Behr official color detail manual verification'
where b.name='Behr'
on conflict(brand_id, normalized_color_code) do update set
  color_name=excluded.color_name,
  hex_value=excluded.hex_value,
  red_value=excluded.red_value,
  green_value=excluded.green_value,
  blue_value=excluded.blue_value,
  lrv=excluded.lrv,
  color_family=excluded.color_family,
  interior_recommended=excluded.interior_recommended,
  exterior_recommended=excluded.exterior_recommended,
  is_active=true,
  is_discontinued=false,
  source_id=excluded.source_id,
  source_last_seen_at=now(),
  source_updated_at=now(),
  updated_at=now();

create or replace function public.search_paint_catalog(
  search_term text,
  brand_filter uuid default null,
  scope_filter public.paint_scope default null,
  result_limit integer default 20
) returns table(
  color_id uuid, brand_id uuid, brand_name text, color_code text, color_name text,
  hex_value text, interior_recommended boolean, exterior_recommended boolean,
  is_discontinued boolean, matched_by text, rank integer
)
language sql stable security invoker set search_path=''
as $$
  with query as (
    select
      private.normalize_paint_identifier(search_term) normalized_text,
      private.normalize_paint_search_code(search_term) normalized_code
  ), matches as (
    select
      c.id color_id, b.id brand_id, b.name brand_name,
      c.primary_color_code color_code, c.color_name, c.hex_value,
      c.interior_recommended, c.exterior_recommended, c.is_discontinued,
      case
        when c.search_color_code=q.normalized_code then 'exact_code'
        when c.search_color_code like q.normalized_code || '%' then 'partial_code'
        when exists(
          select 1 from public.paint_color_aliases a
          where a.paint_color_id=c.id and a.search_alias_code=q.normalized_code
        ) then 'alias_code'
        when c.search_color_code like '%' || q.normalized_code || '%' then 'partial_code'
        when c.normalized_color_name like '%' || q.normalized_text || '%' then 'color_name'
        else 'brand'
      end matched_by,
      case
        when c.search_color_code=q.normalized_code and brand_filter=c.brand_id then 1
        when c.search_color_code=q.normalized_code then 2
        when c.search_color_code like q.normalized_code || '%' and brand_filter=c.brand_id then 3
        when c.search_color_code like q.normalized_code || '%' then 4
        when exists(
          select 1 from public.paint_color_aliases a
          where a.paint_color_id=c.id and a.search_alias_code like q.normalized_code || '%'
        ) then 5
        when c.normalized_color_name like '%' || q.normalized_text || '%' then 6
        else 7
      end rank
    from public.paint_colors c
    join public.paint_brands b on b.id=c.brand_id
    join public.paint_manufacturers m on m.id=b.manufacturer_id
    cross join query q
    where (brand_filter is null or c.brand_id=brand_filter)
      and (
        scope_filter is null
        or (scope_filter='interior' and c.interior_recommended is true)
        or (scope_filter='exterior' and c.exterior_recommended is true)
        or (scope_filter='interior_exterior' and c.interior_recommended is true and c.exterior_recommended is true)
      )
      and (
        c.search_color_code like '%' || q.normalized_code || '%'
        or c.normalized_color_name like '%' || q.normalized_text || '%'
        or private.normalize_paint_identifier(b.name) like '%' || q.normalized_text || '%'
        or private.normalize_paint_identifier(m.canonical_name) like '%' || q.normalized_text || '%'
        or exists(
          select 1 from public.paint_color_aliases a
          where a.paint_color_id=c.id and a.search_alias_code like q.normalized_code || '%'
        )
        or exists(
          select 1 from public.paint_manufacturer_aliases ma
          where ma.manufacturer_id=m.id and ma.normalized_alias like '%' || q.normalized_text || '%'
        )
      )
  )
  select * from matches
  order by rank, is_discontinued, brand_name, color_code
  limit least(greatest(result_limit,1),20)
$$;
revoke all on function public.search_paint_catalog(text,uuid,public.paint_scope,integer) from public, anon;
grant execute on function public.search_paint_catalog(text,uuid,public.paint_scope,integer) to authenticated;
