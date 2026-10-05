-- Disposable acceptance only. Canonical migration and existing domain handlers are exercised.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000081','Bottle tests','DESKTOP');
reset role;
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';
create function pg_temp.bottle_command(op text,collection_name text,record_key text,p jsonb,expected_status text default 'SYNCHRONIZED') returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 if not exists(select 1 from servos_v2.records where collection=collection_name and id=record_key) then versions:=versions||jsonb_build_array(jsonb_build_object('collection',collection_name,'id',record_key,'version',0));end if;
 if p ? 'expectedVersions' then
  for r in select value from jsonb_array_elements(p->'expectedVersions') loop
   select coalesce(jsonb_agg(value),'[]') into versions from jsonb_array_elements(versions) where not (value->>'collection'=r->>'collection' and value->>'id'=r->>'id');versions:=versions||jsonb_build_array(r);
  end loop;
 end if;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000081','actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000081'),'operation',op,'payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);if r->>'status'<>expected_status then raise exception 'Unexpected % result: %',op,r;end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Bottle command replay changed result';end if;return r;
end$$;
select pg_temp.bottle_command('stockLocation.save','stockLocations','bottle-main','{"id":"bottle-main","data":{"name":"Bottle store","code":"BOTTLEMAIN","type":"STORE"}}');
select pg_temp.bottle_command('stockLocation.save','stockLocations','bottle-bar','{"id":"bottle-bar","data":{"name":"Bottle bar","code":"BOTTLEBAR","type":"BAR"}}');
select pg_temp.bottle_command('stockItem.save','stockItems','wine750','{"id":"wine750","data":{"name":"Wine 750","code":"WINE750","baseUnit":"ml","sealedContainerSize":750,"scanUnitQuantity":750,"averageUnitCostMinor":0}}');
select pg_temp.bottle_command('inventory.adjust','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-main","reason":"Fixture","sealedContainers":12,"openQuantity":0,"countedQty":9000}');
select pg_temp.bottle_command('stockItem.save','stockItems','omitted','{"id":"omitted","data":{"name":"Omitted","code":"OMITTED","baseUnit":"piece","averageUnitCostMinor":0}}');
create temporary table omitted_before as select version,data from servos_v2.records where collection='stockItems' and id='omitted';
select pg_temp.bottle_command('inventory.countSelected','stockCounts','quick','{"locationId":"bottle-main","reason":"Quick count","selectedStockItemIds":["wine750"],"rows":[{"stockItemId":"wine750","expectedQuantity":9000,"countedQuantity":6300,"countedSealedContainers":8,"countedOpenQuantity":300,"measurementMethod":"EXACT"}]}');
do $$begin
 if (select data->'sealedOpenStock'->'bottle-main'->>'sealedContainers' from servos_v2.records where collection='stockItems' and id='wine750')<>'8' then raise exception 'Wrong sealed count';end if;
 if exists(select 1 from omitted_before b join servos_v2.records r on r.collection='stockItems' and r.id='omitted' where b.version<>r.version or b.data<>r.data) then raise exception 'Quick count changed omitted stock';end if;
 if not exists(select 1 from servos_v2.records where collection='stockCounts' and data->>'scope'='SELECTED') then raise exception 'Quick coverage missing';end if;
