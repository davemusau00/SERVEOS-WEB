begin;
create function servos_v2.issue_maintenance_part(command jsonb,part jsonb,work_id text) returns jsonb language plpgsql set search_path='' as $$
declare stock_key text:=servos_v2.required_text(part,'stockItemId');location_key text:=servos_v2.required_text(part,'locationId');stock jsonb;
 qty numeric;on_hand numeric;resource_key text:=stock_key||':'||location_key;budget servos_v2.resources;reserved numeric;unit_cost bigint;value_minor bigint;movement_key text:=extensions.gen_random_uuid()::text;changes jsonb:='[]';allowance servos_v2.allocations;
begin
 stock:=servos_v2.read_record('stockItems',stock_key);perform servos_v2.assert_version(command,'stockItems',stock_key);perform servos_v2.read_record('stockLocations',location_key);
 if jsonb_typeof(part->'quantity') is distinct from 'number' then raise exception 'VALIDATION_FAILED: part quantity';end if;
 qty:=(part->>'quantity')::numeric;if qty<=0 or qty>1000000000 or round(qty,6)<>qty then raise exception 'VALIDATION_FAILED: part quantity';end if;
 on_hand:=coalesce((stock->'currentStock'->>location_key)::numeric,0);if on_hand<qty then raise exception 'ALLOCATION_EXHAUSTED: part stock';end if;
 insert into servos_v2.resources(kind,id,capacity) values('STOCK',resource_key,on_hand) on conflict do nothing;
 select * into budget from servos_v2.resources where kind='STOCK' and id=resource_key for update;
 select a.* into allowance from servos_v2.allocations a join jsonb_array_elements(coalesce(command->'allocationRefs','[]')) ref on ref->>'id'=a.id::text where a.kind='STOCK' and a.resource_id=resource_key and a.device_id=(command->>'deviceId')::uuid and a.state='ACTIVE' and a.version=(ref->>'version')::bigint;
 if found then
  perform servos_v2.consume(allowance.id,(command->>'deviceId')::uuid,qty,movement_key::uuid,now());
 else
  select coalesce(sum(quantity-consumed),0) into reserved from servos_v2.allocations where kind='STOCK' and resource_id=resource_key and state<>'RETURNED';
  if budget.capacity-budget.used-reserved<qty then raise exception 'ALLOCATION_EXHAUSTED: parts reserved for devices';end if;
  update servos_v2.resources set used=used+qty where kind='STOCK' and id=resource_key;
 end if;
 unit_cost:=case when stock ? 'averageUnitCostMinor' then servos_v2.minor(stock,'averageUnitCostMinor') else round(coalesce((stock->>'averageUnitCost')::numeric,0)*100)::bigint end;
 if unit_cost<0 then raise exception 'VALIDATION_FAILED: stock cost';end if;value_minor:=round(qty*unit_cost)::bigint;
 stock:=jsonb_set(stock,'{currentStock}',coalesce(stock->'currentStock','{}')||jsonb_build_object(location_key,on_hand-qty));
 changes:=changes||servos_v2.put_record('stockItems',stock_key,stock);
 changes:=changes||servos_v2.put_record('stockMovements',movement_key,jsonb_build_object('stockItemId',stock_key,'locationId',location_key,'quantityDelta',-qty,'movementType','MAINTENANCE','sourceId',work_id,'sourceCommandId',command->>'id','unitCostMinor',unit_cost,'totalCostMinor',-value_minor,'occurredAt',now(),'actorId',auth.uid()));
 if value_minor>0 then
  changes:=changes||servos_v2.post_journal(command,'maintenance-parts-'||movement_key,'MAINTENANCE',work_id,'Parts used for maintenance',jsonb_build_array(jsonb_build_object('accountCode','MAINTENANCE_EXPENSE','debitMinor',value_minor,'creditMinor',0),jsonb_build_object('accountCode','INVENTORY','debitMinor',0,'creditMinor',value_minor)));
 end if;
 return changes;
end$$;

