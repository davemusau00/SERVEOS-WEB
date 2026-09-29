-- Disposable PostgreSQL acceptance. No real guest, money or provider traffic.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Folio desktop','DESKTOP');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000002','Folio web','WEB');
update servos_v2.control set enabled=true;
select servos_v2.put_record('rooms','room','{"number":"1","capacity":2,"turnaroundMinutes":30,"housekeepingState":"CLEAN","maintenanceState":"AVAILABLE"}');
select servos_v2.put_record('rooms','day-room','{"number":"2","capacity":2,"turnaroundMinutes":30,"housekeepingState":"DIRTY","maintenanceState":"AVAILABLE"}');
select servos_v2.put_record('roomReservations','stay',jsonb_build_object('roomId','room','customerId','guest','guests',1,'startsAt',now()-interval '1 hour','endsAt',now()+interval '47 hours','blockedUntil',now()+interval '47 hours 30 minutes','status','RESERVED','units',2,'rateSnapshot',jsonb_build_object('mode','NIGHTLY','priceMinor',11600,'taxBasisPoints',1600,'currency','KES')));
select servos_v2.put_record('roomReservations','day',jsonb_build_object('roomId','day-room','customerId','guest','guests',1,'startsAt',now()-interval '1 hour','endsAt',now()+interval '3 hours','blockedUntil',now()+interval '3 hours 30 minutes','status','RESERVED','units',1,'rateSnapshot',jsonb_build_object('mode','DAY_USE','durationMinutes',240,'priceMinor',5800,'taxBasisPoints',1600,'currency','KES')));
select servos_v2.put_record('hotelServices','laundry','{"name":"Laundry","priceMinor":1160,"taxBasisPoints":1600,"currency":"KES"}');
select servos_v2.put_record('paymentAccounts','cash','{"name":"Cash till","method":"CASH"}');
select servos_v2.put_record('paymentAccounts','mpesa','{"name":"Manual M-Pesa","method":"MPESA"}');
create function pg_temp.folio_command(op text,p jsonb,expected_status text default 'SYNCHRONIZED',expected_code text default null) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;target text;begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 foreach target in array array['folios','stays'] loop
  if not exists(select 1 from servos_v2.records where collection=target and id=p->>'id') then versions:=versions||jsonb_build_array(jsonb_build_object('collection',target,'id',p->>'id','version',0));end if;
 end loop;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000001'),'operation',op,'payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status or (expected_code is not null and r->'error'->>'code' is distinct from expected_code) then raise exception 'Unexpected % result: %',op,r;end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Folio response-loss replay changed result';end if;
 return r;
end$$;
select pg_temp.folio_command('folio.open','{"id":"stay"}');
select pg_temp.folio_command('folio.deposit','{"id":"stay","amountMinor":5000,"accountId":"cash","cashTenderedMinor":10000}');
do $$begin
 if (servos_v2.read_record('folios','stay')->>'balanceMinor')::bigint<>0 or (servos_v2.read_record('folios','stay')->>'depositMinor')::bigint<>5000 then raise exception 'Deposit recognized as revenue/receivable';end if;
 if not exists(select 1 from servos_v2.records where collection='payments' and data->>'changeMinor'='5000') then raise exception 'Cash change missing';end if;
end$$;
select pg_temp.folio_command('roomReservation.cancel','{"id":"stay","reason":"Cannot discard deposit"}','REJECTED','SETTLEMENT_REQUIRED');
select pg_temp.folio_command('stay.checkIn','{"id":"stay"}');
select pg_temp.folio_command('stay.checkIn','{"id":"stay"}','REJECTED','INVALID_STATE');
select pg_temp.folio_command('folio.postAccommodation','{"id":"stay"}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"stay"}');
do $$begin
 if (servos_v2.read_record('folios','stay')->>'balanceMinor')::bigint<>11600 then raise exception 'Accommodation duplicate or missing first period';end if;
 if (select count(*) from servos_v2.records where collection='folioEntries' and data->>'sourceType'='ACCOMMODATION')<>1 then raise exception 'Duplicate period after catch-up';end if;
 if not exists(select 1 from servos_v2.records where collection='folioEntries' and data->>'sourceType'='ACCOMMODATION' and data->>'netMinor'='10000' and data->>'taxMinor'='1600') then raise exception 'Tax split wrong';end if;
