-- STAGED V2 ONLY. Catalog + Inventory shared cloud domain.
-- Do not run against the live business project before coordinated cutover.
begin;

create function servos_v2.quantity_value(value jsonb,key text,allow_zero boolean default false)
returns numeric language plpgsql immutable set search_path='' as $$
declare result numeric;
begin
 if jsonb_typeof(value->key) is distinct from 'number' then raise exception 'VALIDATION_FAILED: % must be a quantity',key;end if;
 result:=(value->>key)::numeric;
 if result<0 or (not allow_zero and result<=0) or result>1000000000000 or round(result,6)<>result then
  raise exception 'VALIDATION_FAILED: % quantity out of range',key;
 end if;
 return result;
end$$;

create function servos_v2.require_any_permission(wanted text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or not exists(
  select 1 from servos_v2.members m
  where m.user_id=who and m.active
    and ('*'=any(m.permissions) or m.permissions&&wanted)
 ) then raise exception 'PERMISSION_DENIED: %',array_to_string(wanted,'|') using errcode='42501';end if;
 return who;
end$$;

create function servos_v2.apply_catalog_inventory(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';
 p jsonb:=command->'payload';
 key text:=p->>'id';
 data jsonb:=p->'data';
 current_data jsonb;
 current_archived boolean;
 next_data jsonb;
 stock jsonb;
 purchase_packages jsonb;
 stock_key text;
 location_key text;
 target_key text;
 reason text;
 barcode text;
 code_value text;
 base_unit text;
 route_value text;
 qty numeric;
 counted numeric;
 current_qty numeric;
 target_qty numeric;
 reorder_qty numeric;
 scan_qty numeric;
 price_minor bigint;
 cost_minor bigint;
 stock_total numeric;
 changes jsonb:='[]';
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_FAILED: payload';end if;

 if op in ('product.save','product.archive','product.reactivate') then
  perform servos_v2.require_any_permission(array['catalog.manage']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: product id';end if;
  perform servos_v2.assert_version(command,'products',key);
  select r.data,r.archived into current_data,current_archived from servos_v2.records r where r.collection='products' and r.id=key for update;

  if op='product.save' then
   if current_archived then raise exception 'VALIDATION_FAILED: reactivate before editing';end if;
   if jsonb_typeof(data) is distinct from 'object' then raise exception 'VALIDATION_FAILED: product data';end if;
   perform servos_v2.required_text(data,'name');
   code_value:=upper(servos_v2.required_text(data,'code'));
   price_minor:=servos_v2.minor(data,'priceMinor');
   route_value:=upper(coalesce(nullif(trim(data->>'routeTo'),''),'BAR'));
   if route_value not in ('BAR','KITCHEN','SERVICE') then raise exception 'VALIDATION_FAILED: routeTo';end if;
   if exists(select 1 from servos_v2.records r where r.collection='products' and r.id<>key and not r.archived and upper(r.data->>'code')=code_value) then raise exception 'DUPLICATE_REFERENCE: product code';end if;
   barcode:=nullif(trim(data->>'barcode'),'');
   if barcode is not null and (length(barcode)>128 or exists(select 1 from servos_v2.records r where r.collection='products' and r.id<>key and not r.archived and r.data->>'barcode'=barcode)) then raise exception 'DUPLICATE_REFERENCE: product barcode';end if;
   stock_key:=nullif(trim(data->>'stockItemId'),'');
   if stock_key is not null then perform servos_v2.read_record('stockItems',stock_key);end if;
   next_data:=jsonb_build_object(
    'name',trim(data->>'name'),'code',code_value,'priceMinor',price_minor,
    'category',coalesce(nullif(trim(data->>'category'),''),'GENERAL'),
    'routeTo',route_value,'favorite',coalesce((data->>'favorite')::boolean,false),
    'taxClassId',coalesce(nullif(trim(data->>'taxClassId'),''),'A_STANDARD')
   );
   if stock_key is not null then next_data:=next_data||jsonb_build_object('stockItemId',stock_key);end if;
   if barcode is not null then next_data:=next_data||jsonb_build_object('barcode',barcode);end if;
   if data ? 'costPriceMinor' then next_data:=next_data||jsonb_build_object('costPriceMinor',servos_v2.minor(data,'costPriceMinor'));end if;
   if data ? 'portionVolume' then next_data:=next_data||jsonb_build_object('portionVolume',servos_v2.quantity_value(data,'portionVolume',false));end if;
   if data ? 'outletIds' then
    if jsonb_typeof(data->'outletIds') is distinct from 'array' then raise exception 'VALIDATION_FAILED: outletIds';end if;
    next_data:=next_data||jsonb_build_object('outletIds',data->'outletIds');
   end if;
   return servos_v2.put_record('products',key,next_data);
  end if;

  if current_data is null then raise exception 'VALIDATION_FAILED: product missing';end if;
  if op='product.archive' then return servos_v2.put_record('products',key,current_data,true);end if;
  if exists(select 1 from servos_v2.records r where r.collection='products' and r.id<>key and not r.archived and upper(r.data->>'code')=upper(current_data->>'code')) then raise exception 'DUPLICATE_REFERENCE: product code';end if;
  if nullif(current_data->>'barcode','') is not null and exists(select 1 from servos_v2.records r where r.collection='products' and r.id<>key and not r.archived and r.data->>'barcode'=current_data->>'barcode') then raise exception 'DUPLICATE_REFERENCE: product barcode';end if;
  return servos_v2.put_record('products',key,current_data,false);
 end if;

 if op in ('stockItem.save','stockItem.archive','stockItem.reactivate') then
  perform servos_v2.require_any_permission(array['catalog.manage','inventory.adjust']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: stock item id';end if;
  perform servos_v2.assert_version(command,'stockItems',key);
  select r.data,r.archived into current_data,current_archived from servos_v2.records r where r.collection='stockItems' and r.id=key for update;

  if op='stockItem.save' then
   if current_archived then raise exception 'VALIDATION_FAILED: reactivate before editing';end if;
   if jsonb_typeof(data) is distinct from 'object' then raise exception 'VALIDATION_FAILED: stock item data';end if;
   perform servos_v2.required_text(data,'name');
   code_value:=upper(servos_v2.required_text(data,'code'));
   base_unit:=servos_v2.required_text(data,'baseUnit');
   scan_qty:=case when data ? 'scanUnitQuantity' then servos_v2.quantity_value(data,'scanUnitQuantity',false) else 1 end;
   reorder_qty:=case when data ? 'reorderLevel' then servos_v2.quantity_value(data,'reorderLevel',true) else 0 end;
   cost_minor:=case when data ? 'averageUnitCostMinor' then servos_v2.minor(data,'averageUnitCostMinor') else coalesce((current_data->>'averageUnitCostMinor')::bigint,0) end;
   purchase_packages:=coalesce(data->'purchasePackages',current_data->'purchasePackages','[]'::jsonb);
   if jsonb_typeof(purchase_packages) is distinct from 'array' or jsonb_array_length(purchase_packages)>50 then raise exception 'VALIDATION_FAILED: purchase packages';end if;
   if exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) where jsonb_typeof(pkg) is distinct from 'object' or nullif(trim(pkg->>'id'),'') is null or nullif(trim(pkg->>'name'),'') is null or coalesce((pkg->>'baseQuantity')::numeric,0)<=0 or coalesce(pkg->>'baseUnit','') not in ('piece','g','ml')) then raise exception 'VALIDATION_FAILED: purchase package definition';end if;
   if exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) group by pkg->>'id' having count(*)>1) then raise exception 'DUPLICATE_REFERENCE: purchase package id';end if;
   if exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and upper(r.data->>'code')=code_value) then raise exception 'DUPLICATE_REFERENCE: stock code';end if;
   barcode:=nullif(trim(data->>'barcode'),'');
   if barcode is not null and (length(barcode)>128 or exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and r.data->>'barcode'=barcode)) then raise exception 'DUPLICATE_REFERENCE: stock barcode';end if;
   select coalesce(sum(value::numeric),0) into stock_total from jsonb_each_text(coalesce(current_data->'currentStock','{}'::jsonb));
   if current_data is not null and stock_total<>0 and cost_minor is distinct from coalesce((current_data->>'averageUnitCostMinor')::bigint,0) then
    raise exception 'VALIDATION_FAILED: average cost changes require procurement while stock exists';
   end if;
   next_data:=jsonb_build_object(
    'name',trim(data->>'name'),'code',code_value,'baseUnit',base_unit,
    'scanUnitQuantity',scan_qty,'reorderLevel',reorder_qty,'averageUnitCostMinor',cost_minor,
    'purchasePackages',purchase_packages,
    'currentStock',coalesce(current_data->'currentStock','{}'::jsonb)
   );
   if barcode is not null then next_data:=next_data||jsonb_build_object('barcode',barcode);end if;
   return servos_v2.put_record('stockItems',key,next_data);
  end if;

  if current_data is null then raise exception 'VALIDATION_FAILED: stock item missing';end if;
  if op='stockItem.archive' then
   select coalesce(sum(value::numeric),0) into stock_total from jsonb_each_text(coalesce(current_data->'currentStock','{}'::jsonb));
   if stock_total<>0 then raise exception 'INVALID_STATE: stock quantity must be zero before archive';end if;
   if exists(select 1 from servos_v2.records r where r.collection='products' and not r.archived and r.data->>'stockItemId'=key) then raise exception 'INVALID_STATE: active product references stock item';end if;
   return servos_v2.put_record('stockItems',key,current_data,true);
  end if;
  if exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and upper(r.data->>'code')=upper(current_data->>'code')) then raise exception 'DUPLICATE_REFERENCE: stock code';end if;
  return servos_v2.put_record('stockItems',key,current_data,false);
 end if;

 if op in ('stockLocation.save','stockLocation.archive','stockLocation.reactivate') then
  perform servos_v2.require_any_permission(array['inventory.adjust']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: stock location id';end if;
  perform servos_v2.assert_version(command,'stockLocations',key);
  select r.data,r.archived into current_data,current_archived from servos_v2.records r where r.collection='stockLocations' and r.id=key for update;

  if op='stockLocation.save' then
   if current_archived then raise exception 'VALIDATION_FAILED: reactivate before editing';end if;
   if jsonb_typeof(data) is distinct from 'object' then raise exception 'VALIDATION_FAILED: stock location data';end if;
   perform servos_v2.required_text(data,'name');
   code_value:=upper(coalesce(nullif(trim(data->>'code'),''),key));
   route_value:=upper(coalesce(nullif(trim(data->>'type'),''),'STORE'));
   if route_value not in ('STORE','FRIDGE','BAR','KITCHEN','OTHER') then raise exception 'VALIDATION_FAILED: stock location type';end if;
   if exists(select 1 from servos_v2.records r where r.collection='stockLocations' and r.id<>key and not r.archived and upper(coalesce(r.data->>'code',r.id))=code_value) then raise exception 'DUPLICATE_REFERENCE: stock location code';end if;
   next_data:=jsonb_build_object('name',trim(data->>'name'),'code',code_value,'type',route_value);
   if nullif(trim(data->>'propertyId'),'') is not null then next_data:=next_data||jsonb_build_object('propertyId',trim(data->>'propertyId'));end if;
   return servos_v2.put_record('stockLocations',key,next_data);
  end if;

  if current_data is null then raise exception 'VALIDATION_FAILED: stock location missing';end if;
  if op='stockLocation.archive' then
   if exists(select 1 from servos_v2.records r where r.collection='stockItems' and not r.archived and coalesce((r.data->'currentStock'->>key)::numeric,0)<>0) then raise exception 'INVALID_STATE: location still contains stock';end if;
   return servos_v2.put_record('stockLocations',key,current_data,true);
  end if;
  return servos_v2.put_record('stockLocations',key,current_data,false);
 end if;

 if op in ('inventory.count','inventory.adjust','inventory.transfer','inventory.waste') then
  if op='inventory.count' then perform servos_v2.require_any_permission(array['inventory.count','inventory.adjust']);
  elsif op='inventory.adjust' then perform servos_v2.require_any_permission(array['inventory.adjust']);
  elsif op='inventory.transfer' then perform servos_v2.require_any_permission(array['inventory.transfer']);
  else perform servos_v2.require_any_permission(array['inventory.waste']);end if;

  stock_key:=servos_v2.required_text(p,'stockItemId');
  location_key:=servos_v2.required_text(p,'locationId');
  reason:=servos_v2.required_text(p,'reason');
  perform servos_v2.assert_version(command,'stockItems',stock_key);
  perform servos_v2.read_record('stockLocations',location_key);
  select r.data into stock from servos_v2.records r where r.collection='stockItems' and r.id=stock_key and not r.archived for update;
  if stock is null then raise exception 'VALIDATION_FAILED: active stock item missing';end if;
  current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);

  if op in ('inventory.count','inventory.adjust') then
   counted:=servos_v2.quantity_value(p,'countedQty',true);
   next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,counted),true);
   changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
   changes:=changes||servos_v2.put_record('stockMovements','count-'||(command->>'id'),jsonb_build_object(
    'stockItemId',stock_key,'locationId',location_key,'quantityDelta',counted-current_qty,
    'movementType',case when op='inventory.adjust' then 'ADMIN_CORRECTION' else 'COUNT_ADJUSTMENT' end,'reason',reason,'baseUnit',stock->>'baseUnit',
    'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()
   ));
   return changes;
  end if;

  qty:=servos_v2.quantity_value(p,'quantity',false);
  if current_qty<qty then raise exception 'VALIDATION_FAILED: insufficient stock';end if;

  if op='inventory.waste' then
   next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty-qty),true);
   changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
   changes:=changes||servos_v2.put_record('stockMovements','waste-'||(command->>'id'),jsonb_build_object(
    'stockItemId',stock_key,'locationId',location_key,'quantityDelta',-qty,
    'movementType','WASTE','reason',reason,'baseUnit',stock->>'baseUnit',
    'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()
   ));
   return changes;
  end if;

  target_key:=servos_v2.required_text(p,'toLocationId');
  if target_key=location_key then raise exception 'VALIDATION_FAILED: choose a different destination';end if;
  perform servos_v2.read_record('stockLocations',target_key);
  target_qty:=coalesce((stock->'currentStock'->>target_key)::numeric,0);
  next_data:=jsonb_set(stock,'{currentStock}',
    coalesce(stock->'currentStock','{}'::jsonb)
      ||jsonb_build_object(location_key,current_qty-qty)
      ||jsonb_build_object(target_key,target_qty+qty),true);
  changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
  changes:=changes||servos_v2.put_record('stockMovements','transfer-out-'||(command->>'id'),jsonb_build_object(
   'stockItemId',stock_key,'locationId',location_key,'toLocationId',target_key,'quantityDelta',-qty,
   'movementType','TRANSFER_OUT','reason',reason,'baseUnit',stock->>'baseUnit',
   'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()
  ));
  changes:=changes||servos_v2.put_record('stockMovements','transfer-in-'||(command->>'id'),jsonb_build_object(
   'stockItemId',stock_key,'locationId',target_key,'fromLocationId',location_key,'quantityDelta',qty,
   'movementType','TRANSFER_IN','reason',reason,'baseUnit',stock->>'baseUnit',
   'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()
  ));
  return changes;
 end if;

 raise exception 'PROTOCOL_UNSUPPORTED: catalog/inventory operation';
