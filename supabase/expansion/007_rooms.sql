begin;
create function servos_v2.room_available(room_key text,start_at timestamptz,end_at timestamptz,device_key uuid,excluding text default null) returns void language plpgsql set search_path='' as $$
declare room_data jsonb;
begin
 room_data:=servos_v2.read_record('rooms',room_key);
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at then raise exception 'VALIDATION_FAILED: room interval';end if;
 if room_data->>'maintenanceState'<>'AVAILABLE' then raise exception 'ROOM_UNAVAILABLE: room out of order';end if;
 perform servos_v2.assert_ownership('ROOM',room_key,device_key,start_at,end_at);
 if exists(select 1 from servos_v2.records r where r.collection='roomReservations' and r.id is distinct from excluding and not r.archived and r.data->>'roomId'=room_key and r.data->>'status' in ('RESERVED','CHECKED_IN') and tstzrange(coalesce(r.data->>'occupancyStartsAt',r.data->>'startsAt')::timestamptz,(r.data->>'blockedUntil')::timestamptz,'[)')&&tstzrange(start_at,end_at,'[)')) then raise exception 'ROOM_UNAVAILABLE: reservation overlap';end if;
 if exists(select 1 from servos_v2.records r where r.collection='roomBlocks' and not r.archived and r.data->>'roomId'=room_key and r.data->>'status'='ACTIVE' and tstzrange((r.data->>'startsAt')::timestamptz,(r.data->>'endsAt')::timestamptz,'[)')&&tstzrange(start_at,end_at,'[)')) then raise exception 'ROOM_UNAVAILABLE: availability block';end if;
end$$;

