-- STAGED V2 ONLY. Prepare recipe batches as one versioned stock transaction.
begin;

create function servos_v2.apply_inventory_batch_preparation(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload';
 product_key text:=servos_v2.required_text(command->'payload','recipeProductId');
 output_key text:=servos_v2.required_text(command->'payload','outputStockItemId');
 location_key text:=servos_v2.required_text(command->'payload','locationId');
 reason text:=servos_v2.required_text(command->'payload','reason');
 batch_count numeric;yield_count numeric;output_qty numeric;product jsonb;output_stock jsonb;
 ingredient jsonb;ingredient_key text;ingredient_qty numeric;ingredient_stock jsonb;current_qty numeric;
 input_total_cost numeric:=0;output_unit_cost numeric;existing_total numeric;old_cost numeric;next_cost numeric;
 movement_key text;next_data jsonb;changes jsonb:='[]'::jsonb;seen text[]:='{}'::text[];
begin
 perform servos_v2.require_permission('inventory.adjust');
 if length(reason) not between 3 and 180 then raise exception 'VALIDATION_FAILED: preparation note must be 3 to 180 characters';end if;
 batch_count:=servos_v2.quantity_value(p,'batchCount',false);
 if batch_count<1 or batch_count>1000 or trunc(batch_count)<>batch_count then raise exception 'VALIDATION_FAILED: batch count must be a whole number from 1 to 1000';end if;
 select r.data into product from servos_v2.records r where r.collection='products' and r.id=product_key and not r.archived for update;
 if product is null or product->>'inventoryType'<>'BATCH' then raise exception 'VALIDATION_FAILED: choose an active batch recipe';end if;
 perform servos_v2.assert_version(command,'products',product_key);
 if product->>'stockItemId' is distinct from output_key then raise exception 'VALIDATION_FAILED: finished stock must match the stock master linked to this batch recipe';end if;
 yield_count:=coalesce((product->>'recipeYield')::numeric,0);
 if yield_count<1 or yield_count>100000 or trunc(yield_count)<>yield_count then raise exception 'VALIDATION_FAILED: saved recipe yield is invalid';end if;
 if jsonb_typeof(product->'recipeIngredients') is distinct from 'array' or jsonb_array_length(product->'recipeIngredients') not between 1 and 100 then raise exception 'VALIDATION_FAILED: batch recipe ingredients are missing or invalid';end if;
 output_qty:=yield_count*batch_count;
 if output_qty<=0 or output_qty>1000000000 then raise exception 'VALIDATION_FAILED: calculated batch output is out of range';end if;
 if exists(select 1 from jsonb_array_elements(product->'recipeIngredients') x where x->>'stockItemId'=output_key) then raise exception 'VALIDATION_FAILED: finished batch stock cannot be an ingredient in its own recipe';end if;
 perform servos_v2.read_record('stockLocations',location_key);

 -- Lock every input and output in stable ID order before checking baselines.
 for ingredient_key in
  select stock_id from (
   select output_key as stock_id
   union
   select value->>'stockItemId' from jsonb_array_elements(product->'recipeIngredients')
  ) selected order by stock_id
 loop
  if ingredient_key is null or ingredient_key='' then raise exception 'VALIDATION_FAILED: recipe stock item ID';end if;
  select r.data into ingredient_stock from servos_v2.records r where r.collection='stockItems' and r.id=ingredient_key and not r.archived for update;
  if ingredient_stock is null then raise exception 'VALIDATION_FAILED: active recipe stock item missing';end if;
  perform servos_v2.assert_version(command,'stockItems',ingredient_key);
 end loop;
 perform servos_v2.assert_version(command,'stockLocations',location_key);
 perform servos_v2.assert_version(command,'products',product_key);
 perform servos_v2.read_record('stockItems',output_key);
 select r.data into output_stock from servos_v2.records r where r.collection='stockItems' and r.id=output_key and not r.archived for update;
 if lower(coalesce(output_stock->>'baseUnit','piece')) not in ('piece','portion') then raise exception 'VALIDATION_FAILED: finished batch stock must use piece or portion units';end if;

 for ingredient in select value from jsonb_array_elements(product->'recipeIngredients') order by value->>'stockItemId' loop
  ingredient_key:=servos_v2.required_text(ingredient,'stockItemId');
  if ingredient_key=any(seen) then raise exception 'VALIDATION_FAILED: duplicate batch recipe ingredient';end if;
  seen:=array_append(seen,ingredient_key);
  ingredient_qty:=servos_v2.quantity_value(ingredient,'quantity',false)*yield_count*batch_count;
  if ingredient_qty<=0 or ingredient_qty>1000000000 then raise exception 'VALIDATION_FAILED: calculated ingredient usage is out of range';end if;
  select r.data into ingredient_stock from servos_v2.records r where r.collection='stockItems' and r.id=ingredient_key and not r.archived;
  current_qty:=coalesce((ingredient_stock->'currentStock'->>location_key)::numeric,0);
  if current_qty<ingredient_qty then raise exception 'VALIDATION_FAILED: insufficient ingredient stock for batch preparation';end if;
  input_total_cost:=input_total_cost+ingredient_qty*coalesce((ingredient_stock->>'averageUnitCostMinor')::numeric,0);
  next_data:=jsonb_set(ingredient_stock,'{currentStock}',coalesce(ingredient_stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty-ingredient_qty),true);
  changes:=changes||servos_v2.put_record('stockItems',ingredient_key,next_data);
  movement_key:=(command->>'id')||'-batch-in-'||md5(ingredient_key);
  changes:=changes||servos_v2.put_record('stockMovements',movement_key,jsonb_build_object(
   'stockItemId',ingredient_key,'locationId',location_key,'quantityDelta',-ingredient_qty,
   'movementType','BATCH_PREPARATION_INGREDIENT','reason',reason,'baseUnit',ingredient_stock->>'baseUnit',
   'sourceCommandId',command->>'id','batchProductId',product_key,'batchCount',batch_count,
   'occurredAt',now(),'actorId',auth.uid(),
   'unitCostMinor',coalesce((ingredient_stock->>'averageUnitCostMinor')::bigint,0),
   'totalCostMinor',round(ingredient_qty*coalesce((ingredient_stock->>'averageUnitCostMinor')::numeric,0))::bigint
  ));
 end loop;

 output_unit_cost:=input_total_cost/output_qty;
 current_qty:=coalesce((output_stock->'currentStock'->>location_key)::numeric,0);
 if current_qty<0 then raise exception 'INVALID_STATE: finished batch balance is negative';end if;
 select coalesce(sum(value::numeric),0) into existing_total from jsonb_each_text(coalesce(output_stock->'currentStock','{}'::jsonb));
 old_cost:=coalesce((output_stock->>'averageUnitCostMinor')::numeric,0);
 if existing_total<0 or old_cost<0 then raise exception 'INVALID_STATE: finished batch balance or cost is invalid';end if;
 next_cost:=case when existing_total+output_qty>0 then round((existing_total*old_cost+input_total_cost)/(existing_total+output_qty)) else round(output_unit_cost) end;
 next_data:=jsonb_set(jsonb_set(output_stock,'{currentStock}',coalesce(output_stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty+output_qty),true),'{averageUnitCostMinor}',to_jsonb(next_cost),true);
 changes:=changes||servos_v2.put_record('stockItems',output_key,next_data);
 movement_key:=(command->>'id')||'-batch-out-'||md5(output_key);
 changes:=changes||servos_v2.put_record('stockMovements',movement_key,jsonb_build_object(
  'stockItemId',output_key,'locationId',location_key,'quantityDelta',output_qty,
  'movementType','BATCH_PREPARATION_OUTPUT','reason',reason,'baseUnit',output_stock->>'baseUnit',
  'sourceCommandId',command->>'id','batchProductId',product_key,'batchCount',batch_count,
  'yieldPerBatch',yield_count,'occurredAt',now(),'actorId',auth.uid(),
  'unitCostMinor',round(output_unit_cost)::bigint,'totalCostMinor',round(input_total_cost)::bigint
 ));
 return changes;
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_batch_preparation;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation'='inventory.produceBatch' then return servos_v2.apply_inventory_batch_preparation(command);end if;
 return servos_v2.dispatch_before_batch_preparation(command);
end$$;

revoke all on function servos_v2.apply_inventory_batch_preparation(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
