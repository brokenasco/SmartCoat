-- Paint catalog foundation: normalized catalog, source governance, tenant settings,
-- immutable estimate paint snapshots, import auditability, and code-first search.
-- No manufacturer color, product, coverage, or price data is fabricated by this migration.
create extension if not exists pg_trgm;

do $$ begin
  create type public.paint_source_status as enum (
    'official_api','official_feed','official_download','authorized_partner_feed',
    'licensed_third_party','approved_manual_import','pending_permission','unavailable'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.paint_import_status as enum (
    'queued','running','completed','completed_with_warnings','failed','canceled'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.paint_scope as enum ('interior','exterior','interior_exterior','specialty','unknown');
exception when duplicate_object then null; end $$;

create or replace function private.normalize_paint_identifier(value text) returns text
language sql immutable strict security invoker set search_path=''
as $$
  select upper(regexp_replace(
    regexp_replace(trim(translate(value, '‐‑‒–—−', '------')), '^#', ''),
    '[[:space:]]+', ' ', 'g'
  ))
$$;
revoke all on function private.normalize_paint_identifier(text) from public, anon;
grant execute on function private.normalize_paint_identifier(text) to authenticated;

create table if not exists public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.platform_administrators enable row level security;
revoke all on public.platform_administrators from anon, authenticated;

create or replace function private.is_platform_administrator() returns boolean
language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.platform_administrators a where a.user_id = (select auth.uid())
  )
$$;
revoke all on function private.is_platform_administrator() from public, anon;
grant execute on function private.is_platform_administrator() to authenticated;

create or replace function public.current_user_is_platform_administrator() returns boolean
language sql stable security invoker set search_path=''
as $$ select private.is_platform_administrator() $$;
revoke all on function public.current_user_is_platform_administrator() from public, anon;
grant execute on function public.current_user_is_platform_administrator() to authenticated;

create table if not exists public.paint_manufacturers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  website_url text,
  country_code char(2),
  is_active boolean not null default true,
  logo_asset_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.paint_manufacturer_aliases (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.paint_manufacturers(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (private.normalize_paint_identifier(alias)) stored,
  created_at timestamptz not null default now(),
  unique(normalized_alias)
);
create table if not exists public.paint_brands (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.paint_manufacturers(id) on delete restrict,
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.paint_data_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.paint_brands(id) on delete restrict,
  source_name text not null,
  source_type public.paint_source_status not null,
  source_url text,
  authorization_status public.paint_source_status not null,
  license_reference text,
  usage_notes text not null,
  expected_update_frequency text,
  last_successful_sync_at timestamptz,
  last_attempted_sync_at timestamptz,
  next_scheduled_sync_at timestamptz,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, source_name),
  check (not is_enabled or authorization_status not in ('pending_permission','unavailable'))
);
create table if not exists public.paint_color_collections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.paint_brands(id) on delete restrict,
  name text not null,
  external_collection_id text,
  description text,
  is_active boolean not null default true,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, name)
);
create table if not exists public.paint_colors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.paint_brands(id) on delete restrict,
  primary_color_code text not null,
  normalized_color_code text generated always as (private.normalize_paint_identifier(primary_color_code)) stored,
  color_name text not null,
  normalized_color_name text generated always as (private.normalize_paint_identifier(color_name)) stored,
  short_name text,
  hex_value text check (hex_value is null or hex_value ~ '^#[0-9A-Fa-f]{6}$'),
  red_value smallint check (red_value between 0 and 255),
  green_value smallint check (green_value between 0 and 255),
  blue_value smallint check (blue_value between 0 and 255),
  lrv numeric(5,2) check (lrv between 0 and 100),
  color_family text,
  undertone text,
  interior_recommended boolean,
  exterior_recommended boolean,
  is_active boolean not null default true,
  is_discontinued boolean not null default false,
  discontinued_at timestamptz,
  replacement_color_id uuid references public.paint_colors(id) on delete set null,
  external_color_id text,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  source_last_seen_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, normalized_color_code)
);
create index if not exists paint_colors_code_trgm_idx on public.paint_colors using gin(normalized_color_code gin_trgm_ops);
create index if not exists paint_colors_name_trgm_idx on public.paint_colors using gin(normalized_color_name gin_trgm_ops);
create table if not exists public.paint_color_aliases (
  id uuid primary key default gen_random_uuid(),
  paint_color_id uuid not null references public.paint_colors(id) on delete cascade,
  alias_code text not null,
  normalized_alias_code text generated always as (private.normalize_paint_identifier(alias_code)) stored,
  alias_type text not null check(alias_type in ('legacy_code','alternate_code','retailer_code','collection_code','former_code','regional_code')),
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(paint_color_id, normalized_alias_code)
);
create index if not exists paint_color_alias_code_idx on public.paint_color_aliases(normalized_alias_code);
create table if not exists public.paint_color_collection_memberships (
  paint_color_id uuid not null references public.paint_colors(id) on delete cascade,
  collection_id uuid not null references public.paint_color_collections(id) on delete cascade,
  display_order integer,
  created_at timestamptz not null default now(),
  primary key(paint_color_id, collection_id)
);

