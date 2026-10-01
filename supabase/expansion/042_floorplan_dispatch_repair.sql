-- STAGED V2 ONLY. Repair databases that applied 038's partial dispatcher.
-- Keep the accumulated dispatcher intact and wrap only floorplan.save.
begin;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_floorplan_repair;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation'='floorplan.save' then
  if coalesce((command->>'offlineFinalized')::boolean,false) then
   raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';
  end if;
  return servos_v2.apply_floorplan(command);
 end if;
 return servos_v2.dispatch_before_batch_preparation(command);
end$$;

revoke all on function servos_v2.dispatch(jsonb),servos_v2.dispatch_before_floorplan_repair(jsonb),servos_v2.dispatch_before_batch_preparation(jsonb) from public,anon,authenticated;
commit;
