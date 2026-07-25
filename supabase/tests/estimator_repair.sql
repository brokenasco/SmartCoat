begin;

select plan(8);

select is(
  private.normalize_paint_search_code(' #DC 001 '),
  'DC001',
  'search normalization accepts leading hash and spaces'
);

select is(
  (select count(*)::integer from public.paint_colors c join public.paint_brands b on b.id=c.brand_id where b.name='Behr' and c.primary_color_code='DC-001'),
  1,
  'DC-001 exists exactly once for Behr'
);

select is(
  (select c.color_name from public.paint_colors c join public.paint_brands b on b.id=c.brand_id where b.name='Behr' and c.primary_color_code='DC-001'),
  'Whipped Cream',
  'DC-001 has the verified official color name'
);

select is(
  (select c.hex_value from public.paint_colors c join public.paint_brands b on b.id=c.brand_id where b.name='Behr' and c.primary_color_code='DC-001'),
  '#F6F5EF',
  'DC-001 has the verified digital approximation'
);

select ok(
  exists(select 1 from public.paint_data_sources where source_name='Behr official color detail manual verification' and is_enabled),
  'DC-001 has an enabled source-attribution record'
);

select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='paint_colors_brand_search_code_idx'),
  'brand and search-code index exists'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='estimate_paint_items' and column_name='price_per_container_cents_snapshot'),
  'manual container price snapshot exists'
);

select ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='estimate_paint_items' and column_name='container_gallons_snapshot'),
  'manual container gallons snapshot exists'
);

select * from finish();
rollback;
