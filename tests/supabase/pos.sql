-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*'])
on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000051','POS desktop','DESKTOP');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000052','POS web','WEB');
reset role;
update servos_v2.control set enabled=true;

create function pg_temp.pos_command(
 op text,collection_name text,record_key text,p jsonb,
 expected_status text default 'SYNCHRONIZED',
 expected_code text default null,
 device_key uuid default '10000000-0000-4000-8000-000000000051'
) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]')
 into versions from servos_v2.records;
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
 if public.servos_v2_execute(c)<>r then raise exception 'POS response-loss replay changed result';end if;
 return r;
end$$;

-- Assert that a direct staged write is refused by a database guard carrying the expected code.
-- The refused write is rolled back, so the stored record is left unchanged.
create function pg_temp.failing_put(
  label text,collection_name text,record_key text,p jsonb,expected_detail text default 'VALIDATION_FAILED'
) returns void language plpgsql as $$
declare failure text;
begin
  begin
    perform servos_v2.put_record(collection_name,record_key,p);
  exception when others then
    failure:=sqlerrm;
  end;
  if failure is null then
    raise exception '%: the guard accepted a write it should have rejected',label;
  end if;
  if position(expected_detail in failure)=0 then
    raise exception '%: expected %, got %',label,expected_detail,failure;
  end if;
end$$;

select pg_temp.pos_command('posPolicy.save','posPolicy','policy','{"id":"policy","data":{"vatBasisPoints":0,"cateringLevyBasisPoints":0}}');
select pg_temp.pos_command('stockLocation.save','stockLocations','bar-stock','{"id":"bar-stock","data":{"name":"Bar Stock","code":"BAR","type":"BAR"}}');
select pg_temp.pos_command('outlet.save','outlets','bar','{"id":"bar","data":{"name":"Main Bar","code":"BAR","defaultStockLocationId":"bar-stock"}}');
select pg_temp.pos_command('table.save','tables','t1','{"id":"t1","data":{"label":"T1","outletId":"bar","capacity":4}}');
select pg_temp.pos_command('stockItem.save','stockItems','gin','{"id":"gin","data":{"name":"Gin 750ml","code":"GIN","baseUnit":"bottle","scanUnitQuantity":1,"reorderLevel":1,"averageUnitCostMinor":60000}}');
select pg_temp.pos_command('inventory.count','stockItems','gin','{"id":"gin","stockItemId":"gin","locationId":"bar-stock","countedQty":10,"reason":"Opening POS test stock"}');
select pg_temp.pos_command('product.save','products','gin-shot','{"id":"gin-shot","data":{"name":"Gin Shot","code":"GINSHOT","priceMinor":30000,"category":"SPIRITS","routeTo":"BAR","barcode":"616000099","stockItemId":"gin","portionVolume":0.05}}');
select pg_temp.pos_command('product.salesConfig','products','gin-shot','{"productId":"gin-shot","portions":[{"id":"single","name":"Single","priceMinor":30000,"volume":0.05},{"id":"double","name":"Double","priceMinor":55000,"volume":0.1}],"modifiers":[],"recipeIngredients":[]}');

-- Two devices race for one table using the same table baseline.
do $$declare versions jsonb;stale jsonb;r jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]')
 into versions from servos_v2.records;
 versions:=versions||jsonb_build_array(jsonb_build_object('collection','orders','id','order-stale','version',0));
 stale:=jsonb_build_object(
  'id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000052',
  'actorId',auth.uid(),'clientSequence',1,'operation','order.create',
  'payload',jsonb_build_object('id','order-stale','outletId','bar','tableId','t1','name','Other waiter'),
  'expectedVersions',versions
 );
 perform pg_temp.pos_command('order.create','orders','order-1','{"id":"order-1","outletId":"bar","tableId":"t1","name":"Table T1"}');
 r:=public.servos_v2_execute(stale);
 if r->>'status'<>'CONFLICT' or r->'error'->>'code'<>'VERSION_CONFLICT' then
  raise exception 'Second device table race did not conflict: %',r;
 end if;
end$$;

select pg_temp.pos_command('order.addItem','orders','order-1','{"orderId":"order-1","productId":"gin-shot","itemId":"line-1","quantity":2,"portionId":"single","modifierIds":[]}');

