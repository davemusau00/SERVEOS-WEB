-- TEMPORARY PROBE: does a fractional averageUnitCostMinor break maintenance parts?
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000081','Probe','DESKTOP');
reset role;
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';

create function pg_temp.probe_command(op text,collection_name text,record_key text,p jsonb,expected_status text default 'SYNCHRONIZED') returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 if not exists(select 1 from servos_v2.records where collection=collection_name and id=record_key) then versions:=versions||jsonb_build_array(jsonb_build_object('collection',collection_name,'id',record_key,'version',0));end if;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000081','actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000081'),'operation',op,'payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status then raise exception 'PROBE FAIL % expected % got %',op,expected_status,r;end if;
 return r;
end$$;

select pg_temp.probe_command('stockLocation.save','stockLocations','store','{"id":"store","data":{"name":"Store","code":"STORE","type":"STORE"}}');
-- Fractional per-unit cost rate, exactly as the cost-precision migration now produces.
select pg_temp.probe_command('stockItem.save','stockItems','part','{"id":"part","data":{"name":"Filter part","code":"PART","baseUnit":"piece","scanUnitQuantity":1,"reorderLevel":0,"averageUnitCostMinor":11058.823529411765}}');
select pg_temp.probe_command('inventory.count','stockItems','part','{"id":"part","stockItemId":"part","locationId":"store","countedQty":10,"reason":"Probe opening"}');
select servos_v2.put_record('assetCategories','equipment','{"name":"Equipment","code":"EQUIP"}');
select servos_v2.put_record('suppliers','supplier','{"name":"Supplier","code":"SUP1"}');
select servos_v2.put_record('assets','pump','{"name":"Pump","code":"PUMP","categoryId":"equipment","categoryName":"Equipment","status":"IN_SERVICE"}');
select pg_temp.probe_command('maintenance.report','maintenanceOrders','work','{"id":"work","assetId":"pump","description":"Repair pump","priority":"HIGH"}');
select pg_temp.probe_command('maintenance.assign','maintenanceOrders','work','{"id":"work","assigneeId":"tech"}');
select pg_temp.probe_command('maintenance.start','maintenanceOrders','work','{"id":"work"}');
select pg_temp.probe_command('maintenance.complete','maintenanceOrders','work','{"id":"work","resolution":"Fixed","parts":[{"stockItemId":"part","locationId":"store","quantity":2}],"serviceCostMinor":500,"supplierId":"supplier","invoiceReference":"INV-1"}');
do $$declare s jsonb;begin
 select data into s from servos_v2.records where collection='stockMovements' and data->>'movementType'='MAINTENANCE';
 if s is null then raise exception 'PROBE FAIL: no maintenance movement';end if;
 raise exception 'PROBE OK: maintenance movement cost=% total=%',s->>'unitCostMinor',s->>'totalCostMinor';
end$$;
rollback;
