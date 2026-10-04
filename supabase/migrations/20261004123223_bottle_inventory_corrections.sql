-- Additive bottle inventory contracts. Apply to staged/shared authority only.
begin;

create or replace function servos_v2.apply_inventory_location_count(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload'; rows jsonb:=p->'rows'; row_data jsonb; stock jsonb; next_data jsonb;
 location_key text:=servos_v2.required_text(p,'locationId'); stock_key text; reason text;
 expected numeric; counted numeric; current_qty numeric; scan_qty numeric; changes jsonb:='[]';
 size numeric; sealed_count numeric; open_quantity numeric; before_state jsonb; state jsonb; sealed_state jsonb;
 selected_ids jsonb; scope text; active_count integer; row_count integer; item_count integer:=0; variance_count integer:=0;
 count_id text:='count-'||(command->>'id'); state_changed boolean;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 5000 then raise exception 'VALIDATION_FAILED: count must include between 1 and 5000 rows';end if;
 perform servos_v2.require_permission('inventory.count');
 scope:=case when command->>'operation'='inventory.countSelected' then 'SELECTED' else 'FULL' end;
 if length(trim(p->>'reason'))>500 then raise exception 'VALIDATION_FAILED: count reason exceeds 500 characters';end if;
 perform servos_v2.assert_version(command,'stockLocations',location_key);
 perform servos_v2.read_record('stockLocations',location_key);
 reason:=servos_v2.required_text(p,'reason');
 if jsonb_typeof(coalesce(p->'unknownBarcodes','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(p->'unknownBarcodes','[]'::jsonb))<>0 then raise exception 'VALIDATION_FAILED: resolve unknown barcodes before confirming';end if;
 select count(*) into active_count from servos_v2.records where collection='stockItems' and not archived;
 select count(*) into row_count from jsonb_array_elements(rows);
 if scope='FULL' and active_count<>row_count then raise exception 'VALIDATION_FAILED: count must include every active stock item';end if;
 if (select count(distinct value->>'stockItemId') from jsonb_array_elements(rows))<>row_count then raise exception 'VALIDATION_FAILED: duplicate stock item in count';end if;
 if scope='FULL' and exists(select 1 from servos_v2.records r where r.collection='stockItems' and not r.archived and not exists(select 1 from jsonb_array_elements(rows) x where x->>'stockItemId'=r.id)) then raise exception 'VALIDATION_FAILED: every active stock item is required';end if;
 if scope='SELECTED' then
  selected_ids:=p->'selectedStockItemIds';
  if jsonb_typeof(selected_ids) is distinct from 'array' or jsonb_array_length(selected_ids)<>row_count
   or (select count(distinct value) from jsonb_array_elements_text(selected_ids))<>row_count
   or exists(select 1 from jsonb_array_elements_text(selected_ids) s where not exists(select 1 from jsonb_array_elements(rows) r where r->>'stockItemId'=s)) then raise exception 'VALIDATION_FAILED: quick count rows must match selected items';end if;
 end if;
 for row_data in select value from jsonb_array_elements(rows) order by value->>'stockItemId' loop
  stock_key:=servos_v2.required_text(row_data,'stockItemId');
  expected:=servos_v2.quantity_value(row_data,'expectedQuantity',true); counted:=servos_v2.quantity_value(row_data,'countedQuantity',true);
  perform servos_v2.assert_version(command,'stockItems',stock_key);
  select r.data into stock from servos_v2.records r where r.collection='stockItems' and r.id=stock_key and not r.archived for update;
  if stock is null then raise exception 'VALIDATION_FAILED: active stock item missing';end if;
  current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
  if current_qty<>expected then raise exception 'VERSION_CONFLICT: stock quantity changed while this count was open';end if;
  if row_data ? 'name' and row_data->>'name' is distinct from stock->>'name' then raise exception 'VERSION_CONFLICT: stock catalog changed while this count was open';end if;
  if row_data ? 'baseUnit' and row_data->>'baseUnit' is distinct from stock->>'baseUnit' then raise exception 'VERSION_CONFLICT: stock catalog changed while this count was open';end if;
  scan_qty:=case when row_data ? 'scanUnitQuantity' then servos_v2.quantity_value(row_data,'scanUnitQuantity',false) else coalesce((stock->>'scanUnitQuantity')::numeric,1) end;
  if scan_qty<>coalesce((stock->>'scanUnitQuantity')::numeric,1) then raise exception 'VERSION_CONFLICT: stock scan conversion changed while this count was open';end if;
  if row_data ? 'consumptionProductIds' and row_data->'consumptionProductIds'<>(select coalesce(jsonb_agg(r.id order by r.id),'[]') from servos_v2.records r where r.collection='products' and not r.archived and (r.data->>'stockItemId'=stock_key or exists(select 1 from jsonb_array_elements(coalesce(r.data->'recipeIngredients','[]')) l where l->>'stockItemId'=stock_key) or exists(select 1 from jsonb_array_elements(coalesce(r.data->'modifiers','[]')) m cross join lateral jsonb_array_elements(coalesce(m->'ingredientAdjustments','[]')) l where l->>'stockItemId'=stock_key))) then raise exception 'VERSION_CONFLICT: consumption configuration changed';end if;
  if row_data ? 'measurementMethod' and row_data->>'measurementMethod' not in ('EXACT','ESTIMATED') then raise exception 'VALIDATION_FAILED: count measurement method';end if;
  size:=case when stock->>'baseUnit'='ml' then coalesce((stock->>'sealedContainerSize')::numeric,0) else 0 end;
  if row_data ? 'containerSize' and (row_data->>'containerSize')::numeric<>size then raise exception 'VERSION_CONFLICT: bottle size changed';end if;
  if size>0 then
   if jsonb_typeof(row_data->'countedSealedContainers') is distinct from 'number' or jsonb_typeof(row_data->'countedOpenQuantity') is distinct from 'number' then raise exception 'VALIDATION_FAILED: sealed/open count is required for tracked bottle stock';end if;
   sealed_count:=servos_v2.quantity_value(row_data,'countedSealedContainers',true);open_quantity:=servos_v2.quantity_value(row_data,'countedOpenQuantity',true);
   if sealed_count<>floor(sealed_count) or open_quantity>=size or abs(counted-(sealed_count*size+open_quantity))>0.000001 then raise exception 'VALIDATION_FAILED: counted total does not match whole sealed bottles plus open ml';end if;
   sealed_state:=coalesce(stock->'sealedOpenStock','{}'::jsonb);
   state:=coalesce(sealed_state->location_key,jsonb_build_object('sealedContainers',floor(current_qty/size),'openQuantity',current_qty-floor(current_qty/size)*size));
   if coalesce((state->>'sealedContainers')::numeric,-1)<0 or coalesce((state->>'sealedContainers')::numeric,0)<>floor(coalesce((state->>'sealedContainers')::numeric,0)) or coalesce((state->>'openQuantity')::numeric,-1)<0 or coalesce((state->>'openQuantity')::numeric,size)>=size or abs(coalesce((state->>'sealedContainers')::numeric,0)*size+coalesce((state->>'openQuantity')::numeric,0)-current_qty)>0.001 then raise exception 'INVALID_STATE: current sealed/open stock does not reconcile';end if;
   before_state:=jsonb_build_object('containerSize',size,'sealedContainers',(state->>'sealedContainers')::numeric,'openQuantity',(state->>'openQuantity')::numeric);
   state_changed:=(state->>'sealedContainers')::numeric<>sealed_count or (state->>'openQuantity')::numeric<>open_quantity;
   if counted<>current_qty or state_changed or stock->'sealedOpenStock'->location_key is null then
    variance_count:=variance_count+1;
    next_data:=jsonb_set(jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,counted),true),'{sealedOpenStock}',sealed_state||jsonb_build_object(location_key,jsonb_build_object('containerSize',size,'sealedContainers',sealed_count,'openQuantity',open_quantity)),true);
    changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
    changes:=changes||servos_v2.put_record('stockMovements',count_id||'-'||stock_key,jsonb_build_object('stockItemId',stock_key,'locationId',location_key,'quantityDelta',counted-current_qty,'movementType','COUNT_ADJUSTMENT','reason',reason,'baseUnit',stock->>'baseUnit','sealedOpenEffect',jsonb_build_object('before',before_state,'after',jsonb_build_object('containerSize',size,'sealedContainers',sealed_count,'openQuantity',open_quantity)),'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()));
   end if;
  elsif row_data ? 'countedSealedContainers' or row_data ? 'countedOpenQuantity' then raise exception 'VALIDATION_FAILED: sealed/open counts only apply to configured ml bottle stock';
  elsif counted<>current_qty then
   variance_count:=variance_count+1;
   next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,counted),true);
   changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
   changes:=changes||servos_v2.put_record('stockMovements',count_id||'-'||stock_key,jsonb_build_object('stockItemId',stock_key,'locationId',location_key,'quantityDelta',counted-current_qty,'movementType','COUNT_ADJUSTMENT','reason',reason,'baseUnit',stock->>'baseUnit','sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()));
  end if;
  item_count:=item_count+1;
 end loop;
 changes:=changes||servos_v2.put_record('stockCounts',count_id,jsonb_build_object('scope',scope,'selectedStockItemIds',coalesce(selected_ids,(select jsonb_agg(value->>'stockItemId') from jsonb_array_elements(rows))),'sessionId',nullif(trim(p->>'sessionId'),''),'revision',coalesce((p->>'sessionRevision')::integer,1),'locationId',location_key,'reason',reason,'rows',rows,'itemCount',item_count,'varianceCount',variance_count,'reviewed',true,'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()));
 return changes;
end$$;

-- Private helpers remain reachable only through the authenticated dispatcher.
create function servos_v2.assert_reviewed_inventory_versions(command jsonb) returns void
language plpgsql set search_path='' as $$
declare entry jsonb; pinned jsonb:=command->'payload'->'expectedVersions';begin
 if pinned is null then return;end if;
 if jsonb_typeof(pinned)<>'array' or jsonb_array_length(pinned)>10010 then raise exception 'VALIDATION_FAILED: reviewed versions';end if;
 for entry in select value from jsonb_array_elements(pinned) loop
  if not exists(select 1 from jsonb_array_elements(command->'expectedVersions') v where v=entry) then raise exception 'VERSION_CONFLICT: reviewed dependency baseline was replaced';end if;
  perform servos_v2.assert_version(command,entry->>'collection',entry->>'id');
 end loop;
end$$;

create function servos_v2.validate_bottle_product(product_key text,product jsonb) returns void
language plpgsql set search_path='' as $$
declare mode text:=product->>'sellingMode';stock jsonb;size numeric;stock_key text:=product->>'stockItemId';begin
 if mode is not null and mode not in ('BOTTLE_ONLY','BOTTLE_AND_PORTIONS') then raise exception 'VALIDATION_FAILED: selling method';end if;
 if mode is not null then
  stock:=servos_v2.read_record('stockItems',stock_key);size:=coalesce((stock->>'sealedContainerSize')::numeric,0);
  if stock->>'baseUnit'<>'ml' or size<=0 then raise exception 'VALIDATION_FAILED: set the size of one bottle first';end if;
  if mode='BOTTLE_ONLY' then
   if coalesce((product->>'portionVolume')::numeric,1)<>size or jsonb_array_length(coalesce(product->'portions','[]'))=0
    or exists(select 1 from jsonb_array_elements(coalesce(product->'portions','[]')) p where coalesce((p->>'wholeContainerSale')::boolean,false)=false or coalesce((p->>'volume')::numeric,0)<>size)
    then raise exception 'VALIDATION_FAILED: remove measured portions and configure whole bottle sales';end if;
   if jsonb_array_length(coalesce(product->'recipeIngredients','[]'))>0 or exists(select 1 from jsonb_array_elements(coalesce(product->'modifiers','[]')) m where jsonb_array_length(coalesce(m->'ingredientAdjustments','[]'))>0) then raise exception 'VALIDATION_FAILED: review recipe and modifier consumption';end if;
   if exists(select 1 from jsonb_each_text(coalesce(stock->'currentStock','{}')) q where coalesce((stock->'sealedOpenStock'->q.key->>'openQuantity')::numeric,mod(q.value::numeric,size))>0) then raise exception 'INVALID_STATE: resolve existing open liquid first';end if;
   if exists(select 1 from servos_v2.records r where r.collection='products' and not r.archived and r.id<>product_key and (
    exists(select 1 from jsonb_array_elements(coalesce(r.data->'recipeIngredients','[]')) l where l->>'stockItemId'=stock_key)
    or exists(select 1 from jsonb_array_elements(coalesce(r.data->'modifiers','[]')) m cross join lateral jsonb_array_elements(coalesce(m->'ingredientAdjustments','[]')) l where l->>'stockItemId'=stock_key))) then raise exception 'INVALID_STATE: another recipe or modifier consumes this stock';end if;
  end if;
 end if;
 if exists(select 1 from servos_v2.records r where r.collection='products' and not r.archived and r.id<>product_key and r.data->>'sellingMode'='BOTTLE_ONLY' and (
  (product->>'stockItemId'=r.data->>'stockItemId' and mode is distinct from 'BOTTLE_ONLY')
  or exists(select 1 from jsonb_array_elements(coalesce(product->'recipeIngredients','[]')) l where l->>'stockItemId'=r.data->>'stockItemId')
  or exists(select 1 from jsonb_array_elements(coalesce(product->'modifiers','[]')) m cross join lateral jsonb_array_elements(coalesce(m->'ingredientAdjustments','[]')) l where l->>'stockItemId'=r.data->>'stockItemId'))) then raise exception 'INVALID_STATE: review sealed-only stock links before measured consumption';end if;
end$$;

alter function servos_v2.pos_build_item(jsonb,text,jsonb,text) rename to pos_build_item_before_bottle_modes;
create function servos_v2.pos_build_item(command jsonb,product_key text,input jsonb,item_key text)
returns jsonb language plpgsql set search_path='' as $$
declare product jsonb;item jsonb;ingredients jsonb;size numeric;whole boolean;begin
 product:=servos_v2.read_record('products',product_key);
 perform servos_v2.validate_bottle_product(product_key,product);
 if product->>'sellingMode'='BOTTLE_ONLY' and servos_v2.quantity_value(input,'quantity',false)<>floor(servos_v2.quantity_value(input,'quantity',false)) then raise exception 'VALIDATION_FAILED: whole bottle quantity must be integer';end if;
 item:=servos_v2.pos_build_item_before_bottle_modes(command,product_key,input,item_key);
 -- Explicit bottle selling works independently of merchandising category.
 whole:=product->>'sellingMode'='BOTTLE_ONLY' or (product->>'sellingMode'='BOTTLE_AND_PORTIONS' and exists(select 1 from jsonb_array_elements(coalesce(product->'portions','[]')) r where r->>'id'=input->>'portionId' and coalesce((r->>'wholeContainerSale')::boolean,false)));
 if whole then
  if servos_v2.quantity_value(input,'quantity',false)<>floor(servos_v2.quantity_value(input,'quantity',false)) then raise exception 'VALIDATION_FAILED: whole bottle quantity must be integer';end if;
  size:=(servos_v2.read_record('stockItems',product->>'stockItemId')->>'sealedContainerSize')::numeric;
  ingredients:=jsonb_build_array(jsonb_build_object('stockItemId',product->>'stockItemId','quantity',size,'tracked',true,'wholeContainerSale',true));
  item:=jsonb_set(item,'{ingredientSnapshot}',ingredients,true);
 end if;
 return item;
end$$;

create function servos_v2.apply_physical_inventory_movement(command jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=command->'payload';stock_key text:=servos_v2.required_text(p,'stockItemId');
 source_key text:=servos_v2.required_text(p,'locationId');target_key text:=p->>'toLocationId';
 reason text:=servos_v2.required_text(p,'reason');stock jsonb;size numeric;qty numeric;source_qty numeric;target_qty numeric;
 s numeric;o numeric;ts numeric;to_ml numeric;before_s jsonb;before_t jsonb;changed jsonb:='[]';is_sealed boolean;begin
 perform servos_v2.require_permission(case when command->>'operation'='inventory.transfer' then 'inventory.transfer' else 'inventory.waste' end);
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 perform servos_v2.read_record('stockLocations',source_key);
 select data into stock from servos_v2.records where collection='stockItems' and id=stock_key and not archived for update;
 size:=coalesce((stock->>'sealedContainerSize')::numeric,0);qty:=servos_v2.quantity_value(p,'quantity',false);
 if stock->>'baseUnit'<>'ml' or size<=0 or qty<=0 or p->>'disposition' not in ('SEALED','OPEN') then raise exception 'VALIDATION_FAILED: configured bottle stock and physical disposition required';end if;
 is_sealed:=p->>'disposition'='SEALED';if is_sealed and mod(qty,size)<>0 then raise exception 'VALIDATION_FAILED: enter whole sealed bottles';end if;
 source_qty:=coalesce((stock->'currentStock'->>source_key)::numeric,0);
 s:=coalesce((stock->'sealedOpenStock'->source_key->>'sealedContainers')::numeric,floor(source_qty/size));o:=coalesce((stock->'sealedOpenStock'->source_key->>'openQuantity')::numeric,source_qty-s*size);
 if s<0 or s<>floor(s) or o<0 or o>=size or abs(s*size+o-source_qty)>0.000001 then raise exception 'INVALID_STATE: source bottle state does not reconcile';end if;
 before_s:=jsonb_build_object('sealedContainers',s,'openQuantity',o,'containerSize',size);
 if is_sealed then if s<qty/size then raise exception 'INVALID_STATE: insufficient sealed bottles';end if;s:=s-qty/size;
 else if o<qty then raise exception 'INVALID_STATE: insufficient open liquid';end if;o:=o-qty;end if;
 if command->>'operation'='inventory.transfer' then
  if target_key=source_key then raise exception 'VALIDATION_FAILED: choose a different destination';end if;
  perform servos_v2.read_record('stockLocations',target_key);
  target_qty:=coalesce((stock->'currentStock'->>target_key)::numeric,0);
  ts:=coalesce((stock->'sealedOpenStock'->target_key->>'sealedContainers')::numeric,floor(target_qty/size));to_ml:=coalesce((stock->'sealedOpenStock'->target_key->>'openQuantity')::numeric,target_qty-ts*size);
  if ts<0 or ts<>floor(ts) or to_ml<0 or to_ml>=size or abs(ts*size+to_ml-target_qty)>0.000001 then raise exception 'INVALID_STATE: destination bottle state does not reconcile';end if;
  before_t:=jsonb_build_object('sealedContainers',ts,'openQuantity',to_ml,'containerSize',size);
  if is_sealed then ts:=ts+qty/size;else to_ml:=to_ml+qty;end if;
  if to_ml>=size then raise exception 'INVALID_STATE: destination would exceed one open bottle';end if;
  stock:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}')||jsonb_build_object(target_key,target_qty+qty),true);
  stock:=jsonb_set(stock,'{sealedOpenStock}',coalesce(stock->'sealedOpenStock','{}')||jsonb_build_object(target_key,jsonb_build_object('sealedContainers',ts,'openQuantity',to_ml,'containerSize',size)),true);
  changed:=changed||servos_v2.put_record('stockMovements','physical-in-'||(command->>'id'),jsonb_build_object('stockItemId',stock_key,'locationId',target_key,'quantityDelta',qty,'movementType','TRANSFER_IN','reason',reason,'baseUnit','ml','sourceCommandId',command->>'id','sealedOpenEffect',jsonb_build_object('before',before_t,'after',stock->'sealedOpenStock'->target_key),'occurredAt',now()));
 end if;
 stock:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}')||jsonb_build_object(source_key,source_qty-qty),true);
 stock:=jsonb_set(stock,'{sealedOpenStock}',coalesce(stock->'sealedOpenStock','{}')||jsonb_build_object(source_key,jsonb_build_object('sealedContainers',s,'openQuantity',o,'containerSize',size)),true);
 return changed||servos_v2.put_record('stockItems',stock_key,stock)||servos_v2.put_record('stockMovements','physical-out-'||(command->>'id'),jsonb_build_object('stockItemId',stock_key,'locationId',source_key,'quantityDelta',-qty,'movementType',case when command->>'operation'='inventory.transfer' then 'TRANSFER_OUT' else 'WASTE' end,'reason',reason,'baseUnit','ml','sourceCommandId',command->>'id','sealedOpenEffect',jsonb_build_object('before',before_s,'after',stock->'sealedOpenStock'->source_key),'occurredAt',now()));
end$$;

create function servos_v2.reverse_unused_receipt(command jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=command->'payload';receipt_key text:=servos_v2.required_text(p,'goodsReceiptId');
 reason text:=servos_v2.required_text(p,'reason');receipt jsonb;snapshot jsonb;entry jsonb;stock jsonb;prior jsonb;payable jsonb;journal jsonb;
 order_key text;changed jsonb:='[]';lines jsonb:='[]';row_data jsonb;location_key text;quantity_delta numeric;correction_key text:='receipt-correction-'||(command->>'id');begin
 perform servos_v2.require_permission('procurement.pay');perform servos_v2.require_permission('procurement.manage');
 if p->'confirmedUnusedDuplicate' is distinct from 'true'::jsonb or length(reason)>500 then raise exception 'VALIDATION_FAILED: confirm an unused duplicate receipt and explain the mistake';end if;
 perform servos_v2.assert_version(command,'goodsReceipts',receipt_key);
 if exists(select 1 from servos_v2.records where collection='receiptCorrections' and data->>'goodsReceiptId'=receipt_key) then raise exception 'INVALID_STATE: receipt already fully corrected';end if;
 receipt:=servos_v2.read_record('goodsReceipts',receipt_key);snapshot:=servos_v2.read_record('procurementCorrectionBaselines',receipt_key);
 if exists(select 1 from jsonb_array_elements(receipt->'lines') l where coalesce(l->>'treatment','STOCK')<>'STOCK') then raise exception 'INVALID_STATE: asset and expense corrections require accounting review';end if;
 order_key:=receipt->>'purchaseOrderId';location_key:=receipt->>'locationId';
 perform 1 from servos_v2.records where collection='purchaseOrders' and id=order_key for update;
 if snapshot->'orderBefore' is null or (snapshot->>'orderAfterVersion')::bigint<>(select version from servos_v2.records where collection='purchaseOrders' and id=order_key) then raise exception 'INVALID_STATE: later PO activity blocks exact reversal';end if;
 for entry in select value from jsonb_array_elements(snapshot->'stockSnapshots') order by value->>'stockItemId' loop
  select data into stock from servos_v2.records where collection='stockItems' and id=entry->>'stockItemId' and not archived for update;
  if entry->'before' is null or (entry->>'afterVersion')::bigint is distinct from (select version from servos_v2.records where collection='stockItems' and id=entry->>'stockItemId') then raise exception 'INVALID_STATE: later stock or cost activity requires accounting review';end if;
 end loop;
 for entry in select value from jsonb_array_elements(snapshot->'payables') order by value->>'id' loop
  select data into payable from servos_v2.records where collection='supplierPayables' and id=entry->>'id' and not archived for update;
  if (entry->>'version')::bigint is distinct from (select version from servos_v2.records where collection='supplierPayables' and id=entry->>'id') or payable->>'status'<>'RECEIVED_UNINVOICED' or coalesce((payable->>'paidMinor')::bigint,0)<>0 then raise exception 'INVALID_STATE: invoice matching or settlement requires accounting review';end if;
 end loop;
 if (select count(*) from servos_v2.records where collection='journalEntries' and data->>'sourceId'=receipt_key and data->>'sourceType'='PROCUREMENT')<>1 then raise exception 'INVALID_STATE: receipt journal missing or ambiguous';end if;
 select data into journal from servos_v2.records where collection='journalEntries' and data->>'sourceId'=receipt_key and data->>'sourceType'='PROCUREMENT';
 for entry in select value from jsonb_array_elements(snapshot->'stockSnapshots') loop
  prior:=entry->'before';stock:=servos_v2.read_record('stockItems',entry->>'stockItemId');
  quantity_delta:=coalesce((prior->'currentStock'->>location_key)::numeric,0)-coalesce((stock->'currentStock'->>location_key)::numeric,0);
  changed:=changed||servos_v2.put_record('stockMovements',correction_key||'-'||(entry->>'stockItemId'),jsonb_build_object('stockItemId',entry->>'stockItemId','locationId',location_key,'quantityDelta',quantity_delta,'movementType','RECEIPT_REVERSAL','reason',reason,'baseUnit',stock->>'baseUnit','sourceCommandId',command->>'id','sourceId',correction_key,'sealedOpenEffect',jsonb_build_object('before',stock->'sealedOpenStock'->location_key,'after',prior->'sealedOpenStock'->location_key),'occurredAt',now()));
  changed:=changed||servos_v2.put_record('stockItems',entry->>'stockItemId',prior);
 end loop;
 for entry in select value from jsonb_array_elements(snapshot->'payables') loop
  payable:=servos_v2.read_record('supplierPayables',entry->>'id');changed:=changed||servos_v2.put_record('supplierPayables',entry->>'id',payable||jsonb_build_object('amountDueMinor',0,'status','REVERSED','correctionId',correction_key));
 end loop;
 for row_data in select value from jsonb_array_elements(journal->'lines') loop
  lines:=lines||jsonb_build_array(jsonb_build_object('accountCode',row_data->>'accountCode','debitMinor',(row_data->>'creditMinor')::bigint,'creditMinor',(row_data->>'debitMinor')::bigint));
 end loop;
 changed:=changed||servos_v2.post_journal(command,'receipt-reversal-'||(command->>'id'),'RECEIPT_CORRECTION',correction_key,reason,lines);
 changed:=changed||servos_v2.put_record('purchaseOrders',order_key,snapshot->'orderBefore');
 return changed||servos_v2.put_record('receiptCorrections',correction_key,jsonb_build_object('goodsReceiptId',receipt_key,'purchaseOrderId',order_key,'kind','UNUSED_DUPLICATE_FULL_REVERSAL','correctedAmountMinor',receipt->'acceptedValueMinor','remainingCorrectableAmountMinor',0,'linkedRecords',(select jsonb_agg(jsonb_build_object('collection',value->'collection','id',value->'id')) from jsonb_array_elements(changed)),'reason',reason,'actorId',auth.uid(),'sourceCommandId',command->>'id','occurredAt',now()));
end$$;

create function servos_v2.reverse_inventory_movement(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare p jsonb:=command->'payload';movement jsonb;baseline jsonb;stock jsonb;before_stock jsonb;original text;stock_key text;location_key text;qty numeric;changed jsonb:='[]';correction_key text:='movement-correction-'||(command->>'id');begin
 perform servos_v2.require_permission('inventory.adjust');
 movement:=servos_v2.read_record('stockMovements',servos_v2.required_text(p,'movementId'));
 if p->'confirmedRecordingMistake' is distinct from 'true'::jsonb then raise exception 'VALIDATION_FAILED: confirm that this was a recording mistake';end if;
 if movement->>'movementType' not in ('TRANSFER_OUT','TRANSFER_IN','WASTE') then raise exception 'INVALID_STATE: use the transaction correction workflow';end if;
 original:=movement->>'sourceCommandId';baseline:=servos_v2.read_record('inventoryMovementBaselines',original);stock_key:=baseline->>'stockItemId';
 if exists(select 1 from servos_v2.records where collection='movementCorrections' and data->>'reversesCommandId'=original) then raise exception 'INVALID_STATE: movement already fully reversed';end if;
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 select data into stock from servos_v2.records where collection='stockItems' and id=stock_key and not archived for update;
 if (baseline->>'afterVersion')::bigint is distinct from (select version from servos_v2.records where collection='stockItems' and id=stock_key) then raise exception 'INVALID_STATE: later stock/cost activity blocks reversal; correct the current physical balance';end if;
 before_stock:=baseline->'before';
 for location_key in select distinct key from jsonb_each(coalesce(stock->'currentStock','{}')) union select key from jsonb_each(coalesce(before_stock->'currentStock','{}')) loop
  qty:=coalesce((before_stock->'currentStock'->>location_key)::numeric,0)-coalesce((stock->'currentStock'->>location_key)::numeric,0);
  if qty<>0 then changed:=changed||servos_v2.put_record('stockMovements',correction_key||'-'||location_key,jsonb_build_object('stockItemId',stock_key,'locationId',location_key,'quantityDelta',qty,'movementType','MOVEMENT_REVERSAL','reason',servos_v2.required_text(p,'reason'),'sourceCommandId',command->>'id','sourceId',correction_key,'baseUnit',stock->>'baseUnit','sealedOpenEffect',jsonb_build_object('before',stock->'sealedOpenStock'->location_key,'after',before_stock->'sealedOpenStock'->location_key),'occurredAt',now()));end if;
 end loop;
 return changed||servos_v2.put_record('stockItems',stock_key,before_stock)||servos_v2.put_record('movementCorrections',correction_key,jsonb_build_object('movementId',p->>'movementId','stockItemId',stock_key,'reversesCommandId',original,'remainingCorrectableQuantity',0,'reason',p->>'reason','actorId',auth.uid(),'occurredAt',now(),'sourceCommandId',command->>'id'));
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_bottle_inventory_corrections;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare p jsonb:=command->'payload';op text:=command->>'operation';result jsonb;changed jsonb;entry jsonb;product jsonb;product_key text;mode jsonb;collection_name text:=p->>'collection';
 stock_before jsonb;order_before jsonb;receipt jsonb;receipt_key text;snapshots jsonb;payables jsonb;before_stock jsonb;after_stock jsonb;source_record jsonb;version_entry jsonb;begin
 perform servos_v2.assert_reviewed_inventory_versions(command);
 if op in ('inventory.countLocation','inventory.countSelected') then return servos_v2.apply_inventory_location_count(command);end if;
 if op='procurement.reverseUnusedReceipt' then return servos_v2.reverse_unused_receipt(command);end if;
 if op='inventory.reverseMovement' then return servos_v2.reverse_inventory_movement(command);end if;
 if op in ('inventory.transfer','inventory.waste') then before_stock:=servos_v2.read_record('stockItems',p->>'stockItemId');end if;
 if op in ('inventory.transfer','inventory.waste') and p ? 'disposition' then
  result:=servos_v2.apply_physical_inventory_movement(command);
  return result||servos_v2.put_record('inventoryMovementBaselines',command->>'id',jsonb_build_object('stockItemId',p->>'stockItemId','before',before_stock,'afterVersion',(select version from servos_v2.records where collection='stockItems' and id=p->>'stockItemId'),'operation',op));
 end if;
 -- Route Native catalog CRUD through the same domain validators as Web.
 if op in ('record.save','record.archive','record.reactivate') and collection_name in ('products','stockItems','stockLocations') then
  op:=case collection_name when 'products' then 'product' when 'stockItems' then 'stockItem' else 'stockLocation' end||case command->>'operation' when 'record.save' then '.save' when 'record.archive' then '.archive' else '.reactivate' end;
  command:=jsonb_set(command,'{operation}',to_jsonb(op));
  if op='product.save' and not (p->'data' ? 'priceMinor') then p:=jsonb_set(p,'{data,priceMinor}',to_jsonb(round((p->'data'->>'price')::numeric*100)::bigint),true);end if;
  if op='stockItem.save' and not (p->'data' ? 'averageUnitCostMinor') then p:=jsonb_set(p,'{data,averageUnitCostMinor}',to_jsonb((p->'data'->>'averageUnitCost')::numeric*100),true);end if;
  command:=jsonb_set(command,'{payload}',p);
 end if;
 if op='stockItem.archive' then
  if exists(select 1 from servos_v2.records r where r.collection='products' and not r.archived and (exists(select 1 from jsonb_array_elements(coalesce(r.data->'recipeIngredients','[]')) l where l->>'stockItemId'=p->>'id') or exists(select 1 from jsonb_array_elements(coalesce(r.data->'modifiers','[]')) m cross join lateral jsonb_array_elements(coalesce(m->'ingredientAdjustments','[]')) l where l->>'stockItemId'=p->>'id'))) then raise exception 'INVALID_STATE: active recipe or modifier references this stock';end if;
  if exists(select 1 from servos_v2.records r cross join lateral jsonb_array_elements(coalesce(r.data->'items','[]')) l where r.collection='purchaseOrders' and not r.archived and coalesce(r.data->>'status','') not in ('CANCELLED','CLOSED') and l->>'stockItemId'=p->>'id' and coalesce((l->>'quantityReceived')::numeric,0)<(l->>'quantityOrdered')::numeric) then raise exception 'INVALID_STATE: resolve outstanding purchase order quantities before archiving stock';end if;
 end if;
 if op='product.save' then mode:=coalesce(p->'data'->'sellingMode',(select data->'sellingMode' from servos_v2.records where collection='products' and id=p->>'id'));end if;
 if op='inventory.adjust' then
  perform servos_v2.assert_version(command,'stockItems',p->>'stockItemId');before_stock:=servos_v2.read_record('stockItems',p->>'stockItemId');
  if p ? 'expectedQuantity' and (p->>'expectedQuantity')::numeric<>coalesce((before_stock->'currentStock'->>(p->>'locationId'))::numeric,0) then raise exception 'VERSION_CONFLICT: balance changed';end if;
  if p->'sourceRecord' is not null and p->'sourceRecord'<>'null'::jsonb then
   if p->'sourceRecord'->>'collection' not in ('stockCounts','stockMovements') then raise exception 'VALIDATION_FAILED: correction source';end if;
   source_record:=servos_v2.read_record(p->'sourceRecord'->>'collection',p->'sourceRecord'->>'id');
   if source_record->>'stockItemId' is distinct from p->>'stockItemId' and not exists(select 1 from jsonb_array_elements(coalesce(source_record->'rows','[]')) r where r->>'stockItemId'=p->>'stockItemId') then raise exception 'VALIDATION_FAILED: source does not contain this stock';end if;
  end if;
 end if;
 if op='purchaseOrder.receive' then
  perform 1 from servos_v2.records where collection='purchaseOrders' and id=p->>'purchaseOrderId' for update;
  order_before:=servos_v2.read_record('purchaseOrders',p->>'purchaseOrderId');
  perform 1 from servos_v2.records where collection='stockItems' and not archived order by id for update;
  select coalesce(jsonb_object_agg(id,data),'{}') into stock_before from servos_v2.records where collection='stockItems' and not archived;
 end if;
 result:=servos_v2.dispatch_before_bottle_inventory_corrections(command);
 if op in ('product.save','product.reactivate','catalog.createWithOpeningStock') then
  for entry in select value from jsonb_array_elements(result) where value->>'collection'='products' loop
   product_key:=entry->>'id';product:=servos_v2.read_record('products',product_key);
   mode:=case when op='catalog.createWithOpeningStock' then p->'product'->'sellingMode' when op='product.reactivate' then product->'sellingMode' else mode end;
   if mode is not null and mode<>'null'::jsonb then product:=product||jsonb_build_object('sellingMode',mode);end if;
   -- Author the submitted formats; older callers preserve existing formats.
   if op='product.save' and p->'data' ? 'portions' then
    product:=product||jsonb_build_object('portions',(select coalesce(jsonb_agg((value-'price')||jsonb_build_object('priceMinor',coalesce(value->'priceMinor',to_jsonb(round(coalesce((value->>'price')::numeric,0)*100)::bigint)))),'[]') from jsonb_array_elements(p->'data'->'portions')));
   end if;
   if op='product.save' and p->'data' ? 'modifiers' then product:=product||jsonb_build_object('modifiers',(select coalesce(jsonb_agg((value-'priceAdjustment')||jsonb_build_object('priceAdjustmentMinor',coalesce(value->'priceAdjustmentMinor',to_jsonb(round(coalesce((value->>'priceAdjustment')::numeric,0)*100)::bigint)))),'[]') from jsonb_array_elements(p->'data'->'modifiers')));end if;
   perform servos_v2.validate_bottle_product(product_key,product);
   changed:=servos_v2.put_record('products',product_key,product);
   select coalesce(jsonb_agg(value),'[]') into result from jsonb_array_elements(result) where not (value->>'collection'='products' and value->>'id'=product_key);result:=result||changed;
  end loop;
 end if;
 if op='inventory.adjust' then
  after_stock:=servos_v2.read_record('stockItems',p->>'stockItemId');
  result:=result||servos_v2.put_record('inventoryCorrections','correction-'||(command->>'id'),jsonb_build_object('stockItemId',p->>'stockItemId','locationId',p->>'locationId','sourceRecord',p->'sourceRecord','beforeQuantity',before_stock->'currentStock'->(p->>'locationId'),'afterQuantity',after_stock->'currentStock'->(p->>'locationId'),'beforeState',before_stock->'sealedOpenStock'->(p->>'locationId'),'afterState',after_stock->'sealedOpenStock'->(p->>'locationId'),'reason',p->>'reason','sourceCommandId',command->>'id','actorId',auth.uid(),'occurredAt',now()));
 end if;
 if op='purchaseOrder.receive' then
  for entry in select value from jsonb_array_elements(result) where value->>'collection'='goodsReceipts' loop
   receipt:=entry->'data';receipt_key:=entry->>'id';snapshots:='[]';
   for product_key in select distinct value->>'stockItemId' from jsonb_array_elements(receipt->'lines') where coalesce(value->>'treatment','STOCK')='STOCK' and (value->>'quantityAccepted')::numeric>0 loop
    snapshots:=snapshots||jsonb_build_array(jsonb_build_object('stockItemId',product_key,'before',stock_before->product_key,'afterVersion',(select version from servos_v2.records where collection='stockItems' and id=product_key)));
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version)),'[]') into payables from servos_v2.records where collection='supplierPayables' and data->>'goodsReceiptId'=receipt_key;
   result:=result||servos_v2.put_record('procurementCorrectionBaselines',receipt_key,jsonb_build_object('receiptId',receipt_key,'orderBefore',order_before,'orderAfterVersion',(select version from servos_v2.records where collection='purchaseOrders' and id=p->>'purchaseOrderId'),'stockSnapshots',snapshots,'payables',payables));
  end loop;
 end if;
 if op in ('inventory.transfer','inventory.waste') then result:=result||servos_v2.put_record('inventoryMovementBaselines',command->>'id',jsonb_build_object('stockItemId',p->>'stockItemId','before',before_stock,'afterVersion',(select version from servos_v2.records where collection='stockItems' and id=p->>'stockItemId'),'operation',op));end if;
 return result;
end$$;

alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_inventory_corrections;
create function servos_v2.can_read_collection(collection_name text) returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if collection_name in ('inventoryCorrections','inventoryMovementBaselines','movementCorrections') then return coalesce(grants&&array['*','inventory.view','inventory.adjust'],false);end if;
 if collection_name in ('receiptCorrections','procurementCorrectionBaselines') then return coalesce(grants&&array['*','procurement.view','procurement.pay','accounting.view'],false);end if;
 return servos_v2.can_read_collection_before_inventory_corrections(collection_name);
end$$;

create function public.servos_v2_inventory_capabilities() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform servos_v2.require_any_permission(array['inventory.view','catalog.manage','procurement.view']);
 return jsonb_build_object('bottleInventoryVersion',1,'countSelected',true,'oneOpenContainer',true,'unusedReceiptReversal',true,'consumedOrPaidReceiptCorrection',false);
end$$;
create function servos_v2.protect_inventory_correction_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable inventory correction history';end$$;
create trigger protect_inventory_correction_history before update or delete on servos_v2.records for each row
 when (old.collection in ('stockCounts','inventoryCorrections','receiptCorrections','procurementCorrectionBaselines','inventoryMovementBaselines','movementCorrections')) execute function servos_v2.protect_inventory_correction_history();
revoke all on function servos_v2.protect_inventory_correction_history() from public,anon,authenticated;
revoke all on function public.servos_v2_inventory_capabilities() from public,anon;
grant execute on function public.servos_v2_inventory_capabilities() to authenticated;
revoke all on function servos_v2.assert_reviewed_inventory_versions(jsonb),servos_v2.validate_bottle_product(text,jsonb),servos_v2.pos_build_item(jsonb,text,jsonb,text),servos_v2.apply_physical_inventory_movement(jsonb),servos_v2.reverse_unused_receipt(jsonb),servos_v2.reverse_inventory_movement(jsonb),servos_v2.dispatch(jsonb),servos_v2.apply_inventory_location_count(jsonb) from public,anon,authenticated;
commit;

