-- Run after creating two test users/tenants in a disposable local database.
-- These assertions intentionally fail if a request can see another tenant.
begin;
set local search_path = public, extensions;
select plan(2);
select set_config('request.jwt.claim.sub', :'tenant_a_user_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.customers where company_id=:'tenant_b_company_id'::uuid),0::bigint,'tenant A cannot read tenant B customers');
select is((select count(*) from public.estimates where company_id=:'tenant_b_company_id'::uuid),0::bigint,'tenant A cannot read tenant B estimates');
select * from finish();
rollback;
