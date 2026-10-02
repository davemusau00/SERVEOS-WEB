-- STAGED V2 ONLY. Native -> Cloud command parity.
--
-- Every mutation the Native production UI emits must have a canonical v2 server
-- handler with the same meaning, or forcing the terminal through v2 turns into a
-- runtime PROTOCOL_UNSUPPORTED failure at the till.
--
-- Two splits are closed here, deliberately and separately:
--
--   customerCredit.charge -> normalized into the canonical credit.charge.
--     Native sends only {orderId} and derives the customer and the outstanding
--     amount itself. The canonical credit.charge expects explicit customerId and
--     amountMinor. This handler derives them from the order using the identical
--     rule and reuses the canonical path, so the accounting effect is provably
--     the same rather than reimplemented.
--
--   order.compItem -> a genuine item-level comp, NOT the whole-order comp.
--     order.comp zeroes the entire order; order.compItem zeroes one line. They
--     are different business operations and must not be overloaded onto each
--     other, so both are defined explicitly.
begin;

-- Canonical customer credit charge, accepting either the explicit Web payload or
-- the derived Native payload.
create or replace function servos_v2.apply_credit_charge(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare who uuid:=servos_v2.require_permission('credit.charge');
        p jsonb:=command->'payload';order_key text;customer_key text;amount bigint;
        order_data jsonb;account_key text;limit_minor bigint;balance bigint;entry_key text;outstanding bigint;
        business uuid;stamp timestamptz:=now();
begin
  select business_id into business from servos_v2.control where singleton;
  order_key:=servos_v2.required_text(p,'orderId');
  perform servos_v2.assert_version(command,'orders',order_key);
  select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
  if order_data is null then raise exception 'VALIDATION_FAILED: order not found';end if;
  if order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order already closed';end if;

  -- The Native payload omits both fields; derive them exactly as the terminal does.
  customer_key:=coalesce(nullif(trim(p->>'customerId'),''),order_data->>'customerId');
  if customer_key is null or customer_key='' then
    raise exception 'VALIDATION_FAILED: link a customer before charging an account';
  end if;
  if order_data->>'customerId' is distinct from customer_key then
    raise exception 'VALIDATION_FAILED: order customer assignment is required';
  end if;
  outstanding:=(order_data->>'grandTotalMinor')::bigint
    - coalesce((order_data->>'amountPaidMinor')::bigint,0)
    - coalesce((order_data->>'amountCreditedMinor')::bigint,0);
  -- Only the explicit Web payload may pin an amount; Native always derives it.
  if jsonb_typeof(p->'amountMinor')='number' then
    amount:=(p->>'amountMinor')::bigint;
    if amount<>outstanding then
      raise exception 'VALIDATION_FAILED: credit charge must settle the outstanding order balance';
    end if;
  else
    amount:=outstanding;
  end if;
  if amount is null or amount<=0 then raise exception 'VALIDATION_FAILED: order has no balance to charge';end if;

  select id,credit_limit_minor into account_key,limit_minor from servos_v2.customer_credit_accounts
   where business_id=business and customer_id=customer_key and status='ACTIVE' for update;
  if account_key is null then raise exception 'INVALID_STATE: customer has no active credit account';end if;
  balance:=servos_v2.credit_balance(customer_key);
  if balance+amount>limit_minor then
    perform servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'credit.override_limit',customer_key,who);
  end if;

  entry_key:='credit-'||(command->>'id');
  if exists(select 1 from servos_v2.customer_credit_entries where id=entry_key) then
    -- Replay of the same command must not create a second entry.
    return servos_v2.put_record('customerCreditEntries',entry_key,
      (select data from servos_v2.customer_credit_entries where id=entry_key));
  end if;
  insert into servos_v2.customer_credit_entries(id,business_id,customer_id,account_id,kind,balance_delta_minor,amount_minor,source_type,source_id,payment_method,notes,actor_id)
    values(entry_key,business,customer_key,account_key,'CHARGE',amount,amount,'ORDER',order_key,'CUSTOMER_CREDIT',p->>'notes',who);
  order_data:=order_data||jsonb_build_object(
    'amountPaidMinor',coalesce((order_data->>'amountPaidMinor')::bigint,0)+amount,
    'paymentMethod','CUSTOMER_CREDIT','state','COMPLETED','creditEntryId',entry_key);
  return servos_v2.put_record('orders',order_key,order_data)
    ||servos_v2.put_record('customerCreditEntries',entry_key,jsonb_build_object(
      'id',entry_key,'customerId',customer_key,'accountId',account_key,'kind','CHARGE',
      'balanceDeltaMinor',amount,'amountMinor',amount,'sourceType','ORDER','sourceId',order_key,
      'paymentMethod','CUSTOMER_CREDIT','notes',p->>'notes','occurredAt',stamp));
end$$;

