-- Disposable database only; dates are deliberately fixed for deterministic overlap checks.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Rooms desktop','DESKTOP');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000002','Rooms web','WEB');
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';
 select servos_v2.put_record('roomTypes','double','{"name":"Double","maxGuests":2}');
 select servos_v2.put_record('property','property','{"name":"Property","roomStayRoomTypeId":"double","roomStayRatePlanId":"night","nightlyCheckoutTime":"10:00","dayStayCutoffTime":"18:00"}');
select servos_v2.put_record('customers','guest','{"name":"Guest"}');
create function pg_temp.room_command(op text,p jsonb,expected_status text default 'SYNCHRONIZED',expected_code text default null,device_key uuid default '10000000-0000-4000-8000-000000000001') returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;target text;begin
 target:=case when op like 'roomReservation.%' then 'roomReservations' when op like 'ratePlan.%' then 'ratePlans' when op in ('room.block','room.unblock') then 'roomBlocks' else 'rooms' end;
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 if not exists(select 1 from servos_v2.records where collection=target and id=p->>'id') then versions:=versions||jsonb_build_array(jsonb_build_object('collection',target,'id',p->>'id','version',0));end if;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId',device_key,'actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id=device_key),'operation',op,'payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status or (expected_code is not null and r->'error'->>'code' is distinct from expected_code) then raise exception 'Unexpected % result: %',op,r;end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Room replay result changed';end if;
 return r;
end$$;
select pg_temp.room_command('room.save','{"id":"101","data":{"number":"101","roomTypeId":"double","capacity":2,"turnaroundMinutes":30,"amenities":["WiFi"]}}');
select pg_temp.room_command('room.condition','{"id":"101","state":"OUT_OF_ORDER","reason":"Pre-service inspection"}');
do $$declare room_data jsonb;begin
 room_data:=servos_v2.read_record('rooms','101');
 if room_data->>'maintenanceState'<>'OUT_OF_ORDER' or room_data->>'housekeepingState'<>'CLEAN' then raise exception 'Room condition changed the wrong state';end if;
end$$;
select pg_temp.room_command('room.condition','{"id":"101","state":"AVAILABLE","reason":"Inspection passed"}');
select pg_temp.room_command('ratePlan.save','{"id":"night","data":{"name":"Night","roomTypeId":"double","mode":"NIGHTLY","priceMinor":500000,"currency":"KES","taxBasisPoints":1600}}');
select pg_temp.room_command('room.save','{"id":"legacy-room","data":{"number":"102","roomTypeId":"double","capacity":2,"turnaroundMinutes":30}}');
select servos_v2.put_record('roomReservations','legacy-reservation','{"roomId":"legacy-room","customerId":"guest","status":"RESERVED","startsAt":"2030-04-01T10:00:00Z","endsAt":"2030-04-02T07:00:00Z"}');
-- Pre-policy reservations without blockedUntil must occupy through departure, not forever.
select pg_temp.room_command('roomReservation.create','{"id":"legacy-overlap","roomId":"legacy-room","stayType":"NIGHTLY","customerId":"guest","guests":1,"startsAt":"2030-04-01T12:00:00Z","endsAt":"2030-04-02T07:00:00Z"}','REJECTED','ROOM_UNAVAILABLE');
 select pg_temp.room_command('roomReservation.create','{"id":"booking","roomId":"101","stayType":"NIGHTLY","customerId":"guest","guests":2,"startsAt":"2030-01-01T14:00:00+03:00","endsAt":"2030-01-03T10:00:00+03:00"}');
-- A second registered client cannot book nightly/day-use overlap or turnaround.
 select pg_temp.room_command('roomReservation.create','{"id":"overlap","roomId":"101","stayType":"DAY","customerId":"guest","guests":1,"startsAt":"2030-01-02T11:00:00+03:00","endsAt":"2030-01-02T15:00:00+03:00"}','REJECTED','ROOM_UNAVAILABLE','10000000-0000-4000-8000-000000000002');
 select pg_temp.room_command('roomReservation.create','{"id":"turnaround","roomId":"101","stayType":"DAY","customerId":"guest","guests":1,"startsAt":"2030-01-03T10:29:00+03:00","endsAt":"2030-01-03T14:29:00+03:00"}','REJECTED','ROOM_UNAVAILABLE');
 select pg_temp.room_command('roomReservation.create','{"id":"next","roomId":"101","stayType":"DAY","customerId":"guest","guests":1,"startsAt":"2030-01-03T10:30:00+03:00","endsAt":"2030-01-03T14:30:00+03:00"}');
