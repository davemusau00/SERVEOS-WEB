-- STAGED V2 ONLY. SQLite -> servos_v2 cutover bootstrap.
--
-- The terminal SQLite database is the current source of truth. This migration
-- provides a reviewed boundary for seeding servos_v2 from it, without routing
-- the data through the legacy uploader.
--
-- Design rules enforced below:
--   * Import is only permitted in CUTOVER_PREP, so it can never race live v2
--     traffic or silently overwrite an operating business.
--   * Page replay is idempotent and each page hash is immutable.
--   * Collections come from a fixed allowlist, never from caller input alone.
--   * The actor is auth.uid(); there is no client-controlled elevation and no
--     client-controlled server cursor.
--   * Immutable business history is imported with provenance and never
--     recreated as newly transacted activity.
--   * Financial and stock control totals must verify before a cutover commits.
begin;

create table if not exists servos_v2.cutovers(
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null,
  source_terminal_id uuid not null,
  source_manifest_hash text not null check(length(source_manifest_hash)=64),
  source_schema_version bigint not null check(source_schema_version>=0),
  started_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  record_count bigint not null default 0 check(record_count>=0),
  status text not null default 'PREPARING'
    check(status in ('PREPARING','IMPORTING','VERIFYING','READY','COMMITTED','ABORTED')),
  completed_at timestamptz,
  verification_hash text,
  source_manifest jsonb
);
create index if not exists cutovers_business on servos_v2.cutovers(business_id,started_at desc);

-- One row per imported page. The page hash is immutable evidence that a replayed
-- page is byte-identical to the page first accepted.
create table if not exists servos_v2.cutover_pages(
  cutover_id uuid not null references servos_v2.cutovers(id) on delete cascade,
  page_index integer not null check(page_index>=0),
  collection text not null,
  after_id text not null,
  record_count integer not null check(record_count between 0 and 500),
  page_hash text not null check(length(page_hash)=64),
  imported_at timestamptz not null default now(),
  primary key(cutover_id,page_index)
);

