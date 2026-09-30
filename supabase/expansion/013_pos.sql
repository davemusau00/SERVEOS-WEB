-- STAGED V2 ONLY. Shared POS / orders / tabs / tables / recipes.
-- Requires 012_procurement.sql. Never run directly against the live business project.
begin;

create function servos_v2.pos_recalculate(order_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare item jsonb;net bigint:=0;vat bigint:=0;levy bigint:=0;gross bigint:=0;discount bigint:=0;
begin
 if jsonb_typeof(order_data->'items') is distinct from 'array' then raise exception 'VALIDATION_FAILED: order items';end if;
 for item in select value from jsonb_array_elements(order_data->'items') loop
  if coalesce(item->>'state','OPEN')='VOIDED' then continue;end if;
  net:=net+coalesce((item->>'netMinor')::bigint,0);
  vat:=vat+coalesce((item->>'vatMinor')::bigint,0);
  levy:=levy+coalesce((item->>'levyMinor')::bigint,0);
  gross:=gross+coalesce((item->>'lineTotalMinor')::bigint,0);
  discount:=discount+coalesce((item->>'discountMinor')::bigint,0);
 end loop;
 return order_data||jsonb_build_object(
  'subtotalMinor',net,'taxTotalMinor',vat,'cateringLevyTotalMinor',levy,
  'discountTotalMinor',discount,'grandTotalMinor',gross
 );
end$$;

create function servos_v2.pos_build_item(command jsonb,product_key text,input jsonb,item_key text)
returns jsonb language plpgsql set search_path='' as $$
declare product jsonb;policy jsonb;portion jsonb;modifier jsonb;adjustment jsonb;ingredient jsonb;
 selected_modifiers jsonb:='[]';ingredients jsonb:='[]';selected_ids jsonb:=coalesce(input->'modifierIds','[]'::jsonb);
 qty numeric;unit_minor bigint;base_minor bigint;modifier_minor bigint:=0;line_minor bigint;
 vat_bps integer;levy_bps integer;net bigint;vat bigint;levy bigint;denominator integer;
 volume numeric;container_size numeric;inventory_type text;whole_container boolean:=false;
begin
 perform servos_v2.assert_version(command,'products',product_key);
 product:=servos_v2.read_record('products',product_key);
 policy:=servos_v2.read_record('posPolicy','policy');
 qty:=servos_v2.quantity_value(input,'quantity',false);
 if qty>1000 then raise exception 'VALIDATION_FAILED: item quantity';end if;

 if jsonb_typeof(selected_ids) is distinct from 'array' then raise exception 'VALIDATION_FAILED: modifierIds';end if;

 if nullif(input->>'portionId','') is not null then
  select value into portion from jsonb_array_elements(coalesce(product->'portions','[]'::jsonb)) x where x->>'id'=input->>'portionId';
  if portion is null then raise exception 'VALIDATION_FAILED: portion';end if;
  base_minor:=servos_v2.minor(portion,'priceMinor');
 else
  base_minor:=servos_v2.minor(product,'priceMinor');
 end if;

 for modifier in select value from jsonb_array_elements(coalesce(product->'modifiers','[]'::jsonb)) loop
  if exists(select 1 from jsonb_array_elements_text(selected_ids) s where s=modifier->>'id') then
   modifier_minor:=modifier_minor+coalesce((modifier->>'priceDeltaMinor')::bigint,0);
   selected_modifiers:=selected_modifiers||jsonb_build_array(modifier);
  end if;
 end loop;
 unit_minor:=greatest(0,base_minor+modifier_minor);
 line_minor:=round(unit_minor*qty)::bigint;

 ingredients:=coalesce(product->'recipeIngredients','[]'::jsonb);
 if jsonb_array_length(ingredients)=0 and nullif(product->>'stockItemId','') is not null then
  volume:=coalesce((portion->>'volume')::numeric,(product->>'portionVolume')::numeric,1);
  container_size:=coalesce((product->>'portionVolume')::numeric,0);
  inventory_type:=upper(coalesce(product->>'inventoryType',product->>'category',''));
  whole_container:=inventory_type in ('SPIRIT','SPIRITS','WINE') and container_size>0 and abs(volume-container_size)<0.000001;
  ingredients:=jsonb_build_array(jsonb_build_object('stockItemId',product->>'stockItemId','quantity',volume,'tracked',true,'wholeContainerSale',whole_container));
 end if;

 for modifier in select value from jsonb_array_elements(selected_modifiers) loop
  for adjustment in select value from jsonb_array_elements(coalesce(modifier->'ingredientAdjustments','[]'::jsonb)) loop
   if coalesce((adjustment->>'quantityDelta')::numeric,0)<=0 then continue;end if;
   ingredients:=ingredients||jsonb_build_array(jsonb_build_object(
    'stockItemId',adjustment->>'stockItemId','quantity',(adjustment->>'quantityDelta')::numeric,'tracked',true
   ));
  end loop;
 end loop;

 vat_bps:=coalesce((policy->>'vatBasisPoints')::integer,0);
 levy_bps:=coalesce((policy->>'cateringLevyBasisPoints')::integer,0);
 if vat_bps not between 0 and 10000 or levy_bps not between 0 and 10000 then raise exception 'VALIDATION_FAILED: POS tax policy';end if;
 denominator:=10000+vat_bps+levy_bps;
 net:=round(line_minor::numeric*10000/denominator)::bigint;
 vat:=round(net::numeric*vat_bps/10000)::bigint;
 levy:=line_minor-net-vat;

 return jsonb_build_object(
  'id',item_key,'productId',product_key,'productName',product->>'name','quantity',qty,
  'unitPriceMinor',unit_minor,'lineTotalMinor',line_minor,
  'netMinor',net,'vatMinor',vat,'levyMinor',levy,'discountMinor',0,
  'taxPolicySnapshot',policy,'productSnapshot',product,
  'productVersion',(select version from servos_v2.records where collection='products' and id=product_key),
  'portionSnapshot',portion,'modifiers',selected_modifiers,'ingredientSnapshot',ingredients,
  'state','OPEN','courseStatus','HELD','roundNo',coalesce((input->>'roundNo')::integer,1),
  'courseName',coalesce(nullif(trim(input->>'courseName'),''),coalesce(product->>'routeTo','BAR')),
  'seatLabel',nullif(trim(input->>'seatLabel'),''),'note',nullif(trim(input->>'note'),''),
  'stockFired',false,'comped',false
 );
end$$;

create function servos_v2.pos_resize_item(item_data jsonb,new_quantity numeric)
returns jsonb language plpgsql immutable set search_path='' as $$
declare policy jsonb:=item_data->'taxPolicySnapshot';unit_minor bigint;line_minor bigint;vat_bps integer;levy_bps integer;denominator integer;net bigint;vat bigint;levy bigint;
begin
 if new_quantity<=0 or new_quantity>1000 or round(new_quantity,6)<>new_quantity then raise exception 'VALIDATION_FAILED: item quantity';end if;
 unit_minor:=coalesce((item_data->>'unitPriceMinor')::bigint,-1);
 if unit_minor<0 then raise exception 'VALIDATION_FAILED: item price snapshot';end if;
 vat_bps:=coalesce((policy->>'vatBasisPoints')::integer,0);levy_bps:=coalesce((policy->>'cateringLevyBasisPoints')::integer,0);
 denominator:=10000+vat_bps+levy_bps;line_minor:=round(unit_minor*new_quantity)::bigint;
 net:=round(line_minor::numeric*10000/denominator)::bigint;vat:=round(net::numeric*vat_bps/10000)::bigint;levy:=line_minor-net-vat;
 return item_data||jsonb_build_object('quantity',new_quantity,'lineTotalMinor',line_minor,'netMinor',net,'vatMinor',vat,'levyMinor',levy);
end$$;

create function servos_v2.apply_pos(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';key text:=p->>'id';who uuid:=auth.uid();
 current_data jsonb;current_archived boolean;next_data jsonb;order_data jsonb;table_data jsonb;outlet jsonb;product jsonb;stock jsonb;
 item jsonb;source_item jsonb;ingredient jsonb;portion jsonb;modifier jsonb;adjustment jsonb;
 changes jsonb:='[]';items jsonb;needs jsonb:='{}';whole_needs jsonb:='{}';stock_key text;location_key text;table_key text;outlet_key text;customer_key text;
 item_key text;target_key text;reason text;disposition text;state text;route text;
 qty numeric;need numeric;whole_need numeric;current_qty numeric;percent numeric;line_total bigint;discount bigint;net bigint;vat bigint;levy bigint;
 container_size numeric;sealed_count numeric;open_quantity numeric;extra_open numeric;sealed_state jsonb;sealed_effect jsonb;
 current_round integer;last_round integer;has_fired boolean:=false;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_FAILED: payload';end if;

 if op='posPolicy.save' then
  perform servos_v2.require_any_permission(array['business.configure']);
  key:='policy';perform servos_v2.assert_version(command,'posPolicy',key);
  if jsonb_typeof(p->'data') is distinct from 'object' then raise exception 'VALIDATION_FAILED: POS policy';end if;
  if coalesce((p->'data'->>'vatBasisPoints')::integer,-1) not between 0 and 10000
    or coalesce((p->'data'->>'cateringLevyBasisPoints')::integer,-1) not between 0 and 10000
  then raise exception 'VALIDATION_FAILED: POS tax basis points';end if;
  return servos_v2.put_record('posPolicy',key,jsonb_build_object(
    'vatBasisPoints',(p->'data'->>'vatBasisPoints')::integer,
    'cateringLevyBasisPoints',(p->'data'->>'cateringLevyBasisPoints')::integer,
    'taxInclusive',true,'currency','KES'
  ));
 end if;

 if op in ('outlet.save','outlet.archive','outlet.reactivate') then
  perform servos_v2.require_any_permission(array['business.configure']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: outlet id';end if;
  perform servos_v2.assert_version(command,'outlets',key);
  select r.data,r.archived into current_data,current_archived from servos_v2.records r where r.collection='outlets' and r.id=key for update;
  if op='outlet.save' then
   if current_archived then raise exception 'INVALID_STATE: reactivate outlet before editing';end if;
   perform servos_v2.required_text(p->'data','name');perform servos_v2.required_text(p->'data','code');
   location_key:=servos_v2.required_text(p->'data','defaultStockLocationId');perform servos_v2.read_record('stockLocations',location_key);
   if exists(select 1 from servos_v2.records r where r.collection='outlets' and r.id<>key and not r.archived and lower(r.data->>'code')=lower(p->'data'->>'code')) then raise exception 'DUPLICATE_REFERENCE: outlet code';end if;
   return servos_v2.put_record('outlets',key,jsonb_build_object(
    'name',trim(p->'data'->>'name'),'code',upper(trim(p->'data'->>'code')),
    'defaultStockLocationId',location_key,'active',true
   ));
  end if;
  if current_data is null then raise exception 'VALIDATION_FAILED: outlet missing';end if;
  if op='outlet.archive' and exists(select 1 from servos_v2.records r where r.collection='orders' and not r.archived and r.data->>'outletId'=key and r.data->>'state' not in ('COMPLETED','VOIDED')) then raise exception 'INVALID_STATE: outlet has open orders';end if;
  return servos_v2.put_record('outlets',key,current_data,op='outlet.archive');
 end if;

 if op in ('table.save','table.archive','table.reactivate','table.ready') then
  if op='table.ready' then perform servos_v2.require_any_permission(array['pos.manage_table']);
  else perform servos_v2.require_any_permission(array['floorplan.manage']);end if;
  key:=coalesce(p->>'tableId',key);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: table id';end if;
  perform servos_v2.assert_version(command,'tables',key);
  select r.data,r.archived into current_data,current_archived from servos_v2.records r where r.collection='tables' and r.id=key for update;
  if op='table.save' then
   if current_archived then raise exception 'INVALID_STATE: reactivate table before editing';end if;
   perform servos_v2.required_text(p->'data','label');outlet_key:=servos_v2.required_text(p->'data','outletId');perform servos_v2.read_record('outlets',outlet_key);
   if current_data is not null and nullif(current_data->>'currentOrderId','') is not null and current_data->>'outletId' is distinct from outlet_key then raise exception 'INVALID_STATE: occupied table cannot change outlet';end if;
   next_data:=jsonb_build_object(
    'label',trim(p->'data'->>'label'),'outletId',outlet_key,
    'capacity',greatest(1,coalesce((p->'data'->>'capacity')::integer,2)),
    'state',coalesce(current_data->>'state','AVAILABLE'),
    'currentOrderId',current_data->'currentOrderId'
   );
   return servos_v2.put_record('tables',key,next_data);
  end if;
  if current_data is null then raise exception 'VALIDATION_FAILED: table missing';end if;
  if op='table.archive' then
   if nullif(current_data->>'currentOrderId','') is not null then raise exception 'INVALID_STATE: table has active order';end if;
   return servos_v2.put_record('tables',key,current_data,true);
  elsif op='table.reactivate' then
   return servos_v2.put_record('tables',key,current_data,false);
  else
   if current_data->>'state'<>'CLEANING' or nullif(current_data->>'currentOrderId','') is not null then raise exception 'INVALID_STATE: table is not awaiting cleaning';end if;
   return servos_v2.put_record('tables',key,current_data||jsonb_build_object('state','AVAILABLE','cleanedAt',now(),'cleanedBy',who));
  end if;
 end if;

 if op='product.salesConfig' then
  perform servos_v2.require_any_permission(array['catalog.manage']);
  key:=servos_v2.required_text(p,'productId');perform servos_v2.assert_version(command,'products',key);
  product:=servos_v2.read_record('products',key);
  for item in select value from jsonb_array_elements(coalesce(p->'portions','[]'::jsonb)) loop
   perform servos_v2.required_text(item,'id');perform servos_v2.required_text(item,'name');perform servos_v2.minor(item,'priceMinor');
   if item ? 'volume' then perform servos_v2.quantity_value(item,'volume',false);end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p->'recipeIngredients','[]'::jsonb)) loop
   stock_key:=servos_v2.required_text(item,'stockItemId');perform servos_v2.read_record('stockItems',stock_key);perform servos_v2.quantity_value(item,'quantity',false);
  end loop;
  for modifier in select value from jsonb_array_elements(coalesce(p->'modifiers','[]'::jsonb)) loop
   perform servos_v2.required_text(modifier,'id');perform servos_v2.required_text(modifier,'name');
   if modifier ? 'priceDeltaMinor' then perform servos_v2.minor(modifier,'priceDeltaMinor');end if;
   for adjustment in select value from jsonb_array_elements(coalesce(modifier->'ingredientAdjustments','[]'::jsonb)) loop
    stock_key:=servos_v2.required_text(adjustment,'stockItemId');perform servos_v2.read_record('stockItems',stock_key);perform servos_v2.quantity_value(adjustment,'quantityDelta',false);
   end loop;
  end loop;
  return servos_v2.put_record('products',key,product||jsonb_build_object(
    'portions',coalesce(p->'portions','[]'::jsonb),
    'modifiers',coalesce(p->'modifiers','[]'::jsonb),
    'recipeIngredients',coalesce(p->'recipeIngredients','[]'::jsonb)
  ));
 end if;

 if op='order.create' then
  perform servos_v2.require_any_permission(array['pos.open_tab']);
  key:=servos_v2.required_text(p,'id');perform servos_v2.assert_version(command,'orders',key);
  if exists(select 1 from servos_v2.records where collection='orders' and id=key) then raise exception 'DUPLICATE_REFERENCE: order';end if;
  outlet_key:=servos_v2.required_text(p,'outletId');outlet:=servos_v2.read_record('outlets',outlet_key);
  customer_key:=nullif(trim(p->>'customerId'),'');if customer_key is not null then perform servos_v2.read_record('customers',customer_key);end if;
  table_key:=nullif(trim(p->>'tableId'),'');
  if table_key is not null then
   perform servos_v2.assert_version(command,'tables',table_key);
   select r.data into table_data from servos_v2.records r where r.collection='tables' and r.id=table_key and not r.archived for update;
   if table_data is null or table_data->>'state'<>'AVAILABLE' or nullif(table_data->>'currentOrderId','') is not null then raise exception 'RESOURCE_OWNED: table is not available';end if;
   if table_data->>'outletId'<>outlet_key then raise exception 'VALIDATION_FAILED: table outlet';end if;
   changes:=changes||servos_v2.put_record('tables',table_key,table_data||jsonb_build_object('state','ORDERING','currentOrderId',key));
  end if;
  next_data:=jsonb_build_object(
   'orderNumber','ORD-'||upper(substr(key,1,8)),'outletId',outlet_key,'tableId',table_key,
   'tableName',case when table_key is null then null else table_data->>'label' end,
   'customerId',customer_key,'tabName',coalesce(nullif(trim(p->>'name'),''),'Walk-in'),
   'items','[]'::jsonb,'currentRoundNo',1,'state','OPEN',
   'subtotalMinor',0,'discountTotalMinor',0,'taxTotalMinor',0,'cateringLevyTotalMinor',0,
   'grandTotalMinor',0,'amountPaidMinor',0,'createdAt',now(),'serverEmployeeId',who
  );
  return changes||servos_v2.put_record('orders',key,next_data);
 end if;

 if op in ('order.addItem','order.updateItem','order.removeItem','order.fire','order.kds','order.repeatRound','order.void') then
  key:=servos_v2.required_text(p,'orderId');
  perform servos_v2.assert_version(command,'orders',key);
  select r.data into order_data from servos_v2.records r where r.collection='orders' and r.id=key and not r.archived for update;
  if order_data is null or order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order closed';end if;
  if coalesce((order_data->>'amountPaidMinor')::bigint,0)>0 and op in ('order.addItem','order.updateItem','order.removeItem','order.repeatRound') then raise exception 'INVALID_STATE: partially paid order cannot be edited';end if;
  items:=order_data->'items';

  if op='order.addItem' then
   perform servos_v2.require_any_permission(array['pos.sell']);
   item_key:=coalesce(nullif(trim(p->>'itemId'),''),command->>'id');
   if exists(select 1 from jsonb_array_elements(items) x where x->>'id'=item_key) then raise exception 'DUPLICATE_REFERENCE: order item';end if;
   item:=servos_v2.pos_build_item(command,servos_v2.required_text(p,'productId'),p,item_key);
   items:=items||jsonb_build_array(item);
   return servos_v2.put_record('orders',key,servos_v2.pos_recalculate(order_data||jsonb_build_object('items',items)));

  elsif op='order.updateItem' then
   perform servos_v2.require_any_permission(array['pos.sell']);
   item_key:=servos_v2.required_text(p,'itemId');qty:=servos_v2.quantity_value(p,'quantity',false);
   items:='[]';
   for item in select value from jsonb_array_elements(order_data->'items') loop
    if item->>'id'=item_key then
     if coalesce((item->>'stockFired')::boolean,false) then raise exception 'INVALID_STATE: fired item cannot change quantity';end if;
     item:=servos_v2.pos_resize_item(item,qty);
    end if;
    items:=items||jsonb_build_array(item);
   end loop;
   if not exists(select 1 from jsonb_array_elements(order_data->'items') x where x->>'id'=item_key) then raise exception 'VALIDATION_FAILED: order item missing';end if;
   return servos_v2.put_record('orders',key,servos_v2.pos_recalculate(order_data||jsonb_build_object('items',items)));

  elsif op='order.removeItem' then
   perform servos_v2.require_any_permission(array['pos.sell']);item_key:=servos_v2.required_text(p,'itemId');
   if exists(select 1 from jsonb_array_elements(order_data->'items') x where x->>'id'=item_key and coalesce((x->>'stockFired')::boolean,false)) then raise exception 'INVALID_STATE: fired item cannot be removed';end if;
   select coalesce(jsonb_agg(value),'[]') into items from jsonb_array_elements(order_data->'items') x where x->>'id'<>item_key;
   if jsonb_array_length(items)=jsonb_array_length(order_data->'items') then raise exception 'VALIDATION_FAILED: order item missing';end if;
   return servos_v2.put_record('orders',key,servos_v2.pos_recalculate(order_data||jsonb_build_object('items',items)));

  elsif op='order.fire' then
   perform servos_v2.require_any_permission(array['order.fire','pos.sell']);
   outlet:=servos_v2.read_record('outlets',order_data->>'outletId');location_key:=servos_v2.required_text(outlet,'defaultStockLocationId');
   current_round:=coalesce((order_data->>'currentRoundNo')::integer,1);
   for item in select value from jsonb_array_elements(order_data->'items') loop
    if coalesce((item->>'stockFired')::boolean,false) or item->>'state'='VOIDED' then continue;end if;
    if coalesce((item->>'roundNo')::integer,1)<>current_round then continue;end if;
    has_fired:=true;
    for ingredient in select value from jsonb_array_elements(coalesce(item->'ingredientSnapshot','[]'::jsonb)) loop
     if coalesce((ingredient->>'tracked')::boolean,true)=false then continue;end if;
     stock_key:=servos_v2.required_text(ingredient,'stockItemId');need:=(ingredient->>'quantity')::numeric*(item->>'quantity')::numeric;
     needs:=needs||jsonb_build_object(stock_key,coalesce((needs->>stock_key)::numeric,0)+need);
     if coalesce((ingredient->>'wholeContainerSale')::boolean,false) then whole_needs:=whole_needs||jsonb_build_object(stock_key,coalesce((whole_needs->>stock_key)::numeric,0)+need);end if;
    end loop;
   end loop;
   if not has_fired then raise exception 'INVALID_STATE: no held items in current round';end if;
   for stock_key,need in select e.key,e.value::numeric from jsonb_each_text(needs) as e(key,value) loop
    perform servos_v2.assert_version(command,'stockItems',stock_key);
    select r.data into stock from servos_v2.records r where r.collection='stockItems' and r.id=stock_key and not r.archived for update;
    current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
    if current_qty<need then raise exception 'VALIDATION_FAILED: insufficient stock for %',stock_key;end if;
   whole_need:=coalesce((whole_needs->>stock_key)::numeric,0);container_size:=coalesce((stock->>'sealedContainerSize')::numeric,0);sealed_effect:=null;
   if stock->>'baseUnit'='ml' and container_size>0 then
    sealed_state:=coalesce(stock->'sealedOpenStock','{}'::jsonb)->location_key;
    sealed_count:=coalesce((sealed_state->>'sealedContainers')::numeric,floor(current_qty/container_size));
    open_quantity:=coalesce((sealed_state->>'openQuantity')::numeric,current_qty-sealed_count*container_size);
    if sealed_count<0 or open_quantity<0 or open_quantity>=container_size or abs(sealed_count*container_size+open_quantity-current_qty)>0.001 then raise exception 'INVALID_STATE: sealed/open stock inconsistent; reconcile before sale';end if;
    if whole_need>0 then
     if abs(whole_need/container_size-round(whole_need/container_size))>0.000001 then raise exception 'VALIDATION_FAILED: whole-container sale quantity does not match configured bottle size';end if;
     if sealed_count+0.000001<whole_need/container_size then raise exception 'VALIDATION_FAILED: no sealed bottle available; open liquid cannot satisfy a whole-bottle sale';end if;
     sealed_count:=sealed_count-whole_need/container_size;
    end if;
    need:=need-whole_need;
    if open_quantity+0.000001<need then
     extra_open:=ceil(greatest(0,need-open_quantity)/container_size);
     if sealed_count+0.000001<extra_open then raise exception 'VALIDATION_FAILED: insufficient sealed and open stock for serving';end if;
     sealed_count:=sealed_count-extra_open;open_quantity:=open_quantity+extra_open*container_size;
    end if;
    open_quantity:=open_quantity-need;
    current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
    sealed_effect:=jsonb_build_object('containerSize',container_size,'sealedContainersBefore',coalesce((sealed_state->>'sealedContainers')::numeric,floor(current_qty/container_size)),'sealedContainersAfter',sealed_count,'openQuantityBefore',coalesce((sealed_state->>'openQuantity')::numeric,current_qty-floor(current_qty/container_size)*container_size),'openQuantityAfter',open_quantity);
   elsif whole_need>0 then raise exception 'INVALID_STATE: whole-container sale requires configured sealed-container tracking';
   end if;
   -- Restore the aggregate requested quantity after using need for the serving remainder.
   need:=coalesce((needs->>stock_key)::numeric,0);
    next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty-need),true);
   if sealed_effect is not null then
    next_data:=jsonb_set(next_data,'{sealedOpenStock}',coalesce(next_data->'sealedOpenStock','{}'::jsonb),true);
    next_data:=jsonb_set(next_data,array['sealedOpenStock',location_key],jsonb_build_object('sealedContainers',(sealed_effect->>'sealedContainersAfter')::numeric,'openQuantity',(sealed_effect->>'openQuantityAfter')::numeric,'containerSize',container_size),true);
   end if;
    changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
   changes:=changes||servos_v2.put_record('stockMovements','sale-'||(command->>'id')||'-'||stock_key,jsonb_build_object(
     'stockItemId',stock_key,'locationId',location_key,'quantityDelta',-need,'movementType','SALE_CONSUMPTION',
     'sourceId',key,'sourceCommandId',command->>'id','reason',order_data->>'orderNumber',
     'baseUnit',stock->>'baseUnit','occurredAt',now(),'actorId',who
     )||case when sealed_effect is null then '{}'::jsonb else jsonb_build_object('sealedOpenEffect',sealed_effect) end
    );
   end loop;
   items:='[]';
   for item in select value from jsonb_array_elements(order_data->'items') loop
    if not coalesce((item->>'stockFired')::boolean,false) and item->>'state'<>'VOIDED' and coalesce((item->>'roundNo')::integer,1)=current_round then
     item:=item||jsonb_build_object('stockFired',true,'courseStatus','FIRED','firedAt',now());
    end if;
    items:=items||jsonb_build_array(item);
   end loop;
   changes:=changes||servos_v2.put_record('orders',key,order_data||jsonb_build_object('items',items,'state','FIRED','currentRoundNo',current_round+1,'lastFiredAt',now()));
   return changes;

  elsif op='order.kds' then
   perform servos_v2.require_any_permission(array['kds.update']);item_key:=servos_v2.required_text(p,'itemId');state:=upper(servos_v2.required_text(p,'status'));
   if state not in ('FIRED','PREPARING','READY','SERVED') then raise exception 'VALIDATION_FAILED: KDS state';end if;
   items:='[]';
   for item in select value from jsonb_array_elements(order_data->'items') loop
    if item->>'id'=item_key then
     if not coalesce((item->>'stockFired')::boolean,false) then raise exception 'INVALID_STATE: item has not been fired';end if;
     item:=item||jsonb_build_object('courseStatus',state,'courseUpdatedAt',now());
    end if;
    items:=items||jsonb_build_array(item);
   end loop;
   return servos_v2.put_record('orders',key,order_data||jsonb_build_object('items',items));

  elsif op='order.repeatRound' then
   perform servos_v2.require_any_permission(array['pos.sell']);current_round:=coalesce((order_data->>'currentRoundNo')::integer,1);last_round:=greatest(1,current_round-1);
   items:=order_data->'items';has_fired:=false;
   for source_item in select value from jsonb_array_elements(order_data->'items') loop
    if coalesce((source_item->>'stockFired')::boolean,false) and source_item->>'state'<>'VOIDED' and coalesce((source_item->>'roundNo')::integer,1)=last_round then
     has_fired:=true;item_key=(command->>'id')||'-'||(source_item->>'id');
     item:=servos_v2.pos_build_item(command,source_item->>'productId',jsonb_build_object(
      'quantity',(source_item->>'quantity')::numeric,'portionId',source_item->'portionSnapshot'->>'id',
      'modifierIds',coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(coalesce(source_item->'modifiers','[]'::jsonb)) x),'[]'::jsonb),
      'roundNo',current_round,'courseName',source_item->>'courseName','seatLabel',source_item->>'seatLabel','note',source_item->>'note'
     ),item_key);
     items:=items||jsonb_build_array(item);
    end if;
   end loop;
   if not has_fired then raise exception 'INVALID_STATE: no fired round to repeat';end if;
   return servos_v2.put_record('orders',key,servos_v2.pos_recalculate(order_data||jsonb_build_object('items',items)));

  else
   perform servos_v2.require_any_permission(array['order.void']);reason:=servos_v2.required_text(p,'reason');
   select exists(select 1 from jsonb_array_elements(order_data->'items') x where coalesce((x->>'stockFired')::boolean,false)) into has_fired;
   disposition:=upper(coalesce(nullif(trim(p->>'disposition'),''),case when has_fired then '' else 'NOT_FIRED' end));
   if has_fired and disposition not in ('RETURN_SEALED','WASTE','CONSUMED','MANAGER_ADJUSTMENT') then raise exception 'VALIDATION_FAILED: fired-stock disposition';end if;
   if disposition='RETURN_SEALED' then
    outlet:=servos_v2.read_record('outlets',order_data->>'outletId');location_key:=servos_v2.required_text(outlet,'defaultStockLocationId');
    needs:='{}';
    for item in select value from jsonb_array_elements(order_data->'items') loop
     if not coalesce((item->>'stockFired')::boolean,false) then continue;end if;
     for ingredient in select value from jsonb_array_elements(coalesce(item->'ingredientSnapshot','[]'::jsonb)) loop
      if coalesce((ingredient->>'tracked')::boolean,true)=false then continue;end if;
      stock_key:=ingredient->>'stockItemId';need:=(ingredient->>'quantity')::numeric*(item->>'quantity')::numeric;
      needs:=needs||jsonb_build_object(stock_key,coalesce((needs->>stock_key)::numeric,0)+need);
     end loop;
    end loop;
    for stock_key,need in select e.key,e.value::numeric from jsonb_each_text(needs) as e(key,value) loop
     perform servos_v2.assert_version(command,'stockItems',stock_key);
     select r.data into stock from servos_v2.records r where r.collection='stockItems' and r.id=stock_key and not r.archived for update;
     current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
     next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty+need),true);
     changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
     changes:=changes||servos_v2.put_record('stockMovements','void-return-'||(command->>'id')||'-'||stock_key,jsonb_build_object(
      'stockItemId',stock_key,'locationId',location_key,'quantityDelta',need,'movementType','VOID_RETURN',
      'sourceId',key,'sourceCommandId',command->>'id','reason',reason,'baseUnit',stock->>'baseUnit','occurredAt',now(),'actorId',who
     ));
    end loop;
   end if;
   items:='[]';for item in select value from jsonb_array_elements(order_data->'items') loop items:=items||jsonb_build_array(item||jsonb_build_object('state','VOIDED','voidDisposition',disposition));end loop;
   next_data:=order_data||jsonb_build_object('items',items,'state','VOIDED','voidReason',reason,'voidDisposition',disposition,'voidedAt',now(),'voidedBy',who);
   table_key:=nullif(order_data->>'tableId','');
   if table_key is not null then
    perform servos_v2.assert_version(command,'tables',table_key);table_data:=servos_v2.read_record('tables',table_key);
    changes:=changes||servos_v2.put_record('tables',table_key,table_data||jsonb_build_object('currentOrderId',null,'state','CLEANING'));
   end if;
   return changes||servos_v2.put_record('orders',key,servos_v2.pos_recalculate(next_data));
  end if;
 end if;

 raise exception 'PROTOCOL_UNSUPPORTED: POS operation';
