-- STAGED V2 ONLY. Replaces fixed DAY_USE duration matching with one configured room-stay rate.
-- Nightly stays end at the configured local checkout time; day stays end on the same
-- local date no later than the configured cutoff. Existing snapshots remain readable.
begin;

alter function servos_v2.apply_rooms(jsonb) rename to apply_rooms_before_room_stay_policy;

create or replace function servos_v2.apply_rooms(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';key text;
 current_data jsonb;room_data jsonb;rate jsonb;property jsonb;next_data jsonb;
 room_key text;rate_key text;customer_key text;stay_type text;start_at timestamptz;end_at timestamptz;
 blocked_until timestamptz;turnaround integer;guests integer;units integer;price bigint;checkout time;cutoff time;
begin
 if op='roomStay.settings' then
  perform servos_v2.require_permission('business.configure');
  perform servos_v2.assert_version(command,'property','property');
  property:=servos_v2.read_record('property','property');
  room_key:=servos_v2.required_text(p,'roomTypeId');rate_key:=servos_v2.required_text(p,'ratePlanId');
  perform servos_v2.read_record('roomTypes',room_key);rate:=servos_v2.read_record('ratePlans',rate_key);
  if rate->>'roomTypeId' is distinct from room_key or rate->>'mode' is distinct from 'NIGHTLY' then raise exception 'VALIDATION_FAILED: configure one NIGHTLY room stay rate matching the room type';end if;
  begin checkout:=(servos_v2.required_text(p,'nightlyCheckoutTime')||':00')::time;exception when others then raise exception 'VALIDATION_FAILED: nightly checkout time';end;
  begin cutoff:=(servos_v2.required_text(p,'dayStayCutoffTime')||':00')::time;exception when others then raise exception 'VALIDATION_FAILED: day stay cutoff time';end;
  if checkout>=cutoff then raise exception 'VALIDATION_FAILED: nightly checkout must be before day stay cutoff';end if;
  return servos_v2.put_record('property','property',property||jsonb_build_object('roomStayRoomTypeId',room_key,'roomStayRatePlanId',rate_key,'nightlyCheckoutTime',to_char(checkout,'HH24:MI'),'dayStayCutoffTime',to_char(cutoff,'HH24:MI'),'updatedAt',now()));
 end if;

 key:=servos_v2.required_text(p,'id');
 if op='ratePlan.save' and coalesce(p->'data'->>'mode','NIGHTLY') is distinct from 'NIGHTLY' then raise exception 'VALIDATION_FAILED: room stay rates must be NIGHTLY';end if;
 if op not in ('roomReservation.create','roomReservation.update') then return servos_v2.apply_rooms_before_room_stay_policy(command);end if;

 perform servos_v2.require_permission('rooms.operate');
 perform servos_v2.assert_version(command,'roomReservations',key);
 select data into current_data from servos_v2.records where collection='roomReservations' and id=key;
 if op='roomReservation.create' and current_data is not null then raise exception 'DUPLICATE_REFERENCE: reservation';end if;
 if op='roomReservation.update' and (current_data is null or current_data->>'status' is distinct from 'RESERVED') then raise exception 'INVALID_STATE: only reserved bookings can be edited';end if;
 room_key:=servos_v2.required_text(p,'roomId');customer_key:=servos_v2.required_text(p,'customerId');room_data:=servos_v2.read_record('rooms',room_key);perform servos_v2.read_record('customers',customer_key);
 select data into property from servos_v2.records where collection='property' and id='property' and not archived;
 property:=coalesce(property,'{}'::jsonb);rate_key:=coalesce(nullif(property->>'roomStayRatePlanId',''),nullif(p->>'ratePlanId',''));
 if rate_key is null then raise exception 'VALIDATION_FAILED: configure the room stay rate in Settings';end if;
 rate:=servos_v2.read_record('ratePlans',rate_key);
 if rate->>'roomTypeId' is distinct from room_data->>'roomTypeId' or rate->>'mode' is distinct from 'NIGHTLY' then raise exception 'VALIDATION_FAILED: configure one NIGHTLY room stay rate matching the room type';end if;
 guests:=(p->>'guests')::integer;if guests is null or guests not between 1 and (room_data->>'capacity')::integer then raise exception 'VALIDATION_FAILED: guest capacity';end if;
 start_at:=(p->>'startsAt')::timestamptz;end_at:=(p->>'endsAt')::timestamptz;
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at or end_at-start_at>interval '366 days' then raise exception 'VALIDATION_FAILED: stay interval';end if;
 checkout:=(coalesce(property->>'nightlyCheckoutTime','10:00')||':00')::time;cutoff:=(coalesce(property->>'dayStayCutoffTime','18:00')||':00')::time;stay_type:=coalesce(nullif(p->>'stayType',''),'NIGHTLY');
 if stay_type='DAY' then
  if (end_at at time zone 'Africa/Nairobi')::date<>(start_at at time zone 'Africa/Nairobi')::date or (end_at at time zone 'Africa/Nairobi')::time>cutoff then raise exception 'VALIDATION_FAILED: day stay must end by the configured cutoff';end if;
  units:=1;
 elsif stay_type='NIGHTLY' then
  if (end_at at time zone 'Africa/Nairobi')::time<>checkout then raise exception 'VALIDATION_FAILED: nightly departure must be at %',to_char(checkout,'HH24:MI');end if;
  units:=((end_at at time zone 'Africa/Nairobi')::date-(start_at at time zone 'Africa/Nairobi')::date);
  if units not between 1 and 366 then raise exception 'VALIDATION_FAILED: nightly arrival/departure dates';end if;
 else raise exception 'VALIDATION_FAILED: stay type must be NIGHTLY or DAY';end if;
 turnaround:=(room_data->>'turnaroundMinutes')::integer;blocked_until:=end_at+make_interval(mins=>turnaround);perform servos_v2.room_available(room_key,start_at,blocked_until,(command->>'deviceId')::uuid,key);
 price:=servos_v2.minor(rate,'priceMinor')*units;
 next_data:=jsonb_build_object('roomId',room_key,'ratePlanId',rate_key,'stayType',stay_type,'customerId',customer_key,'guests',guests,'startsAt',start_at,'occupancyStartsAt',start_at,'endsAt',end_at,'blockedUntil',blocked_until,'turnaroundMinutes',turnaround,'status','RESERVED','rateSnapshot',rate,'units',units,'quotedAmountMinor',price,'taxInclusive',true,'createdAt',coalesce(current_data->'createdAt',to_jsonb(now())),'updatedAt',now(),'actorId',auth.uid());
 return servos_v2.put_record('roomReservations',key,next_data);
end$$;

revoke all on function servos_v2.apply_rooms(jsonb) from public,anon,authenticated;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_room_stay_policy;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation'='roomStay.settings' or command->>'operation' like 'roomReservation.%' or command->>'operation' like 'ratePlan.%' then return servos_v2.apply_rooms(command);end if;
 return servos_v2.dispatch_before_room_stay_policy(command);
end$$;
revoke all on function servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;