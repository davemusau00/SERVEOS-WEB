-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;

insert into servos_v2.members values(
 '00000000-0000-4000-8000-000000000001',true,array['*']
)
on conflict(user_id) do update set active=true,permissions=array['*'];

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device(
 '10000000-0000-4000-8000-000000000041','Procurement desktop','DESKTOP'
);
reset role;
update servos_v2.control set enabled=true;

create function pg_temp.proc_command(
 op text, collection_name text, record_key text, p jsonb,
 expected_status text default 'SYNCHRONIZED',
 expected_code text default null
) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;
begin
 select coalesce(
   jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),
   '[]'
 ) into versions from servos_v2.records;

 if not exists(
   select 1 from servos_v2.records
   where collection=collection_name and id=record_key
 ) then
  versions:=versions||jsonb_build_array(
    jsonb_build_object('collection',collection_name,'id',record_key,'version',0)
  );
 end if;

 c:=jsonb_build_object(
  'id',gen_random_uuid(),'schemaVersion',2,
  'deviceId','10000000-0000-4000-8000-000000000041',
  'actorId',auth.uid(),
  'clientSequence',(
    select last_sequence+1
    from servos_v2.devices
    where id='10000000-0000-4000-8000-000000000041'
  ),
  'operation',op,'payload',p,'expectedVersions',versions
 );

 r:=public.servos_v2_execute(c);

 if r->>'status'<>expected_status
    or (expected_code is not null and r->'error'->>'code' is distinct from expected_code)
 then raise exception 'Unexpected % result: %',op,r; end if;

 if public.servos_v2_execute(c)<>r then
  raise exception 'Procurement response-loss replay changed result';
 end if;

 return r;
end$$;

select pg_temp.proc_command(
 'supplier.save','suppliers','supplier',
 '{"id":"supplier","data":{"name":"Supplier One","code":"SUP1","paymentTermsDays":30}}'
);

select pg_temp.proc_command(
 'stockLocation.save','stockLocations','main',
 '{"id":"main","data":{"name":"Main Store","code":"MAIN","type":"STORE"}}'
);

select pg_temp.proc_command(
 'stockItem.save','stockItems','flour',
 '{"id":"flour","data":{"name":"Flour","code":"FLOUR","baseUnit":"kg","scanUnitQuantity":1,"reorderLevel":2,"averageUnitCostMinor":10000}}'
);

select pg_temp.proc_command(
 'inventory.count','stockItems','flour',
 '{"id":"flour","stockItemId":"flour","locationId":"main","countedQty":8,"reason":"Opening procurement test stock"}'
);

select servos_v2.put_record(
 'assetCategories','equipment','{"name":"Equipment","code":"EQUIP"}'
);

select pg_temp.proc_command(
 'purchaseOrder.create','purchaseOrders','po',
 '{
  "id":"po","supplierId":"supplier",
  "items":[
   {"lineId":"stock-line","treatment":"STOCK","stockItemId":"flour","quantityOrdered":10,"unitPriceMinor":12000},
   {"lineId":"expense-line","treatment":"EXPENSE","description":"Generator service","expenseCategory":"REPAIRS","quantityOrdered":1,"unitPriceMinor":50000},
   {"lineId":"asset-line","treatment":"ASSET","assetName":"Chest freezer","assetCategoryId":"equipment","quantityOrdered":1,"unitPriceMinor":8000000}
  ]
 }'
);

select pg_temp.proc_command(
 'purchaseOrder.receive','purchaseOrders','po',
 '{
  "purchaseOrderId":"po","locationId":"main",
  "supplierInvoiceNumber":"INV-001","deliveryNote":"DN-1",
  "lines":[
   {"lineId":"stock-line","quantityDelivered":10,"quantityAccepted":9,"quantityRejected":1,"rejectionReason":"Damaged"},
   {"lineId":"expense-line","quantityDelivered":1,"quantityAccepted":1,"quantityRejected":0},
   {"lineId":"asset-line","quantityDelivered":1,"quantityAccepted":1,"quantityRejected":0}
  ]
 }'
);

do $$
declare s jsonb;
begin
 s:=servos_v2.read_record('stockItems','flour');

 if (s->'currentStock'->>'main')::numeric<>17 then
  raise exception 'Stock receipt quantity wrong';
 end if;

 if (s->>'averageUnitCostMinor')::bigint<>11059 then
  raise exception 'Weighted average cost wrong: %',s->>'averageUnitCostMinor';
 end if;

 if (select count(*) from servos_v2.records where collection='goodsReceipts')<>1 then
  raise exception 'GRN missing';
 end if;

 if (select count(*) from servos_v2.records where collection='supplierPayables')<>1 then
  raise exception 'Payable missing';
 end if;

 if (
   select count(*) from servos_v2.records
   where collection='assetAcquisitions'
     and data->>'status'='PENDING_COMMISSION'
 )<>1 then raise exception 'Asset acquisition missing'; end if;

 if not exists(
   select 1 from servos_v2.records
   where collection='journalEntries' and data->>'sourceType'='PROCUREMENT'
 ) then raise exception 'Procurement journal missing'; end if;
