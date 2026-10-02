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

select servos_v2.put_record('stockLocations','main','{"name":"Main Store","code":"MAIN","baseUnit":"unit"}');
select servos_v2.put_record('products','cola','{"name":"Cola","code":"COLA","priceMinor":500,"category":"DRINKS","portions":[],"modifiers":[],"recipeIngredients":[],"outletIds":[]}');
select servos_v2.put_record('customers','credit-cust','{"name":"Credit Customer"}');

-- A shared order-building helper, mirroring how the POS suite drives commands.
create or replace function pg_temp.parity_command(op text,payload jsonb)
returns jsonb language plpgsql as $$
declare
  seq bigint;
  data jsonb;
begin
  select coalesce(max(client_sequence),0)+1 into seq from servos_v2.commands where device_id='10000000-0000-4000-8000-0000000000b1';
  data := jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,
    'deviceId','10000000-0000-4000-8000-0000000000b1','actorId',auth.uid(),
    'clientSequence',seq,'operation',op,'payload',payload,
    'expectedVersions',coalesce(payload->'expectedVersions','[]'::jsonb));
  return public.servos_v2_execute(data);
end$$;

-- Build an open order with one fired line, then link the credit customer.
do $$
declare
  r jsonb;
  order_key text;
  order_data jsonb;
begin
  r := pg_temp.parity_command('order.create',jsonb_build_object('id','parity-order','outletId','main','name','Parity Order'));
  order_key := coalesce(r#>>'{records,0,id}', r->>'id');
  if order_key is null then
    raise exception 'order.create did not return a key: %',r;
  end if;
  r := pg_temp.parity_command('order.addItem',jsonb_build_object('orderId',order_key,'productId','cola','itemId','line-1','quantity',2));
  if (r->>'status') <> 'SYNCHRONIZED' then
    raise exception 'order.addItem failed: %',r;
  end if;
end$$;

-- customerCredit.charge: the Native payload carries only orderId and the server
-- must derive the customer and the outstanding amount from the order itself.
do $$
declare
  order_data jsonb;
  r jsonb;
  charged bigint;
begin
  select data into order_data from servos_v2.records where collection='orders' and id='parity-order' for update;
  if order_data->>'customerId' is null then
    perform pg_temp.parity_command('order.assignCustomer',jsonb_build_object('orderId','parity-order','customerId','credit-cust'));
    select data into order_data from servos_v2.records where collection='orders' and id='parity-order' for update;
  end if;

  -- The derived Native payload has no customerId and no amountMinor.
  r := pg_temp.parity_command('customerCredit.charge',jsonb_build_object('orderId','parity-order'));
  if (r->>'status') <> 'SYNCHRONIZED' then
    raise exception 'customerCredit.charge must accept the derived Native payload: %',r;
  end if;

  select data into order_data from servos_v2.records where collection='orders' and id='parity-order';
  if order_data->>'paymentMethod' is distinct from 'CUSTOMER_CREDIT' then
    raise exception 'the order must be settled to customer credit';
  end if;
  if order_data->>'state' is distinct from 'COMPLETED' then
    raise exception 'a fully credited order must complete';
  end if;

  -- Exactly one entry, stamped from the cutover provenance rule (not a re-charge).
  select count(*) into charged from servos_v2.customer_credit_entries where source_id='parity-order';
  if charged <> 1 then
    raise exception 'customerCredit.charge must create exactly one entry, got %',charged;
  end if;
  if not exists(select 1 from servos_v2.customer_credit_entries where source_id='parity-order' and kind='CHARGE') then
    raise exception 'the credit entry must be a CHARGE';
  end if;
end$$;

rollback;