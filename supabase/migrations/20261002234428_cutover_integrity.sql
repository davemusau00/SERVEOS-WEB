-- Existing-terminal cutover: prove complete source membership, not totals alone.
begin;

alter function servos_v2.cutover_collection_allowed(text) rename to cutover_collection_allowed_before_integrity;
create function servos_v2.cutover_collection_allowed(collection_name text) returns boolean
language sql immutable set search_path='' as $$
  select servos_v2.cutover_collection_allowed_before_integrity(collection_name) or collection_name in (
    'property','paymentConfig','paymentAccounts','posPolicy','priceRules','purchasePackages',
    'inventoryReceipts','maintenanceEvents','cashMovements','stockCounts','closeDayReports','supplierPayments','mpesaDiscrepancies',
    'customerCreditAccounts','customerCreditEntries','customerCreditReconciliations','customerCreditDiscrepancies',
    'recipes','events','promoters','reservations','waitlist','housekeeping','maintenance');
$$;
alter function servos_v2.cutover_collection_is_history(text) rename to cutover_collection_is_history_before_integrity;
create function servos_v2.cutover_collection_is_history(collection_name text) returns boolean
language sql immutable set search_path='' as $$
  select servos_v2.cutover_collection_is_history_before_integrity(collection_name) or collection_name in (
    'customerCreditEntries','customerCreditReconciliations','inventoryReceipts','maintenanceEvents',
    'cashMovements','stockCounts','closeDayReports','supplierPayments');
$$;
alter function servos_v2.cutover_server_totals() rename to cutover_server_totals_before_integrity;
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
    'stockQuantity',coalesce((select round(sum(q::numeric),6) from servos_v2.records r
      cross join lateral jsonb_each_text(case when jsonb_typeof(r.data->'currentStock')='object' then r.data->'currentStock' else '{}'::jsonb end) l(k,v)
      cross join lateral (select nullif(regexp_replace(l.v,'[^0-9.\-]','','g'),'')::numeric as q) parsed
      where r.collection='stockItems' and not r.archived and parsed.q is not null),0),
    'stockMovements',(select count(*) from servos_v2.records where collection='stockMovements' and not archived),
    'tillCount',(select count(*) from servos_v2.records where collection='tillSessions' and not archived),
    'openTillCashMinor',coalesce((select sum(coalesce((data->>'expectedCashInDrawerMinor')::bigint,round(coalesce((data->>'expectedCashInDrawer')::numeric,0)*100)::bigint)) from servos_v2.records where collection='tillSessions' and not archived and data->>'status'='OPEN'),0),
    'closedTillCashMinor',coalesce((select sum(coalesce((data->>'expectedCashInDrawerMinor')::bigint,round(coalesce((data->>'expectedCashInDrawer')::numeric,0)*100)::bigint)) from servos_v2.records where collection='tillSessions' and not archived and coalesce(data->>'status','')<>'OPEN'),0),
    'creditEntries',(select count(*) from servos_v2.records where collection='customerCreditEntries' and not archived),
    'creditOutstandingMinor',coalesce((select sum(coalesce((data->>'balanceDeltaMinor')::bigint,0)) from servos_v2.records where collection='customerCreditEntries' and not archived),0),
    'payableOutstandingMinor',coalesce((select sum(greatest(coalesce((data->>'outstandingMinor')::bigint,0),0)) from servos_v2.records where collection='supplierPayables' and not archived),0),
    'receiptTotalMinor',coalesce((select sum(coalesce((data->>'totalMinor')::bigint,0)) from servos_v2.records where collection='receiptDocuments' and not archived),0),
    'orderTotalMinor',coalesce((select sum(greatest(coalesce((data->>'grandTotalMinor')::bigint,(data->>'totalMinor')::bigint,round(coalesce((data->>'grandTotal')::numeric,0)*100)::bigint),0)) from servos_v2.records where collection='orders' and not archived),0)
  ) into result;
  return result;
end$$;
revoke all on function servos_v2.cutover_collection_allowed(text),servos_v2.cutover_collection_is_history(text),servos_v2.cutover_server_totals() from public,anon,authenticated;

-- Commissioning Admin snapshots must include every preserved source collection,
-- including legacy configuration that has no transactional Web editor.
alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_cutover_integrity;
create function servos_v2.can_read_collection(collection_name text) returns boolean
language sql stable set search_path='' as $$
  select servos_v2.can_read_collection_before_cutover_integrity(collection_name) or
    (servos_v2.cutover_collection_allowed(collection_name) and exists(select 1 from servos_v2.staff_profiles s
      join servos_v2.members m on m.user_id=s.auth_user_id and m.active where s.auth_user_id=auth.uid() and s.active and s.role='Admin'));
$$;
revoke all on function servos_v2.can_read_collection(text) from public,anon,authenticated;

