begin;
set local search_path = public, extensions;
select plan(6);
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.company_memberships
  where status='active' and role in ('owner','admin','manager') order by created_at limit 1
),true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table workflow_ids(estimate_id uuid,company_id uuid,project_id uuid);
insert into workflow_ids(estimate_id,company_id)
select public.save_estimate_draft(
  null,m.company_id,'Transactional workflow test',
  '{"rooms":[{"id":"test-room","name":"Room 1","sortOrder":0,"length":"10","width":"8","height":"8","workers":"2","wageDollars":"25","prepHours":"2","openings":[],"result":{"grossSurfaceAreaSqFt":288,"deductedOpeningAreaSqFt":0,"netPaintableAreaSqFt":288}}]}'::jsonb,
  '{"valid":true,"formulaVersion":"4.0.0"}'::jsonb,100000,55000,45
),m.company_id
from public.company_memberships m where m.user_id=auth.uid() and m.status='active' limit 1;
select is((select status::text from public.estimates where id=(select estimate_id from workflow_ids)),'draft','draft created');
select is((select count(*)::integer from public.estimate_rooms where estimate_id=(select estimate_id from workflow_ids)),1,'room persisted');
update workflow_ids set project_id=public.approve_estimate(estimate_id);
select is((select status::text from public.estimates where id=(select estimate_id from workflow_ids)),'approved','draft approved');
select ok((select project_id is not null from workflow_ids),'project initialized');
select is((select count(*)::integer from public.estimate_approval_snapshots where estimate_id=(select estimate_id from workflow_ids)),1,'immutable snapshot created');
select throws_ok(
  format('update public.estimates set total_cents=1 where id=%L',(select estimate_id from workflow_ids)),
  'P0001','Approved estimate financial and scope data is immutable','approved total cannot change'
);
select * from finish();
rollback;
