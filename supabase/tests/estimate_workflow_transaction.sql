begin;
set local search_path = public, extensions;
select plan(17);
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.company_memberships
  where status='active' and role in ('owner','admin','manager') order by created_at limit 1
),true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table workflow_ids(estimate_id uuid,company_id uuid,project_id uuid);
insert into workflow_ids(estimate_id,company_id)
select public.save_estimate_draft(
  null,m.company_id,'Transactional workflow test',
  '{"rooms":[{"id":"test-room","name":"Room 1","sortOrder":0,"length":"10","width":"8","height":"8","surfaceType":"smooth_previously_painted_drywall","workers":"2","wageDollars":"25","prepHours":"2","coats":"2","containerSizeGallons":"1","containerQuantity":"1","pricePerContainerDollars":"50","paintBrand":"Test Brand","paintColorCode":"T-100","openings":[],"result":{"surfaceType":"smooth_previously_painted_drywall","surfaceModifier":1,"grossSurfaceAreaSqFt":288,"deductedOpeningAreaSqFt":0,"netPaintableAreaSqFt":288}}]}'::jsonb,
  '{"valid":true,"formulaVersion":"7.0.0"}'::jsonb,57542,31648,45
),m.company_id
from public.company_memberships m where m.user_id=auth.uid() and m.status='active' limit 1;
select is((select status::text from public.estimates where id=(select estimate_id from workflow_ids)),'draft','draft created');
select is((select count(*)::integer from public.estimate_rooms where estimate_id=(select estimate_id from workflow_ids)),1,'room persisted');
select is((select count(*)::integer from public.estimate_status_history where estimate_id=(select estimate_id from workflow_ids) and to_status='draft'),1,'new draft history persisted');
select is((select number_of_workers from public.estimates where id=(select estimate_id from workflow_ids)),2,'shared worker count persisted');
select is((select average_hourly_wage_cents::integer from public.estimates where id=(select estimate_id from workflow_ids)),2500,'shared wage persisted');
select is((select prep_person_hours_per_room from public.estimates where id=(select estimate_id from workflow_ids)),2.00::numeric,'shared prep hours persisted');
select is((select other_direct_materials_cents from public.estimates where id=(select estimate_id from workflow_ids)),0::bigint,'new drafts do not persist other direct materials');
select ok(has_function_privilege('authenticated','private.surface_modifier(text)','EXECUTE'),'room snapshot dependency is executable by authenticated writes');
update workflow_ids set project_id=public.approve_estimate(estimate_id);
select is((select status::text from public.estimates where id=(select estimate_id from workflow_ids)),'approved','draft approved');
select ok((select project_id is not null from workflow_ids),'project initialized');
select is((select count(*)::integer from public.estimate_approval_snapshots where estimate_id=(select estimate_id from workflow_ids)),1,'immutable snapshot created');
select is((select count(*)::integer from public.estimate_status_history where estimate_id=(select estimate_id from workflow_ids) and to_status='approved'),1,'approval history persisted');
select throws_ok(
  format('update public.estimates set total_cents=1 where id=%L',(select estimate_id from workflow_ids)),
  'P0001','Approved estimate financial and scope data is immutable','approved total cannot change'
);
select throws_ok(
  format('select public.delete_estimate_draft(%L,%L)',(select estimate_id from workflow_ids),'not allowed'),
  'P0001','Only draft estimates can be deleted','approved estimate cannot be deleted as a draft'
);
insert into workflow_ids(estimate_id,company_id)
select public.save_estimate_draft(null,m.company_id,'Soft delete workflow test','{"rooms":[]}'::jsonb,
  '{"valid":false,"formulaVersion":"6.0.0"}'::jsonb,0,0,45),m.company_id
from public.company_memberships m where m.user_id=auth.uid() and m.status='active' limit 1;
select lives_ok(
  format('select public.delete_estimate_draft(%L,%L)',(select estimate_id from workflow_ids where project_id is null order by estimate_id desc limit 1),'workflow test'),
  'manager can soft-delete a draft'
);
select ok((select deleted_at is not null from public.estimates where id=(select estimate_id from workflow_ids where project_id is null order by estimate_id desc limit 1)),'soft-deleted draft is retained');
select is((select count(*)::integer from public.estimates where id=(select estimate_id from workflow_ids where project_id is null order by estimate_id desc limit 1) and deleted_at is null),0,'soft-deleted draft is excluded from active rows');
select * from finish();
rollback;
