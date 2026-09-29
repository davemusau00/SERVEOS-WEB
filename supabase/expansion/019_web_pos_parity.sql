-- STAGED V2 ONLY. Hosted web POS parity for checked-in room charge, table movement,
-- merge, discounts and comps. Never enable beside legacy writers.
begin;

create or replace function servos_v2.apply_web_pos(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation'; p jsonb:=command->'payload'; who uuid:=auth.uid();
 order_key text:=servos_v2.required_text(p,'orderId'); order_data jsonb; folio jsonb; reservation jsonb;
 source_table jsonb; target_table jsonb; target_order jsonb; target_key text; source_key text;
 total bigint; paid bigint; discount bigint; percent numeric; reason text; changes jsonb:='[]';
 stamp timestamptz:=now(); receipt_key text;
begin
 if op='pos.roomCharge' then
   perform servos_v2.require_permission('folio.room_charge');
   perform servos_v2.assert_version(command,'orders',order_key);
   select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
   if order_data is null or order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order closed';end if;
   total:=coalesce((order_data->>'grandTotalMinor')::bigint,0);paid:=coalesce((order_data->>'amountPaidMinor')::bigint,0);
   if total<=paid then raise exception 'INVALID_STATE: order has no outstanding balance';end if;
   perform servos_v2.assert_version(command,'folios',servos_v2.required_text(p,'folioId'));
   folio:=servos_v2.read_record('folios',p->>'folioId');
   if folio->>'status'<>'OPEN' then raise exception 'INVALID_STATE: folio closed';end if;
   reservation:=servos_v2.read_record('roomReservations',folio->>'reservationId');
   if reservation->>'status'<>'CHECKED_IN' then raise exception 'INVALID_STATE: room charge requires checked-in guest';end if;
   changes:=changes||servos_v2.folio_charge(command,p->>'folioId','folio-pos-charge-'||(command->>'id'),total-paid,0,'SALES',jsonb_build_object('sourceType','POS_ROOM_CHARGE','orderId',order_key,'description','POS room charge'));
   order_data:=order_data||jsonb_build_object('amountPaidMinor',total,'paymentMethod','ROOM_CHARGE','roomChargeFolioId',p->>'folioId','state','COMPLETED','completedAt',stamp);
   source_key:=nullif(order_data->>'tableId','');
   if source_key is not null then perform servos_v2.assert_version(command,'tables',source_key);source_table:=servos_v2.read_record('tables',source_key);changes:=changes||servos_v2.put_record('tables',source_key,source_table||jsonb_build_object('currentOrderId',null,'state','CLEANING'));end if;
   changes:=changes||servos_v2.put_record('orders',order_key,order_data);
   receipt_key:='receipt-room-'||(command->>'id');
   changes:=changes||servos_v2.put_record('receiptDocuments',receipt_key,jsonb_build_object('id',receipt_key,'orderId',order_key,'number','ROOM-'||upper(substr(command->>'id',1,8)),'issuedAt',stamp,'totalMinor',total,'paidMinor',total,'balanceMinor',0,'paymentMethod','ROOM_CHARGE','folioId',p->>'folioId','items',order_data->'items','message','Charged to checked-in guest folio'));
   return changes;
 elsif op in ('order.discount','order.comp') then
   if op='order.discount' then perform servos_v2.require_permission('order.discount'); else perform servos_v2.require_permission('order.comp');end if;
   perform servos_v2.assert_version(command,'orders',order_key);
   select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
   if order_data is null or order_data->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: order closed';end if;
   total:=coalesce((order_data->>'grandTotalMinor')::bigint,0);paid:=coalesce((order_data->>'amountPaidMinor')::bigint,0);if paid>0 then raise exception 'INVALID_STATE: paid order cannot be discounted';end if;
   reason:=servos_v2.required_text(p,'reason');
   if op='order.discount' then percent:=(p->>'percent')::numeric;if percent is null or percent<=0 or percent>100 then raise exception 'VALIDATION_FAILED: discount percent';end if;discount:=round(total*percent/100);else discount:=total;end if;
   if not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=who and s.active and s.role in ('Admin','Manager')) then perform servos_v2.require_manager_approval((p->>'approvalToken')::uuid,case when op='order.discount' then 'order.discount' else 'order.comp' end,order_key,who);end if;
   changes:=changes||servos_v2.put_record('orders',order_key,order_data||jsonb_build_object('discountTotalMinor',discount,'grandTotalMinor',greatest(0,total-discount),'discountReason',reason,'discountType',case when op='order.discount' then 'DISCOUNT' else 'COMP' end,'discountedBy',who,'discountedAt',stamp));return changes;
 elsif op in ('order.transfer','order.merge') then
   perform servos_v2.require_permission(case when op='order.transfer' then 'order.transfer' else 'order.merge' end);
   perform servos_v2.assert_version(command,'orders',order_key);
   select data into order_data from servos_v2.records where collection='orders' and id=order_key and not archived for update;
   source_key:=nullif(order_data->>'tableId','');target_key:=servos_v2.required_text(p,'targetTableId');if source_key is null or source_key=target_key then raise exception 'VALIDATION_FAILED: target table';end if;
   perform servos_v2.assert_version(command,'tables',source_key);perform servos_v2.assert_version(command,'tables',target_key);source_table:=servos_v2.read_record('tables',source_key);target_table:=servos_v2.read_record('tables',target_key);
   if op='order.transfer' then if nullif(target_table->>'currentOrderId','') is not null then raise exception 'RESOURCE_OWNED: target table is occupied';end if;changes:=changes||servos_v2.put_record('tables',source_key,source_table||jsonb_build_object('currentOrderId',null,'state','CLEANING'));changes:=changes||servos_v2.put_record('tables',target_key,target_table||jsonb_build_object('currentOrderId',order_key,'state','ORDERING'));changes:=changes||servos_v2.put_record('orders',order_key,order_data||jsonb_build_object('tableId',target_key,'tableName',target_table->>'label'));return changes;end if;
   target_key:=servos_v2.required_text(p,'targetOrderId');perform servos_v2.assert_version(command,'orders',target_key);target_order:=servos_v2.read_record('orders',target_key);if target_order->>'state' in ('COMPLETED','VOIDED') then raise exception 'INVALID_STATE: target order closed';end if;
   changes:=changes||servos_v2.put_record('orders',target_key,target_order||jsonb_build_object('items',coalesce(target_order->'items','[]'::jsonb)||(coalesce(order_data->'items','[]'::jsonb)),'subtotalMinor',coalesce(target_order->'subtotalMinor',0)::bigint+coalesce(order_data->'subtotalMinor',0)::bigint,'grandTotalMinor',coalesce(target_order->'grandTotalMinor',0)::bigint+coalesce(order_data->'grandTotalMinor',0)::bigint));
   changes:=changes||servos_v2.put_record('orders',order_key,order_data||jsonb_build_object('state','VOIDED','mergedInto',target_key,'mergedAt',stamp));changes:=changes||servos_v2.put_record('tables',source_key,source_table||jsonb_build_object('currentOrderId',null,'state','CLEANING'));return changes;
 end if;
 raise exception 'PROTOCOL_UNSUPPORTED: hosted POS parity operation';
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_web_pos;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation' in ('pos.roomCharge','order.transfer','order.merge','order.discount','order.comp') then return servos_v2.apply_web_pos(command);end if;
 return servos_v2.dispatch_before_web_pos(command);
end$$;
revoke all on function servos_v2.apply_web_pos(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;