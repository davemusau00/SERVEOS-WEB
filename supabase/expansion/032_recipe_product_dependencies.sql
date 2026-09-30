-- STAGED V2 ONLY. Recipe products must validate every referenced stock and
-- outlet baseline in the same authenticated command transaction.
begin;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_recipe_product_dependencies;

create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 product_data jsonb:=command->'payload'->'data';
 ingredient jsonb;
 ingredient_id text;
 outlet_id text;
begin
 if command->>'operation'='product.save'
    and jsonb_typeof(product_data->'recipeIngredients')='array'
    and jsonb_array_length(product_data->'recipeIngredients')>0 then
  if jsonb_array_length(product_data->'recipeIngredients')>100 then raise exception 'VALIDATION_FAILED: recipe ingredients';end if;
  for ingredient in select value from jsonb_array_elements(product_data->'recipeIngredients') loop
   ingredient_id:=servos_v2.required_text(ingredient,'stockItemId');
   perform servos_v2.assert_version(command,'stockItems',ingredient_id);
   perform servos_v2.read_record('stockItems',ingredient_id);
  end loop;
  if product_data ? 'outletIds' then
   if jsonb_typeof(product_data->'outletIds') is distinct from 'array'
      or jsonb_array_length(product_data->'outletIds') not between 1 and 50 then
    raise exception 'VALIDATION_FAILED: recipe product outlets';
   end if;
   for outlet_id in select jsonb_array_elements_text(product_data->'outletIds') loop
    perform servos_v2.assert_version(command,'outlets',outlet_id);
    perform servos_v2.read_record('outlets',outlet_id);
   end loop;
  end if;
 end if;
 return servos_v2.dispatch_before_recipe_product_dependencies(command);
end$$;

-- Internal dispatch is called by the authenticated SECURITY DEFINER command
-- envelope. It is never a public or direct client RPC.
revoke all on function servos_v2.dispatch(jsonb),servos_v2.dispatch_before_recipe_product_dependencies(jsonb) from public,anon,authenticated;
commit;
