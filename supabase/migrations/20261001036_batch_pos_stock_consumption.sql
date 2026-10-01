-- STAGED V2 ONLY. Sellable batch recipes draw from prepared portions stock.
begin;

alter function servos_v2.pos_build_item(jsonb,text,jsonb,text) rename to pos_build_item_before_batch_stock;
create function servos_v2.pos_build_item(command jsonb,product_key text,input jsonb,item_key text)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;product jsonb;stock_key text;volume numeric;portion jsonb;
begin
 result:=servos_v2.pos_build_item_before_batch_stock(command,product_key,input,item_key);
 product:=result->'productSnapshot';
 if upper(coalesce(product->>'inventoryType',''))<>'BATCH' then return result;end if;
 stock_key:=servos_v2.required_text(product,'stockItemId');
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 product:=servos_v2.read_record('products',product_key);
 perform servos_v2.read_record('stockItems',stock_key);
 portion:=result->'portionSnapshot';
 volume:=coalesce((portion->>'volume')::numeric,(product->>'portionVolume')::numeric,1);
 if volume<=0 or volume>1000000 then raise exception 'VALIDATION_FAILED: batch portion stock quantity';end if;
 return jsonb_set(result,'{ingredientSnapshot}',jsonb_build_array(jsonb_build_object(
  'stockItemId',stock_key,'quantity',volume,'tracked',true
 )),true);
end$$;

revoke all on function servos_v2.pos_build_item(jsonb,text,jsonb,text) from public,anon,authenticated;
commit;