end$$;
select pg_temp.bottle_command('inventory.countLocation','stockCounts','incomplete','{"locationId":"bottle-main","reason":"Incomplete","rows":[{"stockItemId":"wine750","expectedQuantity":6300,"countedQuantity":6300,"countedSealedContainers":8,"countedOpenQuantity":300}]}','REJECTED');
select pg_temp.bottle_command('inventory.countSelected','stockCounts','invalid','{"locationId":"bottle-main","reason":"Bad open count","selectedStockItemIds":["wine750"],"rows":[{"stockItemId":"wine750","expectedQuantity":6300,"countedQuantity":6750,"countedSealedContainers":8,"countedOpenQuantity":750}]}','REJECTED');
select pg_temp.bottle_command('inventory.countSelected','stockCounts','duplicate','{"locationId":"bottle-main","reason":"Duplicate","selectedStockItemIds":["wine750","wine750"],"rows":[{"stockItemId":"wine750","expectedQuantity":6300,"countedQuantity":6300,"countedSealedContainers":8,"countedOpenQuantity":300},{"stockItemId":"wine750","expectedQuantity":6300,"countedQuantity":6300,"countedSealedContainers":8,"countedOpenQuantity":300}]}','REJECTED');
select pg_temp.bottle_command('inventory.countSelected','stockCounts','stale',jsonb_build_object('locationId','bottle-main','reason','Frozen review','selectedStockItemIds',jsonb_build_array('wine750'),'rows',jsonb_build_array(jsonb_build_object('stockItemId','wine750','expectedQuantity',6300,'countedQuantity',6300,'countedSealedContainers',8,'countedOpenQuantity',300)),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockItems','id','wine750','version',0))),'CONFLICT');
select pg_temp.bottle_command('inventory.transfer','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-main","toLocationId":"bottle-bar","reason":"Three sealed bottles","quantity":2250,"disposition":"SEALED"}');
do $$begin
 if (select data->'sealedOpenStock'->'bottle-main'->>'openQuantity' from servos_v2.records where collection='stockItems' and id='wine750')<>'300' then raise exception 'Sealed transfer changed open liquid';end if;
 if (select (data->'sealedOpenStock'->'bottle-bar'->>'sealedContainers')::numeric from servos_v2.records where collection='stockItems' and id='wine750')<>3 then raise exception 'Sealed transfer failed';end if;
end$$;
select pg_temp.bottle_command('inventory.adjust','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-bar","reason":"Open destination","sealedContainers":3,"openQuantity":600,"countedQty":2850}');
create temporary table transfer_before as select data,version from servos_v2.records where collection='stockItems' and id='wine750';
select pg_temp.bottle_command('inventory.transfer','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-main","toLocationId":"bottle-bar","reason":"Cannot merge full open bottles","quantity":200,"disposition":"OPEN"}','REJECTED');
do $$begin if exists(select 1 from transfer_before b join servos_v2.records r on r.collection='stockItems' and r.id='wine750' where b.data<>r.data or b.version<>r.version) then raise exception 'Failed transfer did not roll back';end if;end$$;
select pg_temp.bottle_command('inventory.adjust','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-main","reason":"Resolve open stock","sealedContainers":8,"openQuantity":0,"countedQty":6000}');
select pg_temp.bottle_command('inventory.adjust','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-bar","reason":"Resolve open stock","sealedContainers":3,"openQuantity":0,"countedQty":2250}');
select pg_temp.bottle_command('product.save','products','bottle-only','{"id":"bottle-only","data":{"name":"Bottle wine","code":"BOTTLEWINE","priceMinor":100000,"category":"GENERAL","stockItemId":"wine750","sellingMode":"BOTTLE_ONLY","portionVolume":750,"portions":[{"id":"bottle","name":"Whole bottle","volume":750,"priceMinor":100000,"wholeContainerSale":true}]}}');
select pg_temp.bottle_command('product.save','products','bottle-only','{"id":"bottle-only","data":{"name":"Bottle wine","code":"BOTTLEWINE","priceMinor":100000,"stockItemId":"wine750","sellingMode":"BOTTLE_ONLY","portionVolume":750,"portions":[{"id":"shot","name":"Shot","volume":30,"priceMinor":10000}]}}','REJECTED');
create temporary table before_waste as select data from servos_v2.records where collection='stockItems' and id='wine750';
select pg_temp.bottle_command('inventory.waste','stockItems','wine750','{"stockItemId":"wine750","locationId":"bottle-main","quantity":750,"disposition":"SEALED","reason":"Mistaken recording"}');
create temporary table wasted_movement as select id,data from servos_v2.records where collection='stockMovements' and data->>'movementType'='WASTE' and data->>'stockItemId'='wine750';
select pg_temp.bottle_command('inventory.reverseMovement','movementCorrections','new',jsonb_build_object('movementId',(select id from wasted_movement),'confirmedRecordingMistake',true,'reason','Not physically wasted'));
do $$begin if (select data from before_waste)<>(select data from servos_v2.records where collection='stockItems' and id='wine750') then raise exception 'Movement reversal state mismatch';end if;end$$;
select pg_temp.bottle_command('inventory.reverseMovement','movementCorrections','again',jsonb_build_object('movementId',(select id from wasted_movement),'confirmedRecordingMistake',true,'reason','Again'),'REJECTED');
select pg_temp.bottle_command('supplier.save','suppliers','bottle-supplier','{"id":"bottle-supplier","data":{"name":"Bottle supplier","code":"BOTTLESUP","paymentTermsDays":0}}');
select pg_temp.bottle_command('purchaseOrder.create','purchaseOrders','bottle-po','{"id":"bottle-po","supplierId":"bottle-supplier","items":[{"lineId":"wine-line","stockItemId":"wine750","quantityOrdered":750,"unitPriceMinor":200}]}');
create temporary table stock_before_receipt as select data from servos_v2.records where collection='stockItems' and id='wine750';
create temporary table po_before_receipt as select data from servos_v2.records where collection='purchaseOrders' and id='bottle-po';
select pg_temp.bottle_command('purchaseOrder.receive','goodsReceipts','new',jsonb_build_object('purchaseOrderId','bottle-po','locationId','bottle-main','lines',jsonb_build_array(jsonb_build_object('lineId',(select data->'items'->0->>'lineId' from servos_v2.records where collection='purchaseOrders' and id='bottle-po'),'stockItemId','wine750','quantityDelivered',750,'quantityAccepted',750,'quantityRejected',0))));
create temporary table original_receipt as select id,data from servos_v2.records where collection='goodsReceipts' and data->>'purchaseOrderId'='bottle-po';
select pg_temp.bottle_command('procurement.reverseUnusedReceipt','receiptCorrections','new',jsonb_build_object('goodsReceiptId',(select id from original_receipt),'reason','Duplicate recording','confirmedUnusedDuplicate',true));
do $$begin
 if (select data from stock_before_receipt)<>(select data from servos_v2.records where collection='stockItems' and id='wine750') then raise exception 'Cost/stock not restored';end if;
 if (select data from po_before_receipt)<>(select data from servos_v2.records where collection='purchaseOrders' and id='bottle-po') then raise exception 'PO fulfilment not restored';end if;
 if exists(select 1 from original_receipt b join servos_v2.records r on r.collection='goodsReceipts' and r.id=b.id where r.data<>b.data) then raise exception 'Original receipt rewritten';end if;
 if exists(select 1 from servos_v2.records where collection='supplierPayables' and data->>'goodsReceiptId'=(select id from original_receipt) and (data->>'amountDueMinor')::bigint<>0) then raise exception 'Payable not reversed';end if;
end$$;
select pg_temp.bottle_command('procurement.reverseUnusedReceipt','receiptCorrections','again',jsonb_build_object('goodsReceiptId',(select id from original_receipt),'reason','Again','confirmedUnusedDuplicate',true),'REJECTED');
-- A package costs 10,001 minor units for 9,000 ml; retain the invoice total,
-- a fractional rate and unchanged pre-existing open liquid.
select pg_temp.bottle_command('stockItem.save','stockItems','rate-stock','{"id":"rate-stock","data":{"name":"Rate test","code":"RATESTOCK","baseUnit":"ml","sealedContainerSize":750,"scanUnitQuantity":750,"averageUnitCostMinor":0,"purchasePackages":[{"id":"case12","name":"12 bottles","baseQuantity":9000,"unitsPerPackage":12,"baseUnit":"ml"}]}}');
select pg_temp.bottle_command('inventory.adjust','stockItems','rate-stock','{"stockItemId":"rate-stock","locationId":"bottle-main","sealedContainers":0,"openQuantity":300,"countedQty":300,"reason":"Existing open liquid"}');
select pg_temp.bottle_command('purchaseOrder.create','purchaseOrders','rate-po','{"id":"rate-po","supplierId":"bottle-supplier","items":[{"lineId":"rate-line","stockItemId":"rate-stock","purchasePackageId":"case12","quantityOrdered":1,"unitPriceMinor":10001}]}');
select pg_temp.bottle_command('purchaseOrder.receive','goodsReceipts','rate-new','{"purchaseOrderId":"rate-po","locationId":"bottle-main","lines":[{"lineId":"rate-line","stockItemId":"rate-stock","quantityDelivered":1,"quantityAccepted":1,"quantityRejected":0}]}');
do $$declare s jsonb;begin
 select data into s from servos_v2.records where collection='stockItems' and id='rate-stock';
 if round((s->>'averageUnitCostMinor')::numeric*9300)<>10001 then raise exception 'Invoice value lost through rounded per-ml rate';end if;
 if (s->'sealedOpenStock'->'bottle-main'->>'sealedContainers')::numeric<>12 then raise exception 'Receiving did not retain sealed bottles';end if;
 if (s->'sealedOpenStock'->'bottle-main'->>'openQuantity')::numeric<>300 then raise exception 'Receiving changed existing open liquid';end if;
end$$;
rollback;
