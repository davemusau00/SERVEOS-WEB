-- Preserve invoice money integers while retaining fractional per-canonical-unit cost rates.
begin;

create function servos_v2.cost_rate_value(value jsonb,key text) returns numeric language plpgsql immutable set search_path='' as $$
declare rate numeric;begin
 if jsonb_typeof(value->key) is distinct from 'number' then raise exception 'VALIDATION_FAILED: cost rate must be numeric';end if;
 rate:=(value->>key)::numeric;if rate<0 or rate>9000000000000000 then raise exception 'VALIDATION_FAILED: cost rate out of range';end if;return pg_catalog.trim_scale(rate);
end$$;

create or replace function servos_v2.apply_catalog_inventory(command jsonb)
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
 barcode_aliases jsonb;
 barcode_alias text;
 stock_key text;
 recipe_stock_key text;
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
 cost_minor numeric;
 stock_total numeric;
 container_size numeric;
 sealed_count numeric;
 open_quantity numeric;
 sealed_state jsonb;
 sealed_before jsonb;
 sealed_after jsonb;
 recipe_line jsonb;
 recipe_stock jsonb;
 recipe_ingredients jsonb:='[]'::jsonb;
 recipe_qty numeric;
 field_name text;
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
   if data ? 'recipeIngredients' then
    if jsonb_typeof(data->'recipeIngredients') is distinct from 'array' or jsonb_array_length(data->'recipeIngredients')>100 then raise exception 'VALIDATION_FAILED: recipe ingredients';end if;
    for recipe_line in select value from jsonb_array_elements(data->'recipeIngredients') loop
     recipe_stock_key:=servos_v2.required_text(recipe_line,'stockItemId');
     recipe_qty:=servos_v2.quantity_value(recipe_line,'quantity',false);
     recipe_stock:=servos_v2.read_record('stockItems',recipe_stock_key);
     if exists(select 1 from jsonb_array_elements(recipe_ingredients) existing where existing->>'stockItemId'=recipe_stock_key) then raise exception 'DUPLICATE_REFERENCE: recipe stock item';end if;
     recipe_ingredients:=recipe_ingredients||jsonb_build_array(jsonb_build_object('stockItemId',recipe_stock_key,'quantity',recipe_qty,'tracked',true));
    end loop;
   end if;
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
   if data ? 'inventoryType' then next_data:=next_data||jsonb_build_object('inventoryType',upper(servos_v2.required_text(data,'inventoryType')));end if;
   if data ? 'recipeIngredients' then next_data:=next_data||jsonb_build_object('recipeIngredients',recipe_ingredients);end if;
   if data ? 'recipeYield' then
    recipe_qty:=servos_v2.quantity_value(data,'recipeYield',false);
    if recipe_qty>100000 or trunc(recipe_qty)<>recipe_qty then raise exception 'VALIDATION_FAILED: recipe yield must be a whole number from 1 to 100000';end if;
    next_data:=next_data||jsonb_build_object('recipeYield',recipe_qty);
   end if;
   foreach field_name in array array['inventoryType','recipeIngredients','portions','portionVolume','containerQuantity','containerUnit','productFamilyId','productFamilyName','packageType','variantLabel','recipeYield','recipeBatchCostMinor','modifiers'] loop
    if not (data ? field_name) and current_data ? field_name then next_data:=next_data||jsonb_build_object(field_name,current_data->field_name);end if;
   end loop;
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
   cost_minor:=case when data ? 'averageUnitCostMinor' then servos_v2.cost_rate_value(data,'averageUnitCostMinor') else coalesce((current_data->>'averageUnitCostMinor')::numeric,0) end;
   purchase_packages:=coalesce(data->'purchasePackages',current_data->'purchasePackages','[]'::jsonb);
   barcode_aliases:=coalesce(data->'barcodeAliases',current_data->'barcodeAliases','[]'::jsonb);
   if jsonb_typeof(purchase_packages) is distinct from 'array' or jsonb_array_length(purchase_packages)>50 then raise exception 'VALIDATION_FAILED: purchase packages';end if;
   if exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) where jsonb_typeof(pkg) is distinct from 'object' or nullif(trim(pkg->>'id'),'') is null or nullif(trim(pkg->>'name'),'') is null or coalesce((pkg->>'baseQuantity')::numeric,0)<=0 or coalesce(pkg->>'baseUnit','') not in ('piece','g','ml')) then raise exception 'VALIDATION_FAILED: purchase package definition';end if;
   if exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) group by pkg->>'id' having count(*)>1) then raise exception 'DUPLICATE_REFERENCE: purchase package id';end if;
   if jsonb_typeof(barcode_aliases) is distinct from 'array' or jsonb_array_length(barcode_aliases)>100 then raise exception 'VALIDATION_FAILED: barcode aliases';end if;
   if exists(select 1 from jsonb_array_elements_text(barcode_aliases) as aliases(alias) where nullif(trim(alias),'') is null or length(trim(alias))>128) then raise exception 'VALIDATION_FAILED: barcode alias';end if;
   if exists(select 1 from jsonb_array_elements_text(barcode_aliases) as aliases(alias) group by lower(trim(alias)) having count(*)>1) then raise exception 'DUPLICATE_REFERENCE: barcode alias';end if;
   if exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and upper(r.data->>'code')=code_value) then raise exception 'DUPLICATE_REFERENCE: stock code';end if;
   barcode:=nullif(trim(data->>'barcode'),'');
   if barcode is not null and length(barcode)>128 then raise exception 'VALIDATION_FAILED: stock barcode';end if;
   if barcode is not null and lower(barcode)=lower(code_value) then raise exception 'DUPLICATE_REFERENCE: barcode cannot equal stock code';end if;
   if exists(select 1 from jsonb_array_elements_text(barcode_aliases) as aliases(alias) where lower(trim(alias)) in (lower(code_value),lower(coalesce(barcode,''))) or exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) where lower(coalesce(packages.pkg->>'barcode',''))=lower(trim(alias)))) then raise exception 'DUPLICATE_REFERENCE: barcode alias collides with this stock item';end if;
   if barcode is not null and exists(select 1 from jsonb_array_elements(purchase_packages) as packages(pkg) where lower(coalesce(packages.pkg->>'barcode',''))=lower(barcode)) then raise exception 'DUPLICATE_REFERENCE: primary barcode collides with purchase package barcode';end if;
   for barcode_alias in select trim(value) from jsonb_array_elements_text(barcode_aliases) as aliases(value) loop
    if barcode_alias=barcode then raise exception 'DUPLICATE_REFERENCE: barcode alias matches primary barcode';end if;
    if exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and (
      lower(coalesce(r.data->>'barcode',''))=lower(barcode_alias) or lower(coalesce(r.data->>'code',''))=lower(barcode_alias)
      or exists(select 1 from jsonb_array_elements_text(coalesce(r.data->'barcodeAliases','[]'::jsonb)) as a(value) where lower(a.value)=lower(barcode_alias))
      or exists(select 1 from jsonb_array_elements(coalesce(r.data->'purchasePackages','[]'::jsonb)) as pk(value) where lower(coalesce(pk.value->>'barcode',''))=lower(barcode_alias))
    )) then raise exception 'DUPLICATE_REFERENCE: stock barcode alias';end if;
   end loop;
   select coalesce(jsonb_agg(to_jsonb(trim(value))),'[]'::jsonb) into barcode_aliases from jsonb_array_elements_text(barcode_aliases) as aliases(value);
   if barcode is not null and exists(select 1 from servos_v2.records r where r.collection='stockItems' and r.id<>key and not r.archived and (
      lower(coalesce(r.data->>'barcode',''))=lower(barcode) or lower(coalesce(r.data->>'code',''))=lower(barcode)
      or exists(select 1 from jsonb_array_elements_text(coalesce(r.data->'barcodeAliases','[]'::jsonb)) as a(value) where lower(a.value)=lower(barcode))
      or exists(select 1 from jsonb_array_elements(coalesce(r.data->'purchasePackages','[]'::jsonb)) as pk(value) where lower(coalesce(pk.value->>'barcode',''))=lower(barcode))
   )) then raise exception 'DUPLICATE_REFERENCE: stock barcode';end if;
   select coalesce(sum(value::numeric),0) into stock_total from jsonb_each_text(coalesce(current_data->'currentStock','{}'::jsonb));
   if current_data is not null and stock_total<>0 and cost_minor is distinct from coalesce((current_data->>'averageUnitCostMinor')::numeric,0) then
    raise exception 'VALIDATION_FAILED: average cost changes require procurement while stock exists';
   end if;
   container_size:=coalesce((data->>'sealedContainerSize')::numeric,(current_data->>'sealedContainerSize')::numeric,0);
   if container_size<0 or container_size>100000 or round(container_size,6)<>container_size then raise exception 'VALIDATION_FAILED: sealed container size';end if;
   if container_size>0 and base_unit<>'ml' then raise exception 'VALIDATION_FAILED: sealed container tracking requires ml base unit';end if;
   if current_data is not null and container_size>0 and container_size is distinct from coalesce((current_data->>'sealedContainerSize')::numeric,0) and stock_total<>0 then raise exception 'INVALID_STATE: sealed container size cannot change while stock exists';end if;
   if container_size=0 and stock_total<>0 and coalesce(current_data->>'sealedContainerSize','')<>'' then raise exception 'INVALID_STATE: sealed container tracking cannot be removed while stock exists';end if;
   next_data:=jsonb_build_object(
    'name',trim(data->>'name'),'code',code_value,'baseUnit',base_unit,
    'scanUnitQuantity',scan_qty,'reorderLevel',reorder_qty,'averageUnitCostMinor',cost_minor,
    'purchasePackages',purchase_packages,
    'barcodeAliases',barcode_aliases,
    'sealedContainerSize',case when container_size>0 then to_jsonb(container_size) else 'null'::jsonb end,
    'sealedOpenStock',coalesce(current_data->'sealedOpenStock','{}'::jsonb),
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
   if op='inventory.adjust' and (p ? 'sealedContainers' or p ? 'openQuantity') then
    if stock->>'baseUnit'<>'ml' then raise exception 'VALIDATION_FAILED: sealed/open correction requires ml stock';end if;
    container_size:=coalesce((stock->>'sealedContainerSize')::numeric,0);
    if container_size<=0 then raise exception 'INVALID_STATE: configure a sealed container size first';end if;
    if jsonb_typeof(p->'sealedContainers') is distinct from 'number' or jsonb_typeof(p->'openQuantity') is distinct from 'number' then raise exception 'VALIDATION_FAILED: sealed/open quantities';end if;
    sealed_count:=(p->>'sealedContainers')::numeric;open_quantity:=(p->>'openQuantity')::numeric;
    if sealed_count<0 or round(sealed_count)<>sealed_count or open_quantity<0 or open_quantity>=container_size or round(open_quantity,6)<>open_quantity then raise exception 'VALIDATION_FAILED: sealed/open quantities';end if;
    if abs(counted-(sealed_count*container_size+open_quantity))>0.000001 then raise exception 'VALIDATION_FAILED: counted total does not match sealed/open quantities';end if;
    sealed_state:=coalesce(stock->'sealedOpenStock','{}'::jsonb);sealed_before:=coalesce(sealed_state->location_key,jsonb_build_object('sealedContainers',floor(current_qty/container_size),'openQuantity',current_qty-floor(current_qty/container_size)*container_size));
    if coalesce((sealed_before->>'sealedContainers')::numeric,-1)<0 or coalesce((sealed_before->>'openQuantity')::numeric,-1)<0 or coalesce((sealed_before->>'openQuantity')::numeric,container_size)>=container_size or abs(coalesce((sealed_before->>'sealedContainers')::numeric,0)*container_size+coalesce((sealed_before->>'openQuantity')::numeric,0)-current_qty)>0.001 then raise exception 'INVALID_STATE: sealed/open stock inconsistent; reconcile before correction';end if;
    sealed_after:=jsonb_build_object('sealedContainers',sealed_count,'openQuantity',open_quantity);
    sealed_state:=jsonb_set(sealed_state,array[location_key],sealed_after,true);
    next_data:=jsonb_set(jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,counted),true),'{sealedOpenStock}',sealed_state,true);
    changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
    changes:=changes||servos_v2.put_record('stockMovements','count-'||(command->>'id'),jsonb_build_object(
     'stockItemId',stock_key,'locationId',location_key,'quantityDelta',counted-current_qty,
     'movementType','ADMIN_CORRECTION','reason',reason,'baseUnit',stock->>'baseUnit',
     'sealedOpenEffect',jsonb_build_object('sealedContainersBefore',(sealed_before->>'sealedContainers')::numeric,'sealedContainersAfter',sealed_count,'openQuantityBefore',(sealed_before->>'openQuantity')::numeric,'openQuantityAfter',open_quantity),
     'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()
    ));
    return changes;
   end if;
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