-- Frozen imports retain source order numbers and immutable receipt snapshots.
create or replace function servos_v2.assign_public_order_number()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_setting('servos.cutover_import',true)='verified' then return new;end if;
  if new.collection='orders' then
    new.data:=jsonb_set(new.data,'{orderNumber}',to_jsonb('ORD-'||lpad(nextval('servos_v2.order_public_number_seq')::text,6,'0')),true);
  end if;
  return new;
end$$;

create or replace function servos_v2.guard_business_branding()
returns trigger language plpgsql set search_path='' as $$
declare branding jsonb:=coalesce(new.data->'branding','{}'::jsonb);
        receipt jsonb:=coalesce(new.data->'receipt','{}'::jsonb);
        image_value text; raster jsonb; width integer; height integer; expected_bytes integer;
        encoded text; key text; changed boolean:=false; old_version bigint;
begin
  if current_setting('servos.cutover_import',true)='verified' then return new;end if;
  if new.collection<>'organization' or new.id<>'business' then return new;end if;
  if jsonb_typeof(branding)<>'object' or jsonb_typeof(receipt)<>'object' then
    raise exception 'VALIDATION_FAILED: business branding settings must be objects';
  end if;
  if length(branding::text)>500000 or length(receipt::text)>300000 then raise exception 'VALIDATION_FAILED: branding settings exceed the safe storage limit';end if;
  foreach key in array array['appEmblemDataUrl'] loop
    if branding ? key and jsonb_typeof(branding->key)<>'null' then
      image_value:=branding->>key;
      if image_value !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' or length(image_value)>240000 then
        raise exception 'VALIDATION_FAILED: app emblem must be a bounded normalized JPEG';
      end if;
    end if;
  end loop;
  if receipt ? 'logoDataUrl' and jsonb_typeof(receipt->'logoDataUrl')<>'null' then
    image_value:=receipt->>'logoDataUrl';
    if image_value !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' or length(image_value)>240000 then
      raise exception 'VALIDATION_FAILED: receipt logo must be a bounded normalized JPEG';
    end if;
  end if;
  if receipt ? 'thermalLogo' and jsonb_typeof(receipt->'thermalLogo')<>'null' then
    raster:=receipt->'thermalLogo';
    if jsonb_typeof(raster)<>'object' then raise exception 'VALIDATION_FAILED: thermal logo raster';end if;
    width:=(raster->>'width')::integer;height:=(raster->>'height')::integer;encoded:=raster->>'base64';
    if width<1 or width>576 or height<1 or height>220 or encoded is null or encoded !~ '^[A-Za-z0-9+/]+={0,2}$' then
      raise exception 'VALIDATION_FAILED: thermal logo dimensions or encoding';
    end if;
    expected_bytes:=ceil((ceil(width::numeric/8)*height)::numeric/3)::integer*4;
    if length(encoded)<>expected_bytes or length(encoded)>24000 then raise exception 'VALIDATION_FAILED: thermal logo raster size';end if;
  end if;

  if tg_op='INSERT' then
    if branding ? 'appEmblemDataUrl' then new.data:=jsonb_set(new.data,'{branding,version}',to_jsonb(1),true);end if;
    if receipt ? 'logoDataUrl' or receipt ? 'thermalLogo' then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(1),true);end if;
  else
    old_version:=coalesce((old.data->'branding'->>'version')::bigint,0);
    changed:=(new.data->'branding'->'appEmblemDataUrl') is distinct from (old.data->'branding'->'appEmblemDataUrl');
    if changed then new.data:=jsonb_set(new.data,'{branding,version}',to_jsonb(old_version+1),true);end if;
    old_version:=coalesce((old.data->'receipt'->>'version')::bigint,0);
    changed:=(new.data->'receipt'->'logoDataUrl') is distinct from (old.data->'receipt'->'logoDataUrl')
      or (new.data->'receipt'->'thermalLogo') is distinct from (old.data->'receipt'->'thermalLogo');
    if changed then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(old_version+1),true);end if;
  end if;
  return new;
end$$;

create or replace function servos_v2.capture_receipt_branding()
returns trigger language plpgsql set search_path='' as $$
declare identity_data jsonb; receipt_settings jsonb; order_data jsonb; customer_data jsonb;
        branding_version bigint; customer_name text; receipt_no text; payment_snapshot jsonb;
        till_qr jsonb;