-- Immutable verification evidence.
create table if not exists servos_v2.cutover_evidence(
  id uuid primary key default extensions.gen_random_uuid(),
  cutover_id uuid not null references servos_v2.cutovers(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);

-- Page and evidence rows are append-only: a retry may reuse a key with identical
-- content, but nothing may be rewritten afterwards.
create or replace function servos_v2.cutover_evidence_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Immutable cutover evidence'; end$$;
drop trigger if exists cutover_pages_immutable on servos_v2.cutover_pages;
create trigger cutover_pages_immutable before update or delete on servos_v2.cutover_pages
  for each row execute function servos_v2.cutover_evidence_immutable();
drop trigger if exists cutover_evidence_immutable on servos_v2.cutover_evidence;
create trigger cutover_evidence_immutable before update or delete on servos_v2.cutover_evidence
  for each row execute function servos_v2.cutover_evidence_immutable();

-- Collections the cutover may import. This mirrors the terminal allowlist. The
-- three excluded legacy collections have no canonical v2 read path.
create or replace function servos_v2.cutover_collection_allowed(collection_name text)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  return collection_name in (
    'organization','outlets','products','stockItems','stockLocations','stockMovements',
    'customers','suppliers','employees','assetCategories','assets','assetAcquisitions',
    'assetEvents','roomTypes','ratePlans','rooms','roomBlocks','roomReservations',
    'stays','stayEvents','stayExtensions','folios','folioEntries','tables','orders',
    'tillSessions','payments','refunds','receiptDocuments','mpesaReceipts',
    'journalEntries','purchaseOrders','goodsReceipts','supplierPayables',
    'maintenanceOrders','tillPolicy','hotelServices');
end$$;
revoke all on function servos_v2.cutover_collection_allowed(text) from public,anon,authenticated;

-- Immutable business history: imported with provenance, never re-transacted.
create or replace function servos_v2.cutover_collection_is_history(collection_name text)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  return collection_name in (
    'payments','refunds','receiptDocuments','journalEntries','stockMovements',
    'folioEntries','stayEvents','stayExtensions','assetEvents');
end$$;
revoke all on function servos_v2.cutover_collection_is_history(text) from public,anon,authenticated;

-- Recompute the control totals from what actually landed in servos_v2, so
-- verification compares two independently computed numbers rather than echoing
-- the client back to itself.
create or replace function servos_v2.cutover_server_totals()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenders jsonb;result jsonb;
begin
  select coalesce(jsonb_object_agg(tender,amount),'{}'::jsonb) into tenders from (
    select upper(regexp_replace(coalesce(data->>'tenderType','UNKNOWN'),'[-_ ]','','g')) as tender,
           sum(coalesce((data->>'amountMinor')::bigint,0)) as amount
    from servos_v2.records where collection='payments' and not archived
    group by 1 order by 1) t;
  select jsonb_build_object(
    'recordCount',(select count(*) from servos_v2.records where not archived),
    'paymentByTender',tenders,
    'stockQuantity',coalesce((select sum(round(q::numeric)) from servos_v2.records r
      cross join lateral jsonb_each_text(case when jsonb_typeof(r.data->'currentStock')='object' then r.data->'currentStock' else '{}'::jsonb end) l(k,v)
      cross join lateral (select nullif(regexp_replace(l.v,'[^0-9.\-]','','g'),'')::numeric as q) parsed
      where r.collection='stockItems' and not r.archived and parsed.q is not null),0),
    'stockMovements',(select count(*) from servos_v2.records where collection='stockMovements' and not archived),
    'tillCount',(select count(*) from servos_v2.records where collection='tillSessions' and not archived),
    'openTillCashMinor',coalesce((select sum(coalesce((data->>'expectedCashInDrawer')::bigint,0)) from servos_v2.records where collection='tillSessions' and not archived and data->>'status'='OPEN'),0),
    'closedTillCashMinor',coalesce((select sum(coalesce((data->>'expectedCashInDrawer')::bigint,0)) from servos_v2.records where collection='tillSessions' and not archived and coalesce(data->>'status','')<>'OPEN'),0),
    'creditEntries',(select count(*) from servos_v2.records where collection='customerCreditEntries' and not archived),
    'creditOutstandingMinor',coalesce((select sum(coalesce((data->>'amountMinor')::bigint,0)) from servos_v2.records where collection='customerCreditEntries' and not archived),0),
    'payableOutstandingMinor',coalesce((select sum(greatest(coalesce((data->>'outstandingMinor')::bigint,0),0)) from servos_v2.records where collection='supplierPayables' and not archived),0),
    'receiptTotalMinor',coalesce((select sum(coalesce((data->>'totalMinor')::bigint,0)) from servos_v2.records where collection='receiptDocuments' and not archived),0),
    'orderTotalMinor',coalesce((select sum(greatest(coalesce((data->>'totalMinor')::bigint,0),0)) from servos_v2.records where collection='orders' and not archived),0)
  ) into result;
  return result;
end$$;
revoke all on function servos_v2.cutover_server_totals() from public,anon,authenticated;

-- Shared precondition: an Admin acting on this business, in CUTOVER_PREP.
create or replace function servos_v2.cutover_precheck()
returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid;
begin
  who:=auth.uid();
  if who is null then raise exception 'PERMISSION_DENIED: authentication required' using errcode='42501'; end if;
  if not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=who and s.active and s.role='Admin') then
    raise exception 'PERMISSION_DENIED: Admin staff profile required' using errcode='42501';
  end if;
  if servos_v2.authority()<>'CUTOVER_PREP' then
    raise exception 'VALIDATION_FAILED: cutover import requires CUTOVER_PREP authority (current mode: %)',servos_v2.authority();
  end if;
  return who;
end$$;
revoke all on function servos_v2.cutover_precheck() from public,anon,authenticated;