end$$;
select pg_temp.folio_command('stay.checkOut','{"id":"stay"}','REJECTED','SETTLEMENT_REQUIRED');
select pg_temp.folio_command('folio.applyDeposit','{"id":"stay","amountMinor":5001}','REJECTED','VALIDATION_FAILED');
select pg_temp.folio_command('folio.applyDeposit','{"id":"stay","amountMinor":5000}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"stay","settleBookedStay":true}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"stay","settleBookedStay":true}');
select pg_temp.folio_command('stay.checkOut','{"id":"stay"}','REJECTED','SETTLEMENT_REQUIRED');
insert into servos_v2.resources(kind,id,capacity) values('FOLIO','stay',1);
select servos_v2.reserve('30000000-0000-4000-8000-000000000009','FOLIO','stay','10000000-0000-4000-8000-000000000002',1,now()-interval '2 days',now()-interval '1 day');
select pg_temp.folio_command('folio.postService','{"id":"stay","serviceId":"laundry","quantity":1}','REJECTED','RESOURCE_OWNED');
update servos_v2.allocations set state='RETURNED' where kind='FOLIO';
select pg_temp.folio_command('folio.postService','{"id":"stay","serviceId":"laundry","quantity":1}');
do $$declare entry_key text;begin
 select id into entry_key from servos_v2.records where collection='folioEntries' and data->>'sourceType'='SERVICE';
 perform pg_temp.folio_command('folio.reverse',jsonb_build_object('id','stay','entryId',entry_key,'reason','Service cancelled'));
 perform pg_temp.folio_command('folio.reverse',jsonb_build_object('id','stay','entryId',entry_key,'reason','Duplicate'),'REJECTED','DUPLICATE_REFERENCE');
end$$;
select pg_temp.folio_command('folio.pay','{"id":"stay","amountMinor":1000,"accountId":"mpesa","reference":"ABC123"}','REJECTED','VALIDATION_FAILED');
select pg_temp.folio_command('folio.pay','{"id":"stay","amountMinor":1000,"accountId":"mpesa","reference":" ABC123 ","manuallyConfirmed":true}');
select pg_temp.folio_command('folio.open','{"id":"day"}');
select pg_temp.folio_command('folio.deposit','{"id":"day","amountMinor":1000,"accountId":"mpesa","reference":"abc123","manuallyConfirmed":true}','REJECTED','DUPLICATE_REFERENCE');
select pg_temp.folio_command('folio.pay','{"id":"stay","amountMinor":17201,"accountId":"cash","cashTenderedMinor":20000}','REJECTED','VALIDATION_FAILED');
select pg_temp.folio_command('folio.pay','{"id":"stay","amountMinor":17200,"accountId":"cash","cashTenderedMinor":20000}');
select pg_temp.folio_command('stay.checkOut','{"id":"stay"}');
select pg_temp.folio_command('stay.checkOut','{"id":"stay"}','REJECTED','INVALID_STATE');
select pg_temp.folio_command('folio.postAccommodation','{"id":"stay"}','REJECTED','INVALID_STATE');
select pg_temp.folio_command('stay.checkIn','{"id":"day"}','REJECTED','ROOM_UNAVAILABLE');
select servos_v2.put_record('rooms','day-room',servos_v2.read_record('rooms','day-room')||'{"housekeepingState":"CLEAN"}');
select pg_temp.folio_command('stay.checkIn','{"id":"day"}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"day"}');
select servos_v2.put_record('rooms','move-room','{"number":"3","roomTypeId":"double","capacity":2,"turnaroundMinutes":45,"housekeepingState":"CLEAN","maintenanceState":"AVAILABLE"}');
select pg_temp.folio_command('stay.move','{"id":"day","roomId":"day-room","reason":"Same room"}','REJECTED','VALIDATION_FAILED');
select pg_temp.folio_command('stay.move','{"id":"day","roomId":"move-room","reason":"Guest requested another room"}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"day"}');
select servos_v2.put_record('ratePlans','extension-rate','{"name":"Two-hour extension","roomTypeId":"double","mode":"DAY_USE","durationMinutes":120,"priceMinor":2900,"taxBasisPoints":1600,"currency":"KES"}');
select pg_temp.folio_command('stay.extend','{"id":"day","ratePlanId":"extension-rate","units":1,"payment":{"amountMinor":1,"accountId":"cash","cashTenderedMinor":3000}}','REJECTED','VALIDATION_FAILED');
do $$declare before_data jsonb;before_entries bigint;begin
 before_data:=servos_v2.read_record('roomReservations','day');select count(*) into before_entries from servos_v2.records where collection='folioEntries';
 perform pg_temp.folio_command('stay.extend','{"id":"day","ratePlanId":"extension-rate","units":1,"payment":{"amountMinor":2900,"accountId":"mpesa","reference":"ABC123","manuallyConfirmed":true}}','REJECTED','DUPLICATE_REFERENCE');
 if servos_v2.read_record('roomReservations','day')<>before_data or (select count(*) from servos_v2.records where collection='folioEntries')<>before_entries or (servos_v2.read_record('folios','day')->>'balanceMinor')::bigint<>5800 then raise exception 'Rejected extension leaked charge or changed departure';end if;
