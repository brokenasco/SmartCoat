-- Premium entitlements and tour state. Safe for repeated preview resets; no production rows are deleted.
do $$ begin
  create type public.subscription_status as enum ('incomplete','trialing','active','past_due','unpaid','canceled','expired','lifetime');
exception when duplicate_object then null; end $$;

create table if not exists public.company_entitlements (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status public.subscription_status not null default 'incomplete',
  source text not null default 'stripe' check (source in ('stripe','manual','administrator','developer')),
  provider_customer_id text unique,
  provider_subscription_id text unique,
  current_period_ends_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_entitlements_status_expiry_idx on public.company_entitlements(status,access_expires_at);

alter table public.profiles add column if not exists product_tour_completed_at timestamptz;
alter table public.profiles add column if not exists product_tour_step smallint not null default 0 check(product_tour_step between 0 and 10);

create or replace function private.has_premium_access(target_company uuid) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.company_entitlements e
    where e.company_id=target_company
      and e.status in ('active','trialing','lifetime')
      and (e.access_expires_at is null or e.access_expires_at > now())
  )
$$;
revoke all on function private.has_premium_access(uuid) from public,anon;
grant execute on function private.has_premium_access(uuid) to authenticated;

alter table public.company_entitlements enable row level security;
drop policy if exists entitlements_read on public.company_entitlements;
create policy entitlements_read on public.company_entitlements for select to authenticated
using(private.is_company_member(company_id));
grant select on public.company_entitlements to authenticated;

-- Premium enforcement is database-backed so a client-side overlay cannot be bypassed.
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for all to authenticated
using(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]))
with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
drop policy if exists properties_write on public.properties;
create policy properties_write on public.properties for all to authenticated
using(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]))
with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
drop policy if exists estimates_write on public.estimates;
create policy estimates_write on public.estimates for all to authenticated
using(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]))
with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
drop policy if exists estimate_rooms_access on public.estimate_rooms;
create policy estimate_rooms_access on public.estimate_rooms for all to authenticated
using(private.has_premium_access(company_id) and private.is_company_member(company_id))
with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager','estimator']::public.company_role[]));
drop policy if exists projects_manage on public.projects;
create policy projects_manage on public.projects for all to authenticated
using(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager']::public.company_role[]))
with check(private.has_premium_access(company_id) and private.has_company_role(company_id,array['owner','admin','manager']::public.company_role[]));
