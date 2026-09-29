-- Disposable PostgreSQL only. Fixtures and helpers are rolled back.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Asset test','WEB');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000002','Other device','WEB');
update servos_v2.control set enabled=true;
select servos_v2.put_record('assetCategories','equipment','{"name":"Equipment"}');
select servos_v2.put_record('stockLocations','store','{"name":"Store"}');
select servos_v2.put_record('stockLocations','other','{"name":"Other"}');
select servos_v2.put_record('employees','tech','{"name":"Technician"}');
select servos_v2.put_record('suppliers','supplier','{"name":"Supplier"}');
select servos_v2.put_record('stockItems','part','{"name":"Part","averageUnitCostMinor":150,"currentStock":{"store":10}}');
create function pg_temp.asset_command(op text,p jsonb,expected_status text default 'SYNCHRONIZED',expected_code text default null) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;target text;begin
 target:=case when op like 'asset.%' then 'assets' else 'maintenanceOrders' end;
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 if not exists(select 1 from servos_v2.records where collection=target and id=p->>'id') then versions:=versions||jsonb_build_array(jsonb_build_object('collection',target,'id',p->>'id','version',0));end if;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000001'),'operation',op,'payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status or (expected_code is not null and r->'error'->>'code' is distinct from expected_code) then raise exception 'Unexpected % result: %',op,r;end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Response-loss replay changed result';end if;
 return r;
end$$;
select pg_temp.asset_command('asset.save','{"id":"asset","data":{"name":"Pump","tag":"EQ-1","assetCategoryId":"equipment","locationId":"store","purchaseCostMinor":10000}}');
select pg_temp.asset_command('asset.save','{"id":"duplicate","data":{"name":"Pump","tag":"eq-1","assetCategoryId":"equipment","locationId":"store","purchaseCostMinor":10000}}','REJECTED','DUPLICATE_REFERENCE');
select pg_temp.asset_command('asset.save','{"id":"asset","data":{"name":"Pump","tag":"EQ-1","assetCategoryId":"equipment","locationId":"other","purchaseCostMinor":10000}}','REJECTED','INVALID_STATE');
select pg_temp.asset_command('asset.assign','{"id":"asset","custodianId":"tech","reason":"Daily use"}');
select pg_temp.asset_command('asset.retire','{"id":"asset","reason":"Old"}','REJECTED','INVALID_STATE');
select pg_temp.asset_command('asset.return','{"id":"asset","reason":"Return to store"}');
select pg_temp.asset_command('asset.transfer','{"id":"asset","locationId":"other","reason":"Relocate"}');
select pg_temp.asset_command('maintenance.report','{"id":"work","assetId":"asset","description":"Repair pump","priority":"HIGH"}');
select pg_temp.asset_command('maintenance.start','{"id":"work"}','REJECTED','INVALID_STATE');
select pg_temp.asset_command('maintenance.assign','{"id":"work","assigneeId":"tech"}');
select pg_temp.asset_command('maintenance.start','{"id":"work"}');
-- Failure after part consumption must roll the whole business transaction back.
select pg_temp.asset_command('maintenance.complete','{"id":"work","resolution":"Fixed","parts":[{"stockItemId":"part","locationId":"store","quantity":2}],"serviceCostMinor":500,"supplierId":"missing","invoiceReference":"INV-1"}','REJECTED','VALIDATION_FAILED');
do $$begin
 if (servos_v2.read_record('stockItems','part')->'currentStock'->>'store')::numeric<>10 or exists(select 1 from servos_v2.records where collection in ('stockMovements','journalEntries')) then raise exception 'Rejected completion leaked stock or journal effects';end if;