begin
  if current_setting('servos.cutover_import',true)='verified' then return new;end if;
  if new.collection<>'receiptDocuments' then return new;end if;
  select data into identity_data from servos_v2.records where collection='organization' and id='business';
  select data into order_data from servos_v2.records where collection='orders' and id=(new.data->>'orderId');
  select data into customer_data from servos_v2.records where collection='customers' and id=order_data->>'customerId';
  receipt_settings:=coalesce(identity_data->'receipt','{}'::jsonb);
  branding_version:=greatest(coalesce((identity_data->'branding'->>'version')::bigint,0),coalesce((receipt_settings->>'version')::bigint,0));
  customer_name:=coalesce(nullif(trim(new.data->>'customerName'),''),nullif(trim(order_data->>'customerName'),''),nullif(trim(customer_data->>'name'),''));
  receipt_no:=new.data->>'number';
  if receipt_no like 'V2-%' then receipt_no:='R-'||right(receipt_no,8);end if;
  select coalesce(jsonb_agg(
    case when replace(replace(replace(upper(coalesce(payment->>'tenderType',payment->>'method','')),'-',''),'_',''),' ','') like '%MPESA%'
      then payment else payment-'reference' end
    order by ordinality
  ),'[]'::jsonb) into payment_snapshot
  from jsonb_array_elements(coalesce(new.data->'payments','[]'::jsonb)) with ordinality as receipt_payments(payment,ordinality);
  -- Snapshot the QR exactly as configured now. Changing, disabling or deleting it affects future receipts only.
  till_qr:=case
    when jsonb_typeof(receipt_settings->'mpesaTillQr')='object'
      and receipt_settings->'mpesaTillQr'->>'enabled'='true'
      and coalesce(receipt_settings->'mpesaTillQr'->>'dataUrl','') ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    then receipt_settings->'mpesaTillQr'||jsonb_build_object('enabled',true)
    else null end;
  new.data:=new.data||jsonb_build_object(
    'schemaVersion',2,
    'number',receipt_no,
    'customerName',customer_name,
    'payments',payment_snapshot,
    'brandingSnapshot',jsonb_build_object(
      'version',branding_version,
      'footerLines',jsonb_build_array('Built By KINGSFORGE','info@kingsforge.co.ke','info@davemusau.co.ke','0746157440'),
      'receiptLogoDataUrl',receipt_settings->'logoDataUrl',
      'thermalLogo',receipt_settings->'thermalLogo',
      'mpesaTillQr',till_qr
    )
  );
  return new;
end$$;

