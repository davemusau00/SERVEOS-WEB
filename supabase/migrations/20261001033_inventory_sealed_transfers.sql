-- STAGED V2 ONLY. Keep bottle/open-liquid state coherent on package transfers.
-- This remains behind the authenticated BusinessCommandV2 dispatcher.
begin;

create function servos_v2.apply_sealed_inventory_transfer(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload';
 stock_key text:=servos_v2.required_text(p,'stockItemId');
 source_key text:=servos_v2.required_text(p,'locationId');
 target_key text:=servos_v2.required_text(p,'toLocationId');
 reason text:=servos_v2.required_text(p,'reason');
 stock jsonb;next_data jsonb;changed jsonb:='[]';
 size numeric;qty numeric;source_total numeric;target_total numeric;
 source_state jsonb;target_state jsonb;source_sealed numeric;source_open numeric;
 target_sealed numeric;target_open numeric;before_source jsonb;before_target jsonb;
 add_sealed numeric;add_open numeric;opened numeric;command_id text:=command->>'id';
begin
 perform servos_v2.require_permission('inventory.transfer');
 if source_key=target_key then raise exception 'VALIDATION_FAILED: choose a different destination';end if;
 qty:=servos_v2.quantity_value(p,'quantity',false);
 if qty<=0 then raise exception 'VALIDATION_FAILED: transfer quantity must be positive';end if;
 perform servos_v2.assert_version(command,'stockItems',stock_key);
 perform servos_v2.read_record('stockLocations',source_key);
 perform servos_v2.read_record('stockLocations',target_key);
 select r.data into stock from servos_v2.records r where r.collection='stockItems' and r.id=stock_key and not r.archived for update;
 if stock is null then raise exception 'VALIDATION_FAILED: active stock item missing';end if;
 size:=coalesce((stock->>'sealedContainerSize')::numeric,0);
 if stock->>'baseUnit'<>'ml' or size<=0 then
  return servos_v2.dispatch_before_inventory_sealed_transfers(command);
 end if;
 source_total:=coalesce((stock->'currentStock'->>source_key)::numeric,0);
 target_total:=coalesce((stock->'currentStock'->>target_key)::numeric,0);
 if source_total<qty then raise exception 'VALIDATION_FAILED: insufficient stock';end if;
 source_state:=coalesce(stock->'sealedOpenStock'->source_key,jsonb_build_object('sealedContainers',floor(source_total/size),'openQuantity',source_total-floor(source_total/size)*size));
 target_state:=coalesce(stock->'sealedOpenStock'->target_key,jsonb_build_object('sealedContainers',floor(target_total/size),'openQuantity',target_total-floor(target_total/size)*size));
 source_sealed:=coalesce((source_state->>'sealedContainers')::numeric,-1);source_open:=coalesce((source_state->>'openQuantity')::numeric,-1);
 target_sealed:=coalesce((target_state->>'sealedContainers')::numeric,-1);target_open:=coalesce((target_state->>'openQuantity')::numeric,-1);
 if source_sealed<0 or source_sealed<>floor(source_sealed) or source_open<0 or source_open>=size or abs(source_sealed*size+source_open-source_total)>0.001 then raise exception 'INVALID_STATE: source sealed/open stock does not reconcile';end if;
 if target_sealed<0 or target_sealed<>floor(target_sealed) or target_open<0 or target_open>=size or abs(target_sealed*size+target_open-target_total)>0.001 then raise exception 'INVALID_STATE: destination sealed/open stock does not reconcile';end if;
 before_source:=jsonb_build_object('containerSize',size,'sealedContainers',source_sealed,'openQuantity',source_open);
 before_target:=jsonb_build_object('containerSize',size,'sealedContainers',target_sealed,'openQuantity',target_open);

 -- Follow the terminal's established inventory movement policy: consume open
 -- liquid first, then open only enough sealed containers to cover the remainder.
 if source_open+0.000001<qty then
  opened:=ceil((qty-source_open)/size);
  if source_sealed<opened then raise exception 'VALIDATION_FAILED: insufficient sealed and open stock';end if;
  source_sealed:=source_sealed-opened;source_open:=source_open+opened*size-qty;
 else source_open:=source_open-qty;
 end if;
 if source_open<0.000001 then source_open:=0;end if;

 -- Received whole package volume remains sealed; any measured remainder joins
 -- destination open liquid. Normalize only where the canonical single-open
 -- container model can represent the result.
 add_sealed:=floor(qty/size);add_open:=qty-add_sealed*size;
 target_sealed:=target_sealed+add_sealed;target_open:=target_open+add_open;
 if target_open>=size then raise exception 'INVALID_STATE: destination already has open liquid; transfer a smaller measured amount so bottle state remains representable';end if;
 if abs((source_sealed*size+source_open)-(source_total-qty))>0.001 or abs((target_sealed*size+target_open)-(target_total+qty))>0.001 then raise exception 'INVALID_STATE: transfer sealed/open conservation failed';end if;

 next_data:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(source_key,source_total-qty,target_key,target_total+qty),true);
 next_data:=jsonb_set(next_data,'{sealedOpenStock}',coalesce(stock->'sealedOpenStock','{}'::jsonb)||jsonb_build_object(
  source_key,jsonb_build_object('containerSize',size,'sealedContainers',source_sealed,'openQuantity',source_open),
  target_key,jsonb_build_object('containerSize',size,'sealedContainers',target_sealed,'openQuantity',target_open)),true);
 changed:=changed||servos_v2.put_record('stockItems',stock_key,next_data);
 changed:=changed||servos_v2.put_record('stockMovements','transfer-out-'||command_id,jsonb_build_object(
  'stockItemId',stock_key,'locationId',source_key,'toLocationId',target_key,'quantityDelta',-qty,'movementType','TRANSFER_OUT','reason',reason,'baseUnit',stock->>'baseUnit',
  'sealedOpenEffect',jsonb_build_object('before',before_source,'after',jsonb_build_object('containerSize',size,'sealedContainers',source_sealed,'openQuantity',source_open)),
  'sourceCommandId',command_id,'occurredAt',now(),'actorId',auth.uid()));
 changed:=changed||servos_v2.put_record('stockMovements','transfer-in-'||command_id,jsonb_build_object(
  'stockItemId',stock_key,'locationId',target_key,'fromLocationId',source_key,'quantityDelta',qty,'movementType','TRANSFER_IN','reason',reason,'baseUnit',stock->>'baseUnit',
  'sealedOpenEffect',jsonb_build_object('before',before_target,'after',jsonb_build_object('containerSize',size,'sealedContainers',target_sealed,'openQuantity',target_open)),
  'sourceCommandId',command_id,'occurredAt',now(),'actorId',auth.uid()));
 return changed;
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_inventory_sealed_transfers;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation'='inventory.transfer' then return servos_v2.apply_sealed_inventory_transfer(command);end if;
 return servos_v2.dispatch_before_inventory_sealed_transfers(command);
end$$;

revoke all on function servos_v2.apply_sealed_inventory_transfer(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
