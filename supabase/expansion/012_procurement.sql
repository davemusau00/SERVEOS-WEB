-- STAGED V2 ONLY. Procurement, receiving, supplier accounting and acquisition commissioning.
-- Never run this directly against the live business project before coordinated cutover.
begin;

create or replace function servos_v2.protect_ledger_records()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection in (
   'journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions',
   'stockMovements','receiptDocuments','payments','goodsReceipts','supplierPayments'
 ) then raise exception 'Immutable business history'; end if;
 if tg_op='UPDATE' and new.collection in (
   'journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions',
   'stockMovements','receiptDocuments','payments','goodsReceipts','supplierPayments'
 ) then raise exception 'Immutable business history'; end if;
 return case when tg_op='DELETE' then old else new end;
end$$;

create function servos_v2.apply_procurement(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';
 p jsonb:=command->'payload';
 key text:=p->>'id';
 who uuid:=auth.uid();

 current_data jsonb; current_archived boolean;
 supplier jsonb; stock jsonb; order_data jsonb; line jsonb; stored_line jsonb;
 receipt jsonb; payable jsonb; acquisition jsonb; next_data jsonb;
 items jsonb:='[]'; receipt_lines jsonb:='[]'; journal_lines jsonb:='[]'; changes jsonb:='[]';

 treatment text; line_key text; supplier_key text; stock_key text; location_key text; category_key text;
 description text; category text; account_code text; account_name text; method text; reference_key text;
 invoice_number text; invoice_date text; due_date text; room_key text; asset_location_key text; tag text;

 qty numeric; delivered numeric; accepted numeric; rejected numeric; ordered numeric; received numeric;
 current_qty numeric; stock_total numeric;

 old_cost bigint; next_cost bigint; unit_price bigint; line_total bigint; subtotal bigint:=0;
 stock_value bigint:=0; asset_value bigint:=0; expense_value bigint:=0; accepted_total bigint:=0;
 approval_by uuid;
 invoice_total bigint; payable_total bigint; amount bigint; due bigint; paid bigint; remaining bigint;
 ordinal integer;

 over_received boolean:=false; needs_location boolean:=false; all_received boolean:=true; all_matched boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'VALIDATION_FAILED: payload'; end if;

 if op in ('supplier.save','supplier.archive','supplier.reactivate') then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: supplier id'; end if;
  perform servos_v2.assert_version(command,'suppliers',key);
  select r.data,r.archived into current_data,current_archived
  from servos_v2.records r where r.collection='suppliers' and r.id=key for update;

  if op='supplier.save' then
   if current_archived then raise exception 'INVALID_STATE: reactivate supplier before editing'; end if;
   if jsonb_typeof(p->'data') is distinct from 'object' then raise exception 'VALIDATION_FAILED: supplier data'; end if;
   current_data:=p->'data';
   perform servos_v2.required_text(current_data,'name');
   perform servos_v2.required_text(current_data,'code');
   if current_data ? 'paymentTermsDays' and (
      jsonb_typeof(current_data->'paymentTermsDays') is distinct from 'number'
      or (current_data->>'paymentTermsDays')::integer not between 0 and 3650
   ) then raise exception 'VALIDATION_FAILED: payment terms'; end if;
   if exists(
      select 1 from servos_v2.records r
      where r.collection='suppliers' and r.id<>key and not r.archived
        and lower(r.data->>'code')=lower(trim(current_data->>'code'))
   ) then raise exception 'DUPLICATE_REFERENCE: supplier code'; end if;
   if exists(
      select 1 from jsonb_object_keys(current_data) field
      where field not in ('name','code','phone','email','contactPerson','kraPin','paymentTermsDays','notes')
   ) then raise exception 'VALIDATION_FAILED: unsupported supplier field'; end if;
   next_data:=jsonb_build_object(
    'name',trim(current_data->>'name'),
    'code',upper(trim(current_data->>'code')),
    'phone',coalesce(current_data->>'phone',''),
    'email',coalesce(current_data->>'email',''),
    'contactPerson',coalesce(current_data->>'contactPerson',''),
    'kraPin',coalesce(current_data->>'kraPin',''),
    'paymentTermsDays',coalesce((current_data->>'paymentTermsDays')::integer,0),
    'notes',coalesce(current_data->>'notes','')
   );
   return servos_v2.put_record('suppliers',key,next_data);
  end if;

  if current_data is null then raise exception 'VALIDATION_FAILED: supplier missing'; end if;

  if op='supplier.archive' then
   if exists(
      select 1 from servos_v2.records r
      where r.collection='purchaseOrders' and not r.archived
        and r.data->>'supplierId'=key and r.data->>'status' in ('APPROVED','PARTIALLY_RECEIVED')
   ) then raise exception 'INVALID_STATE: supplier has open purchase orders'; end if;
   if exists(
      select 1 from servos_v2.records r
      where r.collection='supplierPayables' and not r.archived
        and r.data->>'supplierId'=key and r.data->>'status'<>'PAID'
   ) then raise exception 'INVALID_STATE: supplier has open payables'; end if;
   return servos_v2.put_record('suppliers',key,current_data,true);
  end if;

  if exists(
     select 1 from servos_v2.records r
     where r.collection='suppliers' and r.id<>key and not r.archived
       and lower(r.data->>'code')=lower(current_data->>'code')
  ) then raise exception 'DUPLICATE_REFERENCE: supplier code'; end if;
  return servos_v2.put_record('suppliers',key,current_data,false);
 end if;

 if op='purchaseOrder.create' then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  if key is null or length(key) not between 1 and 128 then raise exception 'VALIDATION_FAILED: purchase order id'; end if;
  perform servos_v2.assert_version(command,'purchaseOrders',key);
  if exists(select 1 from servos_v2.records where collection='purchaseOrders' and id=key) then
   raise exception 'DUPLICATE_REFERENCE: purchase order';
  end if;

  supplier_key:=servos_v2.required_text(p,'supplierId');
  supplier:=servos_v2.read_record('suppliers',supplier_key);

  if jsonb_typeof(p->'items') is distinct from 'array'
     or jsonb_array_length(p->'items') not between 1 and 100
  then raise exception 'VALIDATION_FAILED: purchase-order lines'; end if;

  if exists(
    select 1 from jsonb_array_elements(p->'items') x
    group by x->>'lineId' having count(*)>1
  ) then raise exception 'DUPLICATE_REFERENCE: purchase line id'; end if;

  for line in select value from jsonb_array_elements(p->'items') loop
   line_key:=servos_v2.required_text(line,'lineId');
   treatment:=upper(coalesce(line->>'treatment','STOCK'));
   if treatment not in ('STOCK','EXPENSE','ASSET') then
    raise exception 'VALIDATION_FAILED: purchase-line treatment';
   end if;

   qty:=servos_v2.quantity_value(line,'quantityOrdered',false);
   unit_price:=servos_v2.minor(line,'unitPriceMinor');
   line_total:=round(qty*unit_price)::bigint;
   subtotal:=subtotal+line_total;

   if treatment='STOCK' then
    stock_key:=servos_v2.required_text(line,'stockItemId');
    stock:=servos_v2.read_record('stockItems',stock_key);
    if exists(
      select 1 from jsonb_array_elements(items) x
      where x->>'treatment'='STOCK' and x->>'stockItemId'=stock_key
    ) then raise exception 'DUPLICATE_REFERENCE: stock item on purchase order'; end if;

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','STOCK','displayName',stock->>'name',
     'stockItemId',stock_key,
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol',stock->>'baseUnit',
     'scanUnitQuantity',coalesce(stock->'scanUnitQuantity','1'::jsonb),
     'lineTotalMinor',line_total
    ));
   elsif treatment='EXPENSE' then
    description:=servos_v2.required_text(line,'description');
    category:=upper(coalesce(nullif(trim(line->>'expenseCategory'),''),'GENERAL'));
    account_code:=case category
      when 'GENERAL' then 'OPERATING_EXPENSE'
      when 'REPAIRS' then 'MAINTENANCE_EXPENSE'
      when 'MARKETING' then 'MARKETING_EXPENSE'
      when 'UTILITIES' then 'UTILITIES_EXPENSE'
      else null end;
    account_name:=case category
      when 'GENERAL' then 'Operating expense'
      when 'REPAIRS' then 'Maintenance expense'
      when 'MARKETING' then 'Marketing expense'
      when 'UTILITIES' then 'Utilities expense'
      else null end;
    if account_code is null then raise exception 'VALIDATION_FAILED: expense category'; end if;

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','EXPENSE','displayName',description,
     'description',description,'expenseCategory',category,
     'expenseAccountCode',account_code,'expenseAccountName',account_name,
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol','unit','scanUnitQuantity',1,
     'lineTotalMinor',line_total
    ));
   else
    if qty<>trunc(qty) or qty>100 then
     raise exception 'VALIDATION_FAILED: asset quantity must be whole units 1-100';
    end if;
    category_key:=servos_v2.required_text(line,'assetCategoryId');
    current_data:=servos_v2.read_record('assetCategories',category_key);
    description:=servos_v2.required_text(line,'assetName');

    items:=items||jsonb_build_array(jsonb_build_object(
     'lineId',line_key,'treatment','ASSET','displayName',description,
     'assetName',description,'assetCategoryId',category_key,
     'assetCategoryName',current_data->>'name',
     'quantityOrdered',qty,'quantityDelivered',0,'quantityReceived',0,'quantityRejected',0,
     'unitPriceMinor',unit_price,'unitSymbol','asset','scanUnitQuantity',1,
     'lineTotalMinor',line_total
    ));
   end if;
  end loop;

  if subtotal>100000000000 then raise exception 'VALIDATION_FAILED: purchase order total'; end if;

  next_data:=jsonb_build_object(
   'poNumber','PO-'||upper(substr(key,1,8)),
   'supplierId',supplier_key,'supplierName',supplier->>'name',
   'status','APPROVED','items',items,
   'subtotalMinor',subtotal,'taxTotalMinor',0,'grandTotalMinor',subtotal,
   'createdAt',now(),'createdBy',who,'approvedAt',now(),'approvedBy',who
  );
  return servos_v2.put_record('purchaseOrders',key,next_data);
 end if;

 if op='purchaseOrder.receive' then
  perform servos_v2.require_any_permission(array['procurement.receive']);
  key:=servos_v2.required_text(p,'purchaseOrderId');
  perform servos_v2.assert_version(command,'purchaseOrders',key);

  select r.data into order_data
  from servos_v2.records r
  where r.collection='purchaseOrders' and r.id=key and not r.archived
  for update;

  if order_data is null or order_data->>'status' not in ('APPROVED','PARTIALLY_RECEIVED') then
   raise exception 'INVALID_STATE: purchase order cannot receive';
  end if;

  supplier_key:=order_data->>'supplierId';
  supplier:=servos_v2.read_record('suppliers',supplier_key);

  if jsonb_typeof(p->'lines') is distinct from 'array'
     or jsonb_array_length(p->'lines') not between 1 and 100
  then raise exception 'VALIDATION_FAILED: goods receipt lines'; end if;

  if exists(
    select 1 from jsonb_array_elements(p->'lines') x
    group by x->>'lineId' having count(*)>1
  ) then raise exception 'DUPLICATE_REFERENCE: receipt line'; end if;

  location_key:=nullif(trim(p->>'locationId'),'');

  for line in select value from jsonb_array_elements(p->'lines') loop
   line_key:=servos_v2.required_text(line,'lineId');

   select value into stored_line
   from jsonb_array_elements(order_data->'items') x
   where x->>'lineId'=line_key;

   if stored_line is null then
    raise exception 'VALIDATION_FAILED: receipt line is not on purchase order';
   end if;

   delivered:=servos_v2.quantity_value(line,'quantityDelivered',false);
   accepted:=servos_v2.quantity_value(line,'quantityAccepted',true);
   rejected:=servos_v2.quantity_value(line,'quantityRejected',true);

   if abs((accepted+rejected)-delivered)>0.000001 then
    raise exception 'VALIDATION_FAILED: delivered must equal accepted plus rejected';
   end if;

   if rejected>0 and nullif(trim(line->>'rejectionReason'),'') is null then
    raise exception 'VALIDATION_FAILED: rejected quantity needs reason';
   end if;

   ordered:=(stored_line->>'quantityOrdered')::numeric;
   received:=coalesce((stored_line->>'quantityReceived')::numeric,0);
   if received+accepted>ordered+0.000001 then over_received:=true; end if;

   treatment:=stored_line->>'treatment';
   unit_price:=(stored_line->>'unitPriceMinor')::bigint;
   line_total:=round(accepted*unit_price)::bigint;
   accepted_total:=accepted_total+line_total;

   if treatment='STOCK' then
    needs_location:=true; stock_value:=stock_value+line_total;
   elsif treatment='ASSET' then
    if delivered<>trunc(delivered) or accepted<>trunc(accepted) or rejected<>trunc(rejected) then
     raise exception 'VALIDATION_FAILED: asset receipt quantities must be whole units';
    end if;
    asset_value:=asset_value+line_total;
   else
    expense_value:=expense_value+line_total;
   end if;

   receipt_lines:=receipt_lines||jsonb_build_array(stored_line||jsonb_build_object(
    'quantityDelivered',delivered,'quantityAccepted',accepted,'quantityRejected',rejected,
    'acceptedValueMinor',line_total,
    'rejectionReason',coalesce(line->>'rejectionReason','')
   ));
  end loop;

  if over_received then
   approval_by:=servos_v2.require_manager_approval((p->>'approvalToken')::uuid,'procurement.over_receive',p->>'purchaseOrderId',who);
  end if;

  if needs_location then
   if location_key is null then raise exception 'VALIDATION_FAILED: stock location required'; end if;
   perform servos_v2.read_record('stockLocations',location_key);
  end if;

  items:='[]';
  for stored_line in select value from jsonb_array_elements(order_data->'items') loop
   select value into line
   from jsonb_array_elements(receipt_lines) x
   where x->>'lineId'=stored_line->>'lineId';

   if line is not null then
    stored_line:=stored_line||jsonb_build_object(
      'quantityDelivered',coalesce((stored_line->>'quantityDelivered')::numeric,0)+(line->>'quantityDelivered')::numeric,
      'quantityReceived',coalesce((stored_line->>'quantityReceived')::numeric,0)+(line->>'quantityAccepted')::numeric,
      'quantityRejected',coalesce((stored_line->>'quantityRejected')::numeric,0)+(line->>'quantityRejected')::numeric
    );
   end if;

   if coalesce((stored_line->>'quantityReceived')::numeric,0)+0.000001
      < (stored_line->>'quantityOrdered')::numeric
   then all_received:=false; end if;

   items:=items||jsonb_build_array(stored_line);
  end loop;

  key:='receipt-'||(command->>'id');
  receipt:=jsonb_build_object(
   'grnNumber','GRN-'||upper(substr(command->>'id',1,8)),
   'purchaseOrderId',p->>'purchaseOrderId','poNumber',order_data->>'poNumber',
   'supplierId',supplier_key,'supplierName',supplier->>'name',
   'locationId',location_key,
   'supplierInvoiceNumber',coalesce(p->>'supplierInvoiceNumber',''),
   'deliveryNote',coalesce(p->>'deliveryNote',''),
   'notes',coalesce(p->>'notes',''),
   'lines',receipt_lines,
   'acceptedValueMinor',accepted_total,
   'treatmentTotals',jsonb_build_object(
      'stockMinor',stock_value,'assetMinor',asset_value,'expenseMinor',expense_value
   ),
   'status','POSTED','receivedAt',now(),'receivedBy',who
   ,'overReceiptApprovedBy',approval_by
  );

  changes:=changes||servos_v2.put_record('goodsReceipts',key,receipt);

  for line in select value from jsonb_array_elements(receipt_lines) loop
   accepted:=(line->>'quantityAccepted')::numeric;
   if accepted<=0 then continue; end if;

   treatment:=line->>'treatment';
   unit_price:=(line->>'unitPriceMinor')::bigint;
   line_total:=round(accepted*unit_price)::bigint;

   if treatment='STOCK' then
    stock_key:=line->>'stockItemId';
    perform servos_v2.assert_version(command,'stockItems',stock_key);

    select r.data into stock
    from servos_v2.records r
    where r.collection='stockItems' and r.id=stock_key and not r.archived
    for update;

    if stock is null then raise exception 'VALIDATION_FAILED: active stock item missing'; end if;

    current_qty:=coalesce((stock->'currentStock'->>location_key)::numeric,0);
    select coalesce(sum(value::numeric),0) into stock_total
    from jsonb_each_text(coalesce(stock->'currentStock','{}'::jsonb));

    old_cost:=coalesce((stock->>'averageUnitCostMinor')::bigint,0);
    next_cost:=round((stock_total*old_cost+accepted*unit_price)/(stock_total+accepted))::bigint;

    next_data:=jsonb_set(
      stock,'{currentStock}',
      coalesce(stock->'currentStock','{}'::jsonb)||jsonb_build_object(location_key,current_qty+accepted),
      true
    )||jsonb_build_object('averageUnitCostMinor',next_cost);

    changes:=changes||servos_v2.put_record('stockItems',stock_key,next_data);
    changes:=changes||servos_v2.put_record(
      'stockMovements',
      'receipt-'||(command->>'id')||'-'||(line->>'lineId'),
      jsonb_build_object(
       'stockItemId',stock_key,'locationId',location_key,'quantityDelta',accepted,
       'movementType','PURCHASE_RECEIPT','sourceId',key,'sourceCommandId',command->>'id',
       'unitCostMinor',unit_price,'totalCostMinor',line_total,
       'reason',receipt->>'grnNumber','baseUnit',stock->>'baseUnit',
       'occurredAt',now(),'actorId',who
      )
    );
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','INVENTORY','debitMinor',line_total,'creditMinor',0)
    );

   elsif treatment='ASSET' then
    for ordinal in 1..accepted::integer loop
     changes:=changes||servos_v2.put_record(
      'assetAcquisitions',
      'acq-'||(command->>'id')||'-'||(line->>'lineId')||'-'||ordinal::text,
      jsonb_build_object(
       'status','PENDING_COMMISSION',
       'goodsReceiptId',key,'grnNumber',receipt->>'grnNumber',
       'purchaseOrderId',p->>'purchaseOrderId','poNumber',order_data->>'poNumber',
       'purchaseLineId',line->>'lineId','unitOrdinal',ordinal,
       'assetName',line->>'assetName',
       'assetCategoryId',line->>'assetCategoryId',
       'assetCategoryName',line->>'assetCategoryName',
       'supplierId',supplier_key,'supplierName',supplier->>'name',
       'unitCostMinor',unit_price,
       'receivedAt',now(),'receivedBy',who
      )
     );
    end loop;
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','ASSET_CLEARING','debitMinor',line_total,'creditMinor',0)
    );

   else
    journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object(
       'accountCode',line->>'expenseAccountCode',
       'debitMinor',line_total,'creditMinor',0
      )
    );
   end if;
  end loop;

  if accepted_total>0 then
   changes:=changes||servos_v2.put_record(
    'supplierPayables','payable-'||(command->>'id'),
    jsonb_build_object(
     'payableNumber','AP-'||upper(substr(command->>'id',1,8)),
     'supplierId',supplier_key,'supplierName',supplier->>'name',
     'purchaseOrderId',p->>'purchaseOrderId',
     'goodsReceiptId',key,'grnNumber',receipt->>'grnNumber',
     'supplierInvoiceNumber',coalesce(p->>'supplierInvoiceNumber',''),
     'amountMinor',accepted_total,'paidMinor',0,'amountDueMinor',accepted_total,
     'status','RECEIVED_UNINVOICED','createdAt',now()
    )
   );

   journal_lines:=journal_lines||jsonb_build_array(
      jsonb_build_object('accountCode','ACCOUNTS_PAYABLE','debitMinor',0,'creditMinor',accepted_total)
   );

   changes:=changes||servos_v2.post_journal(
    command,
    'procurement-receipt-'||(command->>'id'),
    'PROCUREMENT',key,'Accepted supplier goods receipt',
    journal_lines
   );
  end if;

  next_data:=order_data||jsonb_build_object(
    'items',items,
    'status',case when all_received then 'RECEIVED' else 'PARTIALLY_RECEIVED' end,
    'lastGoodsReceiptId',key,'lastGoodsReceiptAt',now()
  );
  changes:=changes||servos_v2.put_record('purchaseOrders',p->>'purchaseOrderId',next_data);
  return changes;
 end if;

 if op='supplierPayable.matchInvoice' then
  perform servos_v2.require_any_permission(array['procurement.manage']);
  key:=servos_v2.required_text(p,'payableId');
  perform servos_v2.assert_version(command,'supplierPayables',key);

  select r.data into payable
  from servos_v2.records r
  where r.collection='supplierPayables' and r.id=key and not r.archived
  for update;

  if payable is null or payable->>'status'<>'RECEIVED_UNINVOICED' then
   raise exception 'INVALID_STATE: payable already matched or settled';
  end if;

  invoice_number:=servos_v2.required_text(p,'invoiceNumber');
  if length(invoice_number)>80 then raise exception 'VALIDATION_FAILED: invoice number'; end if;

  if exists(
    select 1 from servos_v2.records r
    where r.collection='supplierPayables' and r.id<>key
      and r.data->>'supplierId'=payable->>'supplierId'
      and lower(r.data->>'supplierInvoiceNumber')=lower(invoice_number)
  ) then raise exception 'DUPLICATE_REFERENCE: supplier invoice'; end if;

  invoice_total:=servos_v2.minor(p,'invoiceAmountMinor');
  payable_total:=(payable->>'amountMinor')::bigint;
  if invoice_total<>payable_total then
   raise exception 'VALIDATION_FAILED: invoice total must equal accepted GRN payable';
  end if;

  invoice_date:=coalesce(p->>'invoiceDate','');
  due_date:=coalesce(p->>'dueDate','');
  if invoice_date<>'' then perform invoice_date::date; end if;
  if due_date<>'' then perform due_date::date; end if;
  if invoice_date<>'' and due_date<>'' and due_date::date<invoice_date::date then
   raise exception 'VALIDATION_FAILED: due date before invoice date';
  end if;

  receipt:=servos_v2.read_record('goodsReceipts',payable->>'goodsReceiptId');
  if jsonb_typeof(p->'lines') is distinct from 'array' then
   raise exception 'VALIDATION_FAILED: invoice lines';
  end if;

  if jsonb_array_length(p->'lines') <> (
    select count(*) from jsonb_array_elements(receipt->'lines') x
    where (x->>'quantityAccepted')::numeric>0
  ) then raise exception 'VALIDATION_FAILED: invoice must cover every accepted GRN line'; end if;

  subtotal:=0;
  for line in select value from jsonb_array_elements(p->'lines') loop
   line_key:=servos_v2.required_text(line,'lineId');
   if exists(
     select 1 from jsonb_array_elements(p->'lines') x
     where x->>'lineId'=line_key
     group by x->>'lineId' having count(*)>1
   ) then raise exception 'DUPLICATE_REFERENCE: invoice line'; end if;

   select value into stored_line
   from jsonb_array_elements(receipt->'lines') x
   where x->>'lineId'=line_key and (x->>'quantityAccepted')::numeric>0;

   if stored_line is null then raise exception 'VALIDATION_FAILED: invoice line not on accepted GRN'; end if;

   qty:=servos_v2.quantity_value(line,'quantityBilled',false);
   unit_price:=servos_v2.minor(line,'unitPriceMinor');

   if abs(qty-(stored_line->>'quantityAccepted')::numeric)>0.000001
      or unit_price<>(stored_line->>'unitPriceMinor')::bigint
   then raise exception 'VALIDATION_FAILED: invoice line differs from approved PO / accepted GRN'; end if;

   subtotal:=subtotal+round(qty*unit_price)::bigint;
  end loop;

  if subtotal<>invoice_total then raise exception 'VALIDATION_FAILED: invoice line total mismatch'; end if;

  next_data:=payable||jsonb_build_object(
    'supplierInvoiceNumber',invoice_number,
    'invoiceAmountMinor',invoice_total,
    'invoiceDate',invoice_date,'dueDate',due_date,
    'invoiceMatchedAt',now(),'invoiceMatchedBy',who,
    'status','MATCHED_UNPAID'
  );
  changes:=changes||servos_v2.put_record('supplierPayables',key,next_data);

  key:=payable->>'purchaseOrderId';
  perform servos_v2.assert_version(command,'purchaseOrders',key);
  order_data:=servos_v2.read_record('purchaseOrders',key);

  select bool_and(r.data->>'status' in ('MATCHED_UNPAID','PARTIALLY_PAID','PAID'))
  into all_matched
  from servos_v2.records r
  where r.collection='supplierPayables'
    and r.data->>'purchaseOrderId'=key
    and not r.archived;

  if all_matched and order_data->>'status'='RECEIVED' then
   changes:=changes||servos_v2.put_record(
     'purchaseOrders',key,order_data||jsonb_build_object('status','INVOICED')
   );
  end if;

  return changes;
 end if;

 if op='supplierPayable.pay' then
  perform servos_v2.require_any_permission(array['procurement.pay']);
  key:=servos_v2.required_text(p,'payableId');
  perform servos_v2.assert_version(command,'supplierPayables',key);

  select r.data into payable
  from servos_v2.records r
  where r.collection='supplierPayables' and r.id=key and not r.archived
  for update;

  if payable is null or payable->>'status' not in ('MATCHED_UNPAID','PARTIALLY_PAID') then
   raise exception 'INVALID_STATE: match supplier invoice before payment';
  end if;

  if coalesce((p->>'confirmed')::boolean,false) is not true then
   raise exception 'VALIDATION_FAILED: confirm supplier was actually paid';
  end if;

  amount:=servos_v2.minor(p,'amountMinor');
  if amount<=0 then raise exception 'VALIDATION_FAILED: positive payment'; end if;

  due:=coalesce(
    (payable->>'amountDueMinor')::bigint,
    (payable->>'amountMinor')::bigint-coalesce((payable->>'paidMinor')::bigint,0)
  );
  if amount>due then raise exception 'VALIDATION_FAILED: payment exceeds outstanding payable'; end if;

  method:=upper(servos_v2.required_text(p,'method'));
  if method not in ('CASH','BANK','MPESA') then
   raise exception 'VALIDATION_FAILED: supplier payment method';
  end if;

  reference_key:=servos_v2.required_text(p,'reference');
  if length(reference_key)>100 then raise exception 'VALIDATION_FAILED: payment reference'; end if;

  if exists(
    select 1 from servos_v2.records r
    where r.collection='supplierPayments'
      and lower(r.data->>'method')=lower(method)
      and lower(r.data->>'reference')=lower(reference_key)
  ) then raise exception 'DUPLICATE_REFERENCE: supplier payment reference'; end if;

  changes:=changes||servos_v2.put_record(
    'supplierPayments','payment-'||(command->>'id'),
    jsonb_build_object(
     'paymentNumber','SP-'||upper(substr(command->>'id',1,8)),
     'supplierId',payable->>'supplierId','supplierName',payable->>'supplierName',
     'supplierPayableId',key,'supplierInvoiceNumber',payable->>'supplierInvoiceNumber',
     'amountMinor',amount,'method',method,'reference',reference_key,
     'reason',coalesce(p->>'reason',''),
     'status','MANUALLY_CONFIRMED','confirmed',true,
     'occurredAt',now(),'recordedBy',who
    )
  );

  changes:=changes||servos_v2.post_journal(
    command,'supplier-payment-'||(command->>'id'),
    'SUPPLIER_PAYMENT',key,'Manually confirmed supplier payment',
    jsonb_build_array(
      jsonb_build_object('accountCode','ACCOUNTS_PAYABLE','debitMinor',amount,'creditMinor',0),
      jsonb_build_object(
        'accountCode',
        case method when 'CASH' then 'PETTY_CASH' when 'BANK' then 'BANK' else 'MPESA' end,
        'debitMinor',0,'creditMinor',amount
      )
    )
  );

  paid:=coalesce((payable->>'paidMinor')::bigint,0)+amount;
  remaining:=due-amount;

  return changes||servos_v2.put_record(
    'supplierPayables',key,
    payable||jsonb_build_object(
      'paidMinor',paid,'amountDueMinor',remaining,
      'status',case when remaining=0 then 'PAID' else 'PARTIALLY_PAID' end,
      'lastPaymentAt',now()
    )
  );
 end if;

 if op='asset.commission' then
  perform servos_v2.require_any_permission(array['assets.manage']);

  key:=servos_v2.required_text(p,'id');
  reference_key:=servos_v2.required_text(p,'acquisitionId');

  perform servos_v2.assert_version(command,'assets',key);
  perform servos_v2.assert_version(command,'assetAcquisitions',reference_key);

  acquisition:=servos_v2.read_record('assetAcquisitions',reference_key);
  if acquisition->>'status'<>'PENDING_COMMISSION' then
   raise exception 'INVALID_STATE: acquisition already commissioned';
  end if;

  if exists(select 1 from servos_v2.records where collection='assets' and id=key) then
   raise exception 'DUPLICATE_REFERENCE: asset id';
  end if;

  tag:=servos_v2.required_text(p,'tag');
  if exists(
    select 1 from servos_v2.records r
    where r.collection='assets' and lower(r.data->>'tag')=lower(tag)
  ) then raise exception 'DUPLICATE_REFERENCE: asset tag'; end if;

  room_key:=nullif(trim(p->>'roomId'),'');
  asset_location_key:=nullif(trim(p->>'locationId'),'');

  if room_key is null and asset_location_key is null then
   raise exception 'VALIDATION_FAILED: room or stock location required';
  end if;

  if room_key is not null then perform servos_v2.read_record('rooms',room_key); end if;
  if asset_location_key is not null then perform servos_v2.read_record('stockLocations',asset_location_key); end if;

  next_data:=jsonb_build_object(
    'name',coalesce(nullif(trim(p->>'name'),''),acquisition->>'assetName'),
    'tag',tag,
    'assetCategoryId',acquisition->>'assetCategoryId',
    'serialNumber',coalesce(p->>'serialNumber',''),
    'roomId',room_key,'locationId',asset_location_key,
    'supplierId',acquisition->>'supplierId',
    'purchaseCostMinor',(acquisition->>'unitCostMinor')::bigint,
    'acquisitionSourceId',reference_key,
    'status','ACTIVE','condition','GOOD','custodianId',null,
    'acquiredAt',current_date,'notes',coalesce(p->>'notes',''),
    'createdAt',now(),'updatedAt',now()
  );

  changes:=changes||servos_v2.put_record('assets',key,next_data);
  changes:=changes||servos_v2.put_record(
    'assetAcquisitions',reference_key,
    acquisition||jsonb_build_object(
      'status','COMMISSIONED','assetId',key,
      'commissionedAt',now(),'commissionedBy',who
    )
  );

  changes:=changes||servos_v2.put_record(
    'assetEvents','asset-'||(command->>'id'),
    jsonb_build_object(
      'assetId',key,'operation','asset.commission',
      'reason','Procurement commissioning',
      'before',null,'after',next_data,
      'actorId',who,'deviceId',(command->>'deviceId')::uuid,
      'occurredAt',now(),'sourceCommandId',command->>'id'
    )
  );

  amount:=(acquisition->>'unitCostMinor')::bigint;
  if amount>0 then
   changes:=changes||servos_v2.post_journal(
    command,'asset-commission-'||(command->>'id'),
    'ASSET_COMMISSION',key,'Commission capital asset from procurement clearing',
    jsonb_build_array(
      jsonb_build_object('accountCode','FIXED_ASSETS','debitMinor',amount,'creditMinor',0),
      jsonb_build_object('accountCode','ASSET_CLEARING','debitMinor',0,'creditMinor',amount)
    )
   );
  end if;

  return changes;
 end if;

 raise exception 'PROTOCOL_UNSUPPORTED: procurement operation';