end$$;

do $$
declare pid text;p jsonb;
begin
 select id,data into pid,p
 from servos_v2.records
 where collection='supplierPayables'
 limit 1;

 perform pg_temp.proc_command(
  'supplierPayable.matchInvoice','supplierPayables',pid,
  jsonb_build_object(
   'payableId',pid,
   'invoiceNumber','INV-001',
   'invoiceAmountMinor',(p->>'amountMinor')::bigint,
   'invoiceDate','2030-01-01','dueDate','2030-01-31',
   'lines',jsonb_build_array(
    jsonb_build_object('lineId','stock-line','quantityBilled',9,'unitPriceMinor',12000),
    jsonb_build_object('lineId','expense-line','quantityBilled',1,'unitPriceMinor',50000),
    jsonb_build_object('lineId','asset-line','quantityBilled',1,'unitPriceMinor',8000000)
   )
  )
 );

 select data into p
 from servos_v2.records
 where collection='supplierPayables' and id=pid;

 perform pg_temp.proc_command(
  'supplierPayable.pay','supplierPayables',pid,
  jsonb_build_object(
   'payableId',pid,
   'amountMinor',(p->>'amountDueMinor')::bigint,
   'method','BANK','reference','BANK-001',
   'reason','Settlement','confirmed',true
  )
 );
end$$;

do $$
declare aid text;
begin
 select id into aid
 from servos_v2.records
 where collection='assetAcquisitions'
   and data->>'status'='PENDING_COMMISSION'
 limit 1;

 perform pg_temp.proc_command(
  'asset.commission','assets','freezer',
  jsonb_build_object(
   'id','freezer','acquisitionId',aid,
   'tag','ASSET-001','locationId','main','name','Chest freezer'
  )
 );

 if servos_v2.read_record('assetAcquisitions',aid)->>'status'<>'COMMISSIONED' then
  raise exception 'Acquisition not commissioned';
 end if;

 if servos_v2.read_record('assets','freezer')->>'acquisitionSourceId'<>aid then
  raise exception 'Asset source missing';
 end if;
end$$;

-- Duplicate supplier invoice is rejected.
select pg_temp.proc_command(
 'purchaseOrder.create','purchaseOrders','po2',
 '{"id":"po2","supplierId":"supplier","items":[{"lineId":"x","treatment":"EXPENSE","description":"Other","expenseCategory":"GENERAL","quantityOrdered":1,"unitPriceMinor":1000}]}'
);

select pg_temp.proc_command(
 'purchaseOrder.receive','purchaseOrders','po2',
 '{"purchaseOrderId":"po2","supplierInvoiceNumber":"INV-001","lines":[{"lineId":"x","quantityDelivered":1,"quantityAccepted":1,"quantityRejected":0}]}'
);

do $$
declare pid text;
begin
 select id into pid
 from servos_v2.records
 where collection='supplierPayables'
   and data->>'purchaseOrderId'='po2';

 perform pg_temp.proc_command(
  'supplierPayable.matchInvoice','supplierPayables',pid,
  jsonb_build_object(
   'payableId',pid,'invoiceNumber','INV-001',
   'invoiceAmountMinor',1000,
   'invoiceDate','2030-01-01','dueDate','2030-01-31',
   'lines',jsonb_build_array(
    jsonb_build_object('lineId','x','quantityBilled',1,'unitPriceMinor',1000)
   )
  ),
  'REJECTED','DUPLICATE_REFERENCE'
 );
end$$;

-- Posted procurement history is immutable.
do $$
begin
 begin
  update servos_v2.records set data='{}' where collection='goodsReceipts';
  raise exception 'GRN mutable';
 exception when others then
  if sqlerrm not like '%Immutable business history%' then raise; end if;
 end;

 begin
  update servos_v2.records set data='{}' where collection='supplierPayments';
  raise exception 'Supplier payment mutable';
 exception when others then
  if sqlerrm not like '%Immutable business history%' then raise; end if;
 end;
end$$;

-- Permission rejection.
update servos_v2.members
set permissions=array['records.view','procurement.view']
where user_id=auth.uid();

select pg_temp.proc_command(
 'supplier.save','suppliers','blocked',
 '{"id":"blocked","data":{"name":"Blocked","code":"BLOCK"}}',
 'REJECTED','PERMISSION_DENIED'
);

rollback;