-- Item-level comp: zero exactly one line, leaving every other line payable.
create or replace function servos_v2.apply_order_comp_item(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare who uuid:=servos_v2.require_permission('order.comp');
        p jsonb:=command->'payload';order_key text;item_key text;reason text;
        order_data jsonb;items jsonb;updated jsonb;found boolean:=false;item jsonb;
begin
  order_key:=servos_v2.required_text(p,'orderId');
  item_key:=servos_v2.required_text(p,'itemId');
  reason:=servos_v2.required_text(p,'reason');
  perform servos_v2.assert_version(command,'orders',order_key);
  select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
  if order_data is null then raise exception 'VALIDATION_FAILED: order not found';end if;
  if order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order closed';end if;
  if coalesce((order_data->>'amountPaidMinor')::bigint,0)>0 then raise exception 'INVALID_STATE: partially paid order cannot be edited';end if;

  if not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=who and s.active and s.role in ('Admin','Manager')) then
    perform servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'order.comp',item_key,who);
  end if;

  items:='[]'::jsonb;
  for item in select value from jsonb_array_elements(order_data->'items') loop
    if item->>'id'=item_key then
      if coalesce(item->>'comped','false')::boolean then raise exception 'INVALID_STATE: line already comped';end if;
      -- Zero the line and move its value into discountMinor, exactly as native does.
      items:=items||jsonb_build_array(item||jsonb_build_object(
        'comped',true,'compReason',reason,
        'discountMinor',coalesce((item->>'lineTotalMinor')::bigint,0),
        'lineTotalMinor',0,'netMinor',0,'vatMinor',0,'levyMinor',0));
      found:=true;
    else
      items:=items||jsonb_build_array(item);
    end if;
  end loop;
  if not found then raise exception 'VALIDATION_FAILED: order line not found';end if;

  updated:=servos_v2.pos_recalculate(order_data||jsonb_build_object(
    'items',items,'compReason',reason,'compedBy',who,'compedAt',now()));
  -- A fully comped, fully fired order settles the same way native settles it.
  if (updated->>'grandTotalMinor')::bigint=0
     and jsonb_array_length(items)>0
     and not exists(select 1 from jsonb_array_elements(items) x where coalesce((x->>'stockFired')::boolean,false) is not true) then
    updated:=updated||jsonb_build_object('state','COMPLETED','completedAt',now());
  end if;
  return servos_v2.put_record('orders',order_key,updated);
end$$;

-- Link a customer to an open tab. The Native terminal emits this before a credit
-- charge, and it previously had no v2 handler at all: the ledger did not track
-- the operation, so the parity gate could not see the gap.
create or replace function servos_v2.apply_order_assign_customer(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare p jsonb:=command->'payload';order_key text;customer_key text;
        order_data jsonb;customer_data jsonb;customer_name text;paid bigint;
begin
  perform servos_v2.require_permission('pos.open_tab');
  order_key:=servos_v2.required_text(p,'orderId');
  customer_key:=servos_v2.required_text(p,'customerId');
  perform servos_v2.assert_version(command,'orders',order_key);
  select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
  if order_data is null then raise exception 'VALIDATION_FAILED: order not found';end if;
  if order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: closed orders cannot change customer';end if;
  paid:=coalesce((order_data->>'amountPaidMinor')::bigint,0)+coalesce((order_data->>'amountCreditedMinor')::bigint,0);
  if paid>0 then raise exception 'INVALID_STATE: assign the customer before settling any part of this tab';end if;
  select data into customer_data from servos_v2.records where collection='customers' and id=customer_key and not archived;
  if customer_data is null then raise exception 'VALIDATION_FAILED: customer not found';end if;
  customer_name:=customer_data->>'name';

  order_data:=order_data||jsonb_build_object('customerId',customer_key,'customerName',customer_name);
  -- A Walk-in tab adopts the customer name, matching native behaviour.
  if coalesce(order_data->>'tabName','') like 'Walk-in%' then
    order_data:=order_data||jsonb_build_object('tabName',customer_name);
  end if;
  return servos_v2.put_record('orders',order_key,order_data);
end$$;

-- Route both operations before the established chain. credit.charge is
-- intercepted here too, so the derived Native payload and the explicit Web
-- payload share exactly one implementation.
alter function servos_v2.dispatch(jsonb) rename to dispatch_before_native_parity;
create function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation' in ('credit.charge','customerCredit.charge') then
  return servos_v2.apply_credit_charge(command);
 end if;
 if command->>'operation'='order.compItem' then
  return servos_v2.apply_order_comp_item(command);
 end if;
 if command->>'operation'='order.assignCustomer' then
  return servos_v2.apply_order_assign_customer(command);
 end if;
 return servos_v2.dispatch_before_native_parity(command);
end$$;

revoke all on function servos_v2.dispatch(jsonb),servos_v2.dispatch_before_native_parity(jsonb),
  servos_v2.apply_credit_charge(jsonb),servos_v2.apply_order_comp_item(jsonb),
  servos_v2.apply_order_assign_customer(jsonb) from public,anon,authenticated;
commit;