end$$;

create or replace function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false; end if;
 if '*'=any(grants) then return true; end if;

 needed:=case
  when collection_name in ('customers','roomTypes','assetCategories') then array['records.view']
  when collection_name='suppliers' then array['procurement.view','procurement.manage']
  when collection_name='products' then array['catalog.view','catalog.manage']
  when collection_name in ('stockItems','stockMovements','stockLocations') then array['inventory.view','inventory.count','inventory.adjust','inventory.transfer','inventory.waste','stock.view','stock.manage']
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
  when collection_name in ('payments','receiptDocuments') then array['payments.view','payments.manage']
  else array[]::text[] end;

 return grants&&needed;
end$$;

create or replace function servos_v2.dispatch(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then
  raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';
 end if;

 if command->>'operation' in ('record.save','record.archive','record.reactivate') then
  return servos_v2.apply_master(command);
 end if;

 if command->>'operation' like 'supplier.%'
    or command->>'operation' like 'purchaseOrder.%'
    or command->>'operation' like 'supplierPayable.%'
    or command->>'operation'='asset.commission'
 then return servos_v2.apply_procurement(command); end if;

 if command->>'operation' like 'product.%'
    or command->>'operation' like 'stockItem.%'
    or command->>'operation' like 'stockLocation.%'
    or command->>'operation' like 'inventory.%'
 then return servos_v2.apply_catalog_inventory(command); end if;

 if command->>'operation' like 'asset.%'
    or command->>'operation' like 'maintenance.%'
 then return servos_v2.apply_assets(command); end if;

 if command->>'operation' like 'folio.%' then return servos_v2.apply_folios(command); end if;
 if command->>'operation' like 'stay.%' then return servos_v2.apply_stays(command); end if;

 if command->>'operation' like 'room.%'
    or command->>'operation' like 'ratePlan.%'
    or command->>'operation' like 'roomReservation.%'
 then return servos_v2.apply_rooms(command); end if;

 raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';
end$$;

revoke all on function servos_v2.apply_procurement(jsonb),servos_v2.can_read_collection(text)
from public,anon,authenticated;

commit;
