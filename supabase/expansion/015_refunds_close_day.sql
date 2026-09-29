-- STAGED V2 ONLY. Immutable refund/reversal events and close-day snapshots.
-- Requires 014_pos_payments.sql; never apply to a live project while legacy writes remain enabled.
begin;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_refunds;

create function servos_v2.apply_payment_refund(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();
 payment_key text:=servos_v2.required_text(p,'paymentId');payment jsonb;order_key text;order_data jsonb;
 original bigint;refunded bigint;amount bigint;method text;reason text;reference text;confirmed boolean;
 till_key text;till jsonb;journal jsonb;original_lines jsonb;line jsonb;refund_id text;journal_id text;
 cumulative bigint;allocated bigint:=0;piece bigint;lines jsonb:='[]'::jsonb;first_line integer:=0;changed jsonb:='[]'::jsonb;
 stamp timestamptz:=now();
begin
 if op not in ('payment.refund','payment.reverse') then raise exception 'PROTOCOL_UNSUPPORTED: refund operation';end if;
 if op='payment.reverse' then perform servos_v2.require_permission('payment.reverse');
 else perform servos_v2.require_permission('order.refund');end if;
 reason:=servos_v2.required_text(p,'reason');if length(trim(reason))<3 then raise exception 'VALIDATION_FAILED: refund reason';end if;
 perform servos_v2.assert_version(command,'payments',payment_key);
 select r.data into payment from servos_v2.records r where r.collection='payments' and r.id=payment_key and not r.archived for update;
 if payment is null or payment->>'status'<>'PAID' then raise exception 'INVALID_STATE: only paid transactions can be refunded';end if;
 original:=servos_v2.minor(payment,'amountMinor');method:=upper(payment->>'method');order_key:=servos_v2.required_text(payment,'orderId');
 select coalesce(sum((r.data->>'amountMinor')::bigint),0) into refunded from servos_v2.records r where r.collection='refunds' and r.data->>'paymentId'=payment_key;
 if op='payment.reverse' then amount:=original-refunded;else amount:=servos_v2.minor(p,'amountMinor');end if;
 if amount<=0 or refunded+amount>original then raise exception 'VALIDATION_FAILED: refund exceeds remaining refundable payment amount';end if;
 perform servos_v2.assert_version(command,'orders',order_key);
 select r.data into order_data from servos_v2.records r where r.collection='orders' and r.id=order_key and not r.archived for update;
 if order_data is null then raise exception 'VALIDATION_FAILED: source order missing';end if;
 reference:=upper(coalesce(nullif(trim(p->>'externalReference'),''),''));confirmed:=coalesce((p->>'manuallyConfirmed')::boolean,false);
 if method='CASH' then
  select r.id,r.data into till_key,till from servos_v2.records r where r.collection='tillSessions' and r.data->>'status'='OPEN' and not r.archived order by r.data->>'openedAt' desc limit 1 for update;
  if till is null then raise exception 'INVALID_STATE: open a till before paying a cash refund';end if;
  perform servos_v2.assert_version(command,'tillSessions',till_key);
  if amount>(till->>'expectedCashMinor')::bigint then raise exception 'VALIDATION_FAILED: cash refund exceeds expected cash in drawer';end if;
  till:=till||jsonb_build_object('cashRefundsMinor',(till->>'cashRefundsMinor')::bigint+amount,'expectedCashMinor',(till->>'expectedCashMinor')::bigint-amount);
  changed:=changed||servos_v2.put_record('tillSessions',till_key,till);
 elsif method in ('MPESA','CARD') then
  if reference='' or not confirmed then raise exception 'VALIDATION_FAILED: manually confirm the external refund and provide its reference';end if;
  perform pg_advisory_xact_lock(hashtextextended('REFUND:'||method||':'||reference,0));
  if exists(select 1 from servos_v2.records r where r.collection='refunds' and r.data->>'method'=method and r.data->>'externalReference'=reference) then raise exception 'DUPLICATE_REFERENCE: external refund already recorded';end if;
 else raise exception 'VALIDATION_FAILED: unsupported refund tender';end if;

 select r.data into journal from servos_v2.records r where r.collection='journalEntries' and r.data->>'sourceType'='PAYMENT' and r.data->>'sourceId'=payment_key and not r.archived;
 if journal is null or jsonb_typeof(journal->'lines') is distinct from 'array' then raise exception 'VALIDATION_FAILED: original payment journal missing';end if;
 original_lines:=journal->'lines';cumulative:=refunded+amount;
 for line in select value from jsonb_array_elements(original_lines) loop
  if coalesce((line->>'creditMinor')::bigint,0)>0 then
   piece:=round((line->>'creditMinor')::numeric*cumulative/original)-round((line->>'creditMinor')::numeric*refunded/original);
   if piece>0 then
    allocated:=allocated+piece;
    lines:=lines||jsonb_build_array(jsonb_build_object('accountCode',line->>'accountCode','debitMinor',piece,'creditMinor',0,'description','Refund reversal'));
   end if;
  elsif coalesce((line->>'debitMinor')::bigint,0)>0 and first_line=0 then
   first_line:=1;
   lines:=lines||jsonb_build_array(jsonb_build_object('accountCode',line->>'accountCode','debitMinor',0,'creditMinor',amount,'description','Refund settlement'));
  end if;
 end loop;
 if allocated<>amount then
  if allocated=0 then raise exception 'VALIDATION_FAILED: original payment has no refundable revenue allocation';end if;
  lines:=jsonb_set(lines,'{0,debitMinor}',to_jsonb((lines->0->>'debitMinor')::bigint+(amount-allocated)));
 end if;
 if first_line=0 then raise exception 'VALIDATION_FAILED: original payment tender account missing';end if;
 refund_id:='refund-'||(command->>'id');journal_id:='journal-'||refund_id;
 changed:=changed||servos_v2.put_record('refunds',refund_id,jsonb_build_object(
  'paymentId',payment_key,'orderId',order_key,'tillSessionId',till_key,'amountMinor',amount,'method',method,
  'reason',trim(reason),'externalReference',nullif(reference,''),'manuallyConfirmed',confirmed,
  'stockDisposition','NO_AUTOMATIC_RESTOCK','actorId',who,'occurredAt',stamp,'sourceCommandId',command->>'id'));
 changed:=changed||servos_v2.post_journal(command,journal_id,'REFUND',refund_id,'Refund for payment '||payment_key,lines);
 order_data:=order_data||jsonb_build_object('refundedMinor',(coalesce((order_data->>'refundedMinor')::bigint,0)+amount),'lastRefundAt',stamp);
 changed:=changed||servos_v2.put_record('orders',order_key,order_data);
 return changed;
end$$;

create function servos_v2.apply_close_day(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload';who uuid:=auth.uid();till_key text:=servos_v2.required_text(p,'tillId');
 till jsonb;payments jsonb;order_ids text[];orders jsonb;report_key text;gross bigint;tax bigint;levy bigint;discounts bigint;refunds bigint;
 cash bigint;mpesa bigint;card bigint;card_count integer;open_orders integer;refund_count integer;report jsonb;changed jsonb;
begin
 perform servos_v2.require_permission('reports.view');
 perform servos_v2.assert_version(command,'tillSessions',till_key);
 select r.data into till from servos_v2.records r where r.collection='tillSessions' and r.id=till_key and not r.archived for share;
 if till is null or till->>'status'<>'CLOSED' then raise exception 'INVALID_STATE: close the till before generating the close-day report';end if;
 if exists(select 1 from servos_v2.records where collection='closeDayReports' and data->>'tillSessionId'=till_key) then raise exception 'INVALID_STATE: close-day report already exists for this till';end if;
 select coalesce(array_agg(distinct r.data->>'orderId'),'{}'::text[]),coalesce(sum((r.data->>'amountMinor')::bigint) filter(where r.data->>'method'='CASH'),0),
  coalesce(sum((r.data->>'amountMinor')::bigint) filter(where r.data->>'method'='MPESA'),0),coalesce(sum((r.data->>'amountMinor')::bigint) filter(where r.data->>'method'='CARD'),0)
 into order_ids,cash,mpesa,card from servos_v2.records r where r.collection='payments' and r.data->>'tillSessionId'=till_key and not r.archived;
 select coalesce(jsonb_agg(r.data),'[]'::jsonb),coalesce(sum((r.data->>'grandTotalMinor')::bigint),0),coalesce(sum((r.data->>'taxTotalMinor')::bigint),0),
  coalesce(sum((r.data->>'cateringLevyTotalMinor')::bigint),0),coalesce(sum((r.data->>'discountTotalMinor')::bigint),0),count(*) filter(where r.data->>'state' not in ('COMPLETED','VOIDED'))
 into orders,gross,tax,levy,discounts,open_orders from servos_v2.records r where r.collection='orders' and r.id=any(order_ids) and not r.archived;
 if open_orders>0 then raise exception 'INVALID_STATE: close day contains an unsettled order';end if;
 select coalesce(sum((r.data->>'amountMinor')::bigint),0),count(*) into refunds,refund_count from servos_v2.records r where r.collection='refunds' and r.data->>'tillSessionId'=till_key and not r.archived;
 report_key:='close-day-'||till_key;
 report:=jsonb_build_object('tillSessionId',till_key,'openedAt',till->'openedAt','closedAt',till->'closedAt','generatedAt',now(),'generatedBy',who,
  'sales',jsonb_build_object('grossMinor',gross,'netMinor',gross-tax-levy-refunds,'taxMinor',tax,'levyMinor',levy,'refundsMinor',refunds),
  'tenders',jsonb_build_object('cashMinor',cash,'mpesaMinor',mpesa,'cardMinor',card),
  'adjustments',jsonb_build_object('discountsMinor',discounts,'refundCount',refund_count),
  'cash',jsonb_build_object('openingFloatMinor',till->'openingFloatMinor','paidInMinor',till->'cashPaidInMinor','paidOutMinor',till->'cashPaidOutMinor','refundsMinor',till->'cashRefundsMinor','expectedMinor',till->'expectedCashMinor','countedMinor',till->'countedCashMinor','varianceMinor',till->'cashVarianceMinor'),
  'orders',jsonb_build_object('settledCount',jsonb_array_length(orders),'openCount',0,'voidedCount',(select count(*) from jsonb_array_elements(orders) o where o->>'state'='VOIDED')),
  'reconciliation',jsonb_build_object('mpesaAvailable',false,'mpesaStatus','NOT_CONFIGURED','providerInitiated',false),
  'health',jsonb_build_object('cloudSyncStatus','NOT_VERIFIED_BY_CLOSE_DAY'));
 changed:=servos_v2.put_record('closeDayReports',report_key,report);
 return changed;
end$$;

alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_close_day;
create function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];
begin
 if collection_name<>'closeDayReports' then return servos_v2.can_read_collection_before_close_day(collection_name);end if;
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 return grants is not null and ('*'=any(grants) or grants&&array['reports.view','accounting.view']);
end$$;

create or replace function servos_v2.protect_ledger_records() returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments','refunds','goodsReceipts','supplierPayments','cashMovements','closeDayReports') then raise exception 'Immutable business history';end if;
 if tg_op='UPDATE' and new.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments','refunds','goodsReceipts','supplierPayments','cashMovements','closeDayReports') then raise exception 'Immutable business history';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;

create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation' in ('payment.refund','payment.reverse') then return servos_v2.apply_payment_refund(command);end if;
 if command->>'operation'='closeDay.generate' then return servos_v2.apply_close_day(command);end if;
 return servos_v2.dispatch_before_refunds(command);
end$$;

revoke all on function servos_v2.apply_payment_refund(jsonb),servos_v2.apply_close_day(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
