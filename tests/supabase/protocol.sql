\set ON_ERROR_STOP on
create function pg_temp.check_that(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.rejects(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end $$;

insert into servos_private.managers values('00000000-0000-4000-8000-000000000001','owner');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.servos_enroll('Test business','00000000-0000-4000-8000-000000000010',repeat('a',64));
select public.servos_enroll('Test business','00000000-0000-4000-8000-000000000010',repeat('a',64));
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_enroll('Duplicate writer','00000000-0000-4000-8000-000000000011',repeat('b',64))$q$),'second writer denied');
reset role;
select pg_temp.check_that((select count(*)=1 from servos_private.terminal),'enrollment retry is idempotent');

set role anon;
select pg_temp.check_that(pg_temp.rejects('select * from public.business_records'),'anonymous replica read denied');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_upload('00000000-0000-4000-8000-000000000010','wrong','[]')$q$),'invalid terminal token denied');
select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),'[{"sequence":1,"commandId":"00000000-0000-4000-8000-000000000020","changes":[{"collection":"products","id":"p1","version":1,"data":{"name":"Coffee"},"archived":false}]}]');
select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),'[{"sequence":1,"commandId":"00000000-0000-4000-8000-000000000020","changes":[{"collection":"products","id":"p1","version":1,"data":{"name":"Coffee"},"archived":false}]}]');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),'[{"sequence":1,"commandId":"00000000-0000-4000-8000-000000000020","changes":[]}]')$q$),'changed replay denied');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),'[{"sequence":2,"commandId":"00000000-0000-4000-8000-000000000021","changes":[]},{"sequence":4,"commandId":"00000000-0000-4000-8000-000000000022","changes":[]}]')$q$),'sequence gap denied');
-- SERVOS_PATCH_02A_RECONCILIATION
select pg_temp.check_that(
  pg_temp.rejects($q$select public.servos_reconciliation_manifest('00000000-0000-4000-8000-000000000010','wrong',null,null,100)$q$),
  'reconciliation manifest rejects invalid terminal credentials'
);
select pg_temp.check_that(
  (public.servos_reconciliation_manifest(
    '00000000-0000-4000-8000-000000000010',
    repeat('a',64),
    null,
    null,
    100
  )->>'mode')='READ_ONLY_CLOUD_REPLICA',
  'reconciliation manifest identifies read-only cloud replica mode'
);
select pg_temp.check_that(
  jsonb_array_length(
    public.servos_reconciliation_manifest(
      '00000000-0000-4000-8000-000000000010',
      repeat('a',64),
      null,
      null,
      100
    )->'records'
  )=1,
  'reconciliation manifest returns the replicated business record'
);
select pg_temp.check_that(
  (
    public.servos_reconciliation_manifest(
      '00000000-0000-4000-8000-000000000010',
      repeat('a',64),
      null,
      null,
      100
    )->'records'->0->>'collection'
  )='products',
  'reconciliation manifest preserves collection identity'
);
select pg_temp.check_that(
  (
    public.servos_reconciliation_manifest(
      '00000000-0000-4000-8000-000000000010',
      repeat('a',64),
      null,
      null,
      100
    )->'records'->0->>'id'
  )='p1',
  'reconciliation manifest preserves record identity'
);
select pg_temp.check_that(
  (
    public.servos_reconciliation_manifest(
      '00000000-0000-4000-8000-000000000010',
      repeat('a',64),
      null,
      null,
      100
    )->'terminal'->>'lastSequence'
  )::bigint=1,
  'reconciliation manifest reports cloud operation sequence'
);
select pg_temp.check_that(
  jsonb_array_length(
    public.servos_reconciliation_manifest(
      '00000000-0000-4000-8000-000000000010',
      repeat('a',64),
      null,
      null,
      100
    )->'records'
  )=1,
  'reconciliation manifest remains read-only and returns the same replica row'
);

reset role;
select pg_temp.check_that((select last_sequence=1 from servos_private.terminal),'entire failed batch rolled back');
select pg_temp.check_that((select count(*)=1 from servos_private.operations),'replay did not duplicate operations');

set role authenticated;
select pg_temp.check_that((select count(*)=1 from public.business_records),'manager can read replica');
select pg_temp.check_that(pg_temp.rejects($q$update public.business_records set data='{}'$q$),'direct manager writes denied');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_request_change('record.save','{}',1)$q$),'missing collection is denied');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_request_change('record.save','{"collection":"products","id":"p1","data":null}',1)$q$),'null record data is denied');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_request_change('record.archive','{"collection":"products","id":"p1"}',null)$q$),'unversioned archive is denied');
select public.servos_request_change('record.save','{"collection":"products","id":"p1","data":{"name":"Tea"}}',1) as request_id \gset
reset role;
set role anon;
select pg_temp.check_that(jsonb_array_length(public.servos_poll_requests('00000000-0000-4000-8000-000000000010',repeat('a',64)))=1,'request is polled');
select pg_temp.check_that(pg_temp.rejects(format('select public.servos_ack_request(%L,repeat(''a'',64),%L,''applied'',''{}'')','00000000-0000-4000-8000-000000000010',:'request_id')),'applied acknowledgement requires upload');
select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),jsonb_build_array(jsonb_build_object('sequence',2,'commandId',:'request_id','changes','[]'::jsonb)));
select public.servos_ack_request('00000000-0000-4000-8000-000000000010',repeat('a',64),:'request_id','applied','{}');
reset role;
select pg_temp.check_that((select status='applied' from public.remote_change_requests where id=:'request_id'),'applied acknowledgement persisted');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
select pg_temp.check_that((select count(*)=0 from public.business_records),'non-manager cannot read replicas');
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_request_change('record.save','{"collection":"products","id":"p1","data":{}}',1)$q$),'non-manager cannot request changes');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.servos_request_change('record.save','{"collection":"products","id":"p1","data":{"name":"Revoked request"}}',1) as revoked_id \gset
reset role;
delete from servos_private.managers where user_id='00000000-0000-4000-8000-000000000001';
set role anon;
select pg_temp.check_that(jsonb_array_length(public.servos_poll_requests('00000000-0000-4000-8000-000000000010',repeat('a',64)))=0,'revoked author requests not delivered');
reset role;
select pg_temp.check_that((select status='rejected' from public.remote_change_requests where id=:'revoked_id'),'revoked request rejected durably');
update servos_private.terminal set active=false;
set role anon;
select pg_temp.check_that(pg_temp.rejects($q$select public.servos_upload('00000000-0000-4000-8000-000000000010',repeat('a',64),'[]')$q$),'fenced terminal cannot upload');
reset role;
select 'Protocol and policy checks passed' as result;