create function servos_v2.apply_assets(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';key text:=servos_v2.required_text(p,'id');who uuid:=auth.uid();device_key uuid:=(command->>'deviceId')::uuid;
 current_data jsonb;next_data jsonb;asset_data jsonb:=p->'data';changes jsonb:='[]';field text;reference_key text;category jsonb;event_key text;work jsonb;part jsonb;cost bigint;invoice_key text;
begin
 if op like 'asset.%' then
  perform servos_v2.require_permission(case when op in ('asset.save','asset.archive','asset.reactivate') then 'assets.manage' else 'assets.operate' end);
  perform servos_v2.assert_version(command,'assets',key);
  select r.data into current_data from servos_v2.records r where r.collection='assets' and r.id=key;
  perform servos_v2.assert_ownership('ASSET',key,device_key);
  if op='asset.save' then
   if exists(select 1 from servos_v2.records where collection='assets' and id=key and archived) then raise exception 'VALIDATION_FAILED: reactivate archived asset first';end if;
   if current_data->>'status' in ('LOST','RETIRED','DISPOSED') then raise exception 'INVALID_STATE: terminal asset cannot be edited';end if;
   if jsonb_typeof(asset_data) is distinct from 'object' then raise exception 'VALIDATION_FAILED: asset details';end if;
   perform servos_v2.required_text(asset_data,'name');perform servos_v2.required_text(asset_data,'tag');
   if exists(select 1 from servos_v2.records r where r.collection='assets' and r.id<>key and lower(r.data->>'tag')=lower(trim(asset_data->>'tag'))) then raise exception 'DUPLICATE_REFERENCE: asset tag remains unique across history';end if;
   category:=servos_v2.read_record('assetCategories',servos_v2.required_text(asset_data,'assetCategoryId'));
   if nullif(asset_data->>'roomId','') is not null then perform servos_v2.read_record('rooms',asset_data->>'roomId');end if;
   if nullif(asset_data->>'locationId','') is not null then perform servos_v2.read_record('stockLocations',asset_data->>'locationId');end if;
   if nullif(asset_data->>'roomId','') is null and nullif(asset_data->>'locationId','') is null then raise exception 'VALIDATION_FAILED: room or stock location required';end if;
   if nullif(asset_data->>'supplierId','') is not null then perform servos_v2.read_record('suppliers',asset_data->>'supplierId');end if;
   cost:=servos_v2.minor(asset_data,'purchaseCostMinor');
   if current_data is not null and (nullif(asset_data->>'roomId','') is distinct from nullif(current_data->>'roomId','') or nullif(asset_data->>'locationId','') is distinct from nullif(current_data->>'locationId','')) then raise exception 'INVALID_STATE: use asset.transfer to change location';end if;
   if asset_data ? 'acquiredAt' and nullif(asset_data->>'acquiredAt','') is not null then perform (asset_data->>'acquiredAt')::date;end if;
   if asset_data ? 'warrantyUntil' and nullif(asset_data->>'warrantyUntil','') is not null then perform (asset_data->>'warrantyUntil')::date;end if;
   -- Acquisition corrections must not rewrite posted procurement history.
   if current_data ? 'acquisitionSourceId' and (asset_data->>'purchaseCostMinor' is distinct from current_data->>'purchaseCostMinor' or asset_data->>'supplierId' is distinct from current_data->>'supplierId') then raise exception 'INVALID_STATE: correct acquisition through procurement';end if;
   next_data:=coalesce(current_data,jsonb_build_object('status','ACTIVE','condition','GOOD','custodianId',null,'createdAt',now()));
   for field in select jsonb_object_keys(asset_data) loop
    if field not in ('name','tag','assetCategoryId','serialNumber','roomId','locationId','supplierId','acquiredAt','purchaseCostMinor','warrantyUntil','notes') then raise exception 'VALIDATION_FAILED: unsupported asset field %',field;end if;
    next_data:=jsonb_set(next_data,array[field],asset_data->field);
   end loop;
   next_data:=next_data||jsonb_build_object('name',trim(asset_data->>'name'),'tag',trim(asset_data->>'tag'));
  elsif op in ('asset.archive','asset.reactivate') then
   if current_data is null then raise exception 'VALIDATION_FAILED: asset missing';end if;
   if op='asset.archive' and (current_data->>'status' not in ('RETIRED','DISPOSED') or exists(select 1 from servos_v2.records r where r.collection='maintenanceOrders' and r.data->>'assetId'=key and r.data->>'status' not in ('COMPLETED','CANCELLED'))) then raise exception 'INVALID_STATE: retire/dispose and finish maintenance before archive';end if;
   changes:=changes||servos_v2.put_record('assets',key,current_data,op='asset.archive');next_data:=current_data;
  else
   current_data:=servos_v2.read_record('assets',key);next_data:=current_data;
   perform servos_v2.required_text(p,'reason');
   if current_data->>'status'='DISPOSED' then raise exception 'INVALID_STATE: disposed asset is final';end if;
   if op in ('asset.assign','asset.return','asset.transfer','asset.inspect','asset.lose') and current_data->>'status'<>'ACTIVE' then raise exception 'INVALID_STATE: asset is not active';end if;
   if op='asset.assign' then
    reference_key:=servos_v2.required_text(p,'custodianId');perform servos_v2.read_record('employees',reference_key);
    if nullif(current_data->>'custodianId','') is not null then raise exception 'INVALID_STATE: return current assignment first';end if;
    next_data:=next_data||jsonb_build_object('custodianId',reference_key);
   elsif op='asset.return' then
    if nullif(current_data->>'custodianId','') is null then raise exception 'INVALID_STATE: no custodian to return from';end if;
    next_data:=next_data||jsonb_build_object('custodianId',null);
   elsif op='asset.transfer' then
    if nullif(p->>'roomId','') is not null then perform servos_v2.read_record('rooms',p->>'roomId');end if;
    if nullif(p->>'locationId','') is not null then perform servos_v2.read_record('stockLocations',p->>'locationId');end if;
    if nullif(p->>'roomId','') is null and nullif(p->>'locationId','') is null then raise exception 'VALIDATION_FAILED: transfer destination';end if;
    next_data:=next_data||jsonb_build_object('roomId',p->'roomId','locationId',p->'locationId');
   elsif op='asset.inspect' then
    if coalesce(p->>'condition','') not in ('GOOD','FAIR','POOR','BROKEN') then raise exception 'VALIDATION_FAILED: asset condition';end if;
    next_data:=next_data||jsonb_build_object('condition',p->>'condition','lastInspectedAt',now(),'nextInspectionAt',p->'nextInspectionAt');
    if nullif(p->>'nextInspectionAt','') is not null then perform (p->>'nextInspectionAt')::date;end if;
   elsif op in ('asset.lose','asset.retire','asset.dispose') then
    if exists(select 1 from servos_v2.records r where r.collection='maintenanceOrders' and r.data->>'assetId'=key and r.data->>'status' not in ('COMPLETED','CANCELLED')) then raise exception 'INVALID_STATE: resolve maintenance first';end if;
    if op<>'asset.lose' and nullif(current_data->>'custodianId','') is not null then raise exception 'INVALID_STATE: return assigned asset before retirement/disposal';end if;
    next_data:=next_data||jsonb_build_object('status',case op when 'asset.lose' then 'LOST' when 'asset.retire' then 'RETIRED' else 'DISPOSED' end,'custodianId',null);
   else raise exception 'PROTOCOL_UNSUPPORTED: asset operation';end if;
  end if;
  if op not in ('asset.archive','asset.reactivate') then changes:=changes||servos_v2.put_record('assets',key,next_data||jsonb_build_object('updatedAt',now()));end if;
  event_key:='asset-'||(command->>'id');
  changes:=changes||servos_v2.put_record('assetEvents',event_key,jsonb_build_object('assetId',key,'operation',op,'reason',p->>'reason','before',current_data,'after',next_data,'actorId',who,'deviceId',device_key,'occurredAt',now(),'sourceCommandId',command->>'id'));
  return changes;
 end if;

 perform servos_v2.require_permission('maintenance.manage');perform servos_v2.assert_version(command,'maintenanceOrders',key);
 if op='maintenance.report' then
  if exists(select 1 from servos_v2.records where collection='maintenanceOrders' and id=key) then raise exception 'DUPLICATE_REFERENCE: maintenance order';end if;
  if nullif(p->>'assetId','') is null and nullif(p->>'roomId','') is null then raise exception 'VALIDATION_FAILED: asset or room required';end if;
  if nullif(p->>'assetId','') is not null then
   current_data:=servos_v2.read_record('assets',p->>'assetId');perform servos_v2.assert_ownership('ASSET',p->>'assetId',device_key);
   if current_data->>'status'<>'ACTIVE' then raise exception 'INVALID_STATE: inactive asset';end if;
   if nullif(p->>'roomId','') is not null and p->>'roomId' is distinct from current_data->>'roomId' then raise exception 'VALIDATION_FAILED: asset/room mismatch';end if;
  end if;
  if nullif(p->>'roomId','') is not null then perform servos_v2.read_record('rooms',p->>'roomId');end if;
  if coalesce(p->>'priority','') not in ('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'VALIDATION_FAILED: priority';end if;
  work:=jsonb_build_object('assetId',p->'assetId','roomId',p->'roomId','description',servos_v2.required_text(p,'description'),'priority',p->>'priority','status','REPORTED','reportedAt',now(),'reportedBy',who);
 else
  work:=servos_v2.read_record('maintenanceOrders',key);
  if work->>'status' in ('COMPLETED','CANCELLED') then raise exception 'INVALID_STATE: maintenance is closed';end if;
  if nullif(work->>'assetId','') is not null then perform servos_v2.assert_ownership('ASSET',work->>'assetId',device_key);end if;
  if op='maintenance.assign' then
   if work->>'status' not in ('REPORTED','ASSIGNED') then raise exception 'INVALID_STATE: assignment';end if;
   reference_key:=servos_v2.required_text(p,'assigneeId');perform servos_v2.read_record('employees',reference_key);
   work:=work||jsonb_build_object('status','ASSIGNED','assigneeId',reference_key);
  elsif op='maintenance.start' then
   if work->>'status'<>'ASSIGNED' then raise exception 'INVALID_STATE: assign maintenance first';end if;
   work:=work||jsonb_build_object('status','IN_PROGRESS','startedAt',now());
  elsif op='maintenance.cancel' then
   work:=work||jsonb_build_object('status','CANCELLED','reason',servos_v2.required_text(p,'reason'),'closedAt',now());
  elsif op='maintenance.complete' then
   if work->>'status'<>'IN_PROGRESS' then raise exception 'INVALID_STATE: start maintenance first';end if;
   perform servos_v2.required_text(p,'resolution');
   if jsonb_typeof(p->'parts') is distinct from 'array' or jsonb_array_length(p->'parts')>100 then raise exception 'VALIDATION_FAILED: parts list';end if;
   if exists(select 1 from jsonb_array_elements(p->'parts') v group by v->>'stockItemId' having count(*)>1) then raise exception 'VALIDATION_FAILED: combine duplicate stock items';end if;
   for part in select value from jsonb_array_elements(p->'parts') loop changes:=changes||servos_v2.issue_maintenance_part(command,part,key);end loop;
   cost:=servos_v2.minor(p,'serviceCostMinor');
   if cost>0 then
    perform servos_v2.read_record('suppliers',servos_v2.required_text(p,'supplierId'));invoice_key:=servos_v2.required_text(p,'invoiceReference');
    if exists(select 1 from servos_v2.records r where r.collection='supplierPayables' and r.data->>'supplierId'=p->>'supplierId' and lower(r.data->>'invoiceReference')=lower(invoice_key)) then raise exception 'DUPLICATE_REFERENCE: supplier invoice';end if;
    changes:=changes||servos_v2.put_record('supplierPayables','maintenance-'||key,jsonb_build_object('supplierId',p->>'supplierId','invoiceReference',invoice_key,'sourceType','MAINTENANCE','sourceId',key,'amountMinor',cost,'paidMinor',0,'status','MATCHED_UNPAID','createdAt',now()));
    changes:=changes||servos_v2.post_journal(command,'maintenance-service-'||(command->>'id'),'MAINTENANCE',key,'External maintenance service',jsonb_build_array(jsonb_build_object('accountCode','MAINTENANCE_EXPENSE','debitMinor',cost,'creditMinor',0),jsonb_build_object('accountCode','ACCOUNTS_PAYABLE','debitMinor',0,'creditMinor',cost)));
   end if;
   work:=work||jsonb_build_object('status','COMPLETED','resolution',p->>'resolution','parts',p->'parts','serviceCostMinor',cost,'completedAt',now(),'completedBy',who);
  else raise exception 'PROTOCOL_UNSUPPORTED: maintenance operation';end if;
 end if;
 return changes||servos_v2.put_record('maintenanceOrders',key,work);
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;
commit;