create or replace function servos_v2.apply_procurement(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';
 p jsonb:=command->'payload';
 key text:=p->>'id';
 who uuid:=auth.uid();

 current_data jsonb; current_archived boolean;
 supplier jsonb; stock jsonb; order_data jsonb; line jsonb; stored_line jsonb; purchase_package jsonb;
 receipt jsonb; payable jsonb; acquisition jsonb; next_data jsonb;
 items jsonb:='[]'; receipt_lines jsonb:='[]'; journal_lines jsonb:='[]'; changes jsonb:='[]';

 treatment text; line_key text; supplier_key text; stock_key text; location_key text; category_key text;
 description text; category text; account_code text; account_name text; method text; reference_key text;
 invoice_number text; invoice_date text; due_date text; room_key text; asset_location_key text; tag text;

 qty numeric; delivered numeric; accepted numeric; rejected numeric; ordered numeric; received numeric;
 current_qty numeric; stock_total numeric; quantity_base_per_package numeric; base_accepted numeric;

 receipt_size numeric;receipt_sealed numeric;receipt_open numeric;
 old_cost numeric; next_cost numeric; unit_price bigint; line_total bigint; base_unit_cost numeric; subtotal bigint:=0;
 stock_value bigint:=0; asset_value bigint:=0; expense_value bigint:=0; accepted_total bigint:=0;
 approval_by uuid;
 invoice_total bigint; payable_total bigint; amount bigint; due bigint; paid bigint; remaining bigint;
 ordinal integer;

 over_received boolean:=false; needs_location boolean:=false; all_received boolean:=true; all_matched boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_FAILED: payload'; end if;

 if op in ('supplier.save','supplier.archive','supplier.reactivate') then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: supplier id'; end if;
  perform servos_v2.assert_version(command,'suppliers',key);
  select r.data,r.archived into current_data,current_archived
  from servos_v2.records r where r.collection='suppliers' and r.id=key for update;

  if op='supplier.save' then
   if current_archived then raise exception 'INVALID_STATE: reactivate supplier before editing'; end if;
   if jsonb_typeof(p->'data') is distinct from 'object' then raise exception 'VALIDATION_FAILED: supplier data'; end if;
   current_data:=p->'data';
   perform servos_v2.required_text(current_data,'name');
   perform servos_v2.required_text(current_data,'code');
   if current_data ? 'paymentTermsDays' and (
      jsonb_typeof(current_data->'paymentTermsDays') is distinct from 'number'
      or (current_data->>'paymentTermsDays')::integer not between 0 and 3650
   ) then raise exception 'VALIDATION_FAILED: payment terms'; end if;
   if exists(
      select 1 from servos_v2.records r
      where r.collection='suppliers' and r.id<>key and not r.archived
        and lower(r.data->>'code')=lower(trim(current_data->>'code'))
   ) then raise exception 'DUPLICATE_REFERENCE: supplier code'; end if;
   if exists(
      select 1 from jsonb_object_keys(current_data) field
      where field not in ('name','code','phone','email','contactPerson','kraPin','paymentTermsDays','notes')
   ) then raise exception 'VALIDATION_FAILED: unsupported supplier field'; end if;
   next_data:=jsonb_build_object(
    'name',trim(current_data->>'name'),
    'code',upper(trim(current_data->>'code')),
    'phone',coalesce(current_data->>'phone',''),
    'email',coalesce(current_data->>'email',''),
    'contactPerson',coalesce(current_data->>'contactPerson',''),
    'kraPin',coalesce(current_data->>'kraPin',''),
    'paymentTermsDays',coalesce((current_data->>'paymentTermsDays')::integer,0),
    'notes',coalesce(current_data->>'notes','')
   );
   return servos_v2.put_record('suppliers',key,next_data);
  end if;

  if current_data is null then raise exception 'VALIDATION_FAILED: supplier missing'; end if;

  if op='supplier.archive' then
   if exists(
      select 1 from servos_v2.records r
      where r.collection='purchaseOrders' and not r.archived
        and r.data->>'supplierId'=key and r.data->>'status' in ('APPROVED','PARTIALLY_RECEIVED')
   ) then raise exception 'INVALID_STATE: supplier has open purchase orders'; end if;
   if exists(
      select 1 from servos_v2.records r
      where r.collection='supplierPayables' and not r.archived
        and r.data->>'supplierId'=key and r.data->>'status'<>'PAID'
   ) then raise exception 'INVALID_STATE: supplier has open payables'; end if;
   return servos_v2.put_record('suppliers',key,current_data,true);
  end if;

  if exists(
     select 1 from servos_v2.records r
     where r.collection='suppliers' and r.id<>key and not r.archived
       and lower(r.data->>'code')=lower(current_data->>'code')
  ) then raise exception 'DUPLICATE_REFERENCE: supplier code'; end if;
  return servos_v2.put_record('suppliers',key,current_data,false);
 end if;

 if op='purchaseOrder.create' then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: purchase order id'; end if;
  perform servos_v2.assert_version(command,'purchaseOrders',key);
  if exists(select 1 from servos_v2.records where collection='purchaseOrders' and id=key) then
   raise exception 'DUPLICATE_REFERENCE: purchase order';
  end if;

  supplier_key:=servos_v2.required_text(p,'supplierId');
  supplier:=servos_v2.read_record('suppliers',supplier_key);

  if jsonb_typeof(p->'items') is distinct from 'array'
     or jsonb_array_length(p->'items') not between 1 and 100
  then raise exception 'VALIDATION_FAILED: purchase-order lines'; end if;

  if exists(
    select 1 from jsonb_array_elements(p->'items') x
    group by x->>'lineId' having count(*)>1
  ) then raise exception 'DUPLICATE_REFERENCE: purchase line id'; end if;

  for line in select value from jsonb_array_elements(p->'items') loop
   line_key:=servos_v2.required_text(line,'lineId');
   treatment:=upper(coalesce(line->>'treatment','STOCK'));
   if treatment not in ('STOCK','EXPENSE','ASSET') then
    raise exception 'VALIDATION_FAILED: purchase-line treatment';
   end if;

   qty:=servos_v2.quantity_value(line,'quantityOrdered',false);
   unit_price:=servos_v2.minor(line,'unitPriceMinor');
   line_total:=round(qty*unit_price)::bigint;
   subtotal:=subtotal+line_total;

   if treatment='STOCK' then
    stock_key:=servos_v2.required_text(line,'stockItemId');
    stock:=servos_v2.read_record('stockItems',stock_key);
    purchase_package:=null;
    quantity_base_per_package:=1;
    if nullif(trim(line->>'purchasePackageId'),'') is not null then
     select pkg into purchase_package from jsonb_array_elements(coalesce(stock->'purchasePackages','[]'::jsonb)) as packages(pkg) where pkg->>'id'=line->>'purchasePackageId';
     if purchase_package is null then raise exception 'VALIDATION_FAILED: purchase package does not belong to stock item';end if;
     quantity_base_per_package:=(purchase_package->>'baseQuantity')::numeric;
     if quantity_base_per_package<=0 or quantity_base_per_package>1000000000 or qty<>trunc(qty) then raise exception 'VALIDATION_FAILED: whole purchase packages and supported package size required';end if;
    end if;
    if exists(
      select 1 from jsonb_array_elements(items) x
      where x->>'treatment'='STOCK' and x->>'stockItemId'=stock_key
    ) then raise exception 'DUPLICATE_REFERENCE: stock item on purchase order'; end if;

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','STOCK','displayName',stock->>'name',
     'stockItemId',stock_key,
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol',coalesce(purchase_package->>'name',stock->>'baseUnit'),
     'scanUnitQuantity',coalesce(stock->'scanUnitQuantity','1'::jsonb),
     'purchasePackageId',purchase_package->>'id','purchasePackageName',purchase_package->>'name',
     'quantityBasePerPackage',quantity_base_per_package,'quantityBaseUnit',stock->>'baseUnit',
     'lineTotalMinor',line_total
    ));
   elsif treatment='EXPENSE' then
    description:=servos_v2.required_text(line,'description');
    category:=upper(coalesce(nullif(trim(line->>'expenseCategory'),''),'GENERAL'));
    account_code:=case category
      when 'GENERAL' then 'OPERATING_EXPENSE'
      when 'REPAIRS' then 'MAINTENANCE_EXPENSE'
      when 'MARKETING' then 'MARKETING_EXPENSE'
      when 'UTILITIES' then 'UTILITIES_EXPENSE'
      else null end;
    account_name:=case category
      when 'GENERAL' then 'Operating expense'
      when 'REPAIRS' then 'Maintenance expense'
      when 'MARKETING' then 'Marketing expense'
      when 'UTILITIES' then 'Utilities expense'
      else null end;
    if account_code is null then raise exception 'VALIDATION_FAILED: expense category'; end if;

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','EXPENSE','displayName',description,
     'description',description,'expenseCategory',category,
     'expenseAccountCode',account_code,'expenseAccountName',account_name,
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol','unit','scanUnitQuantity',1,
     'lineTotalMinor',line_total
    ));
   else
    if qty<>trunc(qty) or qty>100 then
     raise exception 'VALIDATION_FAILED: asset quantity must be whole units 1-100';
    end if;
    category_key:=servos_v2.required_text(line,'assetCategoryId');
    current_data:=servos_v2.read_record('assetCategories',category_key);
    description:=servos_v2.required_text(line,'assetName');

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','ASSET','displayName',description,
     'assetName',description,'assetCategoryId',category_key,
     'assetCategoryName',current_data->>'name',
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol','asset','scanUnitQuantity',1,
     'lineTotalMinor',line_total
    ));
   end if;
  end loop;

  if subtotal>100000000000 then raise exception 'VALIDATION_FAILED: purchase order total'; end if;

  next_data:=jsonb_build_object(
   'poNumber','PO-'||upper(substr(key,1,8)),
   'supplierId',supplier_key,'supplierName',supplier->>'name',
   'status','APPROVED','items',items,
   'subtotalMinor',subtotal,'taxTotalMinor',0,'grandTotalMinor',subtotal,
   'createdAt',now(),'createdBy',who,'approvedAt',now(),'approvedBy',who
  );
  return servos_v2.put_record('purchaseOrders',key,next_data);
 end if;

 if op='purchaseOrder.receive' then
  perform servos_v2.require_any_permission(array['procurement.receive']);
  key:=servos_v2.required_text(p,'purchaseOrderId');
  perform servos_v2.assert_version(command,'purchaseOrders',key);

  select r.data into order_data
  from servos_v2.records r
  where r.collection='purchaseOrders' and r.id=key and not r.archived
  for update;

  if order_data is null or order_data->>'status' not in ('APPROVED','PARTIALLY_RECEIVED') then
   raise exception 'INVALID_STATE: purchase order cannot receive';
  end if;

  supplier_key:=order_data->>'supplierId';
  supplier:=servos_v2.read_record('suppliers',supplier_key);

  if jsonb_typeof(p->'lines') is distinct from 'array'
     or jsonb_array_length(p->'lines') not between 1 and 100
  then raise exception 'VALIDATION_FAILED: goods receipt lines'; end if;

  if exists(
    select 1 from jsonb_array_elements(p->'lines') x
    group by x->>'lineId' having count(*)>1
  ) then raise exception 'DUPLICATE_REFERENCE: receipt line'; end if;

  location_key:=nullif(trim(p->>'locationId'),'');

  for line in select value from jsonb_array_elements(p->'lines') loop
   line_key:=servos_v2.required_text(line,'lineId');

   select value into stored_line
   from jsonb_array_elements(order_data->'items') x
   where x->>'lineId'=line_key;

   if stored_line is null then
    raise exception 'VALIDATION_FAILED: receipt line is not on purchase order';
   end if;

   delivered:=servos_v2.quantity_value(line,'quantityDelivered',false);
   accepted:=servos_v2.quantity_value(line,'quantityAccepted',true);
   rejected:=servos_v2.quantity_value(line,'quantityRejected',true);

   if abs((accepted+rejected)-delivered)>0.000001 then
    raise exception 'VALIDATION_FAILED: delivered must equal accepted plus rejected';
   end if;

   if rejected>0 and nullif(trim(line->>'rejectionReason'),'') is null then
    raise exception 'VALIDATION_FAILED: rejected quantity needs reason';
   end if;

   if nullif(stored_line->>'purchasePackageId','') is not null and (delivered<>trunc(delivered) or accepted<>trunc(accepted) or rejected<>trunc(rejected)) then raise exception 'VALIDATION_FAILED: receipt quantities must be whole packages';end if;

   ordered:=(stored_line->>'quantityOrdered')::numeric;
   received:=coalesce((stored_line->>'quantityReceived')::numeric,0);
   if received+accepted>ordered+0.000001 then over_received:=true; end if;

   treatment:=stored_line->>'treatment';
   unit_price:=(stored_line->>'unitPriceMinor')::bigint;
   line_total:=round(accepted*unit_price)::bigint;
   accepted_total:=accepted_total+line_total;

   if treatment='STOCK' then
    needs_location:=true; stock_value:=stock_value+line_total;
   elsif treatment='ASSET' then
    if delivered<>trunc(delivered) or accepted<>trunc(accepted) or rejected<>trunc(rejected) then
     raise exception 'VALIDATION_FAILED: asset receipt quantities must be whole units';
    end if;
    asset_value:=asset_value+line_total;
   else
    expense_value:=expense_value+line_total;
   end if;

   receipt_lines:=receipt_lines||jsonb_build_array(stored_line||jsonb_build_object(
    'quantityDelivered',delivered,'quantityAccepted',accepted,'quantityRejected',rejected,
    'acceptedValueMinor',line_total,
    'rejectionReason',coalesce(line->>'rejectionReason','')
   ));
  end loop;

  if over_received then
   approval_by:=servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'procurement.over_receive',p->>'purchaseOrderId',who);
  end if;

  if needs_location then
   if location_key is null then raise exception 'VALIDATION_FAILED: stock location required'; end if;
   perform servos_v2.read_record('stockLocations',location_key);
  end if;

  items:='[]';
  for stored_line in select value from jsonb_array_elements(order_data->'items') loop
   select value into line
   from jsonb_array_elements(receipt_lines) x
   where x->>'lineId'=stored_line->>'lineId';

   if line is not null then
    stored_line:=stored_line||jsonb_build_object(
      'quantityDelivered',coalesce((stored_line->>'quantityDelivered')::numeric,0)+(line->>'quantityDelivered')::numeric,
      'quantityReceived',coalesce((stored_line->>'quantityReceived')::numeric,0)+(line->>'quantityAccepted')::numeric,
      'quantityRejected',coalesce((stored_line->>'quantityRejected')::numeric,0)+(line->>'quantityRejected')::numeric
    );
   end if;

   if coalesce((stored_line->>'quantityReceived')::numeric,0)+0.000001
      < (stored_line->>'quantityOrdered')::numeric
   then all_received:=false; end if;

   items:=items||jsonb_build_array(stored_line);
  end loop;

  key:='receipt-'||(command->>'id');
  receipt:=jsonb_build_object(
   'grnNumber','GRN-'||upper(substr(command->>'id',1,8)),
   'purchaseOrderId',p->>'purchaseOrderId','poNumber',order_data->>'poNumber',
   'supplierId',supplier_key,'supplierName',supplier->>'name',
   'locationId',location_key,
   'supplierInvoiceNumber',coalesce(p->>'supplierInvoiceNumber',''),
   'deliveryNote',coalesce(p->>'deliveryNote',''),
   'notes',coalesce(p->>'notes',''),
   'lines',receipt_lines,
   'acceptedValueMinor',accepted_total,
   'treatmentTotals',jsonb_build_object(
      'stockMinor',stock_value,'assetMinor',asset_value,'expenseMinor',expense_value
   ),
   'status','POSTED','receivedAt',now(),'receivedBy',who
   ,'overReceiptApprovedBy',approval_by
  );

  changes:=changes||servos_v2.put_record('goodsReceipts',key,receipt);

  for line in select value from jsonb_array_elements(receipt_lines) loop
   accepted:=(line->>'quantityAccepted')::numeric;
   if accepted<=0 then continue; end if;

   treatment:=line->>'treatment';
   unit_price:=(line->>'unitPriceMinor')::bigint;
   line_total:=round(accepted*unit_price)::bigint;

   if treatment='STOCK' then
    stock_key:=line->>'stockItemId';
    perform servos_v2.assert_version(command,'stockItems',stock_key);

    select r.data into stock
    from servos_v2.records r
    where r.collection='stockItems' and r.id=stock_key and not r.archived
    for update;

    if stock is null then raise exception 'VALIDATION_FAILED: active stock item missing'; end if;

    current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
    select coalesce(sum(value::numeric),0) into stock_total
    from jsonb_each_text(coalesce(stock->'currentStock','{}'::jsonb));

    old_cost:=coalesce((stock->>'averageUnitCostMinor')::numeric,0);
    quantity_base_per_package:=coalesce(nullif(stored_line->>'quantityBasePerPackage','')::numeric,1);
    if quantity_base_per_package<=0 then raise exception 'VALIDATION_FAILED: purchase package quantity';end if;
    base_accepted:=accepted*quantity_base_per_package;
    base_unit_cost:=pg_catalog.trim_scale(unit_price/quantity_base_per_package);
    next_cost:=pg_catalog.trim_scale((stock_total*old_cost+line_total)/(stock_total+base_accepted));

    next_data:=jsonb_set(
      stock,'{currentStock}',
      coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty+base_accepted),
      true
    )||jsonb_build_object('averageUnitCostMinor',next_cost);

    receipt_size:=coalesce((stock->>'sealedContainerSize')::numeric,0);
    if stock->>'baseUnit'='ml' and receipt_size>0 then
     if mod(base_accepted,receipt_size)<>0 then raise exception 'VALIDATION_FAILED: bottle receipt must contain whole sealed bottles';end if;
     receipt_sealed:=coalesce((stock->'sealedOpenStock'->location_key->>'sealedContainers')::numeric,floor(current_qty/receipt_size));
     receipt_open:=coalesce((stock->'sealedOpenStock'->location_key->>'openQuantity')::numeric,current_qty-receipt_sealed*receipt_size);
     if receipt_sealed<0 or receipt_sealed<>floor(receipt_sealed) or receipt_open<0 or receipt_open>=receipt_size or abs(current_qty-receipt_sealed*receipt_size-receipt_open)>0.000001 then raise exception 'INVALID_STATE: reconcile bottle state before receipt';end if;
     next_data:=jsonb_set(next_data,'{sealedOpenStock}',coalesce(stock->'sealedOpenStock','{}')||jsonb_build_object(location_key,jsonb_build_object('sealedContainers',receipt_sealed+base_accepted/receipt_size,'openQuantity',receipt_open)),true);
    end if;
    changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
    changes:=changes||servos_v2.put_record(
      'stockMovements',
      'receipt-'||(command->>'id')||'-'||(line->>'lineId'),
      jsonb_build_object(
       'stockItemId',stock_key,'locationId',location_key,'quantityDelta',base_accepted,
       'movementType','PURCHASE_RECEIPT','sourceId',key,'sourceCommandId',command->>'id',
       'unitCostMinor',base_unit_cost,'totalCostMinor',line_total,
       'reason',receipt->>'grnNumber','baseUnit',stock->>'baseUnit',
       'occurredAt',now(),'actorId',who
      )
    );
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','INVENTORY','debitMinor',line_total,'creditMinor',0)
    );

   elsif treatment='ASSET' then
    for ordinal in 1..accepted::integer loop
     changes:=changes||servos_v2.put_record(
      'assetAcquisitions',
      'acq-'||(command->>'id')||'-'||(line->>'lineId')||'-'||ordinal::text,
      jsonb_build_object(
       'status','PENDING_COMMISSION',
       'goodsReceiptId',key,'grnNumber',receipt->>'grnNumber',
       'purchaseOrderId',p->>'purchaseOrderId','poNumber',order_data->>'poNumber',
       'purchaseLineId',line->>'lineId','unitOrdinal',ordinal,
       'assetName',line->>'assetName',
       'assetCategoryId',line->>'assetCategoryId',
       'assetCategoryName',line->>'assetCategoryName',
       'supplierId',supplier_key,'supplierName',supplier->>'name',
       'unitCostMinor',unit_price,
       'receivedAt',now(),'receivedBy',who
      )
     );
    end loop;
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','ASSET_CLEARING','debitMinor',line_total,'creditMinor',0)
    );

   else
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object(
       'accountCode',line->>'expenseAccountCode',
       'debitMinor',line_total,'creditMinor',0
      )
    );
   end if;
  end loop;

  if accepted_total>0 then
   changes:=changes||servos_v2.put_record(
    'supplierPayables','payable-'||(command->>'id'),
    jsonb_build_object(
     'payableNumber','AP-'||upper(substr(command->>'id',1,8)),
     'supplierId',supplier_key,'supplierName',supplier->>'name',
     'purchaseOrderId',p->>'purchaseOrderId',
     'goodsReceiptId',key,'grnNumber',receipt->>'grnNumber',
     'supplierInvoiceNumber',coalesce(p->>'supplierInvoiceNumber',''),
     'amountMinor',accepted_total,'paidMinor',0,'amountDueMinor',accepted_total,
     'status','RECEIVED_UNINVOICED','createdAt',now()
    )
   );

   journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','ACCOUNTS_PAYABLE','debitMinor',0,'creditMinor',accepted_total)
   );

   changes:=changes||servos_v2.post_journal(
    command,
    'procurement-receipt-'||(command->>'id'),
    'PROCUREMENT',key,'Accepted supplier goods receipt',
    journal_lines
   );
  end if;

  next_data:=order_data||jsonb_build_object(
    'items',items,
    'status',case when all_received then 'RECEIVED' else 'PARTIALLY_RECEIVED' end,
    'lastGoodsReceiptId',key,'lastGoodsReceiptAt',now()
  );
  changes:=changes||servos_v2.put_record('purchaseOrders',p->>'purchaseOrderId',next_data);
  return changes;
 end if;

 if op='supplierPayable.matchInvoice' then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  key:=servos_v2.required_text(p,'payableId');
  perform servos_v2.assert_version(command,'supplierPayables',key);

  select r.data into payable
  from servos_v2.records r
  where r.collection='supplierPayables' and r.id=key and not r.archived
  for update;

  if payable is null or payable->>'status'<>'RECEIVED_UNINVOICED' then
   raise exception 'INVALID_STATE: payable already matched or settled';
  end if;

  invoice_number:=servos_v2.required_text(p,'invoiceNumber');
  if length(invoice_number)>80 then raise exception 'VALIDATION_FAILED: invoice number'; end if;

  if exists(
    select 1 from servos_v2.records r
    where r.collection='supplierPayables' and r.id<>key
      and r.data->>'supplierId'=payable->>'supplierId'
      and lower(r.data->>'supplierInvoiceNumber')=lower(invoice_number)
  ) then raise exception 'DUPLICATE_REFERENCE: supplier invoice'; end if;

  invoice_total:=servos_v2.minor(p,'invoiceAmountMinor');
  payable_total:=(payable->>'amountMinor')::bigint;
  if invoice_total<>payable_total then
   raise exception 'VALIDATION_FAILED: invoice total must equal accepted GRN payable';
  end if;

  invoice_date:=coalesce(p->>'invoiceDate','');
  due_date:=coalesce(p->>'dueDate','');
  if invoice_date<>'' then perform invoice_date::date; end if;
  if due_date<>'' then perform due_date::date; end if;
  if invoice_date<>'' and due_date<>'' and due_date::date<invoice_date::date then
   raise exception 'VALIDATION_FAILED: due date before invoice date';
  end if;

  receipt:=servos_v2.read_record('goodsReceipts',payable->>'goodsReceiptId');
  if jsonb_typeof(p->'lines') is distinct from 'array' then
   raise exception 'VALIDATION_FAILED: invoice lines';
  end if;

  if jsonb_array_length(p->'lines') <> (
    select count(*) from jsonb_array_elements(receipt->'lines') x
    where (x->>'quantityAccepted')::numeric>0
  ) then raise exception 'VALIDATION_FAILED: invoice must cover every accepted GRN line'; end if;

  subtotal:=0;
  for line in select value from jsonb_array_elements(p->'lines') loop
   line_key:=servos_v2.required_text(line,'lineId');
   if exists(
     select 1 from jsonb_array_elements(p->'lines') x
     where x->>'lineId'=line_key
     group by x->>'lineId' having count(*)>1
   ) then raise exception 'DUPLICATE_REFERENCE: invoice line'; end if;

   select value into stored_line
   from jsonb_array_elements(receipt->'lines') x
   where x->>'lineId'=line_key and (x->>'quantityAccepted')::numeric>0;

   if stored_line is null then raise exception 'VALIDATION_FAILED: invoice line not on accepted GRN'; end if;

   qty:=servos_v2.quantity_value(line,'quantityBilled',false);
   unit_price:=servos_v2.minor(line,'unitPriceMinor');

   if abs(qty-(stored_line->>'quantityAccepted')::numeric)>0.000001
      or unit_price<>(stored_line->>'unitPriceMinor')::bigint
   then raise exception 'VALIDATION_FAILED: invoice line differs from approved PO / accepted GRN'; end if;

   subtotal:=subtotal+round(qty*unit_price)::bigint;
  end loop;

  if subtotal<>invoice_total then raise exception 'VALIDATION_FAILED: invoice line total mismatch'; end if;

  next_data:=payable||jsonb_build_object(
    'supplierInvoiceNumber',invoice_number,
    'invoiceAmountMinor',invoice_total,
    'invoiceDate',invoice_date,'dueDate',due_date,
    'invoiceMatchedAt',now(),'invoiceMatchedBy',who,
    'status','MATCHED_UNPAID'
  );
  changes:=changes||servos_v2.put_record('supplierPayables',key,next_data);

  key:=payable->>'purchaseOrderId';
  perform servos_v2.assert_version(command,'purchaseOrders',key);
  order_data:=servos_v2.read_record('purchaseOrders',key);

  select bool_and(r.data->>'status' in ('MATCHED_UNPAID','PARTIALLY_PAID','PAID'))
  into all_matched
  from servos_v2.records r
  where r.collection='supplierPayables'
    and r.data->>'purchaseOrderId'=key
    and not r.archived;

  if all_matched and order_data->>'status'='RECEIVED' then
   changes:=changes||servos_v2.put_record(
     'purchaseOrders',key,order_data||jsonb_build_object('status','INVOICED')
   );
  end if;

  return changes;
 end if;

 if op='supplierPayable.pay' then
  perform servos_v2.require_any_permission(array['procurement.pay']);
  key:=servos_v2.required_text(p,'payableId');
  perform servos_v2.assert_version(command,'supplierPayables',key);

  select r.data into payable
  from servos_v2.records r
  where r.collection='supplierPayables' and r.id=key and not r.archived
  for update;

  if payable is null or payable->>'status' not in ('MATCHED_UNPAID','PARTIALLY_PAID') then
   raise exception 'INVALID_STATE: match supplier invoice before payment';
  end if;

  if coalesce((p->>'confirmed')::boolean,false) is not true then
   raise exception 'VALIDATION_FAILED: confirm supplier was actually paid';
  end if;

  amount:=servos_v2.minor(p,'amountMinor');
  if amount<=0 then raise exception 'VALIDATION_FAILED: positive payment'; end if;

  due:=coalesce(
    (payable->>'amountDueMinor')::bigint,
    (payable->>'amountMinor')::bigint-coalesce((payable->>'paidMinor')::bigint,0)
  );
  if amount>due then raise exception 'VALIDATION_FAILED: payment exceeds outstanding payable'; end if;

  method:=upper(servos_v2.required_text(p,'method'));
  if method not in ('CASH','BANK','MPESA') then
   raise exception 'VALIDATION_FAILED: supplier payment method';
  end if;

  reference_key:=servos_v2.required_text(p,'reference');
  if length(reference_key)>100 then raise exception 'VALIDATION_FAILED: payment reference'; end if;

  if exists(
    select 1 from servos_v2.records r
    where r.collection='supplierPayments'
      and lower(r.data->>'method')=lower(method)
      and lower(r.data->>'reference')=lower(reference_key)
  ) then raise exception 'DUPLICATE_REFERENCE: supplier payment reference'; end if;

  changes:=changes||servos_v2.put_record(
    'supplierPayments','payment-'||(command->>'id'),
    jsonb_build_object(
     'paymentNumber','SP-'||upper(substr(command->>'id',1,8)),
     'supplierId',payable->>'supplierId','supplierName',payable->>'supplierName',
     'supplierPayableId',key,'supplierInvoiceNumber',payable->>'supplierInvoiceNumber',
     'amountMinor',amount,'method',method,'reference',reference_key,
     'reason',coalesce(p->>'reason',''),
     'status','MANUALLY_CONFIRMED','confirmed',true,
     'occurredAt',now(),'recordedBy',who
    )
  );

  changes:=changes||servos_v2.post_journal(
    command,'supplier-payment-'||(command->>'id'),
    'SUPPLIER_PAYMENT',key,'Manually confirmed supplier payment',
    jsonb_build_array(
      jsonb_build_object('accountCode','ACCOUNTS_PAYABLE','debitMinor',amount,'creditMinor',0),
      jsonb_build_object(
        'accountCode',
        case method when 'CASH' then 'PETTY_CASH' when 'BANK' then 'BANK' else 'MPESA' end,
        'debitMinor',0,'creditMinor',amount
      )
    )
  );

  paid:=coalesce((payable->>'paidMinor')::bigint,0)+amount;
  remaining:=due-amount;

  return changes||servos_v2.put_record(
    'supplierPayables',key,
    payable||jsonb_build_object(
      'paidMinor',paid,'amountDueMinor',remaining,
      'status',case when remaining=0 then 'PAID' else 'PARTIALLY_PAID' end,
      'lastPaymentAt',now()
    )
  );
 end if;

 if op='asset.commission' then
  perform servos_v2.require_any_permission(array['assets.manage']);

  key:=servos_v2.required_text(p,'id');
  reference_key:=servos_v2.required_text(p,'acquisitionId');

  perform servos_v2.assert_version(command,'assets',key);
  perform servos_v2.assert_version(command,'assetAcquisitions',reference_key);

  acquisition:=servos_v2.read_record('assetAcquisitions',reference_key);
  if acquisition->>'status'<>'PENDING_COMMISSION' then
   raise exception 'INVALID_STATE: acquisition already commissioned';
  end if;

  if exists(select 1 from servos_v2.records where collection='assets' and id=key) then
   raise exception 'DUPLICATE_REFERENCE: asset id';
  end if;

  tag:=servos_v2.required_text(p,'tag');
  if exists(
    select 1 from servos_v2.records r
    where r.collection='assets' and lower(r.data->>'tag')=lower(tag)
  ) then raise exception 'DUPLICATE_REFERENCE: asset tag'; end if;

  room_key:=nullif(trim(p->>'roomId'),'');
  asset_location_key:=nullif(trim(p->>'locationId'),'');

  if room_key is null and asset_location_key is null then
   raise exception 'VALIDATION_FAILED: room or stock location required';
  end if;

  if room_key is not null then perform servos_v2.read_record('rooms',room_key); end if;
  if asset_location_key is not null then perform servos_v2.read_record('stockLocations',asset_location_key); end if;

  next_data:=jsonb_build_object(
    'name',coalesce(nullif(trim(p->>'name'),''),acquisition->>'assetName'),
    'tag',tag,
    'assetCategoryId',acquisition->>'assetCategoryId',
    'serialNumber',coalesce(p->>'serialNumber',''),
    'roomId',room_key,'locationId',asset_location_key,
    'supplierId',acquisition->>'supplierId',
    'purchaseCostMinor',(acquisition->>'unitCostMinor')::bigint,
    'acquisitionSourceId',reference_key,
    'status','ACTIVE','condition','GOOD','custodianId',null,
    'acquiredAt',current_date,'notes',coalesce(p->>'notes',''),
    'createdAt',now(),'updatedAt',now()
  );

  changes:=changes||servos_v2.put_record('assets',key,next_data);
  changes:=changes||servos_v2.put_record(
    'assetAcquisitions',reference_key,
    acquisition||jsonb_build_object(
      'status','COMMISSIONED','assetId',key,
      'commissionedAt',now(),'commissionedBy',who
    )
  );

  changes:=changes||servos_v2.put_record(
    'assetEvents','asset-'||(command->>'id'),
    jsonb_build_object(
      'assetId',key,'operation','asset.commission',
      'reason','Procurement commissioning',
      'before',null,'after',next_data,
      'actorId',who,'deviceId',(command->>'deviceId')::uuid,
      'occurredAt',now(),'sourceCommandId',command->>'id'
    )
  );

  amount:=(acquisition->>'unitCostMinor')::bigint;
  if amount>0 then
   changes:=changes||servos_v2.post_journal(
    command,'asset-commission-'||(command->>'id'),
    'ASSET_COMMISSION',key,'Commission capital asset from procurement clearing',
    jsonb_build_array(
      jsonb_build_object('accountCode','FIXED_ASSETS','debitMinor',amount,'creditMinor',0),
      jsonb_build_object('accountCode','ASSET_CLEARING','debitMinor',0,'creditMinor',amount)
    )
   );
  end if;

  return changes;
 end if;

 raise exception 'PROTOCOL_UNSUPPORTED: procurement operation';
