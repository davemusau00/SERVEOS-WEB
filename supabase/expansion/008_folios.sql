begin;
create function servos_v2.open_folio(command jsonb,reservation_key text) returns jsonb language plpgsql set search_path='' as $$
declare booking jsonb;
begin
 booking:=servos_v2.read_record('roomReservations',reservation_key);
 perform servos_v2.assert_version(command,'roomReservations',reservation_key);
 if booking->>'status' not in ('RESERVED','CHECKED_IN') then raise exception 'INVALID_STATE: reservation cannot open folio';end if;
 if exists(select 1 from servos_v2.records where collection='folios' and id=reservation_key) then raise exception 'DUPLICATE_REFERENCE: reservation already has folio';end if;
 perform servos_v2.assert_ownership('FOLIO',reservation_key,(command->>'deviceId')::uuid);
 return servos_v2.put_record('folios',reservation_key,jsonb_build_object('reservationId',reservation_key,'customerId',booking->>'customerId','currency','KES','balanceMinor',0,'depositMinor',0,'status','OPEN','openedAt',now(),'openedBy',auth.uid()));
end$$;

create function servos_v2.folio_entry(command jsonb,folio_key text,entry_key text,details jsonb,balance_delta bigint,deposit_delta bigint default 0) returns jsonb language plpgsql set search_path='' as $$
declare folio jsonb;balance bigint;deposit bigint;changes jsonb;
begin
 folio:=servos_v2.read_record('folios',folio_key);
 if folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: folio closed';end if;
 balance:=(folio->>'balanceMinor')::bigint+balance_delta;deposit:=(folio->>'depositMinor')::bigint+deposit_delta;
 if balance<0 or deposit<0 or balance>9000000000000000 or deposit>9000000000000000 then raise exception 'VALIDATION_FAILED: folio balance/deposit bounds';end if;
 changes:=servos_v2.put_record('folioEntries',entry_key,details||jsonb_build_object('folioId',folio_key,'balanceDeltaMinor',balance_delta,'depositDeltaMinor',deposit_delta,'sourceCommandId',command->>'id','actorId',auth.uid(),'postedAt',now()));
 return changes||servos_v2.put_record('folios',folio_key,folio||jsonb_build_object('balanceMinor',balance,'depositMinor',deposit,'updatedAt',now()));
end$$;

create function servos_v2.folio_charge(command jsonb,folio_key text,entry_key text,gross bigint,tax_bps integer,revenue_account text,details jsonb) returns jsonb language plpgsql set search_path='' as $$
declare tax bigint;net bigint;lines jsonb;changes jsonb:='[]';
begin
 if gross<0 or gross>100000000000000 or tax_bps is null or tax_bps not between 0 and 10000 then raise exception 'VALIDATION_FAILED: charge money/tax';end if;
 tax:=round(gross::numeric*tax_bps/(10000+tax_bps))::bigint;net:=gross-tax;
 if gross>0 then
  lines:=jsonb_build_array(jsonb_build_object('accountCode','GUEST_RECEIVABLE','debitMinor',gross,'creditMinor',0),jsonb_build_object('accountCode',revenue_account,'debitMinor',0,'creditMinor',net));
  if tax>0 then lines:=lines||jsonb_build_array(jsonb_build_object('accountCode','TAX_PAYABLE','debitMinor',0,'creditMinor',tax));end if;
  changes:=servos_v2.post_journal(command,'folio-'||entry_key,'FOLIO',folio_key,'Folio charge',lines);
 end if;
 return changes||servos_v2.folio_entry(command,folio_key,entry_key,details||jsonb_build_object('kind','CHARGE','grossMinor',gross,'netMinor',net,'taxMinor',tax,'taxBasisPoints',tax_bps,'revenueAccount',revenue_account),gross);
end$$;