create table if not exists public.paint_sheens (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  display_name text not null,
  description text,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create table if not exists public.paint_sheen_mappings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.paint_brands(id) on delete cascade,
  sheen_id uuid references public.paint_sheens(id) on delete restrict,
  manufacturer_term text not null,
  normalized_term text generated always as (private.normalize_paint_identifier(manufacturer_term)) stored,
  source_id uuid references public.paint_data_sources(id) on delete restrict,
  unique(brand_id, normalized_term)
);
create table if not exists public.paint_container_sizes (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  volume_value numeric(10,4) not null check(volume_value > 0),
  volume_unit text not null check(volume_unit in ('fluid_ounce','pint','quart','gallon','liter','milliliter','sample')),
  volume_in_gallons numeric(10,6) not null check(volume_in_gallons > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.paint_product_lines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.paint_brands(id) on delete restrict,
  name text not null,
  slug text not null,
  description_summary text,
  interior_exterior_classification public.paint_scope not null default 'unknown',
  product_category text not null,
  base_type text,
  default_coverage_min_sqft_per_gallon numeric(8,2) check(default_coverage_min_sqft_per_gallon > 0),
  default_coverage_max_sqft_per_gallon numeric(8,2) check(default_coverage_max_sqft_per_gallon > 0),
  recommended_coats smallint check(recommended_coats > 0),
  primer_included boolean,
  self_priming_claim boolean,
  voc_category text,
  dry_time_minutes integer check(dry_time_minutes >= 0),
  recoat_time_minutes integer check(recoat_time_minutes >= 0),
  is_active boolean not null default true,
  is_discontinued boolean not null default false,
  external_product_line_id text,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id, slug),
  check(default_coverage_max_sqft_per_gallon is null or default_coverage_min_sqft_per_gallon is null or default_coverage_max_sqft_per_gallon >= default_coverage_min_sqft_per_gallon)
);
create table if not exists public.paint_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_line_id uuid not null references public.paint_product_lines(id) on delete restrict,
  sku text,
  upc text,
  manufacturer_item_number text,
  sheen_id uuid references public.paint_sheens(id) on delete restrict,
  container_size_id uuid references public.paint_container_sizes(id) on delete restrict,
  base_name text,
  base_code text,
  coverage_min_sqft numeric(8,2) check(coverage_min_sqft > 0),
  coverage_max_sqft numeric(8,2) check(coverage_max_sqft > 0),
  coverage_unit text not null default 'sqft_per_gallon',
  default_coverage_sqft numeric(8,2) check(default_coverage_sqft > 0),
  is_tintable boolean,
  is_premixed boolean,
  is_active boolean not null default true,
  is_discontinued boolean not null default false,
  external_variant_id text,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(coverage_max_sqft is null or coverage_min_sqft is null or coverage_max_sqft >= coverage_min_sqft)
);
create unique index if not exists paint_product_variants_source_external_idx on public.paint_product_variants(source_id, external_variant_id) where external_variant_id is not null;
create table if not exists public.paint_color_product_availability (
  id uuid primary key default gen_random_uuid(),
  paint_color_id uuid not null references public.paint_colors(id) on delete cascade,
  product_line_id uuid not null references public.paint_product_lines(id) on delete cascade,
  product_variant_id uuid references public.paint_product_variants(id) on delete cascade,
  availability_status text not null check(availability_status in ('available','unavailable','limited','special_order','discontinued','unknown')),
  interior_supported boolean,
  exterior_supported boolean,
  notes text,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  source_last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(paint_color_id, product_line_id, product_variant_id)
);