end$$;

create or replace function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false;end if;
 if '*'=any(grants) then return true;end if;
 needed:=case
  when collection_name in ('customers','suppliers','roomTypes','assetCategories') then array['records.view']
  when collection_name='products' then array['catalog.view','catalog.manage']
  when collection_name in ('stockItems','stockMovements','stockLocations') then array['inventory.view','inventory.count','inventory.adjust','inventory.transfer','inventory.waste','stock.view','stock.manage']
  when collection_name in ('assets','assetEvents') then array['assets.view','assets.manage','assets.operate']
  when collection_name='maintenanceOrders' then array['maintenance.view','maintenance.manage']
  when collection_name in ('rooms','ratePlans','roomBlocks') then array['rooms.view','rooms.manage','rooms.operate']
  when collection_name in ('roomReservations','stays','stayEvents','stayExtensions') then array['rooms.guests.view','rooms.operate']
  when collection_name in ('folios','folioEntries') then array['folio.view','folio.manage']
  when collection_name in ('hotelServices','paymentAccounts') then array['folio.view','folio.manage','payment.record','business.configure']
  when collection_name='journalEntries' then array['accounting.view','accounting.manage']
  when collection_name='supplierPayables' then array['procurement.view','procurement.manage','accounting.view','accounting.manage']
  when collection_name='employees' then array['staff.view','staff.manage']
  when collection_name in ('payments','receiptDocuments') then array['payments.view','payments.manage']
  else array[]::text[] end;
 return grants&&needed;
end$$;

create or replace function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation' in ('record.save','record.archive','record.reactivate') then return servos_v2.apply_master(command);end if;
 if command->>'operation' like 'product.%' or command->>'operation' like 'stockItem.%' or command->>'operation' like 'stockLocation.%' or command->>'operation' like 'inventory.%' then return servos_v2.apply_catalog_inventory(command);end if;
 if command->>'operation' like 'asset.%' or command->>'operation' like 'maintenance.%' then return servos_v2.apply_assets(command);end if;
 if command->>'operation' like 'folio.%' then return servos_v2.apply_folios(command);end if;
 if command->>'operation' like 'stay.%' then return servos_v2.apply_stays(command);end if;
 if command->>'operation' like 'room.%' or command->>'operation' like 'ratePlan.%' or command->>'operation' like 'roomReservation.%' then return servos_v2.apply_rooms(command);end if;
 raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';
end$$;

revoke all on function servos_v2.quantity_value(jsonb,text,boolean),servos_v2.require_any_permission(text[]),servos_v2.apply_catalog_inventory(jsonb),servos_v2.can_read_collection(text) from public,anon,authenticated;
commit;
