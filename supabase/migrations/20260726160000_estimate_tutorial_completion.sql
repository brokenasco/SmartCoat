-- Versioned completion state for the real-estimator guided tutorial.
alter table public.profiles
  add column if not exists estimate_tutorial_completed_at timestamptz,
  add column if not exists estimate_tutorial_version integer not null default 0
    check (estimate_tutorial_version >= 0);

create or replace function public.complete_estimate_tutorial(tutorial_version integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if tutorial_version < 1 then
    raise exception 'invalid tutorial version' using errcode = '22023';
  end if;

  update public.profiles
  set estimate_tutorial_completed_at = now(),
      estimate_tutorial_version = greatest(estimate_tutorial_version, tutorial_version),
      updated_at = now()
  where id = caller;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
end
$$;

revoke all on function public.complete_estimate_tutorial(integer) from public, anon;
grant execute on function public.complete_estimate_tutorial(integer) to authenticated;
