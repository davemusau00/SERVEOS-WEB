-- STAGED V2 ONLY. Create a Smart Item, its stock master, and an optional
-- opening movement in the same command transaction. This does not enable v2.
begin;

create function servos_v2.apply_smart_item_setup(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload'; product_input jsonb:=command->'payload'->'product';
 stock_input jsonb:=command->'payload'->'stockItem'; product_data jsonb; stock_data jsonb;
 stock_command jsonb; product_command jsonb; changes jsonb:='[]'::jsonb; result jsonb;
 stock_key text; product_key text; location_key text; movement_key text;
 outlet_key text;
 starting_qty numeric; unit_cost_minor bigint; price_minor bigint; sealed_size numeric;
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
 movement_key:=(command->>'id')||':opening';
 if length(movement_key)>128 or (product_key is not null and length(product_key)>128) then raise exception 'VALIDATION_FAILED: generated record id';end if;
 location_key:=servos_v2.required_text(p,'locationId');
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 perform servos_v2.assert_version(command,'stockLocations',location_key);
 location_data:=servos_v2.read_record('stockLocations',location_key);
 starting_qty:=servos_v2.quantity_value(p,'startingQuantity',true);

 stock_data:=stock_input - 'averageUnitCost';
 unit_cost_minor:=round(coalesce(nullif(stock_input->>'averageUnitCost','')::numeric,0)*100)::bigint;
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

-- Catalog managers need the configured outlet identifiers to bind a newly
-- created sellable item; no other authorization class gains this projection.
alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_smart_item_setup;
create function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];
begin
 if collection_name='outlets' then
  select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
  if grants is null then return false;end if;
  if '*'=any(grants) or 'catalog.manage'=any(grants) then return true;end if;
 end if;
 return servos_v2.can_read_collection_before_smart_item_setup(collection_name);
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_smart_item_setup;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation'='catalog.createWithOpeningStock' then return servos_v2.apply_smart_item_setup(command);end if;
 return servos_v2.dispatch_before_smart_item_setup(command);
end$$;
revoke all on function servos_v2.apply_smart_item_setup(jsonb),servos_v2.dispatch(jsonb),servos_v2.can_read_collection_before_smart_item_setup(text),servos_v2.can_read_collection(text) from public,anon,authenticated;
commit;