do $$declare o jsonb;begin
 o:=servos_v2.read_record('orders','order-1');
 if (o->>'grandTotalMinor')::bigint<>60000 then raise exception 'Order total wrong';end if;
 if o->'items'->0->>'productVersion' is null then raise exception 'Product snapshot/version missing';end if;
 if o->'items'->0->'taxPolicySnapshot' is null then raise exception 'Tax snapshot missing';end if;
end$$;

-- Catalog price changes must not rewrite an already-added item's price snapshot when quantity changes.
select servos_v2.put_record('products','gin-shot',servos_v2.read_record('products','gin-shot')||jsonb_build_object('priceMinor',40000));
select pg_temp.pos_command('order.updateItem','orders','order-1','{"orderId":"order-1","itemId":"line-1","quantity":3}');
do $$declare o jsonb;begin
 o:=servos_v2.read_record('orders','order-1');
 if (o->'items'->0->>'unitPriceMinor')::bigint<>30000 or (o->>'grandTotalMinor')::bigint<>90000 then
  raise exception 'Open-order price snapshot was rewritten by catalog change';
 end if;
end$$;

select pg_temp.pos_command('order.fire','orders','order-1','{"orderId":"order-1"}');

do $$declare s jsonb;o jsonb;begin
 s:=servos_v2.read_record('stockItems','gin');o:=servos_v2.read_record('orders','order-1');
 if abs((s->'currentStock'->>'bar-stock')::numeric-9.85)>0.000001 then raise exception 'POS fire consumed wrong stock: %',s->'currentStock'->>'bar-stock';end if;
 if o->'items'->0->>'courseStatus'<>'FIRED' then raise exception 'Fired KDS state missing';end if;
 if (select count(*) from servos_v2.records where collection='stockMovements' and data->>'movementType'='SALE_CONSUMPTION')<>1 then raise exception 'Sale stock movement missing';end if;
end$$;

select pg_temp.pos_command('order.kds','orders','order-1','{"orderId":"order-1","itemId":"line-1","status":"PREPARING"}');
select pg_temp.pos_command('order.kds','orders','order-1','{"orderId":"order-1","itemId":"line-1","status":"READY"}');

-- Fired items cannot be silently edited or removed.
select pg_temp.pos_command('order.updateItem','orders','order-1','{"orderId":"order-1","itemId":"line-1","quantity":3}','REJECTED','INVALID_STATE');
select pg_temp.pos_command('order.removeItem','orders','order-1','{"orderId":"order-1","itemId":"line-1"}','REJECTED','INVALID_STATE');

-- Void with RETURN_SEALED restores exactly the fired ingredient quantity and puts the table into CLEANING.
select pg_temp.pos_command('order.void','orders','order-1','{"orderId":"order-1","reason":"Customer changed mind before service","disposition":"RETURN_SEALED"}');

do $$declare s jsonb;t jsonb;o jsonb;begin
 s:=servos_v2.read_record('stockItems','gin');t:=servos_v2.read_record('tables','t1');o:=servos_v2.read_record('orders','order-1');
 if abs((s->'currentStock'->>'bar-stock')::numeric-10)>0.000001 then raise exception 'Void return did not restore stock';end if;
 if t->>'state'<>'CLEANING' or nullif(t->>'currentOrderId','') is not null then raise exception 'Voided table not released to cleaning';end if;
 if o->>'state'<>'VOIDED' then raise exception 'Order not voided';end if;
end$$;

select pg_temp.pos_command('table.ready','tables','t1','{"tableId":"t1"}');

-- Named tab without a table remains valid and firing is still replay-safe.
select pg_temp.pos_command('order.create','orders','tab-1','{"id":"tab-1","outletId":"bar","name":"Kamau"}');
select pg_temp.pos_command('order.addItem','orders','tab-1','{"orderId":"tab-1","productId":"gin-shot","itemId":"tab-line","quantity":1,"portionId":"double","modifierIds":[]}');
select pg_temp.pos_command('order.fire','orders','tab-1','{"orderId":"tab-1"}');