-- Rebuild coordination/financial indexes from accepted source records. This is
-- index construction, not command replay: no new payments, journals or stock movements.
create function servos_v2.cutover_rebuild_state(cutover_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare cut servos_v2.cutovers; row_data record; data jsonb; account text; entry_kind text; stamp timestamptz;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id;
  if exists(select 1 from servos_v2.allocations where state<>'RETURNED') then
    raise exception 'VALIDATION_FAILED: reconcile outstanding allocations before cutover';
  end if;
  insert into servos_v2.resources(kind,id,capacity)
    select 'STOCK',e.id||':'||s.location,s.qty::numeric from servos_v2.cutover_record_evidence e,
      lateral jsonb_each_text(coalesce(e.source_data->'currentStock','{}'::jsonb)) s(location,qty)
      where e.cutover_id=cut.id and e.collection='stockItems' and not e.archived
    on conflict(kind,id) do nothing;
  insert into servos_v2.resources(kind,id,capacity)
    select case e.collection when 'rooms' then 'ROOM' when 'orders' then 'ORDER' when 'tables' then 'TABLE'
      when 'folios' then 'FOLIO' when 'assets' then 'ASSET' end,e.id,1
    from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and not e.archived and e.collection in ('rooms','orders','tables','folios','assets')
    on conflict(kind,id) do nothing;
  if exists(select 1 from servos_v2.cutover_record_evidence e
      cross join lateral jsonb_each_text(coalesce(e.source_data->'currentStock','{}'::jsonb)) s(location,qty)
      left join servos_v2.resources r on r.kind='STOCK' and r.id=e.id||':'||s.location
      where e.cutover_id=cut.id and e.collection='stockItems' and not e.archived and (r.id is null or r.capacity-r.used<>s.qty::numeric)) then
    raise exception 'VALIDATION_FAILED: stock resource capacity differs from frozen source';
  end if;

  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='customerCreditAccounts' and not e.archived loop
    data:=row_data.source_data;
    insert into servos_v2.customer_credit_accounts(id,business_id,customer_id,credit_limit_minor,status,notes,created_by,updated_by)
    values(row_data.id,cut.business_id,coalesce(data->>'customerId',row_data.id),coalesce((data->>'limitMinor')::bigint,(data->>'creditLimitMinor')::bigint,0),
      case data->>'status' when 'HOLD' then 'SUSPENDED' else coalesce(data->>'status','ACTIVE') end,
      'Cutover index of source account '||row_data.id||': '||coalesce(data->>'notes',''),cut.started_by,cut.started_by)
    on conflict(id) do nothing;
    if not exists(select 1 from servos_v2.customer_credit_accounts a where a.id=row_data.id and a.business_id=cut.business_id
      and a.customer_id=coalesce(data->>'customerId',row_data.id) and a.credit_limit_minor=coalesce((data->>'limitMinor')::bigint,(data->>'creditLimitMinor')::bigint,0)
      and a.status=case data->>'status' when 'HOLD' then 'SUSPENDED' else coalesce(data->>'status','ACTIVE') end) then
      raise exception 'VALIDATION_FAILED: existing credit account differs from source %',row_data.id;
    end if;
  end loop;
  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='customerCreditEntries' and not e.archived loop
    data:=row_data.source_data;account:=coalesce(data->>'creditAccountId',data->>'accountId',data->>'customerId');
    entry_kind:=case data->>'kind' when 'SETTLEMENT' then 'PAYMENT' when 'CHARGE_REVERSAL' then 'ADJUSTMENT' when 'SETTLEMENT_REVERSAL' then 'ADJUSTMENT' else data->>'kind' end;
    insert into servos_v2.customer_credit_entries(id,business_id,customer_id,account_id,kind,balance_delta_minor,amount_minor,source_type,source_id,payment_method,reference,notes,occurred_at,actor_id)
    values(row_data.id,cut.business_id,data->>'customerId',account,entry_kind,(data->>'balanceDeltaMinor')::bigint,(data->>'amountMinor')::bigint,
      data->>'sourceType',data->>'sourceId',coalesce(data->>'paymentMethod',case when data->>'kind'='SETTLEMENT' then data->>'sourceType' end),
      data->>'reference','Cutover index; original actor '||coalesce(data->>'actorId','unrecorded')||'; '||coalesce(data->>'notes',''),
      (data->>'occurredAt')::timestamptz,cut.started_by) on conflict(id) do nothing;
    if not exists(select 1 from servos_v2.customer_credit_entries e where e.id=row_data.id and e.business_id=cut.business_id
      and e.customer_id=data->>'customerId' and e.account_id=account and e.kind=entry_kind and e.balance_delta_minor=(data->>'balanceDeltaMinor')::bigint
      and e.amount_minor=(data->>'amountMinor')::bigint and e.source_type=data->>'sourceType' and e.source_id=data->>'sourceId') then
      raise exception 'VALIDATION_FAILED: existing credit entry differs from source %',row_data.id;
    end if;
  end loop;
  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='mpesaReceipts' and not e.archived loop
    data:=row_data.source_data;
    insert into servos_v2.mpesa_receipts(id,business_id,code,account,received_amount_minor,allocated_amount_minor,received_at,reconciliation_status,statement_amount_minor,statement_reference,review_notes,created_by)
    values(row_data.id,cut.business_id,data->>'code',data->>'account',
      coalesce((data->>'receivedAmountMinor')::bigint,round((data->>'receivedAmount')::numeric*100)::bigint),
      coalesce((data->>'allocatedAmountMinor')::bigint,round(coalesce((data->>'allocatedAmount')::numeric,0)*100)::bigint),
      (data->>'receivedAt')::timestamptz,coalesce(data->>'reconciliationStatus','AWAITING_RECONCILIATION'),
      coalesce((data->>'statementAmountMinor')::bigint,round((data->>'statementAmount')::numeric*100)::bigint),data->>'statementReference',
      'Cutover index of manual evidence; original cashier '||coalesce(data->>'cashierId','unrecorded'),cut.started_by)
    on conflict(id) do nothing;
    if not exists(select 1 from servos_v2.mpesa_receipts r where r.id=row_data.id and r.business_id=cut.business_id
      and r.code=data->>'code' and r.account=data->>'account'
      and r.received_amount_minor=coalesce((data->>'receivedAmountMinor')::bigint,round((data->>'receivedAmount')::numeric*100)::bigint)
      and r.allocated_amount_minor=coalesce((data->>'allocatedAmountMinor')::bigint,round(coalesce((data->>'allocatedAmount')::numeric,0)*100)::bigint)
      and r.reconciliation_status=coalesce(data->>'reconciliationStatus','AWAITING_RECONCILIATION')) then
      raise exception 'VALIDATION_FAILED: existing M-Pesa receipt differs from source %',row_data.id;
    end if;
  end loop;
  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='mpesaDiscrepancies' and not e.archived loop
    data:=row_data.source_data;
    insert into servos_v2.mpesa_discrepancies(id,business_id,receipt_id,received_amount_minor,statement_amount_minor,variance_minor,statement_reference,reason,status,outcome,resolution,opened_by,opened_at,resolved_by,resolved_at)
    values(row_data.id,cut.business_id,data->>'receiptId',
      coalesce((data->>'receivedAmountMinor')::bigint,round((data->>'receivedAmount')::numeric*100)::bigint),
      coalesce((data->>'statementAmountMinor')::bigint,round((data->>'statementAmount')::numeric*100)::bigint),
      coalesce((data->>'varianceMinor')::bigint,round((data->>'variance')::numeric*100)::bigint),
      data->>'statementReference',data->>'reason',data->>'status',data->>'outcome',data->>'resolution',cut.started_by,
      (data->>'openedAt')::timestamptz,case when data->>'resolvedAt' is not null then cut.started_by end,(data->>'resolvedAt')::timestamptz)
    on conflict(id) do nothing;
  end loop;
  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='customerCreditReconciliations' and not e.archived loop
    data:=row_data.source_data;
    insert into servos_v2.customer_credit_reconciliations(id,business_id,customer_id,expected_balance_minor,statement_balance_minor,statement_reference,notes,status,actor_id,occurred_at)
    values(row_data.id,cut.business_id,data->>'customerId',(data->>'expectedBalanceMinor')::bigint,(data->>'statementBalanceMinor')::bigint,
      coalesce(data->>'statementReference',data->>'reference'),coalesce(data->>'notes',''),coalesce(data->>'status','MATCHED'),cut.started_by,
      coalesce(data->>'occurredAt',data->>'reviewedAt')::timestamptz)
    on conflict(id) do nothing;
  end loop;
  for row_data in select * from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection='customerCreditDiscrepancies' and not e.archived loop
    data:=row_data.source_data;
    -- Legacy discrepancies are independent records. Construct their required
    -- private reconciliation index, with source provenance, without a new event.
    account:=coalesce(data->>'reconciliationId','cutover:'||row_data.id);
    stamp:=coalesce(data->>'occurredAt',data->>'openedAt')::timestamptz;
    insert into servos_v2.customer_credit_reconciliations(id,business_id,customer_id,expected_balance_minor,statement_balance_minor,statement_reference,notes,status,actor_id,occurred_at)
    values(account,cut.business_id,data->>'customerId',(data->>'expectedBalanceMinor')::bigint,(data->>'statementBalanceMinor')::bigint,
      coalesce(data->>'statementReference',data->>'reference'),'Reconstructed index of source discrepancy '||row_data.id,'DISCREPANCY',cut.started_by,stamp)
    on conflict(id) do nothing;
    insert into servos_v2.customer_credit_discrepancies(id,business_id,customer_id,reconciliation_id,expected_balance_minor,statement_balance_minor,variance_minor,status,outcome,resolution,actor_id,occurred_at,resolved_by,resolved_at)
    values(row_data.id,cut.business_id,data->>'customerId',account,(data->>'expectedBalanceMinor')::bigint,(data->>'statementBalanceMinor')::bigint,
      coalesce((data->>'varianceMinor')::bigint,(data->>'differenceMinor')::bigint),data->>'status',data->>'outcome',data->>'resolution',cut.started_by,stamp,
      case when data->>'resolvedAt' is not null then cut.started_by end,(data->>'resolvedAt')::timestamptz)
    on conflict(id) do nothing;
  end loop;
  return jsonb_build_object('resourcesRebuilt',true,'financialIndexesRebuilt',true);
end$$;
revoke all on function servos_v2.cutover_rebuild_state(uuid) from public,anon,authenticated;

create function servos_v2.cutover_canonical_json(value jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare result text;
begin
  case jsonb_typeof(value)
    when 'object' then
      select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||servos_v2.cutover_canonical_json(item),',' order by key collate "C"),'')||'}'
        into result from jsonb_each(value) as e(key,item);
    when 'array' then
      select '['||coalesce(string_agg(servos_v2.cutover_canonical_json(item),',' order by position),'')||']'
        into result from jsonb_array_elements(value) with ordinality as e(item,position);
    when 'number' then result:=trim_scale((value::text)::numeric)::text;
    else result:=value::text;
  end case;
  return result;