create function servos_v2.post_accommodation(command jsonb,folio_key text,settle_booked boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare booking jsonb;stay jsonb;rate jsonb;period integer;due_at timestamptz;entry_key text;changes jsonb:='[]';
begin
 booking:=servos_v2.read_record('roomReservations',folio_key);stay:=servos_v2.read_record('stays',folio_key);rate:=booking->'rateSnapshot';
 if stay->>'status'<>'CHECKED_IN' or booking->>'status'<>'CHECKED_IN' then raise exception 'INVALID_STATE: accommodation requires active stay';end if;
 for period in 0..(booking->>'units')::integer-1 loop
  due_at:=(booking->>'startsAt')::timestamptz+make_interval(days=>period);
  if not settle_booked and due_at>now() then continue;end if;
  entry_key:='accommodation-'||md5(folio_key||':'||period);
  if exists(select 1 from servos_v2.records where collection='folioEntries' and id=entry_key) then continue;end if;
  changes:=changes||servos_v2.folio_charge(command,folio_key,entry_key,servos_v2.minor(rate,'priceMinor'),(rate->>'taxBasisPoints')::integer,'ACCOMMODATION_REVENUE',jsonb_build_object('sourceType','ACCOMMODATION','reservationId',folio_key,'period',period,'periodStartsAt',due_at,'rateSnapshot',rate,'description',case rate->>'mode' when 'DAY_USE' then 'Day-use accommodation' else 'Nightly accommodation' end));
 end loop;
 return changes;
end$$;

create function servos_v2.apply_folios(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';key text:=servos_v2.required_text(p,'id');folio jsonb;booking jsonb;entry jsonb;service jsonb;account jsonb;
 amount bigint;tender bigint;method text;reference text;payment_key text:='folio-payment-'||(command->>'id');entry_key text:='entry-'||(command->>'id');changes jsonb:='[]';lines jsonb;quantity integer;settle_booked boolean;
begin
 perform servos_v2.require_permission('folio.manage');perform servos_v2.assert_version(command,'folios',key);perform servos_v2.assert_ownership('FOLIO',key,(command->>'deviceId')::uuid);
 if op='folio.open' then return servos_v2.open_folio(command,key);end if;
 folio:=servos_v2.read_record('folios',key);if folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: folio closed';end if;
 if op='folio.postAccommodation' then
  settle_booked:=coalesce((p->>'settleBookedStay')::boolean,false);
  return servos_v2.post_accommodation(command,key,settle_booked);
 elsif op='folio.postService' then
  booking:=servos_v2.read_record('roomReservations',key);if booking->>'status'<>'CHECKED_IN' then raise exception 'INVALID_STATE: services require checked-in guest';end if;
  service:=servos_v2.read_record('hotelServices',servos_v2.required_text(p,'serviceId'));quantity:=(p->>'quantity')::integer;
  perform servos_v2.assert_version(command,'hotelServices',p->>'serviceId');
  if quantity is null or quantity not between 1 and 1000 then raise exception 'VALIDATION_FAILED: service quantity';end if;
  if service->>'currency' is distinct from 'KES' then raise exception 'VALIDATION_FAILED: service currency';end if;
  return servos_v2.folio_charge(command,key,entry_key,servos_v2.minor(service,'priceMinor')*quantity,(service->>'taxBasisPoints')::integer,'SERVICE_REVENUE',jsonb_build_object('sourceType','SERVICE','serviceId',p->>'serviceId','quantity',quantity,'serviceSnapshot',service,'description',servos_v2.required_text(service,'name')));
 elsif op in ('folio.deposit','folio.pay') then
  perform servos_v2.require_permission('payment.record');amount:=servos_v2.minor(p,'amountMinor');
  booking:=servos_v2.read_record('roomReservations',key);
  if booking->>'status' not in ('RESERVED','CHECKED_IN') then raise exception 'INVALID_STATE: cannot receive funds for cancelled or closed reservation';end if;
  if amount=0 then raise exception 'VALIDATION_FAILED: positive payment required';end if;
  if op='folio.pay' and amount>(folio->>'balanceMinor')::bigint then raise exception 'VALIDATION_FAILED: payment exceeds outstanding balance; record excess as deposit';end if;
  account:=servos_v2.read_record('paymentAccounts',servos_v2.required_text(p,'accountId'));method:=account->>'method';
  perform servos_v2.assert_version(command,'paymentAccounts',p->>'accountId');
  if coalesce(method,'') not in ('CASH','MPESA','CARD','BANK') then raise exception 'VALIDATION_FAILED: payment method';end if;
  if method='CASH' then
   tender:=servos_v2.minor(p,'cashTenderedMinor');if tender<amount then raise exception 'VALIDATION_FAILED: cash tendered';end if;
  else
   if p->'manuallyConfirmed' is distinct from 'true'::jsonb then raise exception 'VALIDATION_FAILED: manual payment confirmation required';end if;
   reference:=upper(servos_v2.required_text(p,'reference'));
   if exists(select 1 from servos_v2.records r where r.collection='payments' and r.data->>'reference'=reference and r.data->>'method'=method and (method='MPESA' or r.data->>'accountId'=p->>'accountId')) then raise exception 'DUPLICATE_REFERENCE: external payment already recorded';end if;
  end if;
  changes:=servos_v2.put_record('payments',payment_key,jsonb_build_object('folioId',key,'purpose',case op when 'folio.deposit' then 'DEPOSIT' else 'SETTLEMENT' end,'amountMinor',amount,'currency','KES','method',method,'accountId',p->>'accountId','reference',reference,'cashTenderedMinor',tender,'changeMinor',case when tender is not null then tender-amount else null end,'confirmation',case method when 'CASH' then 'CASH_RECEIVED' else 'MANUALLY_CONFIRMED' end,'recordedBy',auth.uid(),'recordedAt',now(),'sourceCommandId',command->>'id'));
  lines:=jsonb_build_array(jsonb_build_object('accountCode',case method when 'CASH' then 'CASH' else 'EXTERNAL_PAYMENT_CLEARING' end,'debitMinor',amount,'creditMinor',0),jsonb_build_object('accountCode',case op when 'folio.deposit' then 'GUEST_DEPOSITS' else 'GUEST_RECEIVABLE' end,'debitMinor',0,'creditMinor',amount));
  changes:=changes||servos_v2.post_journal(command,'journal-'||entry_key,'FOLIO',key,'Manually recorded guest funds',lines);
  return changes||servos_v2.folio_entry(command,key,entry_key,jsonb_build_object('kind',case op when 'folio.deposit' then 'DEPOSIT' else 'PAYMENT' end,'paymentId',payment_key,'amountMinor',amount),case op when 'folio.pay' then -amount else 0 end,case op when 'folio.deposit' then amount else 0 end);
 elsif op='folio.applyDeposit' then
  amount:=servos_v2.minor(p,'amountMinor');if amount=0 or amount>(folio->>'depositMinor')::bigint or amount>(folio->>'balanceMinor')::bigint then raise exception 'VALIDATION_FAILED: deposit application exceeds deposit or balance';end if;
  changes:=servos_v2.post_journal(command,'journal-'||entry_key,'FOLIO',key,'Apply guest deposit',jsonb_build_array(jsonb_build_object('accountCode','GUEST_DEPOSITS','debitMinor',amount,'creditMinor',0),jsonb_build_object('accountCode','GUEST_RECEIVABLE','debitMinor',0,'creditMinor',amount)));
  return changes||servos_v2.folio_entry(command,key,entry_key,jsonb_build_object('kind','DEPOSIT_APPLIED','amountMinor',amount),-amount,-amount);
 elsif op='folio.reverse' then
  perform servos_v2.require_permission('folio.reverse');entry:=servos_v2.read_record('folioEntries',servos_v2.required_text(p,'entryId'));perform servos_v2.required_text(p,'reason');
  if entry->>'folioId' is distinct from key or entry->>'kind' is distinct from 'CHARGE' then raise exception 'INVALID_STATE: only this folio charge can be reversed; payments require payout workflow';end if;
  if exists(select 1 from servos_v2.records r where r.collection='folioEntries' and r.data->>'reversesEntryId'=p->>'entryId') then raise exception 'DUPLICATE_REFERENCE: entry already reversed';end if;
  amount:=(entry->>'grossMinor')::bigint;if amount>(folio->>'balanceMinor')::bigint then raise exception 'INVALID_STATE: paid charge requires refund workflow';end if;
  if amount>0 then
   lines:=jsonb_build_array(jsonb_build_object('accountCode','GUEST_RECEIVABLE','debitMinor',0,'creditMinor',amount),jsonb_build_object('accountCode',entry->>'revenueAccount','debitMinor',(entry->>'netMinor')::bigint,'creditMinor',0));
   if (entry->>'taxMinor')::bigint>0 then lines:=lines||jsonb_build_array(jsonb_build_object('accountCode','TAX_PAYABLE','debitMinor',(entry->>'taxMinor')::bigint,'creditMinor',0));end if;
   changes:=servos_v2.post_journal(command,'journal-'||entry_key,'FOLIO',key,'Reverse folio charge: '||(p->>'reason'),lines);
  end if;
  return changes||servos_v2.folio_entry(command,key,entry_key,jsonb_build_object('kind','REVERSAL','reversesEntryId',p->>'entryId','reason',p->>'reason','amountMinor',amount),-amount);
 end if;
 raise exception 'PROTOCOL_UNSUPPORTED: folio operation';
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;
commit;