-- Whole-container behavior is explicit and requires an actual sealed/open ml stock master.
select pg_temp.pos_command('stockItem.save','stockItems','sealed-gin','{"id":"sealed-gin","data":{"name":"Sealed Gin","code":"SEALED-GIN","baseUnit":"ml","scanUnitQuantity":750,"sealedContainerSize":750,"reorderLevel":0,"averageUnitCostMinor":60000}}');
select pg_temp.pos_command('inventory.adjust','stockItems','sealed-gin','{"id":"sealed-gin","stockItemId":"sealed-gin","locationId":"bar-stock","countedQty":1500,"sealedContainers":2,"openQuantity":0,"reason":"Whole-container acceptance stock"}');
select pg_temp.pos_command('product.save','products','sealed-gin-product','{"id":"sealed-gin-product","data":{"name":"Sealed Gin Bottle","code":"SEALED-GIN-PRODUCT","priceMinor":120000,"category":"SPIRITS","inventoryType":"SPIRIT","routeTo":"BAR","stockItemId":"sealed-gin","portionVolume":750}}');
select pg_temp.pos_command('product.salesConfig','products','sealed-gin-product','{"productId":"sealed-gin-product","portions":[{"id":"single","name":"Single","priceMinor":12000,"volume":45},{"id":"whole-container","name":"Whole bottle","priceMinor":120000,"volume":750,"wholeContainerSale":true}],"modifiers":[],"recipeIngredients":[]}');
select pg_temp.pos_command('order.create','orders','whole-bottle-order','{"id":"whole-bottle-order","outletId":"bar","name":"Whole bottle acceptance"}');
select pg_temp.pos_command('order.addItem','orders','whole-bottle-order','{"orderId":"whole-bottle-order","productId":"sealed-gin-product","itemId":"whole-bottle-line","quantity":1,"portionId":"whole-container","modifierIds":[]}');
select pg_temp.pos_command('order.fire','orders','whole-bottle-order','{"orderId":"whole-bottle-order"}');
do $$declare stock jsonb;begin
 stock:=servos_v2.read_record('stockItems','sealed-gin');
 if (stock->'currentStock'->>'bar-stock')::numeric<>750 or (stock->'sealedOpenStock'->'bar-stock'->>'sealedContainers')::numeric<>1 or (stock->'sealedOpenStock'->'bar-stock'->>'openQuantity')::numeric<>0 then raise exception 'Explicit whole-container sale did not consume one sealed bottle';end if;
end$$;
select pg_temp.pos_command('order.void','orders','whole-bottle-order','{"orderId":"whole-bottle-order","reason":"Acceptance cleanup","disposition":"RETURN_SEALED"}');

-- Online POS settlement: manual evidence, atomic split, receipt and journal.
select servos_v2.put_record('organization','business','{"name":"Test Business","branding":{"appEmblemDataUrl":null},"receipt":{"logoDataUrl":"data:image/jpeg;base64,AA==","thermalLogo":{"width":8,"height":1,"base64":"AA=="},"mpesaTillQr":{"enabled":true,"label":"Country Side Till","dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":8,"height":8,"base64":"AAAAAAAAAAA="}}}}');
select servos_v2.put_record('property','property','{"name":"Test Property","address":"Test Street","phone":"0700000000","currency":"KES","timezone":"Africa/Nairobi","receiptFooter":"Thank you"}');
select servos_v2.put_record('paymentAccounts','cash',jsonb_build_object('name','Cash till','method','CASH','accountCode','CASH'));
select servos_v2.put_record('paymentAccounts','mpesa',jsonb_build_object('name','Manual M-Pesa','method','MPESA','number','0700000000','accountCode','MPESA_CLEARING'));
select servos_v2.put_record('paymentAccounts','card',jsonb_build_object('name','External card','method','CARD','accountCode','CARD_CLEARING'));
select pg_temp.pos_command('till.open','tillSessions','shift-1','{"id":"shift-1","openingFloatMinor":1000}');

-- An invalid later leg rolls back an earlier cash leg and all related effects.
select pg_temp.pos_command('payment.split','orders','tab-1','{"orderId":"tab-1","payments":[{"amountMinor":20000,"accountId":"cash","cashTenderedMinor":20000},{"amountMinor":35000,"accountId":"mpesa","reference":"AABBCC11","receivedAmountMinor":35000,"receivedAt":"2026-09-27T12:00:00Z"}]}','REJECTED','VALIDATION_FAILED');
do $$begin
 if exists(select 1 from servos_v2.records where collection='payments') then raise exception 'Failed split retained payment effects';end if;
 if (servos_v2.read_record('tillSessions','shift-1')->>'expectedCashMinor')::bigint<>1000 then raise exception 'Failed split changed drawer cash';end if;
end$$;

