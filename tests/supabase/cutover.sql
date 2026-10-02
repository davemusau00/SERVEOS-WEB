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

-- Import must be refused outside CUTOVER_PREP.
do $$declare failed boolean:=false;begin
  perform public.servos_v2_begin_cutover(jsonb_build_object('terminalId','10000000-0000-4000-8000-000000000001','manifestHash',repeat('a',64),'sqliteSchemaVersion',15,'recordCount',0,'collections','[]'::jsonb,'totals','{}'::jsonb));
  raise exception 'cutover import must be refused outside CUTOVER_PREP';
exception when others then failed:=sqlerrm like '%CUTOVER_PREP%';
  if not failed then raise exception '%',sqlerrm;end if;
end$$;

perform public.servos_v2_set_authority_mode('CUTOVER_PREP','Freeze legacy writes for SQLite bootstrap');

-- Manifest validation.
do $$declare failed boolean:=false;begin
  begin perform public.servos_v2_begin_cutover(jsonb_build_object('terminalId','10000000-0000-4000-8000-000000000001','manifestHash','short','collections','[]'::jsonb));exception when others then failed:=sqlerrm like '%SHA-256%';end;
  if not failed then raise exception 'a malformed manifest hash must be refused';end if;
  failed:=false;
  begin perform public.servos_v2_begin_cutover(jsonb_build_object('terminalId','not-a-uuid','manifestHash',repeat('b',64),'collections','[]'::jsonb));exception when others then failed:=sqlerrm like '%terminal id%';end;
  if not failed then raise exception 'an invalid source terminal must be refused';end if;
end$$;

-- Import state that the server can actually verify: stock and a payment.
perform public.servos_v2_begin_cutover(jsonb_build_object(
  'terminalId','10000000-0000-4000-8000-000000000001','manifestHash',repeat('c',64),
  'sqliteSchemaVersion',15,'recordCount',2,'collections','[]'::jsonb,
  'totals',jsonb_build_object('paymentByTender',jsonb_build_object('CASH',5000),'stockQuantity',30,'stockMovements',0,'tillCount',0,'openTillCashMinor',0,'closedTillCashMinor',0,'creditOutstandingMinor',0,'payableOutstandingMinor',0,'receiptTotalMinor',0,'orderTotalMinor',0)));

do $$declare cut uuid:=null;begin
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;
  if cut is null then raise exception 'cutover was not created';end if;

  -- Unknown collections are refused outright.
  if servos_v2.cutover_collection_allowed('property') or servos_v2.cutover_collection_allowed('inventoryReceipts')
     or servos_v2.cutover_collection_allowed('maintenanceEvents') or servos_v2.cutover_collection_allowed('secrets') then
    raise exception 'the cutover allowlist must exclude unsupported collections';
  end if;
  if not servos_v2.cutover_collection_allowed('customers') or not servos_v2.cutover_collection_allowed('stockItems') then
    raise exception 'the cutover allowlist must include core business collections';
  end if;

  perform public.servos_v2_import_cutover_page(cut,0,'property',jsonb_build_object('afterId','','records','[]'::jsonb));
  raise exception 'an ineligible collection must be refused';
exception when others then
  if sqlerrm not like '%not eligible for cutover import%' then raise;end if;
end$$;

