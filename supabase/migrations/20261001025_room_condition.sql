-- STAGED V2 ONLY. Converges cloud room.condition with the Native room
-- maintenance-state command without changing housekeeping readiness.
begin;

create function servos_v2.apply_room_condition(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload'; room_key text:=servos_v2.required_text(p,'id');
 current_data jsonb; next_data jsonb; state text; reason text;
begin
 perform servos_v2.require_permission('rooms.manage');
 perform servos_v2.assert_version(command,'rooms',room_key);
 select data into current_data from servos_v2.records where collection='rooms' and id=room_key and not archived for update;
 if current_data is null then raise exception 'VALIDATION_FAILED: room missing';end if;
 state:=servos_v2.required_text(p,'state');
 if state not in ('AVAILABLE','OUT_OF_ORDER') then raise exception 'VALIDATION_FAILED: room condition';end if;
 if state='OUT_OF_ORDER' and exists(
  select 1 from servos_v2.records r
  where r.collection='roomReservations' and not r.archived
    and r.data->>'roomId'=room_key and r.data->>'status' in ('RESERVED','CHECKED_IN')
 ) then
  raise exception 'INVALID_STATE: use a room block or resolve active reservations before taking the room out of order';
 end if;
 reason:=nullif(trim(p->>'reason'),'');
 next_data:=current_data||jsonb_build_object('maintenanceState',state,'conditionReason',reason,'conditionAt',now(),'conditionBy',auth.uid());
 return servos_v2.put_record('rooms',room_key,next_data);
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_room_condition;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation'='room.condition' then return servos_v2.apply_room_condition(command);end if;
 return servos_v2.dispatch_before_room_condition(command);
end$$;

revoke all on function servos_v2.apply_room_condition(jsonb) from public,anon,authenticated;
revoke all on function servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