select pg_temp.pos_command('payment.split','orders','tab-1','{"orderId":"tab-1","payments":[{"amountMinor":20000,"accountId":"cash","cashTenderedMinor":22000},{"amountMinor":25000,"accountId":"mpesa","reference":"AABBCC11","receivedAmountMinor":25000,"receivedAt":"2026-09-27T12:00:00Z","manuallyConfirmed":true},{"amountMinor":10000,"accountId":"card","reference":"AUTH-OK-77","manuallyConfirmed":true}]}');
do $$declare o jsonb;s jsonb;receipt jsonb;begin
 o:=servos_v2.read_record('orders','tab-1');s:=servos_v2.read_record('stockItems','gin');
 select data into receipt from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='tab-1';
 if o->>'state'<>'COMPLETED' or (o->>'amountPaidMinor')::bigint<>55000 then raise exception 'Split did not complete the settled order';end if;
 if (s->'currentStock'->>'bar-stock')::numeric<>9.9 then raise exception 'Payment consumed stock a second time';end if;
 if jsonb_array_length(receipt->'paymentIds')<>3 or receipt->>'balanceMinor'<>'0' then raise exception 'Receipt snapshot omitted split settlement';end if;
 if receipt->>'schemaVersion'<>'2' or receipt->>'number' not like 'R-%' or receipt->>'orderNumber' not like 'ORD-%' or receipt->'brandingSnapshot'->>'version'<>'1' or receipt->'brandingSnapshot'->>'receiptLogoDataUrl'<>'data:image/jpeg;base64,AA==' then raise exception 'Receipt did not retain its friendly number and branding snapshot';end if;
 if not exists(select 1 from jsonb_array_elements(receipt->'payments') p where p->>'reference'='AABBCC11' and p->>'method'='MPESA') then raise exception 'Receipt omitted the customer-facing M-Pesa reference';end if;
 if exists(select 1 from jsonb_array_elements(receipt->'payments') p where p->>'method'='CARD' and p ? 'reference') then raise exception 'Receipt retained an external card authorization reference';end if;
 if (select count(*) from servos_v2.records where collection='payments' and data->>'orderId'='tab-1')<>3 then raise exception 'Split did not persist three tender records';end if;
 if exists(select 1 from servos_v2.records where collection='journalEntries' and data->>'sourceType'='PAYMENT' and data->>'totalDebitMinor'<>data->>'totalCreditMinor') then raise exception 'POS payment journal is unbalanced';end if;
 if (servos_v2.read_record('tillSessions','shift-1')->>'expectedCashMinor')::bigint<>21000 then raise exception 'Cash drawer total is wrong';end if;
 if (select data->>'changeMinor' from servos_v2.records where collection='payments' and data->>'orderId'='tab-1' and data->>'method'='CASH')<>'2000' then raise exception 'Cash change snapshot is wrong';end if;
 if exists(select 1 from servos_v2.records where collection='payments' and data->>'method'='MPESA' and data->>'confirmation'<>'MANUALLY_CONFIRMED') then raise exception 'M-Pesa was represented as provider initiated';end if;
  -- The enabled Till QR is snapshotted immutably, is a bounded square PNG raster.
  if receipt->'brandingSnapshot'->'mpesaTillQr'->>'enabled'<>'true'
     or receipt->'brandingSnapshot'->'mpesaTillQr'->>'dataUrl' !~ '^data:image/png;base64,'
     or (receipt->'brandingSnapshot'->'mpesaTillQr'->'thermalRaster'->>'width')::integer
        <> (receipt->'brandingSnapshot'->'mpesaTillQr'->'thermalRaster'->>'height')::integer
     or (receipt->'brandingSnapshot'->'mpesaTillQr'->'thermalRaster'->>'width')::integer>320 then
    raise exception 'Receipt did not snapshot the configured Till QR';
  end if;
  -- The Till QR is a payment convenience only: it never carries a payment reference.
  if receipt->'brandingSnapshot'->'mpesaTillQr' ? 'reference' then raise exception 'Till QR snapshot carried a payment reference';end if;
  -- QR presence must not change any captured amount.
  if (receipt->>'totalMinor')::bigint<>55000 or (receipt->>'paidMinor')::bigint<>55000 then raise exception 'Till QR altered receipt totals';end if;
end$$;

