-- STAGED V2 ONLY. POS tenders and till sessions; requires 013_pos.sql.
-- Never apply to the live business project or enable beside the legacy writer.
begin;

alter table servos_v2.control add column receipt_sequence bigint not null default 0 check(receipt_sequence>=0);

create or replace function servos_v2.protect_ledger_records() returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments','goodsReceipts','supplierPayments','cashMovements') then raise exception 'Immutable business history';end if;
 if tg_op='UPDATE' and new.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments','goodsReceipts','supplierPayments','cashMovements') then raise exception 'Immutable business history';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;

create function servos_v2.apply_payments(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();
 order_key text:=p->>'orderId';order_data jsonb;table_data jsonb;account jsonb;till jsonb;
 till_key text;table_key text;method text;reference text;payment_id text;journal_id text;receipt_id text;
 amount bigint;received bigint;tender bigint;paid bigint;total bigint;vat bigint;levy bigint;net bigint;
 tax_piece bigint;levy_piece bigint;leg jsonb;line_no integer:=0;legs integer:=0;sum_amount bigint:=0;
 changed jsonb:='[]';journal_lines jsonb;payment_ids jsonb:='[]';order_items jsonb;
 cash_in bigint;cash_out bigint;opening bigint;expected bigint;counted bigint;variance bigint;
 reason text;identity_data jsonb:='{}';property_data jsonb:='{}';outlet_data jsonb:='{}';receipt_no bigint;
 stamp timestamptz:=now();
begin
 if op='till.open' then
  perform servos_v2.require_permission('till.open');
  till_key:=servos_v2.required_text(p,'id');perform servos_v2.assert_version(command,'tillSessions',till_key);
  perform 1 from servos_v2.records r where r.collection='tillSessions' and r.data->>'status'='OPEN' for update;
  if found then raise exception 'INVALID_STATE: a till session is already open';end if;
  opening:=servos_v2.minor(p,'openingFloatMinor');
  return servos_v2.put_record('tillSessions',till_key,jsonb_build_object(
   'status','OPEN','openingFloatMinor',opening,'cashSalesMinor',0,'cashPaidInMinor',0,
   'cashPaidOutMinor',0,'cashRefundsMinor',0,'expectedCashMinor',opening,
   'openedAt',stamp,'openedBy',who,'openingReason',nullif(trim(p->>'reason'),'')));
 elsif op='till.cashMovement' then
  perform servos_v2.require_permission('till.cashMovement');
  till_key:=servos_v2.required_text(p,'tillSessionId');perform servos_v2.assert_version(command,'tillSessions',till_key);
  select r.data into till from servos_v2.records r where r.collection='tillSessions' and r.id=till_key and not r.archived for update;
  if till is null or till->>'status'<>'OPEN' then raise exception 'INVALID_STATE: till is not open';end if;
  amount:=servos_v2.minor(p,'amountMinor');reason:=servos_v2.required_text(p,'reason');method:=upper(servos_v2.required_text(p,'direction'));
  if amount<=0 or method not in ('PAID_IN','PAID_OUT') then raise exception 'VALIDATION_FAILED: cash movement';end if;
  if method='PAID_OUT' and amount>(till->>'expectedCashMinor')::bigint then raise exception 'VALIDATION_FAILED: cash out exceeds expected drawer cash';end if;
  if method='PAID_IN' then till:=till||jsonb_build_object('cashPaidInMinor',(till->>'cashPaidInMinor')::bigint+amount,'expectedCashMinor',(till->>'expectedCashMinor')::bigint+amount);
  else till:=till||jsonb_build_object('cashPaidOutMinor',(till->>'cashPaidOutMinor')::bigint+amount,'expectedCashMinor',(till->>'expectedCashMinor')::bigint-amount);end if;
  changed:=servos_v2.put_record('tillSessions',till_key,till);
  return changed||servos_v2.put_record('cashMovements','cash-'||(command->>'id'),jsonb_build_object(
   'tillSessionId',till_key,'direction',method,'amountMinor',amount,'reason',reason,
   'actorId',who,'occurredAt',stamp,'sourceCommandId',command->>'id'));
 elsif op='till.close' then
  perform servos_v2.require_permission('till.close');
  till_key:=servos_v2.required_text(p,'id');perform servos_v2.assert_version(command,'tillSessions',till_key);
  select r.data into till from servos_v2.records r where r.collection='tillSessions' and r.id=till_key and not r.archived for update;
  if till is null or till->>'status'<>'OPEN' then raise exception 'INVALID_STATE: till is not open';end if;
  if exists(select 1 from servos_v2.records r where r.collection='orders' and not r.archived and r.data->>'state' not in ('COMPLETED','VOIDED')) then raise exception 'INVALID_STATE: close open orders before closing the till';end if;
  counted:=servos_v2.minor(p,'countedCashMinor');expected:=(till->>'expectedCashMinor')::bigint;
  variance:=counted-expected;
  if variance<>0 then
   perform servos_v2.require_permission('till.override_variance');
   reason:=servos_v2.required_text(p,'varianceReason');
  end if;
  return servos_v2.put_record('tillSessions',till_key,till||jsonb_build_object(
   'status','CLOSED','countedCashMinor',counted,'cashVarianceMinor',variance,
   'closedAt',stamp,'closedBy',who,'varianceReason',reason));
 end if;

 if op not in ('payment.record','payment.split') then raise exception 'PROTOCOL_UNSUPPORTED: payment operation';end if;
 perform servos_v2.require_permission('payment.record');
 if op='payment.split' then
  if jsonb_typeof(p->'payments') is distinct from 'array' or jsonb_array_length(p->'payments') not between 1 and 10 then raise exception 'VALIDATION_FAILED: split requires one to ten tender lines';end if;
  legs:=jsonb_array_length(p->'payments');
 else legs:=1;end if;
 perform servos_v2.assert_version(command,'orders',order_key);
 select r.data into order_data from servos_v2.records r where r.collection='orders' and r.id=order_key and not r.archived for update;
 if order_data is null or order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order closed';end if;
 total:=servos_v2.minor(order_data,'grandTotalMinor');paid:=servos_v2.minor(order_data,'amountPaidMinor');
 if total<=0 or paid>=total then raise exception 'INVALID_STATE: order has no outstanding balance';end if;
 if op='payment.split' then
  for leg in select value from jsonb_array_elements(p->'payments') loop
   amount:=servos_v2.minor(leg,'amountMinor');if amount<=0 then raise exception 'VALIDATION_FAILED: every split tender must be positive';end if;sum_amount:=sum_amount+amount;
  end loop;
  if sum_amount<>total-paid then raise exception 'VALIDATION_FAILED: split must equal the exact outstanding balance';end if;
 else
  amount:=servos_v2.minor(p,'amountMinor');
  if amount<=0 or amount>total-paid then raise exception 'VALIDATION_FAILED: payment exceeds outstanding balance';end if;
  sum_amount:=amount;
 end if;

 -- One open till and every relevant baseline are locked/checked before any leg posts.
 select r.id,r.data into till_key,till from servos_v2.records r where r.collection='tillSessions' and r.data->>'status'='OPEN' and not r.archived order by r.data->>'openedAt' desc limit 1 for update;
 if till is null then raise exception 'INVALID_STATE: open a till before accepting payment';end if;
 perform servos_v2.assert_version(command,'tillSessions',till_key);
 if op='payment.split' then
  for leg in select value from jsonb_array_elements(p->'payments') loop
   perform servos_v2.assert_version(command,'paymentAccounts',servos_v2.required_text(leg,'accountId'));
  end loop;
 else perform servos_v2.assert_version(command,'paymentAccounts',servos_v2.required_text(p,'accountId'));end if;

 for leg in
  select value from jsonb_array_elements(case when op='payment.split' then p->'payments' else jsonb_build_array(p) end)
 loop
  line_no:=line_no+1;amount:=servos_v2.minor(leg,'amountMinor');
  select r.data into account from servos_v2.records r where r.collection='paymentAccounts' and r.id=servos_v2.required_text(leg,'accountId') and not r.archived for share;
  if account is null then raise exception 'VALIDATION_FAILED: payment account missing';end if;
  method:=upper(coalesce(account->>'method',''));
  if method not in ('CASH','MPESA','CARD') then raise exception 'VALIDATION_FAILED: unsupported POS tender';end if;
  reference:=null;
  if method='CASH' then
   tender:=servos_v2.minor(leg,'cashTenderedMinor');
   if tender<amount then raise exception 'VALIDATION_FAILED: cash tender is below payment';end if;
   till:=till||jsonb_build_object('cashSalesMinor',(till->>'cashSalesMinor')::bigint+amount,'expectedCashMinor',(till->>'expectedCashMinor')::bigint+amount);
  else
   if leg->'manuallyConfirmed' is distinct from 'true'::jsonb then raise exception 'VALIDATION_FAILED: manually confirm external payment';end if;
   reference:=upper(servos_v2.required_text(leg,'reference'));
   if method='MPESA' and (length(reference)<6 or length(reference)>20 or reference !~ '^[A-Z0-9]+$') then raise exception 'VALIDATION_FAILED: M-Pesa transaction code';end if;
   if method='CARD' and length(reference)<2 then raise exception 'VALIDATION_FAILED: card authorization reference';end if;
   perform pg_advisory_xact_lock(hashtextextended(method||':'||coalesce(account->>'number',leg->>'accountId')||':'||reference,0));
   if exists(select 1 from servos_v2.records r where r.collection='payments' and r.data->>'reference'=reference and r.data->>'method'=method and (method='MPESA' or r.data->>'accountId'=leg->>'accountId')) then raise exception 'DUPLICATE_REFERENCE: external payment already recorded';end if;
   if method='MPESA' then
    received:=servos_v2.minor(leg,'receivedAmountMinor');
    if received<>amount then raise exception 'VALIDATION_FAILED: this payment must allocate the full manually confirmed M-Pesa amount';end if;
    perform servos_v2.required_text(leg,'receivedAt');
    if (leg->>'receivedAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'VALIDATION_FAILED: M-Pesa timestamp must include timezone';end if;
    perform (leg->>'receivedAt')::timestamptz;
   end if;
  end if;
  payment_id:='payment-'||(command->>'id')||'-'||line_no;
  changed:=changed||servos_v2.put_record('payments',payment_id,jsonb_build_object(
   'orderId',order_key,'tillSessionId',till_key,'amountMinor',amount,'currency','KES','method',method,
   'accountId',leg->>'accountId','reference',reference,'cashTenderedMinor',case when method='CASH' then tender else null end,
   'changeMinor',case when method='CASH' then tender-amount else null end,
   'receivedAt',case when method='MPESA' then leg->>'receivedAt' else null end,
   'confirmation',case when method='CASH' then 'CASH_RECEIVED' else 'MANUALLY_CONFIRMED' end,
   'status','PAID','actorId',who,'occurredAt',stamp,'sourceCommandId',command->>'id'));
  payment_ids:=payment_ids||jsonb_build_array(payment_id);
  tax_piece:=round((order_data->>'taxTotalMinor')::numeric*(paid+amount)/total)-round((order_data->>'taxTotalMinor')::numeric*paid/total);
  levy_piece:=round((order_data->>'cateringLevyTotalMinor')::numeric*(paid+amount)/total)-round((order_data->>'cateringLevyTotalMinor')::numeric*paid/total);
  net:=amount-tax_piece-levy_piece;
  journal_lines:=jsonb_build_array(jsonb_build_object('accountCode',coalesce(account->>'accountCode',method),'debitMinor',amount,'creditMinor',0));
  if net>0 then journal_lines:=journal_lines||jsonb_build_array(jsonb_build_object('accountCode','SALES','debitMinor',0,'creditMinor',net));end if;
  if tax_piece>0 then journal_lines:=journal_lines||jsonb_build_array(jsonb_build_object('accountCode','VAT_PAYABLE','debitMinor',0,'creditMinor',tax_piece));end if;
  if levy_piece>0 then journal_lines:=journal_lines||jsonb_build_array(jsonb_build_object('accountCode','LEVY_PAYABLE','debitMinor',0,'creditMinor',levy_piece));end if;
  journal_id:='journal-'||payment_id;
  changed:=changed||servos_v2.post_journal(command,journal_id,'PAYMENT',payment_id,'POS tender settlement',journal_lines);
  order_data:=order_data||jsonb_build_object('amountPaidMinor',paid+amount,'paymentMethod',method,'paymentIds',coalesce(order_data->'paymentIds','[]'::jsonb)||jsonb_build_array(payment_id));
  paid:=paid+amount;
 end loop;
 changed:=changed||servos_v2.put_record('tillSessions',till_key,till);
 if paid=total then
  order_data:=order_data||jsonb_build_object('state','COMPLETED','completedAt',stamp);
  table_key:=nullif(order_data->>'tableId','');
  if table_key is not null then
   perform servos_v2.assert_version(command,'tables',table_key);
   select r.data into table_data from servos_v2.records r where r.collection='tables' and r.id=table_key and not r.archived for update;
   if table_data is null or table_data->>'currentOrderId'<>order_key then raise exception 'RESOURCE_OWNED: order no longer owns its table';end if;
   changed:=changed||servos_v2.put_record('tables',table_key,table_data||jsonb_build_object('currentOrderId',null,'state','CLEANING'));
  end if;
 end if;
 changed:=changed||servos_v2.put_record('orders',order_key,order_data);

 -- Immutable receipt snapshot is captured for partial and final settlement.
 select coalesce((select data from servos_v2.records where collection='organization' and id='business'),'{}'::jsonb) into identity_data;
 select coalesce((select data from servos_v2.records where collection='property' and id='property'),'{}'::jsonb) into property_data;
 select coalesce((select data from servos_v2.records where collection='outlets' and id=order_data->>'outletId'),'{}'::jsonb) into outlet_data;
 update servos_v2.control set receipt_sequence=receipt_sequence+1 where singleton returning receipt_sequence into receipt_no;
 receipt_id:='receipt-'||(command->>'id');
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',x->'id','description',x->'productName','quantity',x->'quantity',
  'unitPriceMinor',x->'unitPriceMinor','amountMinor',x->'lineTotalMinor','discountMinor',x->'discountMinor',
  'netMinor',x->'netMinor','taxMinor',x->'vatMinor','levyMinor',x->'levyMinor',
  'portion',x->'portionSnapshot'->>'name',
  'modifiers',(select coalesce(jsonb_agg(jsonb_build_object('name',m->>'name')),'[]'::jsonb) from jsonb_array_elements(coalesce(x->'modifiers','[]'::jsonb)) m)
 ) order by (x->>'roundNo')::integer,x->>'id'),'[]'::jsonb) into order_items
 from jsonb_array_elements(coalesce(order_data->'items','[]'::jsonb)) x where x->>'state'<>'VOIDED';
 if coalesce(length(trim(identity_data->>'name')),0)=0 or property_data->>'currency' is distinct from 'KES' or coalesce(length(trim(property_data->>'timezone')),0)=0 then
  raise exception 'VALIDATION_FAILED: business receipt identity and KES property settings are required';
 end if;
 changed:=changed||servos_v2.put_record('receiptDocuments',receipt_id,jsonb_build_object(
  'schemaVersion',1,'orderId',order_key,'sourceCommandId',command->>'id','number','V2-'||lpad(receipt_no::text,8,'0'),
  'orderNumber',order_data->>'orderNumber','issuedAt',stamp,'actorId',who,
  'business',jsonb_build_object('name',identity_data->>'name','address',property_data->>'address','phone',property_data->>'phone','email',property_data->>'email'),
  'outlet',outlet_data->>'name','cashierId',who,'table',order_data->>'tableName','tab',order_data->>'tabName',
  'items',order_items,'currency',property_data->>'currency','timezone',property_data->>'timezone','subtotalMinor',order_data->'subtotalMinor',
  'discountMinor',order_data->'discountTotalMinor','taxMinor',order_data->'taxTotalMinor',
  'levyMinor',order_data->'cateringLevyTotalMinor','totalMinor',total,'paidMinor',paid,'balanceMinor',total-paid,
  'paymentIds',payment_ids,'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'method',r.data->>'method','amountMinor',r.data->'amountMinor','reference',r.data->'reference','cashTenderedMinor',r.data->'cashTenderedMinor','changeMinor',r.data->'changeMinor','occurredAt',r.data->'occurredAt') order by r.id),'[]'::jsonb) from servos_v2.records r where r.collection='payments' and r.data->>'orderId'=order_key),
  'message',coalesce(property_data->>'receiptFooter','Thank you for your business.')));
 return changed;
