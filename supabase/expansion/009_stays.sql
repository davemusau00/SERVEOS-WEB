begin;
create function servos_v2.vacate_room(command jsonb,room_key text) returns jsonb language plpgsql set search_path='' as $$
declare room_data jsonb;until_at timestamptz;affected jsonb;changes jsonb;
begin
 room_data:=servos_v2.read_record('rooms',room_key);
 changes:=servos_v2.put_record('rooms',room_key,room_data||jsonb_build_object('housekeepingState','DIRTY','housekeepingAt',now()));
 until_at:=now()+make_interval(mins=>(room_data->>'turnaroundMinutes')::integer);
 if until_at>now() then
  select coalesce(jsonb_agg(r.id),'[]') into affected from servos_v2.records r where r.collection='roomReservations' and r.data->>'roomId'=room_key and r.data->>'status'='RESERVED' and tstzrange((r.data->>'startsAt')::timestamptz,(r.data->>'blockedUntil')::timestamptz,'[)')&&tstzrange(now(),until_at,'[)');
  changes:=changes||servos_v2.put_record('roomBlocks','turnaround-'||(command->>'id'),jsonb_build_object('roomId',room_key,'startsAt',now(),'endsAt',until_at,'reason','Turnaround after guest departure','sourceType','TURNAROUND','sourceCommandId',command->>'id','status','ACTIVE','affectedReservationIds',affected));
 end if;
 return changes;