create table if not exists public.paint_retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.paint_retailer_products (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.paint_retailers(id) on delete restrict,
  product_variant_id uuid not null references public.paint_product_variants(id) on delete restrict,
  retailer_sku text,
  retailer_product_id text,
  retailer_product_url text,
  store_specific boolean not null default false,
  is_active boolean not null default true,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(retailer_id, product_variant_id, retailer_product_id)
);
create table if not exists public.paint_prices (
  id uuid primary key default gen_random_uuid(),
  retailer_product_id uuid not null references public.paint_retailer_products(id) on delete restrict,
  store_id text,
  postal_code text,
  currency_code char(3) not null default 'USD',
  price_in_cents bigint not null check(price_in_cents >= 0),
  sale_price_in_cents bigint check(sale_price_in_cents >= 0),
  unit_price_in_cents bigint check(unit_price_in_cents >= 0),
  availability_status text,
  effective_at timestamptz not null,
  expires_at timestamptz,
  collected_at timestamptz not null,
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  check(expires_at is null or expires_at > effective_at)
);
create index if not exists paint_prices_lookup_idx on public.paint_prices(retailer_product_id, postal_code, collected_at desc);

create table if not exists public.paint_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.paint_data_sources(id) on delete restrict,
  job_type text not null,
  status public.paint_import_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  records_received integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_unchanged integer not null default 0,
  records_rejected integer not null default 0,
  records_deactivated integer not null default 0,
  error_summary text,
  triggered_by uuid references auth.users(id) on delete set null,
  formula_or_parser_version text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.paint_import_errors (
  id bigint generated always as identity primary key,
  import_job_id uuid not null references public.paint_import_jobs(id) on delete cascade,
  source_record_identifier text,
  error_code text not null,
  error_message text not null,
  raw_record_reference text,
  created_at timestamptz not null default now()
);
create table if not exists public.paint_catalog_change_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  change_type text not null,
  old_value jsonb,
  new_value jsonb,
  source_id uuid references public.paint_data_sources(id) on delete restrict,
  import_job_id uuid references public.paint_import_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists paint_change_log_entity_idx on public.paint_catalog_change_log(entity_type, entity_id, created_at desc);

create table if not exists public.company_paint_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  default_coverage_sqft_per_gallon numeric(8,2) not null default 400 check(default_coverage_sqft_per_gallon between 50 and 1000),
  default_waste_percentage numeric(5,2) not null default 10 check(default_waste_percentage between 0 and 100),
  default_interior_coats smallint not null default 2 check(default_interior_coats between 1 and 10),
  default_exterior_coats smallint not null default 2 check(default_exterior_coats between 1 and 10),
  coverage_override_policy text not null default 'reason_required' check(coverage_override_policy in ('allowed','reason_required','manager_only','disabled')),
  preferred_retailer_id uuid references public.paint_retailers(id) on delete set null,
  preferred_brand_id uuid references public.paint_brands(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.estimate_paint_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  paint_color_id uuid references public.paint_colors(id) on delete set null,
  product_line_id uuid references public.paint_product_lines(id) on delete set null,
  product_variant_id uuid references public.paint_product_variants(id) on delete set null,
  brand_name_snapshot text,
  color_name_snapshot text,
  color_code_snapshot text,
  product_name_snapshot text,
  sheen_snapshot text,
  container_size_snapshot text,
  coverage_rate_snapshot numeric(8,2) not null check(coverage_rate_snapshot > 0),
  coverage_source text not null check(coverage_source in ('product_variant','product_line','company_default','manual_override')),
  coverage_was_overridden boolean not null default false,
  coverage_override_reason text,
  number_of_coats smallint not null check(number_of_coats between 1 and 10),
  waste_percentage numeric(5,2) not null check(waste_percentage between 0 and 100),
  calculated_gallons numeric(10,3) not null check(calculated_gallons >= 0),
  purchase_quantity numeric(10,3) not null check(purchase_quantity >= 0),
  unit_price_snapshot bigint check(unit_price_snapshot >= 0),
  price_source_snapshot text,
  price_collected_at timestamptz,
  retailer_snapshot text,
  postal_code_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not coverage_was_overridden or nullif(trim(coverage_override_reason), '') is not null)
);
create index if not exists estimate_paint_items_tenant_estimate_idx on public.estimate_paint_items(company_id, estimate_id);