-- Till QR settings validation: an enabled QR must carry a printable square raster, and the
-- migration 044 guard is authoritative. A rejected write must not change the stored settings.
select pg_temp.failing_put('non-square QR raster','organization','business','{"name":"Test Business","receipt":{"mpesaTillQr":{"enabled":true,"dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":8,"height":16,"base64":"AwMDAwMDAwM="}}}}');
select pg_temp.failing_put('oversized QR raster','organization','business','{"name":"Test Business","receipt":{"mpesaTillQr":{"enabled":true,"dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":400,"height":400,"base64":"AwMDAwMDAwM="}}}}');
select pg_temp.failing_put('wrong QR raster byte length','organization','business','{"name":"Test Business","receipt":{"mpesaTillQr":{"enabled":true,"dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":8,"height":8,"base64":"AwMDAwMDAwMDA="}}}}');
select pg_temp.failing_put('enabled QR without a raster','organization','business','{"name":"Test Business","receipt":{"mpesaTillQr":{"enabled":true,"dataUrl":"data:image/png;base64,AA=="}}}');
select pg_temp.failing_put('QR without an explicit enabled flag','organization','business','{"name":"Test Business","receipt":{"mpesaTillQr":{"dataUrl":"data:image/png;base64,AA==","thermalRaster":{"width":8,"height":8,"base64":"AwMDAwMDAwM="}}}}');
do $$begin
  if servos_v2.read_record('organization','business')->'receipt'->'mpesaTillQr'->>'label'<>'Country Side Till' then
    raise exception 'A rejected Till QR write changed the stored settings';
  end if;
end$$;

-- Replacing the Till QR affects new receipts only; an earlier receipt keeps its own snapshot.
select pg_temp.pos_command('order.create','orders','order-qr-two','{"id":"order-qr-two","outletId":"bar","name":"QR replacement test"}');
select pg_temp.pos_command('order.addItem','orders','order-qr-two','{"orderId":"order-qr-two","productId":"gin-shot","itemId":"qr-two-line","quantity":1,"portionId":"single","modifierIds":[]}');
select servos_v2.put_record('organization','business',jsonb_set(servos_v2.read_record('organization','business'),'{receipt,mpesaTillQr}',jsonb_build_object('enabled',true,'label','Replacement Till','dataUrl','data:image/png;base64,BB==','thermalRaster',jsonb_build_object('width',8,'height',8,'base64','AwMDAwMDAwM='))));
-- Settle the QR orders on card so the Till QR fixtures cannot disturb the cash drawer arithmetic
-- asserted later by the refund/till-close checks. Each receipt is created at payment commit.
select pg_temp.pos_command('payment.record','orders','order-qr-two','{"orderId":"order-qr-two","amountMinor":30000,"accountId":"card","reference":"QR-TWO-AUTH","manuallyConfirmed":true}');

-- Removing the Till QR affects new receipts only; earlier receipts retain their own QR.
select pg_temp.pos_command('order.create','orders','order-qr-three','{"id":"order-qr-three","outletId":"bar","name":"QR removal test"}');
select pg_temp.pos_command('order.addItem','orders','order-qr-three','{"orderId":"order-qr-three","productId":"gin-shot","itemId":"qr-three-line","quantity":1,"portionId":"single","modifierIds":[]}');
select servos_v2.put_record('organization','business',jsonb_set(servos_v2.read_record('organization','business'),'{receipt}',(servos_v2.read_record('organization','business')->'receipt')-'mpesaTillQr'));
select pg_temp.pos_command('payment.record','orders','order-qr-three','{"orderId":"order-qr-three","amountMinor":30000,"accountId":"card","reference":"QR-THREE-AUTH","manuallyConfirmed":true}');

-- A disabled QR is omitted from the snapshot even while the image stays configured.
select pg_temp.pos_command('order.create','orders','order-qr-four','{"id":"order-qr-four","outletId":"bar","name":"QR disabled test"}');
select pg_temp.pos_command('order.addItem','orders','order-qr-four','{"orderId":"order-qr-four","productId":"gin-shot","itemId":"qr-four-line","quantity":1,"portionId":"single","modifierIds":[]}');
select servos_v2.put_record('organization','business',jsonb_set(servos_v2.read_record('organization','business'),'{receipt,mpesaTillQr,enabled}','false'));
select pg_temp.pos_command('payment.record','orders','order-qr-four','{"orderId":"order-qr-four","amountMinor":30000,"accountId":"card","reference":"QR-FOUR-AUTH","manuallyConfirmed":true}');

