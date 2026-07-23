-- Fictional demonstration tenant. Never use real customer information in seeds.
insert into public.companies(id,name,slug,onboarding_completed_at) values ('10000000-0000-4000-8000-000000000001','Broken Arrow Painting Demo','broken-arrow-demo',now()) on conflict do nothing;
insert into public.customers(id,company_id,name,email,phone,status) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Jordan Sample','jordan@example.invalid','555-0100','customer') on conflict do nothing;
insert into public.properties(id,company_id,customer_id,name,address_line_1,city,region,postal_code) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Sample Residence','100 Demo Lane','Richmond','VA','23220') on conflict do nothing;
-- Membership is attached to the first local auth user when present.
insert into public.profiles(id,full_name) select id,'Demo Owner' from auth.users order by created_at limit 1 on conflict do nothing;
insert into public.company_memberships(company_id,user_id,role) select '10000000-0000-4000-8000-000000000001',id,'owner' from auth.users order by created_at limit 1 on conflict do nothing;
insert into public.estimates(id,company_id,customer_id,property_id,title,status,cost_cents,subtotal_cents,tax_cents,total_cents,target_margin_percent,calculation_snapshot,created_by)
select '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Whole-home interior repaint','accepted',1375000,2500000,150000,2650000,45,'{"assumptions":{"coverageSqFtPerGallon":350,"wastePercent":10,"coats":2},"rooms":["Master Bedroom","Dining Room","Bathroom","Living Room","Second Bathroom","Veranda"]}'::jsonb,id from auth.users order by created_at limit 1 on conflict do nothing;
insert into public.estimate_rooms(company_id,estimate_id,name,sort_order,length_millifeet,width_millifeet,height_millifeet,doors,windows) values
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Master Bedroom',1,14583,15000,8000,1,2),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Dining Room',2,16167,15000,8000,2,2),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Bathroom',3,10167,6000,8000,1,1),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Living Room',4,9917,15000,8000,2,3),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Second Bathroom',5,8000,6000,8000,1,1),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Veranda',6,18000,10000,9000,1,4) on conflict do nothing;