create table if not exists public.paint_unmatched_searches (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  normalized_query text not null,
  brand_filter uuid references public.paint_brands(id) on delete set null,
  searched_at timestamptz not null default now()
);
create index if not exists paint_unmatched_searches_time_idx on public.paint_unmatched_searches(searched_at desc);

-- Global catalog rows are readable by signed-in users; writes remain server/admin only.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'paint_manufacturers','paint_manufacturer_aliases','paint_brands','paint_data_sources',
    'paint_color_collections','paint_colors','paint_color_aliases','paint_color_collection_memberships',
    'paint_sheens','paint_sheen_mappings','paint_container_sizes','paint_product_lines',
    'paint_product_variants','paint_color_product_availability','paint_retailers',
    'paint_retailer_products','paint_prices','paint_import_jobs','paint_import_errors',
    'paint_catalog_change_log','company_paint_settings','estimate_paint_items','paint_unmatched_searches'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy paint_catalog_read on public.paint_manufacturers for select to authenticated using (true);
create policy paint_aliases_read on public.paint_manufacturer_aliases for select to authenticated using (true);
create policy paint_brands_read on public.paint_brands for select to authenticated using (true);
create policy paint_sources_read on public.paint_data_sources for select to authenticated using (true);
create policy paint_collections_read on public.paint_color_collections for select to authenticated using (true);
create policy paint_colors_read on public.paint_colors for select to authenticated using (true);
create policy paint_color_aliases_read on public.paint_color_aliases for select to authenticated using (true);
create policy paint_memberships_read on public.paint_color_collection_memberships for select to authenticated using (true);
create policy paint_sheens_read on public.paint_sheens for select to authenticated using (true);
create policy paint_sheen_mappings_read on public.paint_sheen_mappings for select to authenticated using (true);
create policy paint_sizes_read on public.paint_container_sizes for select to authenticated using (true);
create policy paint_lines_read on public.paint_product_lines for select to authenticated using (true);
create policy paint_variants_read on public.paint_product_variants for select to authenticated using (true);
create policy paint_availability_read on public.paint_color_product_availability for select to authenticated using (true);
create policy paint_retailers_read on public.paint_retailers for select to authenticated using (true);
create policy paint_retailer_products_read on public.paint_retailer_products for select to authenticated using (true);
create policy paint_prices_read on public.paint_prices for select to authenticated using (true);
create policy company_paint_settings_access on public.company_paint_settings for all to authenticated
  using(private.is_company_member(company_id))
  with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager']::public.company_role[]));
create policy estimate_paint_items_access on public.estimate_paint_items for all to authenticated
  using(private.is_company_member(company_id))
  with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
create policy unmatched_search_insert on public.paint_unmatched_searches for insert to authenticated
  with check(user_id = (select auth.uid()) and (company_id is null or private.is_company_member(company_id)));
create policy unmatched_search_admin_read on public.paint_unmatched_searches for select to authenticated
  using(private.is_platform_administrator());
create policy import_jobs_admin_read on public.paint_import_jobs for select to authenticated using(private.is_platform_administrator());
create policy import_errors_admin_read on public.paint_import_errors for select to authenticated using(private.is_platform_administrator());
create policy change_log_admin_read on public.paint_catalog_change_log for select to authenticated using(private.is_platform_administrator());

grant select on public.paint_manufacturers, public.paint_manufacturer_aliases, public.paint_brands,
  public.paint_data_sources, public.paint_color_collections, public.paint_colors, public.paint_color_aliases,
  public.paint_color_collection_memberships, public.paint_sheens, public.paint_sheen_mappings,
  public.paint_container_sizes, public.paint_product_lines, public.paint_product_variants,
  public.paint_color_product_availability, public.paint_retailers, public.paint_retailer_products,
  public.paint_prices, public.company_paint_settings, public.estimate_paint_items,
  public.paint_import_jobs, public.paint_import_errors, public.paint_catalog_change_log,
  public.paint_unmatched_searches to authenticated;