do $$declare first_qr jsonb;second_qr jsonb;third_qr jsonb;fourth_qr jsonb;begin
  select data->'brandingSnapshot'->'mpesaTillQr' into first_qr from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='tab-1';
  select data->'brandingSnapshot'->'mpesaTillQr' into second_qr from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='order-qr-two';
  select data->'brandingSnapshot'->'mpesaTillQr' into third_qr from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='order-qr-three';
  select data->'brandingSnapshot'->'mpesaTillQr' into fourth_qr from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='order-qr-four';
  if first_qr is null or first_qr->>'label'<>'Country Side Till' then raise exception 'Historical receipt lost its original Till QR';end if;
  if second_qr->>'label'<>'Replacement Till' then raise exception 'Replacement QR did not reach the new receipt';end if;
  if third_qr is not null and jsonb_typeof(third_qr)<>'null' then raise exception 'Removing the QR did not clear it on a new receipt';end if;
  if fourth_qr is not null and jsonb_typeof(fourth_qr)<>'null' then raise exception 'A disabled QR must not be snapshotted';end if;
end$$;

-- Duplicate M-Pesa reference rejects without a partial payment.
select pg_temp.pos_command('order.create','orders','order-duplicate','{"id":"order-duplicate","outletId":"bar","name":"Duplicate reference test"}');
select pg_temp.pos_command('order.addItem','orders','order-duplicate','{"orderId":"order-duplicate","productId":"gin-shot","itemId":"dup-line","quantity":1,"portionId":"single","modifierIds":[]}');
select pg_temp.pos_command('payment.record','orders','order-duplicate','{"orderId":"order-duplicate","amountMinor":30000,"accountId":"mpesa","reference":"aabbcc11","receivedAmountMinor":30000,"receivedAt":"2026-09-27T12:05:00Z","manuallyConfirmed":true}','REJECTED','DUPLICATE_REFERENCE');
do $$begin
 if exists(select 1 from servos_v2.records where collection='payments' and data->>'orderId'='order-duplicate') then raise exception 'Duplicate M-Pesa code partially posted';end if;
end$$;

-- Partial settlement blocks edits and any payment above the remaining balance.
select pg_temp.pos_command('order.create','orders','order-partial','{"id":"order-partial","outletId":"bar","name":"Partial settlement test"}');
select pg_temp.pos_command('order.addItem','orders','order-partial','{"orderId":"order-partial","productId":"gin-shot","itemId":"partial-line","quantity":1,"portionId":"double","modifierIds":[]}');
select pg_temp.pos_command('payment.record','orders','order-partial','{"orderId":"order-partial","amountMinor":5000,"accountId":"cash","cashTenderedMinor":5000}');
select pg_temp.pos_command('order.addItem','orders','order-partial','{"orderId":"order-partial","productId":"gin-shot","itemId":"late-line","quantity":1,"portionId":"single","modifierIds":[]}','REJECTED','INVALID_STATE');
select pg_temp.pos_command('payment.record','orders','order-partial','{"orderId":"order-partial","amountMinor":50001,"accountId":"cash","cashTenderedMinor":50001}','REJECTED','VALIDATION_FAILED');

-- Two devices cannot both settle from the same order/till baseline.
do $$declare versions jsonb;c1 jsonb;c2 jsonb;r1 jsonb;r2 jsonb;seq1 bigint;seq2 bigint;baseline bigint;begin
 select version into baseline from servos_v2.records where collection='orders' and id='order-partial';
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 select last_sequence+1 into seq1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000051';
 select last_sequence+1 into seq2 from servos_v2.devices where id='10000000-0000-4000-8000-000000000052';
 c1:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000051','actorId',auth.uid(),'clientSequence',seq1,'operation','payment.record','payload',jsonb_build_object('orderId','order-partial','amountMinor',5000,'accountId','cash','cashTenderedMinor',5000),'expectedVersions',versions);
 c2:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000052','actorId',auth.uid(),'clientSequence',seq2,'operation','payment.record','payload',jsonb_build_object('orderId','order-partial','amountMinor',5000,'accountId','cash','cashTenderedMinor',5000),'expectedVersions',versions);
 r1:=public.servos_v2_execute(c1);r2:=public.servos_v2_execute(c2);
 if r1->>'status'<>'SYNCHRONIZED' then raise exception 'First competing payment failed: %',r1;end if;
 if r2->>'status'<>'CONFLICT' or r2->'error'->>'code'<>'VERSION_CONFLICT' then raise exception 'Stale second-device payment did not conflict: %',r2;end if;
 if (select count(*) from servos_v2.records where collection='payments' and data->>'orderId'='order-partial')<>2 then raise exception 'Stale payment partially committed';end if;
 if baseline is null then raise exception 'Payment conflict fixture missing order baseline';end if;
