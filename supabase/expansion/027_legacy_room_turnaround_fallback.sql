begin;

-- Older reservation snapshots may predate blockedUntil. Treat their persisted
-- departure as the occupied-until boundary instead of an unbounded range.
create or replace function servos_v2.room_available(
 room_key text,
 start_at timestamptz,
 end_at timestamptz,
 device_key uuid,
 excluding text default null
) returns void language plpgsql set search_path='' as $$
declare room_data jsonb;
begin
 room_data:=servos_v2.read_record('rooms',room_key);
 if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at then raise exception 'VALIDATION_FAILED: room interval';end if;
 if room_data->>'maintenanceState'<>'AVAILABLE' then raise exception 'ROOM_UNAVAILABLE: room out of order';end if;
 perform servos_v2.assert_ownership('ROOM',room_key,device_key,start_at,end_at);
 if exists(
  select 1 from servos_v2.records r
  where r.collection='roomReservations' and r.id is distinct from excluding and not r.archived
   and r.data->>'roomId'=room_key and r.data->>'status' in ('RESERVED','CHECKED_IN')
   and tstzrange(
    coalesce(r.data->>'occupancyStartsAt',r.data->>'startsAt')::timestamptz,
    coalesce(r.data->>'blockedUntil',r.data->>'endsAt')::timestamptz,
    '[)'
   )&&tstzrange(start_at,end_at,'[)')
 ) then raise exception 'ROOM_UNAVAILABLE: reservation overlap';end if;
 if exists(
  select 1 from servos_v2.records r
  where r.collection='roomBlocks' and not r.archived and r.data->>'roomId'=room_key and r.data->>'status'='ACTIVE'
   and tstzrange((r.data->>'startsAt')::timestamptz,(r.data->>'endsAt')::timestamptz,'[)')&&tstzrange(start_at,end_at,'[)')
 ) then raise exception 'ROOM_UNAVAILABLE: availability block';end if;
end$$;

commit;
