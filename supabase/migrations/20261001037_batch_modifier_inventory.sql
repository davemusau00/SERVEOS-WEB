-- STAGED V2 ONLY. Preserve modifier ingredient effects when batch sales draw
-- their base quantity from prepared portions rather than raw recipe inputs.
begin;

alter function servos_v2.pos_build_item(jsonb,text,jsonb,text) rename to pos_build_item_before_batch_modifier_effects;
create function servos_v2.pos_build_item(command jsonb,product_key text,input jsonb,item_key text)
returns jsonb language plpgsql set search_path='' as $$
declare
 result jsonb;product jsonb;stock_key text;portion jsonb;volume numeric;
 modifier jsonb;adjustment jsonb;adjustment_stock text;adjustment_qty numeric;
 ingredients jsonb;
begin
 result:=servos_v2.pos_build_item_before_batch_modifier_effects(command,product_key,input,item_key);
 product:=result->'productSnapshot';
 if upper(coalesce(product->>'inventoryType',''))<>'BATCH' then return result;end if;

 stock_key:=servos_v2.required_text(product,'stockItemId');
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 perform servos_v2.read_record('stockItems',stock_key);
 portion:=result->'portionSnapshot';
 volume:=coalesce((portion->>'volume')::numeric,(product->>'portionVolume')::numeric,1);
 if volume<=0 or volume>1000000 then raise exception 'VALIDATION_FAILED: batch portion stock quantity';end if;
 ingredients:=jsonb_build_array(jsonb_build_object('stockItemId',stock_key,'quantity',volume,'tracked',true));

 -- The wrapped builder has already selected and validated these modifiers.
 -- Rebuild only their extra-input effects; raw recipe lines are intentionally
 -- omitted because their full-batch quantities were consumed at preparation.
 for modifier in select value from jsonb_array_elements(coalesce(result->'modifiers','[]'::jsonb)) loop
  for adjustment in select value from jsonb_array_elements(coalesce(modifier->'ingredientAdjustments','[]'::jsonb)) loop
   adjustment_qty:=coalesce((adjustment->>'quantityDelta')::numeric,0);
   if adjustment_qty<=0 then continue;end if;
   if adjustment_qty>1000000 then raise exception 'VALIDATION_FAILED: modifier ingredient quantity out of range';end if;
   adjustment_stock:=servos_v2.required_text(adjustment,'stockItemId');
   perform servos_v2.assert_version(command,'stockItems',adjustment_stock);
   perform servos_v2.read_record('stockItems',adjustment_stock);
   ingredients:=ingredients||jsonb_build_array(jsonb_build_object(
    'stockItemId',adjustment_stock,'quantity',adjustment_qty,'tracked',true
   ));
  end loop;
 end loop;
 return jsonb_set(result,'{ingredientSnapshot}',ingredients,true);
end$$;

revoke all on function servos_v2.pos_build_item(jsonb,text,jsonb,text) from public,anon,authenticated;
commit;