end$$;
select pg_temp.pos_command('till.close','tillSessions','shift-1','{"id":"shift-1","countedCashMinor":1000}','REJECTED','INVALID_STATE');
select pg_temp.pos_command('payment.record','orders','order-partial','{"orderId":"order-partial","amountMinor":45000,"accountId":"cash","cashTenderedMinor":45000}');
select pg_temp.pos_command('order.void','orders','order-duplicate','{"orderId":"order-duplicate","reason":"Close duplicate-reference test tab"}');

-- Card payment requires a manually observed external authorization reference.
select pg_temp.pos_command('order.create','orders','order-card','{"id":"order-card","outletId":"bar","name":"Card settlement"}');
select pg_temp.pos_command('order.addItem','orders','order-card','{"orderId":"order-card","productId":"gin-shot","itemId":"card-line","quantity":1,"portionId":"single","modifierIds":[]}');
select pg_temp.pos_command('payment.record','orders','order-card','{"orderId":"order-card","amountMinor":30000,"accountId":"card","reference":"EXT-991","manuallyConfirmed":true}');
do $$begin
 if not exists(select 1 from servos_v2.records where collection='payments' and data->>'orderId'='order-card' and data->>'confirmation'='MANUALLY_CONFIRMED' and data->>'reference'='EXT-991') then raise exception 'Card authorization evidence was not captured';end if;
end$$;

-- Completing a table order releases the table and does not repeat fire consumption.
select pg_temp.pos_command('order.create','orders','order-table-pay','{"id":"order-table-pay","outletId":"bar","tableId":"t1","name":"Settled table"}');
select pg_temp.pos_command('order.addItem','orders','order-table-pay','{"orderId":"order-table-pay","productId":"gin-shot","itemId":"table-pay-line","quantity":1,"portionId":"single","modifierIds":[]}');
select pg_temp.pos_command('order.fire','orders','order-table-pay','{"orderId":"order-table-pay"}');
select servos_v2.put_record('products','gin-shot',servos_v2.read_record('products','gin-shot')||jsonb_build_object('name','Renamed Gin'));
select pg_temp.pos_command('payment.record','orders','order-table-pay','{"orderId":"order-table-pay","amountMinor":30000,"accountId":"cash","cashTenderedMinor":30000}');
do $$declare t jsonb;o jsonb;receipt jsonb;s jsonb;begin
 t:=servos_v2.read_record('tables','t1');o:=servos_v2.read_record('orders','order-table-pay');s:=servos_v2.read_record('stockItems','gin');
 select data into receipt from servos_v2.records where collection='receiptDocuments' and data->>'orderId'='order-table-pay';
 if t->>'state'<>'CLEANING' or nullif(t->>'currentOrderId','') is not null or o->>'state'<>'COMPLETED' then raise exception 'Paid table order was not released';end if;
 if receipt->'items'->0->>'description'<>'Gin Shot' then raise exception 'Receipt snapshot changed after catalog rename';end if;
 if (s->'currentStock'->>'bar-stock')::numeric<>9.85 then raise exception 'Settlement repeated stock consumption';end if;
 begin update servos_v2.records set data=data||jsonb_build_object('message','mutated') where collection='receiptDocuments' and id=receipt->>'id';raise exception 'Receipt was mutable';exception when others then if sqlerrm<>'Immutable business history' then raise;end if;end;
end$$;
select pg_temp.pos_command('till.cashMovement','tillSessions','shift-1','{"tillSessionId":"shift-1","direction":"PAID_IN","amountMinor":500,"reason":"Verified float adjustment"}');
select pg_temp.pos_command('till.cashMovement','tillSessions','shift-1','{"tillSessionId":"shift-1","direction":"PAID_OUT","amountMinor":200,"reason":"Approved cash purchase"}');

