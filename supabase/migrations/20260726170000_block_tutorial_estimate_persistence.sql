-- Defense in depth: tutorial content is never valid estimate persistence input.
create or replace function private.reject_tutorial_estimate_persistence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((new.draft_payload ->> 'isTutorial')::boolean, false) then
    raise exception 'Tutorial estimates cannot be saved.'
      using errcode = '22023';
  end if;
  return new;
end
$$;

drop trigger if exists reject_tutorial_estimate_persistence on public.estimates;
create trigger reject_tutorial_estimate_persistence
before insert or update of draft_payload on public.estimates
for each row execute function private.reject_tutorial_estimate_persistence();