end$$;

create or replace function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false;end if;if '*'=any(grants) then return true;end if;
 needed:=case
  when collection_name in ('customers','roomTypes','assetCategories') then array['records.view']
  when collection_name='suppliers' then array['procurement.view','procurement.manage']
  when collection_name='products' then array['catalog.view','catalog.manage','pos.sell']
  when collection_name in ('stockItems','stockMovements','stockLocations') then array['inventory.view','inventory.count','inventory.adjust','inventory.transfer','inventory.waste','stock.view','stock.manage','pos.sell']
  when collection_name in ('outlets','tables','posPolicy') then array['business.view','floorplan.view','pos.sell','pos.open_tab','pos.manage_table']
  when collection_name='orders' then array['pos.sell','pos.open_tab','order.fire','kds.view','kds.update']
  when collection_name in ('purchaseOrders','goodsReceipts') then array['procurement.view','procurement.manage','procurement.receive']
  when collection_name in ('supplierPayables','supplierPayments') then array['procurement.view','procurement.manage','procurement.pay','accounting.view','accounting.manage']
  when collection_name='assetAcquisitions' then array['procurement.view','assets.view','assets.manage']
  when collection_name in ('assets','assetEvents') then array['assets.view','assets.manage','assets.operate']
  when collection_name='maintenanceOrders' then array['maintenance.view','maintenance.manage']
  when collection_name in ('rooms','ratePlans','roomBlocks') then array['rooms.view','rooms.manage','rooms.operate']
  when collection_name in ('roomReservations','stays','stayEvents','stayExtensions') then array['rooms.guests.view','rooms.operate']
  when collection_name in ('folios','folioEntries') then array['folio.view','folio.manage']
  when collection_name in ('hotelServices','paymentAccounts') then array['folio.view','folio.manage','payment.record','business.configure']
  when collection_name='journalEntries' then array['accounting.view','accounting.manage']
  when collection_name='employees' then array['staff.view','staff.manage']
  when collection_name in ('payments','receiptDocuments') then array['payments.view','payments.manage']
  else array[]::text[] end;
 return grants&&needed;