-- Real pages: stock and a cash payment.
do $$declare cut uuid;page jsonb;result jsonb;begin
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;
  result:=public.servos_v2_import_cutover_page(cut,0,'stockItems',jsonb_build_object('afterId','','records',jsonb_build_array(
    jsonb_build_object('id','cola','version',1,'archived',false,'data',jsonb_build_object('id','cola','name','Cola','currentStock',jsonb_build_object('main',24,'bar',6))))));
  if (result->>'imported')::int<>1 then raise exception 'stock page did not import';end if;

  -- Replaying the identical page is a proven no-op, not a duplicate insert.
  result:=public.servos_v2_import_cutover_page(cut,0,'stockItems',jsonb_build_object('afterId','','records',jsonb_build_array(
    jsonb_build_object('id','cola','version',1,'archived',false,'data',jsonb_build_object('id','cola','name','Cola','currentStock',jsonb_build_object('main',24,'bar',6))))));
  if (result->>'replayed')::boolean is not true then raise exception 'identical page replay must be idempotent';end if;
  if (select count(*) from servos_v2.records where collection='stockItems')<>1 then raise exception 'page replay duplicated records';end if;

  -- A different page under the same index is refused.
  begin
    perform public.servos_v2_import_cutover_page(cut,0,'stockItems',jsonb_build_object('afterId','','records',jsonb_build_array(
      jsonb_build_object('id','different','version',1,'archived',false,'data',jsonb_build_object('name','Different')))));
    raise exception 'a conflicting page replay must be refused';
  exception when others then
    if sqlerrm not like '%REPLAY_MISMATCH%' then raise;end if;
  end if;

  -- History carries provenance and is not a new transaction.
  perform public.servos_v2_import_cutover_page(cut,1,'payments',jsonb_build_object('afterId','','records',jsonb_build_array(
    jsonb_build_object('id','pay-1','version',3,'archived',false,'data',jsonb_build_object('id','pay-1','tenderType','CASH','amountMinor',5000)))));
  if (select data->>'source' from servos_v2.records where collection='payments' and id='pay-1') is distinct from 'LEGACY_SQLITE_CUTOVER' then
    raise exception 'imported history must carry cutover provenance';
  end if;
  if not servos_v2.cutover_collection_is_history('payments') or servos_v2.cutover_collection_is_history('customers') then
    raise exception 'history classification is wrong';
  end if;

  -- Credential fields may not enter shared business records.
  begin
    perform public.servos_v2_import_cutover_page(cut,2,'customers',jsonb_build_object('afterId','','records',jsonb_build_array(
      jsonb_build_object('id','leaky','version',1,'archived',false,'data',jsonb_build_object('name','Leaky','pinHash','leaked')))));
    raise exception 'a credential field must be refused on import';
  exception when others then
    if sqlerrm not like '%credential field%' then raise;end if;
  end if;

  -- Commit is refused until verification has passed.
  begin perform public.servos_v2_commit_cutover(cut,false);raise exception 'commit before verification must be refused';exception when others then
    if sqlerrm not like '%must be READY%' then raise;end if;
  end if;
end$$;

-- Totals are recomputed server side and must match to reach READY.
do $$declare cut uuid;result jsonb;begin
  select id into cut from servos_v2.cutovers order by started_at desc limit 1;
  result:=public.servos_v2_verify_cutover(cut);
  if (result->>'verified')::boolean is not true then
    raise exception 'verification failed: %',result->'differences';
  end if;
  if result->>'verificationHash' is null or length(result->>'verificationHash')<64 then
    raise exception 'verification evidence must carry a SHA-256 hash';
  end if;
  -- A cutover without confirmed backup evidence cannot commit.
  begin perform public.servos_v2_commit_cutover(cut,false);raise exception 'commit without backup evidence must be refused';exception when others then
    if sqlerrm not like '%backup must be confirmed%' then raise;end if;
  end if;
  if (select status from servos_v2.cutovers where id=cut) is distinct from 'READY' then raise exception 'cutover should be READY';end if;
  -- Evidence is immutable.
  begin update servos_v2.cutover_pages set record_count=999 where cutover_id=cut;raise exception 'page evidence must be immutable';exception when others then
    if sqlerrm not like '%Immutable cutover evidence%' then raise;end if;
  end if;
  begin delete from servos_v2.cutover_evidence where cutover_id=cut;raise exception 'cutover evidence must not be deletable';exception when others then
    if sqlerrm not like '%Immutable cutover evidence%' then raise;end if;
  end if;
  -- Abort stays available and is itself recorded.
  perform public.servos_v2_abort_cutover(cut,'Rehearsal rollback');
  if (select status from servos_v2.cutovers where id=cut) is distinct from 'ABORTED' then raise exception 'cutover should be ABORTED';end if;
  begin perform public.servos_v2_abort_cutover(cut,'');raise exception 'an abort reason must be required';exception when others then
    if sqlerrm not like '%abort reason is required%' then raise;end if;
  end if;
end$$;

rollback;