end$$;
create function servos_v2.apply_stays(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';key text:=servos_v2.required_text(p,'id');device_key uuid:=(command->>'deviceId')::uuid;
 booking jsonb;room_data jsonb;stay jsonb;folio jsonb;changes jsonb:='[]';period integer;destination jsonb;destination_key text;until_at timestamptz;event_data jsonb;
 rate jsonb;units integer;amount bigint;new_end timestamptz;nested_command jsonb;baselines jsonb;folio_version bigint;extension_key text:='extension-'||(command->>'id');
begin
 perform servos_v2.require_permission('rooms.operate');
 booking:=servos_v2.read_record('roomReservations',key);room_data:=servos_v2.read_record('rooms',booking->>'roomId');
 perform servos_v2.assert_version(command,'roomReservations',key);perform servos_v2.assert_version(command,'stays',key);perform servos_v2.assert_version(command,'folios',key);perform servos_v2.assert_version(command,'rooms',booking->>'roomId');
 perform servos_v2.assert_ownership('ROOM',booking->>'roomId',device_key,coalesce(booking->>'occupancyStartsAt',booking->>'startsAt')::timestamptz,(booking->>'blockedUntil')::timestamptz);
 perform servos_v2.assert_ownership('FOLIO',key,device_key);
 if op='stay.checkIn' then
  if booking->>'status'<>'RESERVED' or now()<(booking->>'startsAt')::timestamptz or now()>=(booking->>'endsAt')::timestamptz then raise exception 'INVALID_STATE: check-in requires reserved current arrival interval';end if;
  if room_data->>'housekeepingState'<>'CLEAN' or room_data->>'maintenanceState'<>'AVAILABLE' then raise exception 'ROOM_UNAVAILABLE: room must be clean and available';end if;
  if exists(select 1 from servos_v2.records r where r.collection='stays' and r.data->>'roomId'=booking->>'roomId' and r.data->>'status'='CHECKED_IN') then raise exception 'ROOM_UNAVAILABLE: prior occupant has not checked out';end if;
  if exists(select 1 from servos_v2.records where collection='stays' and id=key) then raise exception 'DUPLICATE_REFERENCE: stay already exists';end if;
  perform servos_v2.room_available(booking->>'roomId',(booking->>'startsAt')::timestamptz,(booking->>'blockedUntil')::timestamptz,device_key,key);
  select r.data into folio from servos_v2.records r where r.collection='folios' and r.id=key;
  if folio is null then changes:=servos_v2.open_folio(command,key);
  elsif folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: closed folio';end if;
  changes:=changes||servos_v2.put_record('stays',key,jsonb_build_object('reservationId',key,'folioId',key,'roomId',booking->>'roomId','customerId',booking->>'customerId','status','CHECKED_IN','checkedInAt',now(),'checkedInBy',auth.uid()));
  changes:=changes||servos_v2.put_record('roomReservations',key,booking||jsonb_build_object('status','CHECKED_IN'));
  changes:=changes||servos_v2.post_accommodation(command,key);
  event_data:=jsonb_build_object('operation',op,'roomId',booking->>'roomId');
 elsif op='stay.move' then
  stay:=servos_v2.read_record('stays',key);folio:=servos_v2.read_record('folios',key);
  if stay->>'status'<>'CHECKED_IN' or booking->>'status'<>'CHECKED_IN' or folio->>'status'<>'OPEN' or (booking->>'endsAt')::timestamptz<=now() then raise exception 'INVALID_STATE: move requires active unexpired stay';end if;
  destination_key:=servos_v2.required_text(p,'roomId');perform servos_v2.required_text(p,'reason');
  if destination_key=booking->>'roomId' then raise exception 'VALIDATION_FAILED: destination must differ';end if;
  destination:=servos_v2.read_record('rooms',destination_key);perform servos_v2.assert_version(command,'rooms',destination_key);
  if destination->>'housekeepingState'<>'CLEAN' or (destination->>'capacity')::integer<(booking->>'guests')::integer then raise exception 'ROOM_UNAVAILABLE: destination not clean or too small';end if;
  if exists(select 1 from servos_v2.records r where r.collection='stays' and r.data->>'roomId'=destination_key and r.data->>'status'='CHECKED_IN') then raise exception 'ROOM_UNAVAILABLE: destination occupied';end if;
  until_at:=(booking->>'endsAt')::timestamptz+make_interval(mins=>(destination->>'turnaroundMinutes')::integer);
  perform servos_v2.room_available(destination_key,now(),until_at,device_key,key);
  changes:=servos_v2.vacate_room(command,booking->>'roomId');
  changes:=changes||servos_v2.put_record('stays',key,stay||jsonb_build_object('roomId',destination_key));
  changes:=changes||servos_v2.put_record('roomReservations',key,booking||jsonb_build_object('roomId',destination_key,'occupancyStartsAt',now(),'blockedUntil',until_at,'turnaroundMinutes',(destination->>'turnaroundMinutes')::integer));
  event_data:=jsonb_build_object('operation',op,'fromRoomId',booking->>'roomId','toRoomId',destination_key,'reason',p->>'reason','previousOccupancyStartsAt',coalesce(booking->'occupancyStartsAt',booking->'startsAt'),'previousOccupancyEndsAt',now());
 elsif op='stay.extend' then
  perform servos_v2.require_permission('folio.manage');perform servos_v2.require_permission('payment.record');
  stay:=servos_v2.read_record('stays',key);folio:=servos_v2.read_record('folios',key);
  if stay->>'status'<>'CHECKED_IN' or booking->>'status'<>'CHECKED_IN' or folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: extension requires active stay';end if;
  rate:=servos_v2.read_record('ratePlans',servos_v2.required_text(p,'ratePlanId'));perform servos_v2.assert_version(command,'ratePlans',p->>'ratePlanId');
  if rate->>'roomTypeId' is distinct from room_data->>'roomTypeId' or rate->>'currency' is distinct from 'KES' then raise exception 'VALIDATION_FAILED: extension rate room type/currency';end if;
  units:=(p->>'units')::integer;if units is null or units not between 1 and 366 then raise exception 'VALIDATION_FAILED: extension units';end if;
  if rate->>'mode'='NIGHTLY' then new_end:=(booking->>'endsAt')::timestamptz+make_interval(days=>units);
  elsif rate->>'mode'='DAY_USE' then new_end:=(booking->>'endsAt')::timestamptz+make_interval(mins=>units*(rate->>'durationMinutes')::integer);
  else raise exception 'VALIDATION_FAILED: extension mode';end if;
  if new_end<=now() or new_end-(booking->>'startsAt')::timestamptz>interval '366 days' then raise exception 'VALIDATION_FAILED: extension interval';end if;
  until_at:=new_end+make_interval(mins=>(room_data->>'turnaroundMinutes')::integer);
  perform servos_v2.room_available(booking->>'roomId',(booking->>'endsAt')::timestamptz,until_at,device_key,key);
  amount:=servos_v2.minor(rate,'priceMinor')*units;
  if amount<=0 or servos_v2.minor(p->'payment','amountMinor')<>amount then raise exception 'VALIDATION_FAILED: extension must be paid at exact quoted price';end if;
  changes:=servos_v2.folio_charge(command,key,extension_key,amount,(rate->>'taxBasisPoints')::integer,'ACCOMMODATION_REVENUE',jsonb_build_object('sourceType','EXTENSION','rateSnapshot',rate,'units',units,'description','Paid stay extension'));
  -- The outer command already checked the client baseline. The nested payment
  -- sees this transaction's newly posted charge, not a stale client folio version.
  select version into folio_version from servos_v2.records where collection='folios' and id=key;
  select jsonb_agg(case when v->>'collection'='folios' and v->>'id'=key then v||jsonb_build_object('version',folio_version) else v end) into baselines from jsonb_array_elements(command->'expectedVersions') v;
  nested_command:=command||jsonb_build_object('operation','folio.pay','expectedVersions',baselines,'payload',p->'payment'||jsonb_build_object('id',key));
  changes:=changes||servos_v2.apply_folios(nested_command);
  changes:=changes||servos_v2.put_record('stayExtensions',extension_key,jsonb_build_object('stayId',key,'roomId',booking->>'roomId','startsAt',booking->'endsAt','endsAt',new_end,'rateSnapshot',rate,'units',units,'amountMinor',amount,'paymentId','folio-payment-'||(command->>'id'),'sourceCommandId',command->>'id','recordedAt',now(),'actorId',auth.uid()));
  changes:=changes||servos_v2.put_record('roomReservations',key,booking||jsonb_build_object('endsAt',new_end,'blockedUntil',until_at,'extensionAmountMinor',coalesce((booking->>'extensionAmountMinor')::bigint,0)+amount));
  event_data:=jsonb_build_object('operation',op,'roomId',booking->>'roomId','previousEndsAt',booking->'endsAt','endsAt',new_end,'extensionId',extension_key);
 elsif op='stay.checkOut' then
  stay:=servos_v2.read_record('stays',key);folio:=servos_v2.read_record('folios',key);
  if stay->>'status'<>'CHECKED_IN' or booking->>'status'<>'CHECKED_IN' or folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: stay is not open';end if;
  for period in 0..(booking->>'units')::integer-1 loop
   if not exists(select 1 from servos_v2.records where collection='folioEntries' and id='accommodation-'||md5(key||':'||period)) then raise exception 'SETTLEMENT_REQUIRED: post all booked accommodation periods before checkout';end if;
  end loop;
  if (folio->>'balanceMinor')::bigint<>0 or (folio->>'depositMinor')::bigint<>0 then raise exception 'SETTLEMENT_REQUIRED: settle balance and apply/refund remaining deposit';end if;
  changes:=servos_v2.put_record('stays',key,stay||jsonb_build_object('status','CHECKED_OUT','checkedOutAt',now(),'checkedOutBy',auth.uid()));
  changes:=changes||servos_v2.put_record('roomReservations',key,booking||jsonb_build_object('status','CHECKED_OUT'));
  changes:=changes||servos_v2.put_record('folios',key,folio||jsonb_build_object('status','CLOSED','closedAt',now(),'closedBy',auth.uid()));
  changes:=changes||servos_v2.vacate_room(command,booking->>'roomId');
  event_data:=jsonb_build_object('operation',op,'roomId',booking->>'roomId');
 else raise exception 'PROTOCOL_UNSUPPORTED: stay operation';end if;
 return changes||servos_v2.put_record('stayEvents','stay-'||(command->>'id'),event_data||jsonb_build_object('stayId',key,'actorId',auth.uid(),'occurredAt',now(),'sourceCommandId',command->>'id'));
end$$;
create or replace function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation' in ('record.save','record.archive','record.reactivate') then return servos_v2.apply_master(command);end if;
 if command->>'operation' like 'asset.%' or command->>'operation' like 'maintenance.%' then return servos_v2.apply_assets(command);end if;
 if command->>'operation' like 'folio.%' then return servos_v2.apply_folios(command);end if;
 if command->>'operation' like 'stay.%' then return servos_v2.apply_stays(command);end if;
 if command->>'operation' like 'room.%' or command->>'operation' like 'ratePlan.%' or command->>'operation' like 'roomReservation.%' then return servos_v2.apply_rooms(command);end if;
 raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;
commit;