end$$;

create function servos_v2.cutover_record_hash(collection_name text,record_id text,record_version bigint,data jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(collection_name||chr(31)||record_id||chr(31)||record_version::text||chr(31)||servos_v2.cutover_canonical_json(data),'UTF8'),'sha256'),'hex');
$$;

create table servos_v2.cutover_record_evidence(
  cutover_id uuid not null references servos_v2.cutovers(id),
  collection text not null,
  id text not null,
  version bigint not null check(version>0),
  archived boolean not null,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  source_data jsonb not null,
  primary key(cutover_id,collection,id)
);
alter table servos_v2.cutover_record_evidence enable row level security;
create trigger cutover_record_evidence_immutable before update or delete on servos_v2.cutover_record_evidence
for each row execute function servos_v2.cutover_evidence_immutable();
revoke all on servos_v2.cutover_record_evidence from public,anon,authenticated;

-- Preserve previous validators privately. Their public names must not bypass the new gates.
alter function public.servos_v2_begin_cutover(jsonb) set schema servos_v2;
alter function public.servos_v2_import_cutover_page(uuid,integer,text,jsonb) set schema servos_v2;
alter function public.servos_v2_verify_cutover(uuid) set schema servos_v2;
revoke all on function servos_v2.servos_v2_begin_cutover(jsonb),servos_v2.servos_v2_import_cutover_page(uuid,integer,text,jsonb),servos_v2.servos_v2_verify_cutover(uuid) from public,anon,authenticated;