-- Partial refund and full reversal retain the original tender and conserve the till.
select pg_temp.pos_command('order.create','orders','order-refund','{"id":"order-refund","outletId":"bar","name":"Refund workflow"}');
select pg_temp.pos_command('order.addItem','orders','order-refund','{"orderId":"order-refund","productId":"gin-shot","itemId":"refund-line","quantity":1,"portionId":"single","modifierIds":[]}');
select pg_temp.pos_command('payment.record','orders','order-refund','{"orderId":"order-refund","amountMinor":30000,"accountId":"cash","cashTenderedMinor":30000}');
do $$declare payment_key text;begin
 select id into payment_key from servos_v2.records where collection='payments' and data->>'orderId'='order-refund';
 perform pg_temp.pos_command('payment.refund','payments',payment_key,jsonb_build_object('paymentId',payment_key,'amountMinor',10000,'reason','Partial customer refund'));
 perform pg_temp.pos_command('payment.refund','payments',payment_key,jsonb_build_object('paymentId',payment_key,'amountMinor',25000,'reason','Over-refund'),'REJECTED','VALIDATION_FAILED');
 perform pg_temp.pos_command('payment.reverse','payments',payment_key,jsonb_build_object('paymentId',payment_key,'reason','Reverse remaining tender'));
 if (select count(*) from servos_v2.records where collection='refunds' and data->>'paymentId'=payment_key)<>2 then raise exception 'Partial refund and reversal history missing';end if;
 if (servos_v2.read_record('orders','order-refund')->>'refundedMinor')::bigint<>30000 then raise exception 'Order refund total is incorrect';end if;
 if (servos_v2.read_record('tillSessions','shift-1')->>'expectedCashMinor')::bigint<>106300 then raise exception 'Cash refunds did not conserve expected drawer';end if;
 begin update servos_v2.records set data=data||jsonb_build_object('amountMinor',1) where collection='payments' and id=payment_key;raise exception 'Payment was mutable';exception when others then if sqlerrm<>'Immutable business history' then raise;end if;end;
end$$;
select pg_temp.pos_command('till.close','tillSessions','shift-1','{"id":"shift-1","countedCashMinor":106300}');
do $$declare t jsonb;begin
 t:=servos_v2.read_record('tillSessions','shift-1');
 if t->>'status'<>'CLOSED' or (t->>'expectedCashMinor')::bigint<>106300 or (t->>'cashVarianceMinor')::bigint<>0 then raise exception 'Till close did not conserve counted cash';end if;
 if (select count(*) from servos_v2.records where collection='cashMovements')<>2 then raise exception 'Till movements missing';end if;
 begin update servos_v2.records set data=data||jsonb_build_object('reason','mutated') where collection='cashMovements';raise exception 'Cash movement was mutable';exception when others then if sqlerrm<>'Immutable business history' then raise;end if;end;
end$$;
select pg_temp.pos_command('closeDay.generate','closeDayReports','close-day-shift-1','{"tillId":"shift-1"}');
do $$declare report jsonb;begin
 select data into report from servos_v2.records where collection='closeDayReports' and id='close-day-shift-1';
 if report->'sales'->>'grossMinor'<>'290000' or report->'sales'->>'refundsMinor'<>'30000' then raise exception 'Close-day sales or refund totals are wrong: %',report;end if;
 if report->'tenders'->>'mpesaMinor'<>'25000' or report->'tenders'->>'cardMinor'<>'130000' or report->'tenders'->>'cashMinor'<>'135000' then raise exception 'Close-day tender totals are wrong: %',report;end if;
 if report->'cash'->>'varianceMinor'<>'0' or report->'orders'->>'openCount'<>'0' then raise exception 'Close-day drawer/open-tab snapshot is wrong';end if;
 if report->'reconciliation'->>'providerInitiated'<>'false' then raise exception 'Close-day report invented provider settlement';end if;
 begin update servos_v2.records set data=data||jsonb_build_object('sales','{}') where collection='closeDayReports';raise exception 'Close-day report was mutable';exception when others then if sqlerrm<>'Immutable business history' then raise;end if;end;
end$$;

-- Permission rejection.
update servos_v2.members set permissions=array['records.view','catalog.view'] where user_id=auth.uid();
select pg_temp.pos_command('order.create','orders','blocked','{"id":"blocked","outletId":"bar","name":"Blocked"}','REJECTED','PERMISSION_DENIED');

rollback;
