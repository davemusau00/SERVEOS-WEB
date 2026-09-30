-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
reset role;
insert into servos_v2.members(user_id,active,permissions)
values ('00000000-0000-4000-8000-000000000001',true,array['*'])
on conflict(user_id) do update set active=true,permissions=array['*'];
update servos_v2.control set enabled=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-0000-0000-000000000039','Controlled import fixture','WEB');
do $$
declare c jsonb;r jsonb; replay jsonb; batch_id text:='import-fixture-products';
begin
 c:=jsonb_build_object('id','20000000-0000-0000-0000-000000000039','schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',1,'operation','admin.import.stage','payload',jsonb_build_object('id',batch_id,'fileName','products.csv','templateKey','products','csvText',E'external_id,name,code,price,barcode\nlegacy-0001,Tea,IMP001,12.50,00001234'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'import stage rejected: %',r;end if;
 c:=jsonb_build_object('id','20000000-0000-0000-0000-000000000040','schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',2,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'import dry-run rejected: %',r;end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'DRY_RUN_READY' then raise exception 'valid import did not reach DRY_RUN_READY';end if;
 c:=jsonb_build_object('id','20000000-0000-0000-0000-000000000041','schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',3,'operation','admin.import.apply','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'import apply rejected: %',r;end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'APPLIED' then raise exception 'batch was not applied';end if;
 if (select data->>'barcode' from servos_v2.records where collection='products' and id='legacy-0001')<>'00001234' then raise exception 'barcode leading zeroes were not preserved';end if;
 if (select data->>'priceMinor' from servos_v2.records where collection='products' and id='legacy-0001')<>'1250' then raise exception 'price was not converted to minor units';end if;
 replay:=public.servos_v2_execute(c);if replay is distinct from r then raise exception 'apply replay returned a different result';end if;
 c:=jsonb_build_object('id','20000000-0000-0000-0000-000000000042','schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',4,'operation','admin.import.stage','payload',jsonb_build_object('id','import-fixture-invalid','fileName','invalid.csv','templateKey','products','csvText',E'name,code,price\nTea,IMP002,1e3'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'invalid-source stage rejected early: %',r;end if;
 c:=jsonb_build_object('id','20000000-0000-0000-0000-000000000043','schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',5,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId','import-fixture-invalid'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'invalid import dry-run rejected: %',r;end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id='import-fixture-invalid')<>'DRY_RUN_BLOCKED' then raise exception 'scientific notation was not rejected';end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'APPLIED' then raise exception 'invalid batch altered prior successful batch';end if;
end$$;
reset role;
do $$begin
 if exists(select 1 from servos_v2.import_sources where batch_id='import-fixture-products') then raise exception 'applied source CSV was not removed';end if;
 if exists(select 1 from servos_v2.records where collection='importBatches' and id='import-fixture-products' and data ? 'sourceCsv') then raise exception 'raw source leaked into replicated batch record';end if;
 if (select count(*) from servos_v2.records where collection='products' and id in ('legacy-0001','import-fixture-invalid'))<>1 then raise exception 'invalid dry-run created a product';end if;
end$$;
rollback;