end$$;
select pg_temp.asset_command('maintenance.complete','{"id":"work","resolution":"Fixed","parts":[{"stockItemId":"part","locationId":"store","quantity":2}],"serviceCostMinor":500,"supplierId":"supplier","invoiceReference":"INV-1"}');
select pg_temp.asset_command('maintenance.complete','{"id":"work","resolution":"Again","parts":[],"serviceCostMinor":0}','REJECTED','INVALID_STATE');
do $$declare row_data record;begin
 if (servos_v2.read_record('stockItems','part')->'currentStock'->>'store')::numeric<>8 then raise exception 'Part quantity incorrect';end if;
 if (select count(*) from servos_v2.records where collection='stockMovements')<>1 or (select count(*) from servos_v2.records where collection='journalEntries')<>2 then raise exception 'Missing or duplicated postings';end if;
 if (servos_v2.read_record('supplierPayables','maintenance-work')->>'amountMinor')::bigint<>500 then raise exception 'Payable missing';end if;
 for row_data in select data from servos_v2.records where collection='journalEntries' loop
  if row_data.data->>'totalDebitMinor' is distinct from row_data.data->>'totalCreditMinor' then raise exception 'Unbalanced journal';end if;
 end loop;
 begin update servos_v2.records set data='{}' where collection='assetEvents';raise exception 'History was mutable';exception when others then if sqlerrm not like '%Immutable business history%' then raise;end if;end;
end$$;
insert into servos_v2.resources(kind,id,capacity) values('ASSET','asset',1);
select servos_v2.reserve('30000000-0000-4000-8000-000000000001','ASSET','asset','10000000-0000-4000-8000-000000000002',1,now()-interval '2 days',now()-interval '1 day');
select pg_temp.asset_command('asset.transfer','{"id":"asset","locationId":"store","reason":"Wrong device"}','REJECTED','RESOURCE_OWNED');
-- A fixture marks handover complete; no public handover implementation is claimed.
update servos_v2.allocations set state='RETURNED' where kind='ASSET';
select pg_temp.asset_command('maintenance.report','{"id":"reserved-work","assetId":"asset","description":"Second repair","priority":"LOW"}');
select pg_temp.asset_command('maintenance.assign','{"id":"reserved-work","assigneeId":"tech"}');
select pg_temp.asset_command('maintenance.start','{"id":"reserved-work"}');
select servos_v2.reserve('30000000-0000-4000-8000-000000000002','STOCK','part:store','10000000-0000-4000-8000-000000000002',8,now()-interval '2 days',now()-interval '1 day');
select pg_temp.asset_command('maintenance.complete','{"id":"reserved-work","resolution":"Cannot take reserved parts","parts":[{"stockItemId":"part","locationId":"store","quantity":1}],"serviceCostMinor":0}','REJECTED','ALLOCATION_EXHAUSTED');
do $$begin if (servos_v2.read_record('stockItems','part')->'currentStock'->>'store')::numeric<>8 then raise exception 'Consumed another device allocation';end if;end$$;
select pg_temp.asset_command('maintenance.cancel','{"id":"reserved-work","reason":"Parts allocated elsewhere"}');
select pg_temp.asset_command('asset.retire','{"id":"asset","reason":"End of service"}');
select pg_temp.asset_command('asset.archive','{"id":"asset"}');
select pg_temp.asset_command('asset.reactivate','{"id":"asset"}');
select pg_temp.asset_command('asset.assign','{"id":"asset","custodianId":"tech","reason":"Cannot revive retirement"}','REJECTED','INVALID_STATE');
update servos_v2.members set permissions=array['records.view'] where user_id=auth.uid();
select pg_temp.asset_command('asset.dispose','{"id":"asset","reason":"Forbidden"}','REJECTED','PERMISSION_DENIED');
set local role authenticated;
do $$declare page jsonb;begin
 page:=public.servos_v2_pull(0,500);
 if (page->>'cursor')::bigint=0 or jsonb_array_length(page->'changes')=0 then raise exception 'Filtered feed lost cursor progress';end if;
 if exists(select 1 from jsonb_array_elements(page->'changes') c where jsonb_array_length(c->'records')<>0) then raise exception 'Sensitive asset, stock, payable or journal record leaked';end if;
 begin perform * from servos_v2.records;raise exception 'Direct private record access allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
