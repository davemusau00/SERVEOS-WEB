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
do $$
declare c jsonb;r jsonb;seq bigint:=6;batch_id text;command_id uuid;template text;csv text;expected_collection text;record_id text;
begin
 foreach template in array ['stockLocations','roomTypes'] loop
  batch_id:='import-fixture-'||template;
  if template='stockLocations' then csv:=E'external_id,name,code,type\nloc-001,Main Store,MAIN,STORE';expected_collection:='stockLocations';record_id:='loc-001';
  else csv:=E'external_id,name,code,max_guests\nroomtype-001,Standard,STD,2';expected_collection:='roomTypes';record_id:='roomtype-001';end if;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.stage','payload',jsonb_build_object('id',batch_id,'fileName',template||'.csv','templateKey',template,'csvText',csv),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% stage rejected: %',template,r;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% dry-run rejected: %',template,r;end if;
  if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'DRY_RUN_READY' then raise exception '% dry-run not ready',template;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.apply','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% apply rejected: %',template,r;end if;
  if not exists(select 1 from servos_v2.records where collection=expected_collection and id=record_id and not archived) then raise exception '% domain record missing after import',template;end if;
  if template='stockLocations' and (select data->>'type' from servos_v2.records where collection='stockLocations' and id=record_id)<>'STORE' then raise exception 'stock location type was not preserved';end if;
  if template='roomTypes' and (select data->>'maxGuests' from servos_v2.records where collection='roomTypes' and id=record_id)<>'2' then raise exception 'room type capacity was not preserved';end if;
  seq:=seq+1;
 end loop;
end$$;
do $$
declare c jsonb;r jsonb;seq bigint:=12;batch_id text;command_id uuid;template text;csv text;expected_collection text;record_id text;
begin
 foreach template in array ['ratePlans','rooms'] loop
  batch_id:='import-fixture-'||template;
  if template='ratePlans' then
   csv:=E'external_id,name,room_type_external_id,nightly_rate,currency,tax_basis_points\nrate-001,Standard Night,roomtype-001,8000.00,KES,1600';expected_collection:='ratePlans';record_id:='rate-001';
  else
   csv:=E'external_id,room_number,room_type_external_id,capacity,turnaround_minutes,floor,amenities,notes\nroom-001,101,roomtype-001,2,30,1,WiFi;TV,Near garden';expected_collection:='rooms';record_id:='room-001';
  end if;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.stage','payload',jsonb_build_object('id',batch_id,'fileName',template||'.csv','templateKey',template,'csvText',csv),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% stage rejected: %',template,r;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% dry-run rejected: %',template,r;end if;
  if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'DRY_RUN_READY' then raise exception '% dry-run not ready',template;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.apply','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% apply rejected: %',template,r;end if;
  if not exists(select 1 from servos_v2.records where collection=expected_collection and id=record_id and not archived) then raise exception '% domain record missing after import',template;end if;
  if template='ratePlans' and ((select data->>'priceMinor' from servos_v2.records where collection='ratePlans' and id=record_id)<>'800000' or (select data->>'mode' from servos_v2.records where collection='ratePlans' and id=record_id)<>'NIGHTLY') then raise exception 'nightly rate values not preserved';end if;
  if template='rooms' and ((select data->>'housekeepingState' from servos_v2.records where collection='rooms' and id=record_id)<>'CLEAN' or (select data->>'maintenanceState' from servos_v2.records where collection='rooms' and id=record_id)<>'AVAILABLE') then raise exception 'room command defaults were not preserved';end if;
  seq:=seq+1;
 end loop;
