-- Disposable PostgreSQL acceptance only. Never run against a business project.
--
-- SQLite -> servos_v2 cutover bootstrap. A blind insert into servos_v2.records is
-- not enough: the cutover must be gated, replayable, allowlisted, provenance
-- stamped, and verified against independently recomputed control totals.
begin;

insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by)
values('00000000-0000-4000-8000-000000000001','cutover-admin','Cutover Admin','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
on conflict(auth_user_id) do update set role='Admin',active=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

-- The fixed allowlist excludes the three legacy collections that have no
-- canonical v2 read path, and includes the core business collections.
do $$
declare
  bad integer := 0;
begin
  if servos_v2.cutover_collection_allowed('property') then bad := bad + 1; end if;
  if servos_v2.cutover_collection_allowed('inventoryReceipts') then bad := bad + 1; end if;
  if servos_v2.cutover_collection_allowed('maintenanceEvents') then bad := bad + 1; end if;
  if servos_v2.cutover_collection_allowed('secrets') then bad := bad + 1; end if;
  if bad > 0 then
    raise exception 'the cutover allowlist must exclude unsupported collections';
  end if;
  if not servos_v2.cutover_collection_allowed('customers') then
    raise exception 'the cutover allowlist must include core business collections';
  end if;
  if not servos_v2.cutover_collection_allowed('stockItems') then
    raise exception 'the cutover allowlist must include core business collections';
  end if;
end$$;

-- Import must be refused outside the maintenance window.
do $$
declare
  refused boolean := false;
begin
  begin
    perform public.servos_v2_begin_cutover(jsonb_build_object(
      'terminalId','10000000-0000-4000-8000-000000000001',
      'manifestHash',repeat('a',64),'sqliteSchemaVersion',15,'recordCount',0,
      'collections','[]'::jsonb,'totals','{}'::jsonb));
  exception when others then
    refused := sqlerrm like '%CUTOVER_PREP%';
  end;
  if not refused then
    raise exception 'cutover import must be refused outside CUTOVER_PREP';
  end if;
end$$;

-- Enter CUTOVER_PREP: legacy writes frozen, v2 execute still closed.
do $$
declare
  refused boolean := false;
begin
  perform public.servos_v2_set_authority_mode('CUTOVER_PREP','Freeze legacy writes for SQLite bootstrap');
  if servos_v2.authority() <> 'CUTOVER_PREP' then
    raise exception 'CUTOVER_PREP was not entered';
  end if;
  begin
    perform public.servos_upload('10000000-0000-4000-8000-000000000009','fixture-device-token','[]'::jsonb);
  exception when others then
    refused := sqlerrm like '%frozen during cutover preparation%';
  end;
  if not refused then
    raise exception 'CUTOVER_PREP must freeze the legacy writer';
  end if;
  begin
    perform public.servos_v2_execute(jsonb_build_object(
      'id',gen_random_uuid(),'schemaVersion',2,
      'deviceId','10000000-0000-4000-8000-000000000001','actorId',auth.uid(),
      'clientSequence',1,'operation','record.save',
      'payload',jsonb_build_object('collection','customers','id','prep-write',
        'data',jsonb_build_object('name','Prep Write')),
      'expectedVersions','[]'::jsonb));
  exception when others then
    refused := sqlerrm like '%PROTOCOL_DISABLED%';
  end;
  if not refused then
    raise exception 'CUTOVER_PREP must still refuse v2 business writes';
  end if;
end$$;

-- A malformed manifest is refused, and creates no cutover row.
do $$
declare
  refused boolean := false;
  created integer := 0;
begin
  begin
    perform public.servos_v2_begin_cutover(jsonb_build_object(
      'terminalId','10000000-0000-4000-8000-000000000001',
      'manifestHash','short','collections','[]'::jsonb));
  exception when others then
    refused := sqlerrm like '%SHA-256%';
  end;
  if not refused then
    raise exception 'a malformed manifest hash must be refused';
  end if;

  refused := false;
  begin
    perform public.servos_v2_begin_cutover(jsonb_build_object(
      'terminalId','not-a-uuid','manifestHash',repeat('b',64),'collections','[]'::jsonb));
  exception when others then
    refused := sqlerrm like '%terminal id%';
  end;
  if not refused then
    raise exception 'an invalid source terminal must be refused';
  end if;

  select count(*) into created from servos_v2.cutovers;
  if created <> 0 then
    raise exception 'a refused manifest must not create a cutover';
  end if;
end$$;

-- Begin the real cutover. The manifest totals describe exactly what the pages
-- below import, so verification can reach READY and the comparison really runs.
do $$
declare
  cut uuid;
  manifest jsonb;
  stock_data jsonb:=jsonb_build_object('id','cola','name','Cola','currentStock',jsonb_build_object('main',24,'bar',6));
  payment_data jsonb:=jsonb_build_object('id','pay-1','tenderType','CASH','amountMinor',5000);
begin
  manifest:=jsonb_build_object(
    'terminalId','10000000-0000-4000-8000-000000000001',
    'manifestHash',repeat('c',64),'sqliteSchemaVersion',15,'recordCount',2,
    'collections',jsonb_build_array(
      jsonb_build_object('collection','stockItems','activeCount',1,'archivedCount',0,'records',jsonb_build_array(
        jsonb_build_object('id','cola','version',1,'archived',false,'hash',servos_v2.cutover_record_hash('stockItems','cola',1,stock_data)))),
      jsonb_build_object('collection','payments','activeCount',1,'archivedCount',0,'records',jsonb_build_array(
        jsonb_build_object('id','pay-1','version',3,'archived',false,'hash',servos_v2.cutover_record_hash('payments','pay-1',3,payment_data))))),
    'totals',jsonb_build_object('paymentByTender',jsonb_build_object('CASH',5000),
      'stockQuantity',30,'stockMovements',0,'tillCount',0,
      'openTillCashMinor',0,'closedTillCashMinor',0,'creditOutstandingMinor',0,
      'payableOutstandingMinor',0,'receiptTotalMinor',0,'orderTotalMinor',0));
  manifest:=manifest||jsonb_build_object('manifestHash',encode(extensions.digest(convert_to(servos_v2.cutover_canonical_json(manifest-'manifestHash'),'UTF8'),'sha256'),'hex'));
  perform public.servos_v2_begin_cutover(manifest);
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;
  if cut is null then
    raise exception 'cutover was not created';
  end if;

  -- An ineligible collection is refused outright.
  begin
    perform public.servos_v2_import_cutover_page(cut,0,'property',
      jsonb_build_object('afterId','','records','[]'::jsonb));
    raise exception 'an ineligible collection must be refused';
  exception when others then
    if sqlerrm not like '%not eligible for cutover import%' then
      raise;
    end if;
  end;
end$$;

-- Page import, idempotent replay, conflict refusal, provenance and secrets.
do $$
declare
  cut uuid;
  result jsonb;
  stored integer := 0;
  provenance text;
  refused boolean := false;
begin
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;

  -- Missing records can carry zero financial totals; totals alone cannot prove completion.
  result:=public.servos_v2_verify_cutover(cut);
  if (result->>'verified')::boolean or (result->>'missingRecords')::int<>2 then
    raise exception 'incomplete import must not verify: %',result;
  end if;

  begin
    perform public.servos_v2_import_cutover_page(cut,10,'customers',jsonb_build_object('afterId','','records',
      jsonb_build_array(jsonb_build_object('id','unmanifested','version',1,'data',jsonb_build_object('name','Unmanifested')))));
    raise exception 'unmanifested record was accepted';
  exception when others then
    if sqlerrm not like '%MANIFEST_MISMATCH%' then raise;end if;
  end;
  if exists(select 1 from servos_v2.records where id='unmanifested') then raise exception 'rejected page was not atomic';end if;

  result := public.servos_v2_import_cutover_page(cut,0,'stockItems',
    jsonb_build_object('afterId','','records',jsonb_build_array(
      jsonb_build_object('id','cola','version',1,'archived',false,
        'data',jsonb_build_object('id','cola','name','Cola',
          'currentStock',jsonb_build_object('main',24,'bar',6))))));
  if (result->>'imported')::int <> 1 then
    raise exception 'stock page did not import';
  end if;

  -- Replaying the identical page is a proven no-op, not a duplicate insert.
  result := public.servos_v2_import_cutover_page(cut,0,'stockItems',
    jsonb_build_object('afterId','','records',jsonb_build_array(
      jsonb_build_object('id','cola','version',1,'archived',false,
        'data',jsonb_build_object('id','cola','name','Cola',
          'currentStock',jsonb_build_object('main',24,'bar',6))))));
  if (result->>'replayed')::boolean is not true then
    raise exception 'identical page replay must be idempotent';
  end if;
  select count(*) into stored from servos_v2.records where collection='stockItems';
  if stored <> 1 then
    raise exception 'page replay duplicated records';
  end if;

  -- A different page under the same index is refused.
  refused := false;
  begin
    perform public.servos_v2_import_cutover_page(cut,0,'stockItems',
      jsonb_build_object('afterId','','records',jsonb_build_array(
        jsonb_build_object('id','different','version',1,'archived',false,
          'data',jsonb_build_object('name','Different')))));
  exception when others then
    refused := sqlerrm like '%REPLAY_MISMATCH%';
  end;
  if not refused then
    raise exception 'a conflicting page replay must be refused';
  end if;

  -- Immutable history keeps provenance and is never a new transaction.
  perform public.servos_v2_import_cutover_page(cut,1,'payments',
    jsonb_build_object('afterId','','records',jsonb_build_array(
      jsonb_build_object('id','pay-1','version',3,'archived',false,
        'data',jsonb_build_object('id','pay-1','tenderType','CASH','amountMinor',5000)))));
  select data->>'source' into provenance
    from servos_v2.records where collection='payments' and id='pay-1';
  if provenance is distinct from 'LEGACY_SQLITE_CUTOVER' then
    raise exception 'imported history must carry cutover provenance, got %',coalesce(provenance,'<null>');
  end if;
  if not servos_v2.cutover_collection_is_history('payments') then
    raise exception 'history classification is wrong';
  end if;
  if servos_v2.cutover_collection_is_history('customers') then
    raise exception 'history classification is wrong';
  end if;

  -- Credential fields may not enter shared business records.
  refused := false;
  begin
    perform public.servos_v2_import_cutover_page(cut,2,'customers',
      jsonb_build_object('afterId','','records',jsonb_build_array(
        jsonb_build_object('id','leaky','version',1,'archived',false,
          'data',jsonb_build_object('name','Leaky','pinHash','leaked')))));
  exception when others then
    refused := sqlerrm like '%credential field%';
  end;
  if not refused then
    raise exception 'a credential field must be refused on import';
  end if;

  -- Commit is refused until verification has passed.
  refused := false;
  begin
    perform public.servos_v2_commit_cutover(cut,false);
  exception when others then
    refused := sqlerrm like '%must be READY%';
  end;
  if not refused then
    raise exception 'commit before verification must be refused';
  end if;
end$$;

-- Verification recomputes totals server side and reaches READY.
do $$
declare
  cut uuid;
  result jsonb;
  state text;
  refused boolean := false;
begin
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;
  result := public.servos_v2_verify_cutover(cut);
  if (result->>'verified')::boolean is not true then
    raise exception 'verification failed: %',result->'differences';
  end if;
  if result->>'verificationHash' is null or length(result->>'verificationHash') < 64 then
    raise exception 'verification evidence must carry a SHA-256 hash';
  end if;
  select status into state from servos_v2.cutovers where id=cut;
  if state is distinct from 'READY' then
    raise exception 'cutover should be READY, got %',state;
  end if;

  -- A cutover without confirmed backup evidence cannot commit.
  refused := false;
  begin
    perform public.servos_v2_commit_cutover(cut,false);
  exception when others then
    refused := sqlerrm like '%backup must be confirmed%';
  end;
  if not refused then
    raise exception 'commit without backup evidence must be refused';
  end if;

  -- Evidence is immutable.
  refused := false;
  begin
    update servos_v2.cutover_pages set record_count=999 where cutover_id=cut;
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'page evidence must be immutable';
  end if;

  refused := false;
  begin
    delete from servos_v2.cutover_evidence where cutover_id=cut;
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'cutover evidence must not be deletable';
  end if;

  -- Abort stays available and is itself recorded.
  perform public.servos_v2_abort_cutover(cut,'Rehearsal rollback');
  select status into state from servos_v2.cutovers where id=cut;
  if state is distinct from 'ABORTED' then
    raise exception 'cutover should be ABORTED, got %',state;
  end if;

  refused := false;
  begin
    perform public.servos_v2_abort_cutover(cut,'');
  exception when others then
    refused := sqlerrm like '%abort reason is required%';
  end;
  if not refused then
    raise exception 'an abort reason must be required';
  end if;
end$$;

rollback;