end$$;

create or replace function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false;end if;if '*'=any(grants) then return true;end if;
 needed:=case
  when collection_name in ('cashMovements','tillSessions') then array['till.view','till.open','till.close','till.cashMovement','payments.view','payments.manage']
  when collection_name in ('payments','receiptDocuments','refunds') then array['payments.view','payments.manage','order.refund','payment.reverse']
  when collection_name in ('customers','roomTypes','assetCategories') then array['records.view']
  when collection_name='suppliers' then array['procurement.view','procurement.manage']
  when collection_name='products' then array['catalog.view','catalog.manage','pos.sell']
  when collection_name in ('stockItems','stockMovements','stockLocations') then array['inventory.view','inventory.count','inventory.adjust','inventory.transfer','inventory.waste','stock.view','stock.manage','pos.sell']
  when collection_name in ('outlets','tables','posPolicy') then array['business.view','floorplan.view','pos.sell','pos.open_tab','pos.manage_table']
  when collection_name='orders' then array['pos.sell','pos.open_tab','order.fire','kds.view','kds.update']
  when collection_name in ('purchaseOrders','goodsReceipts') then array['procurement.view','procurement.manage','procurement.receive']
  when collection_name in ('supplierPayables','supplierPayments') then array['procurement.view','procurement.manage','procurement.pay','accounting.view','accounting.manage']
  when collection_name='assetAcquisitions' then array['procurement.view','assets.view','assets.manage']
  when collection_name in ('assets','assetEvents') then array['assets.view','assets.manage','assets.operate']
  when collection_name='maintenanceOrders' then array['maintenance.view','maintenance.manage']
  when collection_name in ('rooms','ratePlans','roomBlocks') then array['rooms.view','rooms.manage','rooms.operate']
  when collection_name in ('roomReservations','stays','stayEvents','stayExtensions') then array['rooms.guests.view','rooms.operate']
  when collection_name in ('folios','folioEntries') then array['folio.view','folio.manage']
  when collection_name in ('hotelServices','paymentAccounts') then array['folio.view','folio.manage','payment.record','business.configure']
  when collection_name='journalEntries' then array['accounting.view','accounting.manage']
  when collection_name='employees' then array['staff.view','staff.manage']
  else array[]::text[] end;
 return grants&&needed;