grant insert, update, delete on public.company_paint_settings, public.estimate_paint_items to authenticated;
grant insert on public.paint_unmatched_searches to authenticated;
grant usage, select on sequence public.paint_unmatched_searches_id_seq to authenticated;

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
    select private.normalize_paint_identifier(search_term) normalized
  ), matches as (
    select c.id color_id, b.id brand_id, b.name brand_name, c.primary_color_code color_code,
      c.color_name, c.hex_value, c.interior_recommended, c.exterior_recommended, c.is_discontinued,
      case
        when c.normalized_color_code = q.normalized then 'exact_code'
        when exists(select 1 from public.paint_color_aliases a where a.paint_color_id=c.id and a.normalized_alias_code=q.normalized) then 'alias_code'
        when c.normalized_color_code like q.normalized || '%' then 'partial_code'
        else 'color_name'
      end matched_by,
      case
        when c.normalized_color_code = q.normalized then 1
        when exists(select 1 from public.paint_color_aliases a where a.paint_color_id=c.id and a.normalized_alias_code=q.normalized) then 2
        when c.normalized_color_code like q.normalized || '%' then 3
        else 4
      end rank
    from public.paint_colors c
    join public.paint_brands b on b.id=c.brand_id
    cross join query q
    where (brand_filter is null or c.brand_id=brand_filter)
      and (scope_filter is null
        or scope_filter='unknown'
        or (scope_filter='interior' and c.interior_recommended is true)
        or (scope_filter='exterior' and c.exterior_recommended is true)
        or (scope_filter='interior_exterior' and c.interior_recommended is true and c.exterior_recommended is true))
      and (
        c.normalized_color_code like q.normalized || '%'
        or c.normalized_color_name like '%' || q.normalized || '%'
        or exists(select 1 from public.paint_color_aliases a where a.paint_color_id=c.id and a.normalized_alias_code like q.normalized || '%')
      )
  )
  select * from matches order by rank, is_discontinued, brand_name, color_code limit least(greatest(result_limit,1),50)
$$;
revoke all on function public.search_paint_catalog(text,uuid,public.paint_scope,integer) from public, anon;
grant execute on function public.search_paint_catalog(text,uuid,public.paint_scope,integer) to authenticated;

-- Canonical brand registry only. Each official-web source remains disabled and pending
-- permission because a public website is not, by itself, authorization to ingest a catalog.
insert into public.paint_manufacturers(canonical_name,slug,website_url) values
('Behr','behr','https://www.behr.com'),
('Sherwin-Williams','sherwin-williams','https://www.sherwin-williams.com'),
('Valspar','valspar','https://www.valspar.com'),
('Rust-Oleum','rust-oleum','https://www.rustoleum.com'),
('Farrow & Ball','farrow-ball','https://www.farrow-ball.com'),
('Clare','clare','https://www.clare.com'),
('Annie Sloan','annie-sloan','https://www.anniesloan.com'),
('PPG Paints','ppg-paints','https://www.ppgpaints.com'),
('Glidden','glidden','https://www.glidden.com'),
('HGTV Home by Sherwin-Williams','hgtv-home-by-sherwin-williams','https://www.hgtvhomebysherwinwilliams.com'),
('Benjamin Moore','benjamin-moore','https://www.benjaminmoore.com')
on conflict(slug) do update set canonical_name=excluded.canonical_name, website_url=excluded.website_url;

insert into public.paint_brands(manufacturer_id,name,slug)
select id, canonical_name, slug from public.paint_manufacturers
where slug in ('behr','sherwin-williams','valspar','rust-oleum','farrow-ball','clare','annie-sloan','ppg-paints','glidden','hgtv-home-by-sherwin-williams','benjamin-moore')
on conflict(slug) do update set name=excluded.name, manufacturer_id=excluded.manufacturer_id;