create function servos_v2.apply_rooms(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';key text:=servos_v2.required_text(p,'id');details jsonb:=p->'data';device_key uuid:=(command->>'deviceId')::uuid;
 current_data jsonb;next_data jsonb;room_data jsonb;rate jsonb;kind_data jsonb;start_at timestamptz;end_at timestamptz;blocked_until timestamptz;turnaround integer;guests integer;units integer;price bigint;tax_bps integer;field text;room_key text;target text;
begin
 if op like 'room.%' or op like 'ratePlan.%' then
  perform servos_v2.require_permission('rooms.manage');
  target:=case when op like 'ratePlan.%' then 'ratePlans' when op in ('room.block','room.unblock') then 'roomBlocks' else 'rooms' end;
  if target='rooms' then perform servos_v2.assert_ownership('ROOM',key,device_key);end if;
  perform servos_v2.assert_version(command,target,key);
  select r.data into current_data from servos_v2.records r where r.collection=target and r.id=key;
  if op in ('room.save','ratePlan.save') then
   if exists(select 1 from servos_v2.records where collection=target and id=key and archived) then raise exception 'INVALID_STATE: reactivate before editing';end if;
   if jsonb_typeof(details) is distinct from 'object' then raise exception 'VALIDATION_FAILED: details required';end if;
   kind_data:=servos_v2.read_record('roomTypes',servos_v2.required_text(details,'roomTypeId'));
   if op='room.save' then
    perform servos_v2.required_text(details,'number');
    if exists(select 1 from servos_v2.records r where r.collection='rooms' and r.id<>key and lower(trim(r.data->>'number'))=lower(trim(details->>'number'))) then raise exception 'DUPLICATE_REFERENCE: room number';end if;
    guests:=(details->>'capacity')::integer;turnaround:=(details->>'turnaroundMinutes')::integer;
    if guests is null or guests not between 1 and (kind_data->>'maxGuests')::integer or turnaround is null or turnaround not between 0 and 1440 then raise exception 'VALIDATION_FAILED: capacity or turnaround';end if;
    if current_data is not null and (current_data->>'roomTypeId' is distinct from details->>'roomTypeId' or current_data->>'capacity' is distinct from details->>'capacity' or current_data->>'turnaroundMinutes' is distinct from details->>'turnaroundMinutes') and (exists(select 1 from servos_v2.records r where r.collection='roomReservations' and r.data->>'roomId'=key and r.data->>'status' in ('RESERVED','CHECKED_IN')) or exists(select 1 from servos_v2.allocations where kind='ROOM' and resource_id=key and state<>'RETURNED')) then raise exception 'INVALID_STATE: resolve active reservations and allocations before changing room constraints';end if;
    next_data:=coalesce(current_data,jsonb_build_object('housekeepingState','CLEAN','maintenanceState','AVAILABLE','createdAt',now()));
    for field in select jsonb_object_keys(details) loop
     if field not in ('number','roomTypeId','capacity','turnaroundMinutes','floor','amenities','notes') then raise exception 'VALIDATION_FAILED: room field %',field;end if;
     next_data:=jsonb_set(next_data,array[field],details->field);
    end loop;
    next_data:=next_data||jsonb_build_object('number',trim(details->>'number'));
   else
    perform servos_v2.required_text(details,'name');price:=servos_v2.minor(details,'priceMinor');
    tax_bps:=(details->>'taxBasisPoints')::integer;
    if tax_bps is null or tax_bps not between 0 and 10000 or details->>'currency' is distinct from 'KES' then raise exception 'VALIDATION_FAILED: rate currency/tax';end if;
    if coalesce(details->>'mode','') not in ('NIGHTLY','DAY_USE') then raise exception 'VALIDATION_FAILED: rate mode';end if;
    if details->>'mode'='DAY_USE' and (coalesce((details->>'durationMinutes')::integer,0) not between 1 and 1440) then raise exception 'VALIDATION_FAILED: day-use duration';end if;
    for field in select jsonb_object_keys(details) loop
     if field not in ('name','roomTypeId','mode','priceMinor','currency','taxBasisPoints','durationMinutes','notes') then raise exception 'VALIDATION_FAILED: rate field %',field;end if;
    end loop;
    next_data:=details||jsonb_build_object('name',trim(details->>'name'),'updatedAt',now());
   end if;
  elsif op in ('room.archive','room.reactivate','ratePlan.archive','ratePlan.reactivate') then
   if current_data is null then raise exception 'VALIDATION_FAILED: master missing';end if;
   if op in ('room.archive','ratePlan.archive') and exists(select 1 from servos_v2.records r where r.collection='roomReservations' and r.data->>'status' in ('RESERVED','CHECKED_IN') and (r.data->>'roomId'=key or r.data->>'ratePlanId'=key)) then raise exception 'INVALID_STATE: active reservations';end if;
   if op='room.archive' and exists(select 1 from servos_v2.records r where not r.archived and ((r.collection='assets' and r.data->>'roomId'=key) or (r.collection='roomBlocks' and r.data->>'roomId'=key and r.data->>'status'='ACTIVE' and (r.data->>'endsAt')::timestamptz>now()) or (r.collection='maintenanceOrders' and r.data->>'roomId'=key and r.data->>'status' not in ('COMPLETED','CANCELLED')))) then raise exception 'INVALID_STATE: active room references';end if;
   return servos_v2.put_record(target,key,current_data,op in ('room.archive','ratePlan.archive'));
  elsif op='room.housekeeping' then
   current_data:=servos_v2.read_record('rooms',key);
   if not ((current_data->>'housekeepingState'='DIRTY' and p->>'state'='CLEANING') or (current_data->>'housekeepingState'='CLEANING' and p->>'state'='INSPECTION') or (current_data->>'housekeepingState'='INSPECTION' and p->>'state' in ('CLEAN','DIRTY')) or (current_data->>'housekeepingState'='CLEAN' and p->>'state'='DIRTY')) then raise exception 'INVALID_STATE: housekeeping transition';end if;
   next_data:=current_data||jsonb_build_object('housekeepingState',p->>'state','housekeepingAt',now(),'housekeepingBy',auth.uid());
  elsif op='room.block' then
   if current_data is not null then raise exception 'DUPLICATE_REFERENCE: room block';end if;
   room_key:=servos_v2.required_text(p,'roomId');start_at:=(p->>'startsAt')::timestamptz;end_at:=(p->>'endsAt')::timestamptz;
   perform servos_v2.room_available(room_key,start_at,end_at,device_key);
   if nullif(p->>'maintenanceOrderId','') is not null then
    kind_data:=servos_v2.read_record('maintenanceOrders',p->>'maintenanceOrderId');
    if kind_data->>'roomId' is distinct from room_key or kind_data->>'status' in ('COMPLETED','CANCELLED') then raise exception 'VALIDATION_FAILED: maintenance room/status';end if;
   end if;
   next_data:=jsonb_build_object('roomId',room_key,'startsAt',start_at,'endsAt',end_at,'reason',servos_v2.required_text(p,'reason'),'maintenanceOrderId',p->'maintenanceOrderId','status','ACTIVE','createdAt',now());
  elsif op='room.unblock' then
   current_data:=servos_v2.read_record('roomBlocks',key);
   if current_data->>'status'<>'ACTIVE' then raise exception 'INVALID_STATE: block already released';end if;
   perform servos_v2.assert_ownership('ROOM',current_data->>'roomId',device_key,(current_data->>'startsAt')::timestamptz,(current_data->>'endsAt')::timestamptz);
   if nullif(current_data->>'maintenanceOrderId','') is not null and servos_v2.read_record('maintenanceOrders',current_data->>'maintenanceOrderId')->>'status' not in ('COMPLETED','CANCELLED') then raise exception 'INVALID_STATE: resolve maintenance before inspection/release';end if;
   next_data:=current_data||jsonb_build_object('status','RELEASED','releasedAt',now(),'inspection',servos_v2.required_text(p,'inspection'),'releasedBy',auth.uid());
  else raise exception 'PROTOCOL_UNSUPPORTED: room master operation';end if;
  return servos_v2.put_record(target,key,next_data);
 end if;

 if op not like 'roomReservation.%' then raise exception 'PROTOCOL_UNSUPPORTED: stay/folio operations awaiting financial integration';end if;
 perform servos_v2.require_permission('rooms.operate');perform servos_v2.assert_version(command,'roomReservations',key);
 select r.data into current_data from servos_v2.records r where r.collection='roomReservations' and r.id=key;
 if op in ('roomReservation.create','roomReservation.update') then
  if op='roomReservation.create' and current_data is not null then raise exception 'DUPLICATE_REFERENCE: reservation';end if;
  if op='roomReservation.update' and (current_data is null or current_data->>'status'<>'RESERVED') then raise exception 'INVALID_STATE: only reserved bookings can be edited';end if;
  if op='roomReservation.update' and current_data->>'customerId' is distinct from p->>'customerId' and exists(select 1 from servos_v2.records where collection='folios' and id=key) then raise exception 'INVALID_STATE: opened folio customer cannot be replaced';end if;
  room_key:=servos_v2.required_text(p,'roomId');room_data:=servos_v2.read_record('rooms',room_key);
  rate:=servos_v2.read_record('ratePlans',servos_v2.required_text(p,'ratePlanId'));
  if rate->>'roomTypeId' is distinct from room_data->>'roomTypeId' then raise exception 'VALIDATION_FAILED: rate does not match room type';end if;
  perform servos_v2.read_record('customers',servos_v2.required_text(p,'customerId'));
  guests:=(p->>'guests')::integer;if guests is null or guests not between 1 and (room_data->>'capacity')::integer then raise exception 'VALIDATION_FAILED: guest capacity';end if;
  start_at:=(p->>'startsAt')::timestamptz;end_at:=(p->>'endsAt')::timestamptz;
  if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at or end_at-start_at>interval '366 days' then raise exception 'VALIDATION_FAILED: stay interval';end if;
  if rate->>'mode'='DAY_USE' then
   if end_at-start_at<>make_interval(mins=>(rate->>'durationMinutes')::integer) then raise exception 'VALIDATION_FAILED: day-use duration must match rate';end if;units:=1;
  else
   units:=(end_at at time zone 'Africa/Nairobi')::date-(start_at at time zone 'Africa/Nairobi')::date;
   if units not between 1 and 366 then raise exception 'VALIDATION_FAILED: nightly dates';end if;
  end if;
  turnaround:=(room_data->>'turnaroundMinutes')::integer;blocked_until:=end_at+make_interval(mins=>turnaround);
  perform servos_v2.room_available(room_key,start_at,blocked_until,device_key,key);
  -- Moving a reservation also requires authority over the previously occupied interval.
  if current_data is not null then perform servos_v2.assert_ownership('ROOM',current_data->>'roomId',device_key,(current_data->>'startsAt')::timestamptz,(current_data->>'blockedUntil')::timestamptz);end if;
  price:=servos_v2.minor(rate,'priceMinor')*units;
  next_data:=jsonb_build_object('roomId',room_key,'ratePlanId',p->>'ratePlanId','customerId',p->>'customerId','guests',guests,'startsAt',start_at,'endsAt',end_at,'blockedUntil',blocked_until,'turnaroundMinutes',turnaround,'status','RESERVED','rateSnapshot',rate,'units',units,'quotedAmountMinor',price,'taxInclusive',true,'createdAt',coalesce(current_data->'createdAt',to_jsonb(now())),'updatedAt',now(),'actorId',auth.uid());
 elsif op in ('roomReservation.cancel','roomReservation.noShow') then
  current_data:=servos_v2.read_record('roomReservations',key);
  if current_data->>'status'<>'RESERVED' then raise exception 'INVALID_STATE: reservation is not reserved';end if;
  if exists(select 1 from servos_v2.records r where r.collection='folios' and r.id=key and ((r.data->>'balanceMinor')::bigint<>0 or (r.data->>'depositMinor')::bigint<>0)) then raise exception 'SETTLEMENT_REQUIRED: resolve reservation folio funds before cancellation/no-show';end if;
  if op='roomReservation.noShow' and now()<(current_data->>'startsAt')::timestamptz then raise exception 'INVALID_STATE: arrival time has not passed';end if;
  perform servos_v2.assert_ownership('ROOM',current_data->>'roomId',device_key,(current_data->>'startsAt')::timestamptz,(current_data->>'blockedUntil')::timestamptz);
  next_data:=current_data||jsonb_build_object('status',case op when 'roomReservation.cancel' then 'CANCELLED' else 'NO_SHOW' end,'reason',servos_v2.required_text(p,'reason'),'closedAt',now(),'closedBy',auth.uid());
 else raise exception 'PROTOCOL_UNSUPPORTED: reservation operation';end if;
 return servos_v2.put_record('roomReservations',key,next_data);
end$$;
revoke all on function servos_v2.room_available(text,timestamptz,timestamptz,uuid,text),servos_v2.apply_rooms(jsonb) from public,anon,authenticated;
commit;