end$$;

create or replace function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation' like 'payment.%' or command->>'operation' like 'till.%' then return servos_v2.apply_payments(command);end if;
 if command->>'operation' in ('record.save','record.archive','record.reactivate') then return servos_v2.apply_master(command);end if;
 if command->>'operation' like 'posPolicy.%' or command->>'operation' like 'outlet.%' or command->>'operation' like 'table.%' or command->>'operation' like 'order.%' or command->>'operation'='product.salesConfig' then return servos_v2.apply_pos(command);end if;
 if command->>'operation' like 'supplier.%' or command->>'operation' like 'purchaseOrder.%' or command->>'operation' like 'supplierPayable.%' or command->>'operation'='asset.commission' then return servos_v2.apply_procurement(command);end if;
 if command->>'operation' like 'product.%' or command->>'operation' like 'stockItem.%' or command->>'operation' like 'stockLocation.%' or command->>'operation' like 'inventory.%' then return servos_v2.apply_catalog_inventory(command);end if;
 if command->>'operation' like 'asset.%' or command->>'operation' like 'maintenance.%' then return servos_v2.apply_assets(command);end if;
 if command->>'operation' like 'folio.%' then return servos_v2.apply_folios(command);end if;
 if command->>'operation' like 'stay.%' then return servos_v2.apply_stays(command);end if;
 if command->>'operation' like 'room.%' or command->>'operation' like 'ratePlan.%' or command->>'operation' like 'roomReservation.%' then return servos_v2.apply_rooms(command);end if;
 raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';
end$$;

revoke all on function servos_v2.apply_payments(jsonb) from public,anon,authenticated;
commit;
