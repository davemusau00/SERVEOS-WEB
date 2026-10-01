-- STAGED V2 ONLY. Rebuild the canonical route tail after 038's partial dispatcher.
-- Keep both post-035 operations and delegate all older routes to their preserved chain.
begin;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_floorplan_repair;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then
  raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';
 end if;
 if command->>'operation'='floorplan.save' then
  return servos_v2.apply_floorplan(command);
 end if;
 if command->>'operation'='inventory.produceBatch' then
  return servos_v2.apply_inventory_batch_preparation(command);
 end if;
 return servos_v2.dispatch_before_batch_preparation(command);
end$$;

revoke all on function servos_v2.dispatch(jsonb),servos_v2.dispatch_before_floorplan_repair(jsonb),servos_v2.dispatch_before_batch_preparation(jsonb),servos_v2.apply_floorplan(jsonb),servos_v2.apply_inventory_batch_preparation(jsonb) from public,anon,authenticated;
commit;
