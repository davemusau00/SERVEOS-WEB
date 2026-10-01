-- STAGED V2 ONLY. Whole-location counts must reconcile Spirit/Wine bottle state.
begin;

create or replace function servos_v2.apply_inventory_location_count(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload'; rows jsonb:=p->'rows'; row_data jsonb; stock jsonb; next_data jsonb;
 location_key text:=servos_v2.required_text(p,'locationId'); stock_key text; reason text;
 expected numeric; counted numeric; current_qty numeric; scan_qty numeric; changes jsonb:='[]';
 size numeric; sealed_count numeric; open_quantity numeric; before_state jsonb; state jsonb; sealed_state jsonb;
 active_count integer; row_count integer; item_count integer:=0; variance_count integer:=0;
 count_id text:='count-'||(command->>'id'); state_changed boolean;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 5000 then raise exception 'VALIDATION_FAILED: count must include between 1 and 5000 rows';end if;
 perform servos_v2.require_any_permission(array['inventory.count','inventory.adjust']);
 perform servos_v2.assert_version(command,'stockLocations',location_key);
 perform servos_v2.read_record('stockLocations',location_key);
 reason:=servos_v2.required_text(p,'reason');
 if jsonb_typeof(coalesce(p->'unknownBarcodes','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(p->'unknownBarcodes','[]'::jsonb))<>0 then raise exception 'VALIDATION_FAILED: resolve unknown barcodes before confirming';end if;
 select count(*) into active_count from servos_v2.records where collection='stockItems' and not archived;
 select count(*) into row_count from jsonb_array_elements(rows);
 if active_count<>row_count then raise exception 'VALIDATION_FAILED: count must include every active stock item';end if;
 if exists(select 1 from jsonb_array_elements(rows) a cross join jsonb_array_elements(rows) b where a->>'stockItemId'=b->>'stockItemId' and a is distinct from b) then raise exception 'VALIDATION_FAILED: duplicate stock item in count';end if;
 if exists(select 1 from servos_v2.records r where r.collection='stockItems' and not r.archived and not exists(select 1 from jsonb_array_elements(rows) x where x->>'stockItemId'=r.id)) then raise exception 'VALIDATION_FAILED: every active stock item is required';end if;
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
  size:=case when stock->>'baseUnit'='ml' then coalesce((stock->>'sealedContainerSize')::numeric,0) else 0 end;
  if size>0 then
   if jsonb_typeof(row_data->'countedSealedContainers') is distinct from 'number' or jsonb_typeof(row_data->'countedOpenQuantity') is distinct from 'number' then raise exception 'VALIDATION_FAILED: sealed/open count is required for tracked bottle stock';end if;
   sealed_count:=servos_v2.quantity_value(row_data,'countedSealedContainers',true);open_quantity:=servos_v2.quantity_value(row_data,'countedOpenQuantity',true);
   if sealed_count<>floor(sealed_count) or open_quantity>=size or abs(counted-(sealed_count*size+open_quantity))>0.000001 then raise exception 'VALIDATION_FAILED: counted total does not match whole sealed bottles plus open ml';end if;
   sealed_state:=coalesce(stock->'sealedOpenStock','{}'::jsonb);
   state:=coalesce(sealed_state->location_key,jsonb_build_object('sealedContainers',floor(current_qty/size),'openQuantity',current_qty-floor(current_qty/size)*size));
   if coalesce((state->>'sealedContainers')::numeric,-1)<0 or coalesce((state->>'sealedContainers')::numeric,0)<>floor(coalesce((state->>'sealedContainers')::numeric,0)) or coalesce((state->>'openQuantity')::numeric,-1)<0 or coalesce((state->>'openQuantity')::numeric,size)>=size or abs(coalesce((state->>'sealedContainers')::numeric,0)*size+coalesce((state->>'openQuantity')::numeric,0)-current_qty)>0.001 then raise exception 'INVALID_STATE: current sealed/open stock does not reconcile';end if;
   before_state:=jsonb_build_object('containerSize',size,'sealedContainers',(state->>'sealedContainers')::numeric,'openQuantity',(state->>'openQuantity')::numeric);
   state_changed:=(state->>'sealedContainers')::numeric<>sealed_count or (state->>'openQuantity')::numeric<>open_quantity;
   if counted<>current_qty or state_changed then
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
 changes:=changes||servos_v2.put_record('stockCounts',count_id,jsonb_build_object('sessionId',nullif(trim(p->>'sessionId'),''),'revision',coalesce((p->>'sessionRevision')::integer,1),'locationId',location_key,'reason',reason,'rows',rows,'itemCount',item_count,'varianceCount',variance_count,'reviewed',true,'sourceCommandId',command->>'id','occurredAt',now(),'actorId',auth.uid()));
 return changes;
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_sealed_location_counts;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation'='inventory.countLocation' then return servos_v2.apply_inventory_location_count(command);end if;
 return servos_v2.dispatch_before_sealed_location_counts(command);
end$$;

revoke all on function servos_v2.apply_inventory_location_count(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
