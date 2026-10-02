-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
reset role;
insert into servos_v2.members(user_id,active,permissions) values
  ('00000000-0000-4000-8000-000000000001',true,array['*']),
  ('00000000-0000-4000-8000-000000000002',true,array['records.view','devices.register'])
on conflict(user_id) do update set active=true,permissions=excluded.permissions;
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select servos_v2.put_record('organization','business','{"name":"Financial controls test"}');
select servos_v2.put_record('property','property','{"currency":"KES","timezone":"Africa/Nairobi"}');
select servos_v2.put_record('outlets','main','{"name":"Main","defaultStockLocationId":null}');
select servos_v2.put_record('customers','customer-credit','{"name":"Credit Customer"}');
select servos_v2.put_record('posPolicy','policy','{"vatBasisPoints":0,"cateringLevyBasisPoints":0}');
select servos_v2.put_record('orders','credit-order','{"customerId":"customer-credit","grandTotalMinor":50000,"amountPaidMinor":0,"state":"OPEN","items":[]}');

create function pg_temp.financial_command(op text,collection_name text,record_key text,p jsonb,device_key uuid default '10000000-0000-4000-8000-000000000081') returns jsonb language plpgsql security definer set search_path=pg_temp,servos_v2,public as $$
declare c jsonb;r jsonb;versions jsonb;seq bigint;
begin
  select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
  if not exists(select 1 from servos_v2.records where collection=collection_name and id=record_key) then versions:=versions||jsonb_build_array(jsonb_build_object('collection',collection_name,'id',record_key,'version',0));end if;
  select last_sequence+1 into seq from servos_v2.devices where id=device_key;
  c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId',device_key,'actorId',auth.uid(),'clientSequence',seq,'operation',op,'payload',p,'expectedVersions',versions);
  r:=public.servos_v2_execute(c);if r->>'status' is distinct from 'SYNCHRONIZED' then raise exception 'Financial command % rejected: %',op,r;end if;return r;
end$$;

set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000081','Financial controls workstation','WEB');
select pg_temp.financial_command('credit.account.save','customerCreditAccounts','account-credit','{"id":"account-credit","customerId":"customer-credit","creditLimitMinor":100000}');
select pg_temp.financial_command('credit.charge','orders','credit-order','{"orderId":"credit-order","customerId":"customer-credit","amountMinor":50000}');
reset role;
do $$begin
  if (select data->>'paymentMethod' from servos_v2.records where collection='orders' and id='credit-order')<>'CUSTOMER_CREDIT' then raise exception 'Credit charge did not mark internal receivable';end if;
  if (select data->>'amountPaidMinor' from servos_v2.records where collection='orders' and id='credit-order')<>'50000' then raise exception 'Credit charge did not conserve order balance';end if;
  if (select sum((data->>'balanceDeltaMinor')::bigint) from servos_v2.records where collection='customerCreditEntries')<>50000 then raise exception 'Credit ledger balance is wrong';end if;
end$$;

set local role authenticated;
select pg_temp.financial_command('credit.settle','customerCreditEntries','settlement-test','{"customerId":"customer-credit","amountMinor":20000,"paymentMethod":"CASH","notes":"Cash settlement"}');
reset role;
do $$begin if (select sum((data->>'balanceDeltaMinor')::bigint) from servos_v2.records where collection='customerCreditEntries')<>30000 then raise exception 'Settlement did not reduce receivable';end if;end$$;

set local role authenticated;
select pg_temp.financial_command('mpesa.receipt','mpesaReceipts','receipt-test','{"id":"receipt-test","code":"MPESA-001","account":"123456","receivedAmountMinor":10000,"receivedAt":"2026-09-29T10:00:00Z"}');
select pg_temp.financial_command('mpesa.discrepancy','mpesaDiscrepancies','discrepancy-test','{"id":"discrepancy-test","receiptId":"receipt-test","statementAmountMinor":9000,"statementReference":"STMT-001","reason":"Statement variance"}');
select pg_temp.financial_command('mpesa.discrepancy.resolve','mpesaDiscrepancies','discrepancy-test','{"discrepancyId":"discrepancy-test","outcome":"ACCEPTED_VARIANCE","resolution":"Manager accepted documented variance"}');
select pg_temp.financial_command('mpesa.reconcile','mpesaReceipts','receipt-test','{"receiptId":"receipt-test","statementAmountMinor":9000,"statementReference":"STMT-001","notes":"Reviewed manually"}');
reset role;
do $$begin
  if (select data->>'reconciliationStatus' from servos_v2.records where collection='mpesaReceipts' and id='receipt-test')<>'RECONCILED_WITH_DISCREPANCY' then raise exception 'M-Pesa reconciliation status is wrong';end if;
  if (select data->>'providerInitiated' from servos_v2.records where collection='mpesaReceipts' and id='receipt-test') is not null then raise exception 'M-Pesa receipt invented provider settlement';end if;
end$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$declare failed boolean:=false;r jsonb;begin
  perform public.servos_v2_register_device('10000000-0000-4000-8000-000000000082','Restricted finance workstation','WEB');
  begin perform pg_temp.financial_command('credit.write_off','customerCreditEntries','writeoff-denied','{"customerId":"customer-credit","amountMinor":1000,"reason":"Bad debt"}','10000000-0000-4000-8000-000000000082');exception when others then failed:=true;end;
  if not failed then raise exception 'Unauthorized write-off was accepted';end if;
end$$;
rollback;