create function public.servos_v2_begin_cutover(manifest jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); group_entry jsonb; entry jsonb; active_total bigint:=0; actual_hash text;
begin
  begin
    perform (manifest->>'terminalId')::uuid;
  exception when invalid_text_representation then
    raise exception 'VALIDATION_FAILED: source terminal id must be a UUID';
  end;
  if jsonb_typeof(manifest->'collections') is distinct from 'array' then raise exception 'VALIDATION_FAILED: manifest collections';end if;
  if manifest ? 'unsupportedCollections' and (jsonb_typeof(manifest->'unsupportedCollections') is distinct from 'array' or jsonb_array_length(manifest->'unsupportedCollections')>0) then
    raise exception 'VALIDATION_FAILED: source has unsupported collections; map and reconcile them before cutover';
  end if;
  if manifest->>'manifestHash' is null or manifest->>'manifestHash' !~ '^[0-9a-f]{64}$' then raise exception 'VALIDATION_FAILED: manifest hash must be a SHA-256 digest';end if;
  actual_hash:=encode(extensions.digest(convert_to(servos_v2.cutover_canonical_json(manifest-'generatedAt'-'manifestHash'),'UTF8'),'sha256'),'hex');
  if actual_hash<>manifest->>'manifestHash' then raise exception 'MANIFEST_MISMATCH: manifest content hash';end if;
  if exists(select 1 from jsonb_array_elements(manifest->'collections') e group by e->>'collection' having count(*)>1) then
    raise exception 'VALIDATION_FAILED: duplicate manifest collection';
  end if;
  for group_entry in select value from jsonb_array_elements(manifest->'collections') loop
    if not coalesce(servos_v2.cutover_collection_allowed(group_entry->>'collection'),false)
      or jsonb_typeof(group_entry->'records') is distinct from 'array' then raise exception 'VALIDATION_FAILED: manifest collection';end if;
    if exists(select 1 from jsonb_array_elements(group_entry->'records') e group by e->>'id' having count(*)>1) then raise exception 'VALIDATION_FAILED: duplicate manifest record';end if;
    for entry in select value from jsonb_array_elements(group_entry->'records') loop
      if entry->>'id' is null or length(entry->>'id') not between 1 and 128
        or entry->>'hash' is null or entry->>'hash' !~ '^[0-9a-f]{64}$'
        or coalesce((entry->>'version')::bigint,0)<1 or jsonb_typeof(entry->'archived') is distinct from 'boolean' then
        raise exception 'VALIDATION_FAILED: manifest record identity';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(group_entry->'records') e where not (e->>'archived')::boolean)
       is distinct from (group_entry->>'activeCount')::bigint then raise exception 'VALIDATION_FAILED: manifest active count';end if;
    if (select count(*) from jsonb_array_elements(group_entry->'records') e where (e->>'archived')::boolean)
       is distinct from (group_entry->>'archivedCount')::bigint then raise exception 'VALIDATION_FAILED: manifest archived count';end if;
    select encode(extensions.digest(convert_to(coalesce(string_agg(e->>'hash','' order by e->>'id' collate "C"),'')||(group_entry->>'activeCount'),'UTF8'),'sha256'),'hex')
      into actual_hash from jsonb_array_elements(group_entry->'records') e;
    if group_entry->>'collectionHash' is distinct from actual_hash then raise exception 'MANIFEST_MISMATCH: collection content hash';end if;
    active_total:=active_total+(group_entry->>'activeCount')::bigint;
  end loop;
  if active_total is distinct from (manifest->>'recordCount')::bigint then raise exception 'VALIDATION_FAILED: manifest record count';end if;
  perform 1 from servos_v2.control where singleton for update;
  if exists(select 1 from servos_v2.cutovers c join servos_v2.control state on state.singleton and state.business_id=c.business_id
    where c.status<>'ABORTED' and (c.source_terminal_id::text is distinct from manifest->>'terminalId'
      or c.source_manifest_hash is distinct from manifest->>'manifestHash')) then
    raise exception 'CUTOVER_CONFLICT: another source manifest already owns this business bootstrap';
  end if;
  return servos_v2.servos_v2_begin_cutover(manifest);
end$$;

