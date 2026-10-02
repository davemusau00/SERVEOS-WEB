-- Disposable PostgreSQL acceptance only. Never run against a business project.
--
-- Native -> Cloud command parity. Every mutation the Native production UI emits
-- must have a canonical v2 handler with the same meaning, or forcing the terminal
-- through v2 becomes a runtime PROTOCOL_UNSUPPORTED failure at the till.
begin;

insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by)
values('00000000-0000-4000-8000-000000000001','parity-admin','Parity Admin','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
on conflict(auth_user_id) do update set role='Admin',active=true;
insert into servos_v2.devices(id,owner_id,label,kind) values('10000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000001','Parity Terminal','DESKTOP') on conflict(id) do nothing;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';

-- POS needs an active policy record before lines can be added.
select servos_v2.put_record('posPolicy','policy','{"id":"policy","vatBasisPoints":0,"cateringLevyBasisPoints":0}');
select servos_v2.put_record('stockLocations','main','{"name":"Main Store","code":"MAIN","baseUnit":"unit"}');
select servos_v2.put_record('outlets','main','{"name":"Main Bar","propertyId":"property","type":"BAR","active":true,"defaultStockLocationId":"main"}');
select servos_v2.put_record('products','cola','{"name":"Cola","code":"COLA","priceMinor":500,"category":"DRINKS","portions":[],"modifiers":[],"recipeIngredients":[],"outletIds":[]}');
select servos_v2.put_record('customers','credit-cust','{"name":"Credit Customer"}');

-- A shared helper that builds the optimistic version set the same way the
-- established POS suite does: every current record version, plus an explicit
-- version 0 for a record that does not exist yet. The signature mirrors the POS
-- helper exactly, so the sixth positional argument is the expected error code.
create or replace function pg_temp.parity_command(
  op text,collection_name text,record_key text,payload jsonb,
  expected_status text default 'SYNCHRONIZED',
  expected_code text default null,
  device_key uuid default '10000000-0000-4000-8000-0000000000b1')
returns jsonb language plpgsql as $$
declare
  c jsonb;
  r jsonb;
  versions jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]')
    into versions from servos_v2.records;
  if not exists(select 1 from servos_v2.records where collection=collection_name and id=record_key) then
    versions:=versions||jsonb_build_array(jsonb_build_object('collection',collection_name,'id',record_key,'version',0));
  end if;
  c:=jsonb_build_object(
    'id',gen_random_uuid(),'schemaVersion',2,'deviceId',device_key,'actorId',auth.uid(),
    'clientSequence',(select coalesce(max(client_sequence),0)+1 from servos_v2.commands where device_id=device_key),
    'operation',op,'payload',payload,'expectedVersions',versions);
  r:=public.servos_v2_execute(c);
  if r->>'status' is distinct from expected_status then
    raise exception '% expected % but got %',op,expected_status,r;
  end if;
  if expected_code is not null and r#>>'{error,code}' is distinct from expected_code then
    raise exception '% expected code % but got %',op,expected_code,r;
  end if;
  return r;
end$$;

-- The credit account lives in its own ledger table, so it is created through the
-- established command rather than written as a plain record.
select pg_temp.parity_command('credit.account.save','customerCreditAccounts','credit-acct',
  jsonb_build_object('id','credit-acct','customerId','credit-cust','creditLimitMinor',500000));

-- Build three equivalent orders: one charged through the derived Native payload,
-- one through the explicit Web payload, and one that tries to under-charge.
select pg_temp.parity_command('order.create','orders','parity-native',
  jsonb_build_object('id','parity-native','outletId','main','name','Parity Native'));
select pg_temp.parity_command('order.addItem','orders','parity-native',
  jsonb_build_object('orderId','parity-native','productId','cola','itemId','line-1','quantity',2));
select pg_temp.parity_command('order.assignCustomer','orders','parity-native',
  jsonb_build_object('orderId','parity-native','customerId','credit-cust'));

select pg_temp.parity_command('order.create','orders','parity-web',
  jsonb_build_object('id','parity-web','outletId','main','name','Parity Web'));
select pg_temp.parity_command('order.addItem','orders','parity-web',
  jsonb_build_object('orderId','parity-web','productId','cola','itemId','line-1','quantity',2));
select pg_temp.parity_command('order.assignCustomer','orders','parity-web',
  jsonb_build_object('orderId','parity-web','customerId','credit-cust'));

select pg_temp.parity_command('order.create','orders','parity-bad',
  jsonb_build_object('id','parity-bad','outletId','main','name','Parity Bad Amount'));
select pg_temp.parity_command('order.addItem','orders','parity-bad',
  jsonb_build_object('orderId','parity-bad','productId','cola','itemId','line-1','quantity',2));
select pg_temp.parity_command('order.assignCustomer','orders','parity-bad',
  jsonb_build_object('orderId','parity-bad','customerId','credit-cust'));

-- The Native payload carries only orderId: the server must derive the customer
-- and the outstanding amount from the order itself.
select pg_temp.parity_command('customerCredit.charge','orders','parity-native',
  jsonb_build_object('orderId','parity-native'));
-- The explicit Web payload must produce exactly the same accounting result.
select pg_temp.parity_command('credit.charge','orders','parity-web',
  jsonb_build_object('orderId','parity-web','customerId','credit-cust','amountMinor',1000));
-- An explicit amount that does not settle the full balance is refused.
select pg_temp.parity_command('credit.charge','orders','parity-bad',
  jsonb_build_object('orderId','parity-bad','customerId','credit-cust','amountMinor',1),
  'REJECTED','VALIDATION_FAILED');

do $$
declare
  native_amount bigint;
  web_amount bigint;
  charged integer;
begin
  select amount_minor into native_amount
    from servos_v2.customer_credit_entries where source_id='parity-native';
  select amount_minor into web_amount
    from servos_v2.customer_credit_entries where source_id='parity-web';

  -- The two payload shapes must agree, or the Native and Web clients diverge.
  if native_amount is distinct from web_amount then
    raise exception 'the derived Native payload and the explicit Web payload must charge the same amount (% vs %)',native_amount,web_amount;
  end if;
  if native_amount is distinct from 1000 then
    raise exception 'the charge must settle the full outstanding balance, got %',native_amount;
  end if;

  -- Exactly one CHARGE entry per settled order, and none for the refused one.
  select count(*) into charged from servos_v2.customer_credit_entries where source_id='parity-native' and kind='CHARGE';
  if charged <> 1 then
    raise exception 'customerCredit.charge must create exactly one CHARGE entry, got %',charged;
  end if;
  select count(*) into charged from servos_v2.customer_credit_entries where source_id='parity-web' and kind='CHARGE';
  if charged <> 1 then
    raise exception 'credit.charge must create exactly one CHARGE entry, got %',charged;
  end if;
  if exists(select 1 from servos_v2.customer_credit_entries where source_id='parity-bad') then
    raise exception 'a refused under-charge must not create a credit entry';
  end if;

  -- Both settled orders are completed on customer credit.
  if exists(
    select 1 from servos_v2.records
    where collection='orders' and id in ('parity-native','parity-web')
      and (data->>'paymentMethod' is distinct from 'CUSTOMER_CREDIT' or data->>'state' is distinct from 'COMPLETED')) then
    raise exception 'both payload shapes must settle the order to customer credit';
  end if;
  -- The refused order is untouched and still open.
  if exists(select 1 from servos_v2.records where collection='orders' and id='parity-bad' and data->>'state'<>'OPEN') then
    raise exception 'a refused charge must leave the order open';
  end if;
end$$;

rollback;