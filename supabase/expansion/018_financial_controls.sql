-- STAGED V2 ONLY. Hosted financial controls: M-Pesa review, customer receivables,
-- POS charge-to-account and manager-protected write-offs. Never enable beside legacy writers.
begin;

create or replace function servos_v2.canonical_financial_permissions()
returns text[] language sql immutable set search_path='' as $$
  select array[
    'mpesa.record','mpesa.reconcile',
    'credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','credit.override_limit',
    'folio.room_charge','order.discount','order.comp','order.void','order.refund','payment.reverse'
  ]
$$;

create table if not exists servos_v2.mpesa_receipts(
  id text primary key,
  business_id uuid not null,
  code text not null,
  account text not null,
  received_amount_minor bigint not null check(received_amount_minor>0),
  allocated_amount_minor bigint not null default 0 check(allocated_amount_minor>=0),
  received_at timestamptz not null,
  reconciliation_status text not null default 'AWAITING_RECONCILIATION' check(reconciliation_status in ('AWAITING_RECONCILIATION','DISCREPANCY','RECONCILED','RECONCILED_WITH_DISCREPANCY')),
  statement_amount_minor bigint,
  statement_reference text,
  review_notes text,
  created_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists mpesa_receipts_business_code_idx on servos_v2.mpesa_receipts(business_id,code);

create table if not exists servos_v2.mpesa_discrepancies(
  id text primary key,
  business_id uuid not null,
  receipt_id text not null references servos_v2.mpesa_receipts(id),
  received_amount_minor bigint not null,
  statement_amount_minor bigint not null,
  variance_minor bigint not null,
  statement_reference text not null,
  reason text not null,
  status text not null default 'OPEN' check(status in ('OPEN','RESOLVED')),
  outcome text,
  resolution text,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);
create index if not exists mpesa_discrepancies_business_status_idx on servos_v2.mpesa_discrepancies(business_id,status);

create table if not exists servos_v2.customer_credit_accounts(
  id text primary key,
  business_id uuid not null,
  customer_id text not null,
  credit_limit_minor bigint not null default 0 check(credit_limit_minor>=0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','SUSPENDED','CLOSED')),
  notes text,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,customer_id)
);

create table if not exists servos_v2.customer_credit_entries(
  id text primary key,
  business_id uuid not null,
  customer_id text not null,
  account_id text not null references servos_v2.customer_credit_accounts(id),
  kind text not null check(kind in ('CHARGE','PAYMENT','WRITE_OFF','ADJUSTMENT')),
  balance_delta_minor bigint not null,
  amount_minor bigint not null check(amount_minor>0),
  source_type text not null,
  source_id text not null,
  payment_method text,
  reference text,
  notes text,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null,
  unique(business_id,source_type,source_id,kind)
);
create index if not exists customer_credit_entries_business_customer_idx on servos_v2.customer_credit_entries(business_id,customer_id,occurred_at desc);

create table if not exists servos_v2.customer_credit_reconciliations(
  id text primary key,
  business_id uuid not null,
  customer_id text not null,
  expected_balance_minor bigint not null,
  statement_balance_minor bigint not null,
  statement_reference text not null,
  notes text not null,
  status text not null check(status in ('MATCHED','DISCREPANCY')),
  actor_id uuid not null,
  occurred_at timestamptz not null default now()
);
create table if not exists servos_v2.customer_credit_discrepancies(
  id text primary key,
  business_id uuid not null,
  customer_id text not null,
  reconciliation_id text not null references servos_v2.customer_credit_reconciliations(id),
  expected_balance_minor bigint not null,
  statement_balance_minor bigint not null,
  variance_minor bigint not null,
  status text not null default 'OPEN' check(status in ('OPEN','RESOLVED')),
  outcome text,
  resolution text,
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);

create or replace function servos_v2.credit_balance(customer_key text)
returns bigint language sql stable set search_path='' as $$
  select coalesce(sum(e.balance_delta_minor),0) from servos_v2.customer_credit_entries e
  where e.customer_id=customer_key and e.business_id=(select business_id from servos_v2.control where singleton)
$$;

create or replace function servos_v2.apply_financial_controls(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  op text:=command->>'operation'; p jsonb:=command->'payload'; who uuid:=auth.uid(); business uuid;
  key text; customer_key text; account_key text; order_key text; entry_key text; receipt_key text; discrepancy_key text;
  amount bigint; limit_minor bigint; balance bigint; statement bigint; received bigint; variance bigint; method text; reference text; reason text;
  order_data jsonb; account_data jsonb; changed jsonb:='[]'::jsonb; stamp timestamptz:=now();
begin
  select business_id into business from servos_v2.control where singleton;

  if op='mpesa.receipt' then
    perform servos_v2.require_permission('mpesa.record');
    receipt_key:=servos_v2.required_text(p,'id');
    if exists(select 1 from servos_v2.mpesa_receipts where business_id=business and code=upper(servos_v2.required_text(p,'code'))) then raise exception 'DUPLICATE_REFERENCE: M-Pesa transaction code is already recorded';end if;
    amount:=servos_v2.minor(p,'receivedAmountMinor');
    if amount<=0 then raise exception 'VALIDATION_FAILED: M-Pesa amount';end if;
    insert into servos_v2.mpesa_receipts(id,business_id,code,account,received_amount_minor,received_at,created_by)
    values(receipt_key,business,upper(servos_v2.required_text(p,'code')),servos_v2.required_text(p,'account'),amount,coalesce((p->>'receivedAt')::timestamptz,stamp),who);
    return servos_v2.put_record('mpesaReceipts',receipt_key,jsonb_build_object('id',receipt_key,'code',upper(p->>'code'),'account',p->>'account','receivedAmountMinor',amount,'allocatedAmountMinor',0,'receivedAt',coalesce(p->>'receivedAt',stamp::text),'reconciliationStatus','AWAITING_RECONCILIATION'));

  elsif op='mpesa.discrepancy' then
    perform servos_v2.require_permission('mpesa.reconcile');
    receipt_key:=servos_v2.required_text(p,'receiptId');statement:=servos_v2.minor(p,'statementAmountMinor');
    select received_amount_minor into received from servos_v2.mpesa_receipts where id=receipt_key and business_id=business for update;
    if received is null then raise exception 'VALIDATION_FAILED: M-Pesa receipt not found';end if;
    if statement=received then raise exception 'VALIDATION_FAILED: statement matches receipt; reconcile directly';end if;
    if exists(select 1 from servos_v2.mpesa_discrepancies where receipt_id=receipt_key and status='OPEN') then raise exception 'INVALID_STATE: resolve the existing M-Pesa discrepancy first';end if;
    discrepancy_key:=coalesce(nullif(p->>'id',''),gen_random_uuid()::text);variance:=statement-received;
    insert into servos_v2.mpesa_discrepancies(id,business_id,receipt_id,received_amount_minor,statement_amount_minor,variance_minor,statement_reference,reason,opened_by)
    values(discrepancy_key,business,receipt_key,received,statement,variance,servos_v2.required_text(p,'statementReference'),servos_v2.required_text(p,'reason'),who);
    update servos_v2.mpesa_receipts set reconciliation_status='DISCREPANCY',statement_amount_minor=statement,statement_reference=p->>'statementReference' where id=receipt_key;
    return servos_v2.put_record('mpesaDiscrepancies',discrepancy_key,jsonb_build_object('id',discrepancy_key,'receiptId',receipt_key,'receivedAmountMinor',received,'statementAmountMinor',statement,'varianceMinor',variance,'statementReference',p->>'statementReference','reason',p->>'reason','status','OPEN'))||servos_v2.put_record('mpesaReceipts',receipt_key,jsonb_build_object('id',receipt_key,'code',(select code from servos_v2.mpesa_receipts where id=receipt_key),'account',(select account from servos_v2.mpesa_receipts where id=receipt_key),'receivedAmountMinor',received,'allocatedAmountMinor',(select allocated_amount_minor from servos_v2.mpesa_receipts where id=receipt_key),'receivedAt',(select received_at from servos_v2.mpesa_receipts where id=receipt_key),'reconciliationStatus','DISCREPANCY','statementAmountMinor',statement,'statementReference',p->>'statementReference'));

  elsif op='mpesa.discrepancy.resolve' then
    perform servos_v2.require_permission('mpesa.reconcile');
    discrepancy_key:=servos_v2.required_text(p,'discrepancyId');
    if p->>'outcome' not in ('STATEMENT_ERROR','MISSING_PAYMENT','MISSING_CHARGE','ACCEPTED_VARIANCE','WRITE_OFF_REQUIRED') then raise exception 'VALIDATION_FAILED: discrepancy outcome';end if;
    select d.receipt_id,d.received_amount_minor,d.statement_amount_minor,d.variance_minor,d.statement_reference,d.reason into receipt_key,received,statement,variance,reference,reason from servos_v2.mpesa_discrepancies d where d.id=discrepancy_key and d.business_id=business and d.status='OPEN' for update;
    if receipt_key is null then raise exception 'INVALID_STATE: open M-Pesa discrepancy not found';end if;
    update servos_v2.mpesa_discrepancies set status='RESOLVED',outcome=p->>'outcome',resolution=servos_v2.required_text(p,'resolution'),resolved_by=who,resolved_at=stamp where id=discrepancy_key and business_id=business and status='OPEN';
    return servos_v2.put_record('mpesaDiscrepancies',discrepancy_key,jsonb_build_object('id',discrepancy_key,'receiptId',receipt_key,'receivedAmountMinor',received,'statementAmountMinor',statement,'varianceMinor',variance,'statementReference',reference,'reason',reason,'status','RESOLVED','outcome',p->>'outcome','resolution',p->>'resolution'));

  elsif op='mpesa.reconcile' then
    perform servos_v2.require_permission('mpesa.reconcile');receipt_key:=servos_v2.required_text(p,'receiptId');statement:=servos_v2.minor(p,'statementAmountMinor');
    select received_amount_minor into received from servos_v2.mpesa_receipts where id=receipt_key and business_id=business for update;
    if received is null then raise exception 'VALIDATION_FAILED: M-Pesa receipt not found';end if;
    if statement<>received and not exists(select 1 from servos_v2.mpesa_discrepancies where receipt_id=receipt_key and status='RESOLVED' and outcome='ACCEPTED_VARIANCE' and statement_amount_minor=statement) then raise exception 'VALIDATION_FAILED: resolve the M-Pesa discrepancy before reconciliation';end if;
    update servos_v2.mpesa_receipts set reconciliation_status=case when statement=received then 'RECONCILED' else 'RECONCILED_WITH_DISCREPANCY' end,statement_amount_minor=statement,statement_reference=servos_v2.required_text(p,'statementReference'),review_notes=p->>'notes',reviewed_by=who,reviewed_at=stamp where id=receipt_key;
    return servos_v2.put_record('mpesaReceipts',receipt_key,jsonb_build_object('id',receipt_key,'code',(select code from servos_v2.mpesa_receipts where id=receipt_key),'account',(select account from servos_v2.mpesa_receipts where id=receipt_key),'receivedAmountMinor',received,'allocatedAmountMinor',(select allocated_amount_minor from servos_v2.mpesa_receipts where id=receipt_key),'receivedAt',(select received_at from servos_v2.mpesa_receipts where id=receipt_key),'reconciliationStatus',case when statement=received then 'RECONCILED' else 'RECONCILED_WITH_DISCREPANCY' end,'statementAmountMinor',statement,'statementReference',p->>'statementReference','reviewNotes',p->>'notes'));

  elsif op='credit.account.save' then
    perform servos_v2.require_permission('credit.manage');customer_key:=servos_v2.required_text(p,'customerId');account_key:=coalesce(nullif(p->>'id',''),gen_random_uuid()::text);limit_minor:=servos_v2.minor(p,'creditLimitMinor');
    if limit_minor<0 then raise exception 'VALIDATION_FAILED: credit limit';end if;
    insert into servos_v2.customer_credit_accounts(id,business_id,customer_id,credit_limit_minor,status,notes,created_by,updated_by) values(account_key,business,customer_key,limit_minor,coalesce(nullif(p->>'status',''),'ACTIVE'),p->>'notes',who,who)
    on conflict(business_id,customer_id) do update set credit_limit_minor=excluded.credit_limit_minor,status=excluded.status,notes=excluded.notes,updated_by=who,updated_at=stamp returning id into account_key;
    return servos_v2.put_record('customerCreditAccounts',account_key,jsonb_build_object('id',account_key,'customerId',customer_key,'creditLimitMinor',limit_minor,'status',coalesce(nullif(p->>'status',''),'ACTIVE'),'notes',p->>'notes'));

  elsif op='credit.charge' then
    perform servos_v2.require_permission('credit.charge');order_key:=servos_v2.required_text(p,'orderId');customer_key:=servos_v2.required_text(p,'customerId');amount:=servos_v2.minor(p,'amountMinor');
    perform servos_v2.assert_version(command,'orders',order_key);
    select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
    if order_data is null or order_data->>'customerId' is distinct from customer_key then raise exception 'VALIDATION_FAILED: order customer assignment is required';end if;
    if amount<=0 or amount<>(order_data->>'grandTotalMinor')::bigint-coalesce((order_data->>'amountPaidMinor')::bigint,0) then raise exception 'VALIDATION_FAILED: credit charge must settle the outstanding order balance';end if;
    select id,credit_limit_minor into account_key,limit_minor from servos_v2.customer_credit_accounts where business_id=business and customer_id=customer_key and status='ACTIVE' for update;
    if account_key is null then raise exception 'INVALID_STATE: customer has no active credit account';end if;
    balance:=servos_v2.credit_balance(customer_key);if balance+amount>limit_minor then perform servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'credit.override_limit',customer_key,who);end if;
    entry_key:='credit-'||(command->>'id');
    insert into servos_v2.customer_credit_entries(id,business_id,customer_id,account_id,kind,balance_delta_minor,amount_minor,source_type,source_id,payment_method,notes,actor_id) values(entry_key,business,customer_key,account_key,'CHARGE',amount,amount,'ORDER',order_key,'CUSTOMER_CREDIT',p->>'notes',who);
    order_data:=order_data||jsonb_build_object('amountPaidMinor',coalesce((order_data->>'amountPaidMinor')::bigint,0)+amount,'paymentMethod','CUSTOMER_CREDIT','state','COMPLETED','creditEntryId',entry_key);
    changed:=servos_v2.put_record('orders',order_key,order_data);
    return changed||servos_v2.put_record('customerCreditEntries',entry_key,jsonb_build_object('id',entry_key,'customerId',customer_key,'accountId',account_key,'kind','CHARGE','balanceDeltaMinor',amount,'amountMinor',amount,'sourceType','ORDER','sourceId',order_key,'paymentMethod','CUSTOMER_CREDIT','notes',p->>'notes','occurredAt',stamp));

  elsif op='credit.settle' then
    perform servos_v2.require_permission('credit.settle');customer_key:=servos_v2.required_text(p,'customerId');amount:=servos_v2.minor(p,'amountMinor');method:=upper(servos_v2.required_text(p,'paymentMethod'));
    if amount<=0 or method not in ('CASH','MPESA','CARD') then raise exception 'VALIDATION_FAILED: settlement amount or method';end if;
    balance:=servos_v2.credit_balance(customer_key);if amount>balance then raise exception 'VALIDATION_FAILED: settlement exceeds outstanding balance';end if;
    if method in ('MPESA','CARD') and (nullif(trim(p->>'reference'),'') is null or coalesce((p->>'manuallyConfirmed')::boolean,false)=false) then raise exception 'VALIDATION_FAILED: manually confirm the external settlement and provide its reference';end if;
    select id into account_key from servos_v2.customer_credit_accounts where business_id=business and customer_id=customer_key for update;
    if account_key is null then raise exception 'INVALID_STATE: customer credit account not found';end if;
    entry_key:='settlement-'||(command->>'id');
    insert into servos_v2.customer_credit_entries(id,business_id,customer_id,account_id,kind,balance_delta_minor,amount_minor,source_type,source_id,payment_method,reference,notes,actor_id) values(entry_key,business,customer_key,account_key,'PAYMENT',-amount,amount,'CUSTOMER_ACCOUNT',entry_key,method,p->>'reference',p->>'notes',who);
    return servos_v2.put_record('customerCreditEntries',entry_key,jsonb_build_object('id',entry_key,'customerId',customer_key,'accountId',account_key,'kind','PAYMENT','balanceDeltaMinor',-amount,'amountMinor',amount,'sourceType','CUSTOMER_ACCOUNT','sourceId',entry_key,'paymentMethod',method,'reference',p->>'reference','notes',p->>'notes','occurredAt',stamp));

  elsif op='credit.reconcile' then
    perform servos_v2.require_permission('credit.reconcile');customer_key:=servos_v2.required_text(p,'customerId');statement:=servos_v2.minor(p,'statementBalanceMinor');balance:=servos_v2.credit_balance(customer_key);key:='credit-reconcile-'||(command->>'id');
    insert into servos_v2.customer_credit_reconciliations(id,business_id,customer_id,expected_balance_minor,statement_balance_minor,statement_reference,notes,status,actor_id) values(key,business,customer_key,balance,statement,servos_v2.required_text(p,'statementReference'),servos_v2.required_text(p,'notes'),case when balance=statement then 'MATCHED' else 'DISCREPANCY' end,who);
    if balance<>statement then insert into servos_v2.customer_credit_discrepancies(id,business_id,customer_id,reconciliation_id,expected_balance_minor,statement_balance_minor,variance_minor,actor_id) values('credit-discrepancy-'||(command->>'id'),business,customer_key,key,balance,statement,statement-balance,who);end if;
    changed:=servos_v2.put_record('customerCreditReconciliations',key,jsonb_build_object('id',key,'customerId',customer_key,'expectedBalanceMinor',balance,'statementBalanceMinor',statement,'statementReference',p->>'statementReference','notes',p->>'notes','status',case when balance=statement then 'MATCHED' else 'DISCREPANCY' end,'occurredAt',stamp));
    if balance<>statement then changed:=changed||servos_v2.put_record('customerCreditDiscrepancies','credit-discrepancy-'||(command->>'id'),jsonb_build_object('id','credit-discrepancy-'||(command->>'id'),'customerId',customer_key,'reconciliationId',key,'expectedBalanceMinor',balance,'statementBalanceMinor',statement,'varianceMinor',statement-balance,'status','OPEN'));end if;
    return changed;

  elsif op='credit.discrepancy.resolve' then
    perform servos_v2.require_permission('credit.reconcile');key:=servos_v2.required_text(p,'discrepancyId');
    update servos_v2.customer_credit_discrepancies set status='RESOLVED',outcome=servos_v2.required_text(p,'outcome'),resolution=servos_v2.required_text(p,'resolution'),resolved_by=who,resolved_at=stamp where id=key and business_id=business and status='OPEN';
    if not found then raise exception 'INVALID_STATE: open credit discrepancy not found';end if;return servos_v2.put_record('customerCreditDiscrepancies',key,jsonb_build_object('id',key,'customerId',(select customer_id from servos_v2.customer_credit_discrepancies where id=key),'reconciliationId',(select reconciliation_id from servos_v2.customer_credit_discrepancies where id=key),'expectedBalanceMinor',(select expected_balance_minor from servos_v2.customer_credit_discrepancies where id=key),'statementBalanceMinor',(select statement_balance_minor from servos_v2.customer_credit_discrepancies where id=key),'varianceMinor',(select variance_minor from servos_v2.customer_credit_discrepancies where id=key),'status','RESOLVED','outcome',p->>'outcome','resolution',p->>'resolution'));

  elsif op='credit.write_off' then
    perform servos_v2.require_permission('credit.write_off');customer_key:=servos_v2.required_text(p,'customerId');amount:=servos_v2.minor(p,'amountMinor');balance:=servos_v2.credit_balance(customer_key);
    if amount<=0 or amount>balance then raise exception 'VALIDATION_FAILED: write-off exceeds outstanding balance';end if;
    account_key:=(select id from servos_v2.customer_credit_accounts where business_id=business and customer_id=customer_key for update);if account_key is null then raise exception 'INVALID_STATE: customer credit account not found';end if;
    if not (select '*'=any(permissions) from servos_v2.members where user_id=who and active) then perform servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'credit.write_off',customer_key,who);end if;
    insert into servos_v2.customer_credit_entries(id,business_id,customer_id,account_id,kind,balance_delta_minor,amount_minor,source_type,source_id,notes,actor_id) values('writeoff-'||(command->>'id'),business,customer_key,account_key,'WRITE_OFF',-amount,amount,'CUSTOMER_ACCOUNT','writeoff-'||(command->>'id'),servos_v2.required_text(p,'reason'),who);
    return servos_v2.put_record('customerCreditEntries','writeoff-'||(command->>'id'),jsonb_build_object('id','writeoff-'||(command->>'id'),'customerId',customer_key,'accountId',account_key,'kind','WRITE_OFF','balanceDeltaMinor',-amount,'amountMinor',amount,'sourceType','CUSTOMER_ACCOUNT','sourceId','writeoff-'||(command->>'id'),'notes',p->>'reason','occurredAt',stamp));
  end if;
  raise exception 'PROTOCOL_UNSUPPORTED: financial controls operation';
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_financial_controls;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
  if command->>'operation' like 'mpesa.%' or command->>'operation' like 'credit.%' then return servos_v2.apply_financial_controls(command);end if;
  return servos_v2.dispatch_before_financial_controls(command);
end$$;

alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_financial_controls;
create function servos_v2.can_read_collection(collection_name text) returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
  select permissions into grants from servos_v2.members where user_id=auth.uid() and active;if grants is null then return false;end if;if '*'=any(grants) then return true;end if;
  needed:=case
    when collection_name in ('mpesaReceipts','mpesaDiscrepancies') then array['mpesa.reconcile','mpesa.record']
    when collection_name in ('customerCreditAccounts','customerCreditEntries','customerCreditReconciliations','customerCreditDiscrepancies') then array['credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off']
    else array[]::text[] end;
  return (needed<>array[]::text[] and grants&&needed) or servos_v2.can_read_collection_before_financial_controls(collection_name);
end$$;

revoke all on function servos_v2.apply_financial_controls(jsonb),servos_v2.dispatch(jsonb),servos_v2.can_read_collection(text) from public,anon,authenticated;
commit;