end$$;


create or replace function servos_v2.apply_smart_item_setup(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload'; product_input jsonb:=command->'payload'->'product';
 stock_input jsonb:=command->'payload'->'stockItem'; product_data jsonb; stock_data jsonb;
 stock_command jsonb; product_command jsonb; changes jsonb:='[]'::jsonb; result jsonb;
 stock_key text; product_key text; location_key text; movement_key text;
 outlet_key text;
 starting_qty numeric; unit_cost_minor numeric; price_minor bigint; sealed_size numeric;
 location_data jsonb; current_stock jsonb; sealed_state jsonb; portion_input jsonb; portions jsonb:='[]'::jsonb; portion_price bigint;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(stock_input) is distinct from 'object' then raise exception 'VALIDATION_FAILED: Smart Item payload';end if;
 perform servos_v2.require_permission('inventory.adjust');
 if product_input is not null then
  if jsonb_typeof(product_input) is distinct from 'object' then raise exception 'VALIDATION_FAILED: product';end if;
  perform servos_v2.require_permission('catalog.manage');
  if jsonb_typeof(product_input->'outletIds') is distinct from 'array' or jsonb_array_length(product_input->'outletIds') not between 1 and 50 then raise exception 'VALIDATION_FAILED: assign at least one outlet';end if;
  for outlet_key in select jsonb_array_elements_text(product_input->'outletIds') loop
   perform servos_v2.assert_version(command,'outlets',outlet_key);
   perform servos_v2.read_record('outlets',outlet_key);
  end loop;
 end if;
 stock_key:=coalesce(nullif(trim(stock_input->>'id'),''),command->>'id');
 if stock_key is null or length(stock_key)>110 then raise exception 'VALIDATION_FAILED: generated stock item id';end if;
 product_key:=case when product_input is null then null else coalesce(nullif(trim(product_input->>'id'),''),(command->>'id')||':product') end;
 movement_key:=coalesce(nullif(trim(p->>'openingMovementId'),''),(command->>'id')||':opening');
 if length(movement_key)>128 or (product_key is not null and length(product_key)>128) then raise exception 'VALIDATION_FAILED: generated record id';end if;
 if exists(select 1 from servos_v2.records where collection='stockItems' and id=stock_key)
  or (product_key is not null and exists(select 1 from servos_v2.records where collection='products' and id=product_key)) then raise exception 'DUPLICATE_REFERENCE: Smart Item record ID';end if;
 location_key:=servos_v2.required_text(p,'locationId');
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 perform servos_v2.assert_version(command,'stockLocations',location_key);
 location_data:=servos_v2.read_record('stockLocations',location_key);
 starting_qty:=servos_v2.quantity_value(p,'startingQuantity',true);

 stock_data:=stock_input - 'averageUnitCost';
 unit_cost_minor:=pg_catalog.trim_scale(coalesce(nullif(stock_input->>'averageUnitCost','')::numeric,0)*100);
 if unit_cost_minor<0 or unit_cost_minor>9000000000000000 then raise exception 'VALIDATION_FAILED: average unit cost';end if;
 stock_data:=stock_data||jsonb_build_object('id',stock_key,'averageUnitCostMinor',unit_cost_minor,'currentStock','{}'::jsonb);
 stock_command:=jsonb_set(jsonb_set(command,'{operation}','"stockItem.save"'::jsonb),'{payload}',jsonb_build_object('id',stock_key,'data',stock_data),true);
 result:=servos_v2.apply_catalog_inventory(stock_command);
 changes:=changes||result;

 if product_input is not null then
  product_data:=product_input-'price';
  price_minor:=round(coalesce(nullif(product_input->>'price','')::numeric,0)*100)::bigint;
  if price_minor<0 or price_minor>9000000000000000 then raise exception 'VALIDATION_FAILED: product price';end if;
  if jsonb_typeof(coalesce(product_input->'portions','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(product_input->'portions','[]'::jsonb))>50 then raise exception 'VALIDATION_FAILED: sale portions';end if;
  if jsonb_typeof(coalesce(product_input->'modifiers','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(product_input->'modifiers','[]'::jsonb))>0 then raise exception 'PROTOCOL_UNSUPPORTED: add modifiers after item creation';end if;
  for portion_input in select value from jsonb_array_elements(coalesce(product_input->'portions','[]'::jsonb)) loop
   perform servos_v2.required_text(portion_input,'id');perform servos_v2.required_text(portion_input,'name');
   if portion_input ? 'volume' then perform servos_v2.quantity_value(portion_input,'volume',false);end if;
   portion_price:=case when portion_input ? 'priceMinor' then servos_v2.minor(portion_input,'priceMinor') else round(coalesce((portion_input->>'price')::numeric,0)*100)::bigint end;
   portions:=portions||jsonb_build_array((portion_input-'price')||jsonb_build_object('priceMinor',portion_price));
  end loop;
  if exists(select 1 from jsonb_array_elements(portions) x group by x->>'id' having count(*)>1) then raise exception 'DUPLICATE_REFERENCE: sale portion id';end if;
  product_data:=product_data||jsonb_build_object('id',product_key,'stockItemId',stock_key,'priceMinor',price_minor);
  product_command:=jsonb_set(jsonb_set(command,'{operation}','"product.save"'::jsonb),'{payload}',jsonb_build_object('id',product_key,'data',product_data),true);
  result:=servos_v2.apply_catalog_inventory(product_command);
  changes:=changes||result;
  -- product.save preserves legacy fields but does not author portions. Store
  -- normalized minor-unit prices explicitly while keeping its created record
  -- as one final version in this command's change set.
  select data into product_data from servos_v2.records where collection='products' and id=product_key and not archived for update;
  if jsonb_array_length(changes)>0 then changes:=changes-(jsonb_array_length(changes)-1);end if;
  changes:=changes||servos_v2.put_record('products',product_key,product_data||jsonb_build_object('portions',portions,'modifiers','[]'::jsonb));
 end if;

 if starting_qty>0 then
  perform servos_v2.assert_version(command,'stockMovements',movement_key);
  select data into stock_data from servos_v2.records where collection='stockItems' and id=stock_key and not archived for update;
  if stock_data is null then raise exception 'INVALID_STATE: Smart Item stock master missing';end if;
  current_stock:=coalesce(stock_data->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,starting_qty);
  sealed_size:=coalesce((stock_data->>'sealedContainerSize')::numeric,0);
  if sealed_size>0 then
   if stock_data->>'baseUnit'<>'ml' then raise exception 'VALIDATION_FAILED: sealed stock requires ml';end if;
   sealed_state:=coalesce(stock_data->'sealedOpenStock','{}'::jsonb)||jsonb_build_object(location_key,jsonb_build_object('sealedContainers',floor(starting_qty/sealed_size),'openQuantity',starting_qty-floor(starting_qty/sealed_size)*sealed_size,'containerSize',sealed_size));
   stock_data:=jsonb_set(stock_data,'{sealedOpenStock}',sealed_state,true);
  end if;
  stock_data:=jsonb_set(stock_data,'{currentStock}',current_stock,true);
  changes:=changes||servos_v2.put_record('stockItems',stock_key,stock_data);
  changes:=changes||servos_v2.put_record('stockMovements',movement_key,jsonb_build_object(
   'stockItemId',stock_key,'stockItemName',stock_data->>'name','locationId',location_key,
   'locationName',location_data->>'name','quantityDelta',starting_qty,'baseUnit',stock_data->>'baseUnit',
   'movementType','OPENING_BALANCE','sealedOpenAfter',coalesce(stock_data->'sealedOpenStock'->location_key,'null'::jsonb),
   'sourceCommandId',command->>'id','reasonCode','Initial quantity captured with new item',
   'occurredAt',now(),'actorId',auth.uid(),'unitCostMinor',unit_cost_minor,
   'totalCostMinor',round(starting_qty*unit_cost_minor)::bigint
  ));
 end if;
 return changes;
end$$;


revoke all on function servos_v2.cost_rate_value(jsonb,text),servos_v2.apply_catalog_inventory(jsonb),servos_v2.apply_procurement(jsonb),servos_v2.apply_smart_item_setup(jsonb) from public,anon,authenticated;
alter function servos_v2.cutover_collection_allowed(text) rename to cutover_collection_allowed_before_bottle_history;
create function servos_v2.cutover_collection_allowed(collection_name text) returns boolean language sql immutable set search_path='' as $$select servos_v2.cutover_collection_allowed_before_bottle_history(collection_name) or collection_name in ('inventoryCorrections','receiptCorrections','procurementCorrectionBaselines','inventoryMovementBaselines','movementCorrections')$$;
alter function servos_v2.cutover_collection_is_history(text) rename to cutover_collection_is_history_before_bottle_history;
create function servos_v2.cutover_collection_is_history(collection_name text) returns boolean language sql immutable set search_path='' as $$select servos_v2.cutover_collection_is_history_before_bottle_history(collection_name) or collection_name in ('inventoryCorrections','receiptCorrections','procurementCorrectionBaselines','inventoryMovementBaselines','movementCorrections')$$;
revoke all on function servos_v2.cutover_collection_allowed(text),servos_v2.cutover_collection_is_history(text) from public,anon,authenticated;
commit;