-- Begin a cutover. Re-running with the same terminal and manifest hash returns
-- the existing cutover rather than starting a competing one.
create or replace function public.servos_v2_begin_cutover(manifest jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck();state servos_v2.control;terminal uuid;existing servos_v2.cutovers;
begin
  select * into state from servos_v2.control where singleton for update;
  terminal:=nullif(manifest->>'terminalId','')::uuid;
  if terminal is null then raise exception 'VALIDATION_FAILED: source terminal id';end if;
  if manifest->>'manifestHash' is null or length(manifest->>'manifestHash')<>64 then
    raise exception 'VALIDATION_FAILED: manifest hash must be a SHA-256 digest';
  end if;
  if jsonb_typeof(manifest->'collections') is distinct from 'array' then raise exception 'VALIDATION_FAILED: manifest collections';end if;
  if (manifest->>'recordCount')::bigint<0 then raise exception 'VALIDATION_FAILED: record count';end if;

  select * into existing from servos_v2.cutovers c
   where c.business_id=state.business_id and c.source_terminal_id=terminal
     and c.source_manifest_hash=manifest->>'manifestHash' and c.status<>'ABORTED'
   order by c.started_at desc limit 1;
  if found then
    return jsonb_build_object('cutoverId',existing.id,'status',existing.status,'replayed',true);
  end if;

  insert into servos_v2.cutovers(business_id,source_terminal_id,source_manifest_hash,source_schema_version,
    started_by,record_count,status,source_manifest)
  values(state.business_id,terminal,manifest->>'manifestHash',coalesce((manifest->>'sqliteSchemaVersion')::bigint,0),
    who,coalesce((manifest->>'recordCount')::bigint,0),'IMPORTING',manifest)
  returning * into existing;

  insert into servos_v2.cutover_evidence(cutover_id,kind,payload,recorded_by)
  values(existing.id,'MANIFEST_RECORDED',jsonb_build_object('manifestHash',manifest->>'manifestHash','recordCount',manifest->>'recordCount','totals',manifest->'totals'),who);
  update servos_v2.cutovers set status='IMPORTING' where id=existing.id;
  return jsonb_build_object('cutoverId',existing.id,'status','IMPORTING','replayed',false,'expectedRecordCount',existing.record_count);
end$$;
revoke all on function public.servos_v2_begin_cutover(jsonb) from public,anon;
grant execute on function public.servos_v2_begin_cutover(jsonb) to authenticated;

-- Import one page. Replaying a page with identical content is a no-op; replaying
-- it with different content is refused, so a corrupted retry cannot half-apply.
create or replace function public.servos_v2_import_cutover_page(cutover_id uuid,page_index integer,collection_name text,page jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck();cut servos_v2.cutovers;existing_hash text;computed text;
        imported integer:=0;replayed boolean:=false;record jsonb;record_id text;record_version bigint;
        record_data jsonb;is_history boolean;conflicts text[]:='{}';
begin
  if page_index is null or page_index<0 then raise exception 'VALIDATION_FAILED: page index';end if;
  if not servos_v2.cutover_collection_allowed(collection_name) then
    raise exception 'VALIDATION_FAILED: collection % is not eligible for cutover import',collection_name;
  end if;
  if jsonb_typeof(page->'records') is distinct from 'array' then raise exception 'VALIDATION_FAILED: page records';end if;
  if jsonb_array_length(page->'records')>500 then raise exception 'VALIDATION_FAILED: page size';end if;
  if page->>'afterId' is null then raise exception 'VALIDATION_FAILED: page cursor';end if;

  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  if cut.status not in ('IMPORTING','VERIFYING') then raise exception 'VALIDATION_FAILED: cutover is %',cut.status;end if;

  -- The page hash is derived from the content the client claims to have sent, so
  -- a retry is provably the same page rather than a similar one.
  computed:=encode(extensions.digest(convert_to(
    collection_name||'|'||coalesce(page->>'afterId','')||'|'||(page->'records')::text,'UTF8'),'sha256'),'hex');
  if page->>'pageHash' is not null and page->>'pageHash'<>computed then
    raise exception 'REPLAY_MISMATCH: page hash does not match page content';
  end if;

  select p.page_hash into existing_hash from servos_v2.cutover_pages p
   where p.cutover_id=cutover_id and p.page_index=page_index;
  if existing_hash is not null then
    if existing_hash<>computed then
      raise exception 'REPLAY_MISMATCH: page % was already imported with different content',page_index;
    end if;
    return jsonb_build_object('cutoverId',cutover_id,'pageIndex',page_index,'imported',0,'replayed',true,'recordCount',jsonb_array_length(page->'records'));
  end if;

  is_history:=servos_v2.cutover_collection_is_history(collection_name);
  for record in select value from jsonb_array_elements(page->'records') loop
    record_id:=record->>'id';
    record_data:=record->'data';
    record_version:=coalesce((record->>'version')::bigint,1);
    if record_id is null or length(record_id) not between 1 and 128 then raise exception 'VALIDATION_FAILED: record id';end if;
    if jsonb_typeof(record_data) is distinct from 'object' then raise exception 'VALIDATION_FAILED: record data';end if;
    if record_version<1 then raise exception 'VALIDATION_FAILED: record version';end if;
    -- No client-controlled credential fields may enter shared business records.
    if exists(select 1 from jsonb_object_keys(record_data) k where lower(k) in
       ('pinhash','device_token','devicetoken','device_secret','devicesecret','cloud_key','cloudkey','publishablekey','refresh_token','refreshtoken','access_token','accesstoken')) then
      raise exception 'VALIDATION_FAILED: credential field in imported record %',record_id;
    end if;

    if exists(select 1 from servos_v2.records r where r.collection=collection_name and r.id=record_id) then
      -- Duplicate or conflicting ids are refused rather than silently overwritten.
      conflicts:=array_append(conflicts,record_id);
      continue;
    end if;

    -- Imported history carries explicit provenance and is never a new transaction.
    if is_history then
      record_data:=record_data
        || jsonb_build_object('source','LEGACY_SQLITE_CUTOVER','sourceCutoverId',cutover_id::text,'sourceVersion',record_version);
    end if;
    insert into servos_v2.records(collection,id,version,data,archived)
      values(collection_name,record_id,record_version,record_data,coalesce((record->>'archived')::boolean,false));
    imported:=imported+1;
  end loop;

  if array_length(conflicts,1)>0 then
    raise exception 'DUPLICATE_CONFLICT: cutover would overwrite existing % record(s) in %',array_length(conflicts,1),collection_name;
  end if;

  insert into servos_v2.cutover_pages(cutover_id,page_index,collection,after_id,record_count,page_hash)
    values(cutover_id,page_index,collection_name,page->>'afterId',jsonb_array_length(page->'records'),computed);

  return jsonb_build_object('cutoverId',cutover_id,'pageIndex',page_index,'imported',imported,
    'replayed',replayed,'recordCount',jsonb_array_length(page->'records'),'afterId',page->>'afterId');
end$$;
revoke all on function public.servos_v2_import_cutover_page(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.servos_v2_import_cutover_page(uuid,integer,text,jsonb) to authenticated;

-- Verify. Control totals are recomputed server side and compared against the
-- manifest the terminal published. Any difference is reported, not tolerated.
create or replace function public.servos_v2_verify_cutover(cutover_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck();cut servos_v2.cutovers;client_totals jsonb;server_totals jsonb;
        key text;differences text[]:='{}';imported bigint;verification text;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  if cut.status not in ('IMPORTING','VERIFYING','READY') then raise exception 'VALIDATION_FAILED: cutover is %',cut.status;end if;

  client_totals:=coalesce(cut.source_manifest->'totals','{}'::jsonb);
  server_totals:=servos_v2.cutover_server_totals();
  imported:=(select count(*) from servos_v2.records where not archived);

  -- Financial and stock control totals must agree before anything may commit.
  foreach key in array array['paymentByTender','stockQuantity','stockMovements','tillCount',
      'openTillCashMinor','closedTillCashMinor','creditOutstandingMinor','payableOutstandingMinor',
      'receiptTotalMinor','orderTotalMinor'] loop
    if coalesce((client_totals->>key)::numeric,-1) is distinct from coalesce((server_totals->>key)::numeric,-1) then
      differences:=array_append(differences,format('%s: manifest %s, server %s',key,client_totals->>key,server_totals->>key));
    end if;
  end loop;

  verification:=encode(extensions.digest(convert_to(server_totals::text,'UTF8'),'sha256'),'hex');
  insert into servos_v2.cutover_evidence(cutover_id,kind,payload,recorded_by)
    values(cutover_id,'VERIFICATION',jsonb_build_object('clientTotals',client_totals,'serverTotals',server_totals,
      'importedRecordCount',imported,'differences',to_jsonb(differences),'verificationHash',verification),who);

  if array_length(differences,1)>0 then
    update servos_v2.cutovers set status='VERIFYING' where id=cutover_id;
    return jsonb_build_object('cutoverId',cutover_id,'status','VERIFYING','verified',false,
      'differences',to_jsonb(differences),'clientTotals',client_totals,'serverTotals',server_totals);
  end if;

  update servos_v2.cutovers set status='READY',verification_hash=verification where id=cutover_id;
  return jsonb_build_object('cutoverId',cutover_id,'status','READY','verified',true,'differences','[]',
    'verificationHash',verification,'importedRecordCount',imported,'serverTotals',server_totals);
end$$;
revoke all on function public.servos_v2_verify_cutover(uuid) from public,anon;
grant execute on function public.servos_v2_verify_cutover(uuid) to authenticated;

-- Commit a verified cutover. Refused unless verification passed and the caller
-- confirms a local backup exists, so an unrecoverable terminal cannot win.
create or replace function public.servos_v2_commit_cutover(cutover_id uuid,backup_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck();cut servos_v2.cutovers;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  if cut.status<>'READY' then raise exception 'VALIDATION_FAILED: cutover must be READY, is %',cut.status;end if;
  if cut.verification_hash is null then raise exception 'VALIDATION_FAILED: verification evidence is missing';end if;
  if not coalesce(backup_confirmed,false) then raise exception 'VALIDATION_FAILED: a local backup must be confirmed before commit';end if;

  update servos_v2.cutovers set status='COMMITTED',completed_at=now() where id=cutover_id;
  insert into servos_v2.cutover_evidence(cutover_id,kind,payload,recorded_by)
    values(cutover_id,'COMMITTED',jsonb_build_object('verificationHash',cut.verification_hash,'backupConfirmed',true),who);
  return jsonb_build_object('cutoverId',cutover_id,'status','COMMITTED','verificationHash',cut.verification_hash);
end$$;
revoke all on function public.servos_v2_commit_cutover(uuid,boolean) from public,anon;
grant execute on function public.servos_v2_commit_cutover(uuid,boolean) to authenticated;

-- Abort is always permitted and never deletes imported evidence, so an aborted
-- cutover remains auditable.
create or replace function public.servos_v2_abort_cutover(cutover_id uuid,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck();cut servos_v2.cutovers;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  if cut.status='COMMITTED' then raise exception 'VALIDATION_FAILED: a committed cutover cannot be aborted';end if;
  if reason is null or length(trim(reason)) not between 1 and 500 then raise exception 'VALIDATION_FAILED: an abort reason is required';end if;
  update servos_v2.cutovers set status='ABORTED',completed_at=now() where id=cutover_id;
  insert into servos_v2.cutover_evidence(cutover_id,kind,payload,recorded_by)
    values(cutover_id,'ABORTED',jsonb_build_object('reason',trim(reason)),who);
  return jsonb_build_object('cutoverId',cutover_id,'status','ABORTED');
end$$;
revoke all on function public.servos_v2_abort_cutover(uuid,text) from public,anon;
grant execute on function public.servos_v2_abort_cutover(uuid,text) to authenticated;

commit;