end$$;

create or replace function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation' in ('record.save','record.archive','record.reactivate') then return servos_v2.apply_master(command);end if;
 if command->>'operation' like 'posPolicy.%' or command->>'operation' like 'outlet.%' or command->>'operation' like 'table.%' or command->>'operation' like 'order.%' or command->>'operation'='product.salesConfig' then return servos_v2.apply_pos(command);end if;
 if command->>'operation' like 'supplier.%' or command->>'operation' like 'purchaseOrder.%' or command->>'operation' like 'supplierPayable.%' or command->>'operation'='asset.commission' then return servos_v2.apply_procurement(command);end if;
 if command->>'operation' like 'product.%' or command->>'operation' like 'stockItem.%' or command->>'operation' like 'stockLocation.%' or command->>'operation' like 'inventory.%' then return servos_v2.apply_catalog_inventory(command);end if;
 if command->>'operation' like 'asset.%' or command->>'operation' like 'maintenance.%' then return servos_v2.apply_assets(command);end if;
 if command->>'operation' like 'folio.%' then return servos_v2.apply_folios(command);end if;
 if command->>'operation' like 'stay.%' then return servos_v2.apply_stays(command);end if;
 if command->>'operation' like 'room.%' or command->>'operation' like 'ratePlan.%' or command->>'operation' like 'roomReservation.%' then return servos_v2.apply_rooms(command);end if;
 raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';
end$$;

revoke all on function servos_v2.pos_recalculate(jsonb),servos_v2.pos_build_item(jsonb,text,jsonb,text),servos_v2.pos_resize_item(jsonb,numeric),servos_v2.apply_pos(jsonb),servos_v2.can_read_collection(text)
from public,anon,authenticated;
commit;