create function servos_v2.cutover_contains_credentials(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item record;
begin
  if jsonb_typeof(value)='object' then
    for item in select * from jsonb_each(value) loop
      if lower(replace(item.key,'_','')) in ('pinhash','devicetoken','devicesecret','cloudkey','publishablekey','refreshtoken','accesstoken','password','servicekey','servicerolekey')
        or servos_v2.cutover_contains_credentials(item.value) then return true;end if;
    end loop;
  elsif jsonb_typeof(value)='array' then
    for item in select * from jsonb_array_elements(value) loop
      if servos_v2.cutover_contains_credentials(item.value) then return true;end if;
    end loop;
  end if;
  return false;
end$$;
revoke all on function servos_v2.cutover_contains_credentials(jsonb) from public,anon,authenticated;

create function public.servos_v2_import_cutover_page(p_cutover_id uuid,p_page_index integer,collection_name text,page jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); cut servos_v2.cutovers; entry jsonb; expected jsonb; digest text; result jsonb; previous_import text;
begin
  select * into cut from servos_v2.cutovers c where c.id=p_cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  if servos_v2.cutover_contains_credentials(page->'records') then raise exception 'VALIDATION_FAILED: credential field in imported page';end if;
  -- Existing validator retains replay mismatch, credential, size and duplicate checks.
  -- It is atomic with the evidence below: any later failure rolls back the entire page.
  previous_import:=current_setting('servos.cutover_import',true);
  perform set_config('servos.cutover_import','verified',true);
  result:=servos_v2.servos_v2_import_cutover_page(p_cutover_id,p_page_index,collection_name,page);
  perform set_config('servos.cutover_import',coalesce(previous_import,''),true);
  if (result->>'replayed')::boolean then return result;end if;
  for entry in select value from jsonb_array_elements(page->'records') loop
    select r into expected from jsonb_array_elements(cut.source_manifest->'collections') g,
      lateral jsonb_array_elements(g->'records') r where g->>'collection'=collection_name and r->>'id'=entry->>'id';
    digest:=servos_v2.cutover_record_hash(collection_name,entry->>'id',(entry->>'version')::bigint,entry->'data');
    if expected is null or expected->>'hash' is distinct from digest
      or (expected->>'version')::bigint is distinct from (entry->>'version')::bigint
      or (expected->>'archived')::boolean is distinct from coalesce((entry->>'archived')::boolean,false) then
      raise exception 'MANIFEST_MISMATCH: record %/% differs from frozen source',collection_name,entry->>'id';
    end if;
    insert into servos_v2.cutover_record_evidence values(p_cutover_id,collection_name,entry->>'id',(entry->>'version')::bigint,
      coalesce((entry->>'archived')::boolean,false),digest,entry->'data');
  end loop;
  return result;
end$$;

create function public.servos_v2_verify_cutover(cutover_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); cut servos_v2.cutovers; missing bigint; differences bigint; unexpected bigint; result jsonb;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  select count(*) into missing from jsonb_array_elements(cut.source_manifest->'collections') g,
    lateral jsonb_array_elements(g->'records') r where not exists(
      select 1 from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection=g->>'collection' and e.id=r->>'id' and e.source_hash=r->>'hash');
  select count(*) into differences from servos_v2.cutover_record_evidence e
    left join servos_v2.records r on r.collection=e.collection and r.id=e.id
    where e.cutover_id=cut.id and (r.id is null or r.version<>e.version or r.archived<>e.archived or r.data is distinct from
      case when servos_v2.cutover_collection_is_history(e.collection) then e.source_data||jsonb_build_object('source','LEGACY_SQLITE_CUTOVER','sourceCutoverId',cut.id::text,'sourceVersion',e.version) else e.source_data end);
  select count(*) into unexpected from servos_v2.records r where not exists(
    select 1 from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection=r.collection and e.id=r.id)
    and not (r.collection='employees' and exists(select 1 from servos_v2.staff_profiles s
      where s.staff_id=r.id and s.auth_user_id::text=r.data->>'authUserId'));
  if missing>0 or differences>0 or unexpected>0 then
    update servos_v2.cutovers set status='VERIFYING',verification_hash=null where id=cut.id;
    return jsonb_build_object('cutoverId',cut.id,'status','VERIFYING','verified',false,'missingRecords',missing,'changedRecords',differences,'unexpectedRecords',unexpected);
  end if;
  result:=servos_v2.servos_v2_verify_cutover(cutover_id);
  if result->>'verified'='true' then
    result:=result||servos_v2.cutover_rebuild_state(cutover_id);
  end if;
  return result||jsonb_build_object('completeManifest',true,'sourceManifestHash',cut.source_manifest_hash,'sourceTerminalId',cut.source_terminal_id);
end$$;

-- Read-only authenticated evidence used by the native transition boundary.
create function servos_v2.cutover_baseline_content_hash() returns text
language sql stable set search_path='' as $$
  select encode(extensions.digest(convert_to(servos_v2.cutover_canonical_json(coalesce(jsonb_agg(
    jsonb_build_object('collection',r.collection,'id',r.id,'version',r.version,'archived',r.archived,'data',r.data)
    order by r.collection collate "C",r.id collate "C"),'[]'::jsonb)),'UTF8'),'sha256'),'hex')
  from servos_v2.records r where servos_v2.can_read_collection(r.collection);
$$;
revoke all on function servos_v2.cutover_baseline_content_hash() from public,anon,authenticated;

create function public.servos_v2_attest_cutover_baseline(report jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); cut servos_v2.cutovers; state servos_v2.control; identity jsonb; digest text; verification jsonb;
begin
  select * into state from servos_v2.control where singleton for share;
  identity:=public.servos_v2_terminal_identity((report->>'deviceId')::uuid);
  select * into cut from servos_v2.cutovers c where c.business_id=state.business_id
    and c.source_terminal_id=(report->>'deviceId')::uuid and c.status='READY' order by c.started_at desc limit 1 for update;
  if not found then raise exception 'VALIDATION_FAILED: a verified source-terminal cutover is required';end if;
  verification:=public.servos_v2_verify_cutover(cut.id);
  if verification->>'verified' is distinct from 'true' then raise exception 'BASELINE_MISMATCH: source cutover changed after verification';end if;
  digest:=servos_v2.cutover_baseline_content_hash();
  if report->>'verified' is distinct from 'true' or report->>'snapshotComplete' is distinct from 'true'
    or report->>'authorityMode' is distinct from 'CUTOVER_PREP'
    or report->>'businessId' is distinct from state.business_id::text
    or report->>'policyVersion' is distinct from identity->>'policyVersion'
    or (report->>'feedCursor')::bigint is distinct from state.cursor
    or (report->>'serverCursor')::bigint is distinct from state.cursor
    or (report->>'unresolvedLegacyCommands')::bigint is distinct from 0
    or (report->>'recordCount')::bigint is distinct from (select count(*) from servos_v2.records r where servos_v2.can_read_collection(r.collection))
    or report->>'contentDigest' is distinct from digest then
    raise exception 'BASELINE_MISMATCH: installed native content, identity, policy, cursor or unresolved work differs from server (local digest %, server digest %, local count %, server count %, local mode %)',
      report->>'contentDigest',digest,report->>'recordCount',(select count(*) from servos_v2.records r where servos_v2.can_read_collection(r.collection)),report->>'authorityMode';
  end if;
  insert into servos_v2.cutover_evidence(cutover_id,kind,payload,recorded_by)
    values(cut.id,'NATIVE_BASELINE_VERIFIED',report||jsonb_build_object('verificationHash',cut.verification_hash),who);
  return jsonb_build_object('cutoverId',cut.id,'verified',true,'contentDigest',digest,'verificationHash',cut.verification_hash);
end$$;

alter function public.servos_v2_set_authority_mode(text,text) set schema servos_v2;
revoke all on function servos_v2.servos_v2_set_authority_mode(text,text) from public,anon,authenticated;
create function public.servos_v2_set_authority_mode(next_mode text,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  -- Preserve the established authorization check before returning readiness information.
  if auth.uid() is null or not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=auth.uid() and s.active and s.role='Admin') then
    raise exception 'PERMISSION_DENIED: Admin staff profile required' using errcode='42501';
  end if;
  perform 1 from servos_v2.control where singleton for update;
  if next_mode='SHARED_V2' and servos_v2.authority()='CUTOVER_PREP' and not exists(
    select 1 from servos_v2.cutovers c join servos_v2.cutover_evidence e on e.cutover_id=c.id and e.kind='NATIVE_BASELINE_VERIFIED'
    join servos_v2.control state on state.singleton and state.business_id=c.business_id
    where c.status='COMMITTED' and c.verification_hash is not null
      and e.payload->>'verificationHash'=c.verification_hash
      and e.payload->>'contentDigest'=servos_v2.cutover_baseline_content_hash()
      and (e.payload->>'feedCursor')::bigint=state.cursor) then
    raise exception 'VALIDATION_FAILED: committed cutover and current verified native baseline required before SHARED_V2';
  end if;
  return servos_v2.servos_v2_set_authority_mode(next_mode,reason);
end$$;
revoke all on function public.servos_v2_attest_cutover_baseline(jsonb),public.servos_v2_set_authority_mode(text,text) from public,anon;
grant execute on function public.servos_v2_attest_cutover_baseline(jsonb),public.servos_v2_set_authority_mode(text,text) to authenticated;

create function public.servos_v2_cutover_status(cutover_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cut servos_v2.cutovers; mode text;
begin
  if auth.uid() is null or not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=auth.uid() and s.active and s.role='Admin') then
    raise exception 'PERMISSION_DENIED: Admin staff profile required' using errcode='42501';
  end if;
  select c.* into cut from servos_v2.cutovers c join servos_v2.control state on state.business_id=c.business_id and state.singleton where c.id=cutover_id;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  select authority_mode into mode from servos_v2.control where singleton;
  return jsonb_build_object('cutoverId',cut.id,'status',cut.status,'businessId',cut.business_id,'sourceTerminalId',cut.source_terminal_id,
    'sourceManifestHash',cut.source_manifest_hash,'verificationHash',cut.verification_hash,'authorityMode',mode);
end$$;

revoke all on function servos_v2.cutover_canonical_json(jsonb),servos_v2.cutover_record_hash(text,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.servos_v2_begin_cutover(jsonb),public.servos_v2_import_cutover_page(uuid,integer,text,jsonb),public.servos_v2_verify_cutover(uuid),public.servos_v2_cutover_status(uuid) from public,anon;
grant execute on function public.servos_v2_begin_cutover(jsonb),public.servos_v2_import_cutover_page(uuid,integer,text,jsonb),public.servos_v2_verify_cutover(uuid),public.servos_v2_cutover_status(uuid) to authenticated;
commit;