select pg_temp.room_command('room.condition','{"id":"101","state":"OUT_OF_ORDER","reason":"Active booking must block maintenance state"}','REJECTED','INVALID_STATE');
 select pg_temp.room_command('roomReservation.create','{"id":"after-cutoff","roomId":"101","stayType":"DAY","customerId":"guest","guests":1,"startsAt":"2030-01-04T10:30:00+03:00","endsAt":"2030-01-04T18:30:00+03:00"}','REJECTED','VALIDATION_FAILED');
select pg_temp.room_command('room.archive','{"id":"101"}','REJECTED','INVALID_STATE');
select pg_temp.room_command('room.block','{"id":"collision","roomId":"101","startsAt":"2030-01-02T00:00:00Z","endsAt":"2030-01-04T00:00:00Z","reason":"Maintenance"}','REJECTED','ROOM_UNAVAILABLE');
select pg_temp.room_command('room.block','{"id":"block","roomId":"101","startsAt":"2030-02-01T00:00:00Z","endsAt":"2030-02-04T00:00:00Z","reason":"Maintenance"}');
select pg_temp.room_command('roomReservation.create','{"id":"blocked","roomId":"101","stayType":"NIGHTLY","ratePlanId":"night","customerId":"guest","guests":1,"startsAt":"2030-02-02T14:00:00+03:00","endsAt":"2030-02-03T10:00:00+03:00"}','REJECTED','ROOM_UNAVAILABLE');
select pg_temp.room_command('room.unblock','{"id":"block","inspection":"Safe after inspection"}');
-- Rate changes apply prospectively, preserving existing quoted stay snapshots.
select pg_temp.room_command('ratePlan.save','{"id":"night","data":{"name":"Night","roomTypeId":"double","mode":"NIGHTLY","priceMinor":600000,"currency":"KES","taxBasisPoints":0}}');
do $$declare booking jsonb;begin
 booking:=servos_v2.read_record('roomReservations','booking');
 if booking->>'quotedAmountMinor'<>'1000000' or booking->'rateSnapshot'->>'taxBasisPoints'<>'1600' then raise exception 'Historical rate snapshot changed';end if;
end$$;
select pg_temp.room_command('roomReservation.noShow','{"id":"booking","reason":"Too early"}','REJECTED','INVALID_STATE');
select pg_temp.room_command('roomReservation.cancel','{"id":"booking","reason":"Guest cancelled"}');
select pg_temp.room_command('roomReservation.cancel','{"id":"next","reason":"Guest cancelled"}');
select pg_temp.room_command('room.housekeeping','{"id":"101","state":"DIRTY"}');
select pg_temp.room_command('room.housekeeping','{"id":"101","state":"CLEAN"}','REJECTED','INVALID_STATE');
select pg_temp.room_command('room.housekeeping','{"id":"101","state":"CLEANING"}');
select pg_temp.room_command('room.housekeeping','{"id":"101","state":"INSPECTION"}');
select pg_temp.room_command('room.housekeeping','{"id":"101","state":"CLEAN"}');
insert into servos_v2.resources(kind,id,capacity) values('ROOM','101',1);
select servos_v2.reserve('30000000-0000-4000-8000-000000000003','ROOM','101','10000000-0000-4000-8000-000000000002',1,now()-interval '2 days',now()-interval '1 day','2030-03-01T00:00:00Z','2030-03-04T00:00:00Z');
select pg_temp.room_command('roomReservation.create','{"id":"other-allocation","roomId":"101","stayType":"NIGHTLY","ratePlanId":"night","customerId":"guest","guests":1,"startsAt":"2030-03-02T14:00:00+03:00","endsAt":"2030-03-03T10:00:00+03:00"}','REJECTED','RESOURCE_OWNED');
select pg_temp.room_command('room.archive','{"id":"101"}','REJECTED','RESOURCE_OWNED');
update servos_v2.allocations set state='RETURNED' where kind='ROOM';
select pg_temp.room_command('room.archive','{"id":"101"}');
select pg_temp.room_command('room.reactivate','{"id":"101"}');
rollback;
