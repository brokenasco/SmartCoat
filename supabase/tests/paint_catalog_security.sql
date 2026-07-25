begin;
set local search_path = public, extensions;

select plan(8);

select has_table('public', 'paint_colors', 'paint colors table exists');
select has_table('public', 'paint_product_variants', 'product variants table exists');
select has_table('public', 'estimate_paint_items', 'estimate paint snapshots exist');
select has_function('public', 'search_paint_catalog', array['text','uuid','paint_scope','integer'], 'catalog search function exists');
select is(
  private.normalize_paint_identifier('  #n430–6a  '),
  'N430-6A',
  'paint identifiers normalize without losing meaningful punctuation'
);
select throws_ok(
  $$ update public.paint_data_sources set is_enabled=true where authorization_status='pending_permission' $$,
  '23514',
  null,
  'pending sources cannot be enabled'
);
select ok(
  (select count(*) = 11 from public.paint_brands),
  'all canonical brands are registered'
);
select ok(
  not exists(select 1 from public.paint_data_sources where is_enabled),
  'no discovery source is enabled by default'
);

select * from finish();
rollback;