end$$;
select pg_temp.folio_command('stay.extend','{"id":"day","ratePlanId":"extension-rate","units":1,"payment":{"amountMinor":2900,"accountId":"cash","cashTenderedMinor":3000}}');
select pg_temp.folio_command('folio.postAccommodation','{"id":"day","settleBookedStay":true}');
select pg_temp.folio_command('stay.checkOut','{"id":"day"}','REJECTED','SETTLEMENT_REQUIRED');
do $$declare debit bigint;credit bigint;net_revenue bigint;tax bigint;receivable bigint;deposit bigint;begin
 if servos_v2.read_record('rooms','room')->>'housekeepingState'<>'DIRTY' or servos_v2.read_record('folios','stay')->>'status'<>'CLOSED' then raise exception 'Checkout did not close and dirty room';end if;
 if (servos_v2.read_record('folios','day')->>'balanceMinor')::bigint<>5800 then raise exception 'Day-use charged more than once';end if;
 if servos_v2.read_record('rooms','day-room')->>'housekeepingState'<>'DIRTY' or servos_v2.read_record('stays','day')->>'roomId'<>'move-room' then raise exception 'Move did not change occupancy and dirty old room';end if;
 if not exists(select 1 from servos_v2.records where collection='roomBlocks' and data->>'roomId'='day-room' and data->>'sourceType'='TURNAROUND') then raise exception 'Move lost turnaround';end if;
 if not exists(select 1 from servos_v2.records where collection='stayEvents' and data->>'operation'='stay.move' and data->>'fromRoomId'='day-room' and data->>'toRoomId'='move-room') then raise exception 'Move history missing';end if;
 select sum((line->>'debitMinor')::bigint),sum((line->>'creditMinor')::bigint) into debit,credit from servos_v2.records r cross join lateral jsonb_array_elements(r.data->'lines') line where r.collection='journalEntries';
 if debit<>credit then raise exception 'Unbalanced financial effects';end if;
 select sum(case when line->>'accountCode' in ('ACCOMMODATION_REVENUE','SERVICE_REVENUE') then (line->>'creditMinor')::bigint-(line->>'debitMinor')::bigint else 0 end),sum(case when line->>'accountCode'='TAX_PAYABLE' then (line->>'creditMinor')::bigint-(line->>'debitMinor')::bigint else 0 end),sum(case when line->>'accountCode'='GUEST_RECEIVABLE' then (line->>'debitMinor')::bigint-(line->>'creditMinor')::bigint else 0 end),sum(case when line->>'accountCode'='GUEST_DEPOSITS' then (line->>'creditMinor')::bigint-(line->>'debitMinor')::bigint else 0 end)
 into net_revenue,tax,receivable,deposit from servos_v2.records r cross join lateral jsonb_array_elements(r.data->'lines') line where r.collection='journalEntries';
 if net_revenue<>27500 or tax<>4400 or receivable<>5800 or deposit<>0 then raise exception 'Revenue/tax/receivable/deposit conservation failed: %, %, %, %',net_revenue,tax,receivable,deposit;end if;
 if (select count(*) from servos_v2.records where collection='stayExtensions')<>1 then raise exception 'Extension duplicated or missing';end if;
 if (servos_v2.read_record('roomReservations','day')->>'extensionAmountMinor')::bigint<>2900 or (servos_v2.read_record('roomReservations','day')->>'endsAt')::timestamptz<>now()+interval '5 hours' then raise exception 'Extension quote/interval incorrect';end if;
 if exists(select 1 from servos_v2.records where collection='payments' and data->>'method'='MPESA' and data->>'confirmation'<>'MANUALLY_CONFIRMED') then raise exception 'Fabricated provider confirmation';end if;
 begin update servos_v2.records set data='{}' where collection='folioEntries';raise exception 'Folio history mutable';exception when others then if sqlerrm not like '%Immutable business history%' then raise;end if;end;
 begin update servos_v2.records set data='{}' where collection='stayEvents';raise exception 'Stay history mutable';exception when others then if sqlerrm not like '%Immutable business history%' then raise;end if;end;
end$$;
update servos_v2.members set permissions=array['records.view','folio.manage'] where user_id=auth.uid();
select pg_temp.folio_command('folio.pay','{"id":"day","amountMinor":5800,"accountId":"cash","cashTenderedMinor":5800}','REJECTED','PERMISSION_DENIED');
do $$declare entry_key text;begin
 select id into entry_key from servos_v2.records where collection='folioEntries' and data->>'folioId'='day' and data->>'kind'='CHARGE';
 perform pg_temp.folio_command('folio.reverse',jsonb_build_object('id','day','entryId',entry_key,'reason','No reversal permission'),'REJECTED','PERMISSION_DENIED');
end$$;
rollback;