end$$;
do $$
declare c jsonb;r jsonb;seq bigint:=20;batch_id text;command_id uuid;template text;csv text;expected_collection text;record_id text;
begin
 foreach template in array ['assetCategories','assets'] loop
  batch_id:='import-fixture-'||template;
  if template='assetCategories' then
   csv:=E'external_id,name,code,notes\nassetcat-001,Equipment,EQ,Imported category';expected_collection:='assetCategories';record_id:='assetcat-001';
  else
   csv:=E'external_id,name,asset_tag,asset_category_external_id,stock_location_external_id,acquisition_cost,serial_number\nasset-001,Kitchen mixer,EQ-001,assetcat-001,loc-001,25000.00,SN-001';expected_collection:='assets';record_id:='asset-001';
  end if;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.stage','payload',jsonb_build_object('id',batch_id,'fileName',template||'.csv','templateKey',template,'csvText',csv),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% stage rejected: %',template,r;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% dry-run rejected: %',template,r;end if;
  if (select data->>'status' from servos_v2.records where collection='importBatches' and id=batch_id)<>'DRY_RUN_READY' then raise exception '% dry-run not ready',template;end if;seq:=seq+1;
  command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
  c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.apply','payload',jsonb_build_object('batchId',batch_id),'expectedVersions','[]'::jsonb);
  r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception '% apply rejected: %',template,r;end if;
  if not exists(select 1 from servos_v2.records where collection=expected_collection and id=record_id and not archived) then raise exception '% domain record missing after import',template;end if;
  if template='assets' and (select data->>'tag' from servos_v2.records where collection='assets' and id=record_id)<>'EQ-001' then raise exception 'asset tag was not mapped by asset command';end if;
  seq:=seq+1;
 end loop;
 if not exists(select 1 from servos_v2.records where collection='assetEvents' and data->>'assetId'='asset-001' and data->>'operation'='asset.save') then raise exception 'asset import did not leave immutable domain audit event';end if;
end$$;
do $$
declare c jsonb;r jsonb;seq bigint:=28;command_id uuid;target_batch_id text:='import-fixture-cancelled';
begin
 command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.stage','payload',jsonb_build_object('id',target_batch_id,'fileName','cancelled.csv','templateKey','products','csvText',E'external_id,name,code,price\ncancelled-product,Unused,CAN001,10.00'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'cancellation fixture stage rejected: %',r;end if;seq:=seq+1;
 command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.dryRun','payload',jsonb_build_object('batchId',target_batch_id),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'cancellation fixture dry-run rejected: %',r;end if;seq:=seq+1;
 command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.cancel','payload',jsonb_build_object('batchId',target_batch_id,'reason','Operator cancelled the unused rehearsal batch'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'import cancellation rejected: %',r;end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id=target_batch_id)<>'CANCELLED' then raise exception 'cancelled batch status was not retained';end if;
 if (select data->>'cancellationReason' from servos_v2.records where collection='importBatches' and id=target_batch_id)<>'Operator cancelled the unused rehearsal batch' then raise exception 'cancellation reason was not audited';end if;
 if exists(select 1 from servos_v2.import_sources s where s.batch_id=target_batch_id) then raise exception 'cancelled source or preview plan was not purged';end if;
 seq:=seq+1;command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.stage','payload',jsonb_build_object('id',target_batch_id,'fileName','retry.csv','templateKey','products','csvText',E'external_id,name,code,price\nretry-product,Unused,RETRY1,10.00'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'REJECTED' then raise exception 'cancelled batch ID was unexpectedly reusable: %',r;end if;
 seq:=seq+1;command_id:=('20000000-0000-0000-0000-'||lpad((50+seq)::text,12,'0'))::uuid;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000039','actorId',auth.uid(),'clientSequence',seq,'operation','admin.import.cancel','payload',jsonb_build_object('batchId','import-fixture-products','reason','Attempt to cancel an applied batch'),'expectedVersions','[]'::jsonb);
 r:=public.servos_v2_execute(c);if r->>'status'<>'REJECTED' then raise exception 'applied import was incorrectly cancelled: %',r;end if;
 if (select data->>'status' from servos_v2.records where collection='importBatches' and id='import-fixture-products')<>'APPLIED' then raise exception 'rejected cancellation changed applied batch';end if;
end$$;
reset role;
do $$begin
 if exists(select 1 from servos_v2.import_sources where batch_id='import-fixture-products') then raise exception 'applied source CSV was not removed';end if;
 if exists(select 1 from servos_v2.import_sources where batch_id in ('import-fixture-stockLocations','import-fixture-roomTypes','import-fixture-ratePlans','import-fixture-rooms','import-fixture-assetCategories','import-fixture-assets')) then raise exception 'an applied master source CSV was not removed';end if;
 if exists(select 1 from servos_v2.records where collection='products' and id='cancelled-product') then raise exception 'cancelled import wrote a product';end if;
 if exists(select 1 from servos_v2.records where collection='importBatches' and id='import-fixture-products' and data ? 'sourceCsv') then raise exception 'raw source leaked into replicated batch record';end if;
 if (select count(*) from servos_v2.records where collection='products' and id in ('legacy-0001','import-fixture-invalid'))<>1 then raise exception 'invalid dry-run created a product';end if;
end$$;
rollback;