insert into public.paint_manufacturer_aliases(manufacturer_id,alias)
select m.id, v.alias from (values
('sherwin-williams','Sherman Williams'),('sherwin-williams','Sherwin Williams'),
('rust-oleum','Rustoleum'),('rust-oleum','Rust Oleum'),('farrow-ball','Farrow and Ball'),
('ppg-paints','PPG'),('glidden','Gliddon'),('benjamin-moore','Benjamin Moore Paints'),
('hgtv-home-by-sherwin-williams','HGTV Paint'),('hgtv-home-by-sherwin-williams','HGTV Home')
) v(slug,alias) join public.paint_manufacturers m on m.slug=v.slug
on conflict(normalized_alias) do nothing;

insert into public.paint_data_sources(brand_id,source_name,source_type,source_url,authorization_status,usage_notes,expected_update_frequency,is_enabled)
select b.id, b.name || ' official catalog review', 'pending_permission',
  m.website_url, 'pending_permission',
  'Discovery record only. Obtain written authorization, an official feed, or an approved manufacturer file before enabling ingestion.',
  'Re-audit quarterly', false
from public.paint_brands b join public.paint_manufacturers m on m.id=b.manufacturer_id
on conflict(brand_id,source_name) do nothing;

insert into public.paint_sheens(canonical_name,display_name,sort_order) values
('flat','Flat',10),('matte','Matte',20),('eggshell','Eggshell',30),('satin','Satin',40),
('pearl','Pearl',50),('low-lustre','Low Lustre',60),('low-sheen','Low Sheen',70),
('semi-gloss','Semi-Gloss',80),('gloss','Gloss',90),('high-gloss','High Gloss',100),
('chalk','Chalk',110),('metallic','Metallic',120),('textured','Textured',130),('specialty','Specialty',140)
on conflict(canonical_name) do nothing;
insert into public.paint_container_sizes(display_name,volume_value,volume_unit,volume_in_gallons) values
('Sample',1,'sample',0.0625),('Pint',1,'pint',0.125),('Quart',1,'quart',0.25),
('1 Gallon',1,'gallon',1),('5 Gallon',5,'gallon',5)
on conflict(display_name) do nothing;
insert into public.paint_retailers(name,slug,website_url) values
('Home Depot','home-depot','https://www.homedepot.com'),('Lowe''s','lowes','https://www.lowes.com'),
('Sherwin-Williams Stores','sherwin-williams-stores','https://www.sherwin-williams.com'),
('Benjamin Moore Dealers','benjamin-moore-dealers','https://www.benjaminmoore.com'),
('Independent Paint Dealer','independent-paint-dealer',null),('Manufacturer Direct','manufacturer-direct',null)
on conflict(slug) do nothing;

-- Apply the shared updated_at trigger to mutable catalog tables.
drop trigger if exists paint_manufacturers_updated on public.paint_manufacturers;
create trigger paint_manufacturers_updated before update on public.paint_manufacturers for each row execute function private.set_updated_at();
drop trigger if exists paint_brands_updated on public.paint_brands;
create trigger paint_brands_updated before update on public.paint_brands for each row execute function private.set_updated_at();
drop trigger if exists paint_sources_updated on public.paint_data_sources;
create trigger paint_sources_updated before update on public.paint_data_sources for each row execute function private.set_updated_at();
drop trigger if exists paint_colors_updated on public.paint_colors;
create trigger paint_colors_updated before update on public.paint_colors for each row execute function private.set_updated_at();
drop trigger if exists paint_product_lines_updated on public.paint_product_lines;
create trigger paint_product_lines_updated before update on public.paint_product_lines for each row execute function private.set_updated_at();
drop trigger if exists paint_product_variants_updated on public.paint_product_variants;
create trigger paint_product_variants_updated before update on public.paint_product_variants for each row execute function private.set_updated_at();
drop trigger if exists company_paint_settings_updated on public.company_paint_settings;
create trigger company_paint_settings_updated before update on public.company_paint_settings for each row execute function private.set_updated_at();
drop trigger if exists estimate_paint_items_updated on public.estimate_paint_items;
create trigger estimate_paint_items_updated before update on public.estimate_paint_items for each row execute function private.set_updated_at();
