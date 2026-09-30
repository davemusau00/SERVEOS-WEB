-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*'])
on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000031','Inventory desktop','DESKTOP');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000032','Inventory web','WEB');
reset role;
update servos_v2.control set enabled=true;

create function pg_temp.inv_command(op text,collection_name text,record_key text,p jsonb,device_key uuid default '10000000-0000-4000-8000-000000000031',expected_status text default 'SYNCHRONIZED',expected_code text default null)
returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 if not exists(select 1 from servos_v2.records where collection=collection_name and id=record_key) then
  versions:=versions||jsonb_build_array(jsonb_build_object('collection',collection_name,'id',record_key,'version',0));
 end if;
 c:=jsonb_build_object(
  'id',gen_random_uuid(),'schemaVersion',2,'deviceId',device_key,'actorId',auth.uid(),
  'clientSequence',(select last_sequence+1 from servos_v2.devices where id=device_key),
  'operation',op,'payload',p,'expectedVersions',versions
 );
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status or (expected_code is not null and r->'error'->>'code' is distinct from expected_code) then
  raise exception 'Unexpected % result: %',op,r;
 end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Inventory response-loss replay changed result';end if;
 return r;
end$$;

select pg_temp.inv_command('stockLocation.save','stockLocations','main','{"id":"main","data":{"name":"Main Store","code":"MAIN","type":"STORE"}}');
select pg_temp.inv_command('stockLocation.save','stockLocations','bar','{"id":"bar","data":{"name":"Main Bar","code":"BAR","type":"BAR"}}');
select pg_temp.inv_command('stockItem.save','stockItems','gin','{"id":"gin","data":{"name":"Chrome Gin 750ml","code":"GIN750","baseUnit":"bottle","barcode":"616000001","scanUnitQuantity":1,"reorderLevel":5,"averageUnitCostMinor":60000}}');
select pg_temp.inv_command('product.save','products','gin-sell','{"id":"gin-sell","data":{"name":"Chrome Gin 750ml","code":"GIN750-S","priceMinor":100000,"category":"SPIRITS","routeTo":"BAR","stockItemId":"gin","barcode":"616000002","favorite":true}}');

select pg_temp.inv_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","countedQty":10,"reason":"Opening physical count"}');
do $$begin
 if (servos_v2.read_record('stockItems','gin')->'currentStock'->>'main')::numeric<>10 then raise exception 'Count did not set exact quantity';end if;
 if not exists(select 1 from servos_v2.records where collection='stockMovements' and data->>'movementType'='COUNT_ADJUSTMENT') then raise exception 'Count movement missing';end if;
end$$;

-- Reviewed whole-location count includes every active stock item and replays once.
select pg_temp.inv_command('stockItem.save','stockItems','soda','{"id":"soda","data":{"name":"Soda","code":"SODA","baseUnit":"bottle","scanUnitQuantity":2,"averageUnitCostMinor":100}}');
select pg_temp.inv_command('inventory.countLocation','stockItems','count-location-1','{"id":"count-location-1","locationId":"main","sessionId":"web-count-1","sessionRevision":1,"reason":"Reviewed location count","unknownBarcodes":[],"rows":[{"stockItemId":"gin","expectedQuantity":10,"countedQuantity":8,"name":"Chrome Gin 750ml","baseUnit":"bottle","scanUnitQuantity":1},{"stockItemId":"soda","expectedQuantity":0,"countedQuantity":0,"name":"Soda","baseUnit":"bottle","scanUnitQuantity":2}]}');
do $$begin
 if (select count(*) from servos_v2.records where collection='stockCounts')<>1 then raise exception 'Whole-location count record missing';end if;
 if (select count(*) from servos_v2.records where collection='stockMovements' and data->>'reason'='Reviewed location count')<>1 then raise exception 'Whole-location variance movement mismatch';end if;
 if (servos_v2.read_record('stockItems','gin')->'currentStock'->>'main')::numeric<>8 then raise exception 'Whole-location count did not apply variance';end if;
end$$;

select pg_temp.inv_command('inventory.transfer','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","toLocationId":"bar","quantity":3,"reason":"Bar replenishment"}');
do $$declare s jsonb;begin
 s:=servos_v2.read_record('stockItems','gin');
 if (s->'currentStock'->>'main')::numeric<>5 or (s->'currentStock'->>'bar')::numeric<>3 then raise exception 'Transfer quantities incorrect';end if;
 if (select count(*) from servos_v2.records where collection='stockMovements' and data->>'sourceCommandId' is not null and data->>'movementType' in ('TRANSFER_OUT','TRANSFER_IN'))<>2 then raise exception 'Transfer movement pair missing';end if;
end$$;

select pg_temp.inv_command('inventory.waste','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","quantity":2,"reason":"Broken bottle"}');
select pg_temp.inv_command('inventory.waste','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","quantity":99,"reason":"Impossible"}','10000000-0000-4000-8000-000000000031','REJECTED','VALIDATION_FAILED');

-- Two-device stale baseline must conflict rather than overwrite the fresh count.
do $$declare stale jsonb;fresh jsonb;r jsonb;v bigint;begin
 select version into v from servos_v2.records where collection='stockItems' and id='gin';
 stale:=jsonb_build_object(
  'id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000032','actorId',auth.uid(),'clientSequence',1,
  'operation','inventory.count',
  'payload',jsonb_build_object('id','gin','stockItemId','gin','locationId','bar','countedQty',4,'reason','Stale web count'),
  'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockItems','id','gin','version',v))
 );
 perform pg_temp.inv_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"bar","countedQty":5,"reason":"Fresh count"}');
 r:=public.servos_v2_execute(stale);
 if r->>'status'<>'CONFLICT' or r->'error'->>'code'<>'VERSION_CONFLICT' then raise exception 'Stale count did not conflict: %',r;end if;
end$$;

-- Master archive guards.
select pg_temp.inv_command('stockItem.archive','stockItems','gin','{"id":"gin"}','10000000-0000-4000-8000-000000000031','REJECTED','INVALID_STATE');
select pg_temp.inv_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","countedQty":0,"reason":"Clear main"}');
select pg_temp.inv_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"bar","countedQty":0,"reason":"Clear bar"}');
select pg_temp.inv_command('stockItem.archive','stockItems','gin','{"id":"gin"}','10000000-0000-4000-8000-000000000031','REJECTED','INVALID_STATE');
select pg_temp.inv_command('product.archive','products','gin-sell','{"id":"gin-sell"}');
select pg_temp.inv_command('stockItem.archive','stockItems','gin','{"id":"gin"}');
select pg_temp.inv_command('stockItem.reactivate','stockItems','gin','{"id":"gin"}');
select pg_temp.inv_command('product.reactivate','products','gin-sell','{"id":"gin-sell"}');

-- Immutable history.
do $$begin
 begin update servos_v2.records set data='{}' where collection='stockMovements';raise exception 'stock movement history mutable';
 exception when others then if sqlerrm not like '%Immutable business history%' then raise;end if;end;
end$$;

-- Permission rejection.
update servos_v2.members set permissions=array['records.view','catalog.view'] where user_id=auth.uid();
select pg_temp.inv_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"main","countedQty":1,"reason":"No permission"}','10000000-0000-4000-8000-000000000031','REJECTED','PERMISSION_DENIED');

rollback;
