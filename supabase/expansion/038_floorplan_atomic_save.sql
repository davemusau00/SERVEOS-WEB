begin;

create function servos_v2.apply_floorplan(command jsonb) returns jsonb language plpgsql set search_path='' as $$
declare
 p jsonb:=command->'payload';outlet_key text;baseline jsonb:=p->'baseline';tables jsonb:=p->'tables';
 current_row record;table_row jsonb;baseline_row jsonb;table_key text;table_label text;section_name text;shape_name text;
 current_data jsonb;next_data jsonb;employee_data jsonb;assigned_id text;assigned_name text;
 capacity numeric;pos_x numeric;pos_y numeric;minimum_spend numeric;changes jsonb:='[]'::jsonb;
 seen_ids text[]:=array[]::text[];seen_labels text[]:=array[]::text[];baseline_count integer:=0;
begin
 perform servos_v2.require_permission('floorplan.manage');
 outlet_key:=servos_v2.required_text(p,'outletId');
 -- Serialize complete-layout edits for one outlet before locking table rows in ID order.
 perform servos_v2.read_record('outlets',outlet_key);
 perform 1 from servos_v2.records where collection='outlets' and id=outlet_key and not archived for update;
 perform servos_v2.assert_version(command,'outlets',outlet_key);
 if jsonb_typeof(baseline) is distinct from 'array' or jsonb_typeof(tables) is distinct from 'array' then
  raise exception 'VALIDATION_FAILED: layout baseline and up to 500 tables are required';
 end if;
 if jsonb_array_length(tables)>500 then raise exception 'VALIDATION_FAILED: layout supports up to 500 tables';end if;
 for current_row in select id,version from servos_v2.records where collection='tables' and not archived and data->>'outletId'=outlet_key order by id for update loop
  baseline_count:=baseline_count+1;
  select value into baseline_row from jsonb_array_elements(baseline) where value->>'id'=current_row.id;
  if baseline_row is null or (select count(*) from jsonb_array_elements(baseline) where value->>'id'=current_row.id)<>1 then
   raise exception 'VERSION_CONFLICT: floorplan baseline changed; reload the outlet';
  end if;
  if (baseline_row->>'version')::bigint<>current_row.version then raise exception 'VERSION_CONFLICT: floorplan baseline changed; reload the outlet';end if;
  perform servos_v2.assert_version(command,'tables',current_row.id);
 end loop;
 if jsonb_array_length(baseline)<>baseline_count then raise exception 'VERSION_CONFLICT: floorplan baseline changed; reload the outlet';end if;
 for table_row in select value from jsonb_array_elements(tables) loop
  table_key:=servos_v2.required_text(table_row,'id');table_label:=servos_v2.required_text(table_row,'label');
  if table_key=any(seen_ids) or lower(table_label)=any(seen_labels) then raise exception 'DUPLICATE_REFERENCE: table IDs and labels must be unique';end if;
  seen_ids:=array_append(seen_ids,table_key);seen_labels:=array_append(seen_labels,lower(table_label));
  if jsonb_typeof(table_row->'capacity') is distinct from 'number' then raise exception 'VALIDATION_FAILED: table capacity';end if;
  capacity:=(table_row->>'capacity')::numeric;
  if capacity<1 or capacity>1000 or trunc(capacity)<>capacity then raise exception 'VALIDATION_FAILED: table capacity';end if;
  if jsonb_typeof(table_row->'posX') is distinct from 'number' or jsonb_typeof(table_row->'posY') is distinct from 'number' then raise exception 'VALIDATION_FAILED: table coordinates';end if;
  pos_x:=(table_row->>'posX')::numeric;pos_y:=(table_row->>'posY')::numeric;
  if pos_x<0 or pos_x>100 or pos_y<0 or pos_y>100 then raise exception 'VALIDATION_FAILED: layout coordinates must be between 0 and 100';end if;
  if jsonb_typeof(table_row->'minimumSpend') is distinct from 'number' then raise exception 'VALIDATION_FAILED: minimum spend';end if;
  minimum_spend:=(table_row->>'minimumSpend')::numeric;
  if minimum_spend<0 or minimum_spend>1000000000 then raise exception 'VALIDATION_FAILED: minimum spend';end if;
  section_name:=servos_v2.required_text(table_row,'section');shape_name:=servos_v2.required_text(table_row,'shape');
  if shape_name not in ('SQUARE','RECTANGLE','ROUND','BAR_TOP') then raise exception 'VALIDATION_FAILED: table shape';end if;
  if table_row ? 'isJoinable' and jsonb_typeof(table_row->'isJoinable') is distinct from 'boolean' then raise exception 'VALIDATION_FAILED: table joinable flag';end if;
  perform servos_v2.assert_version(command,'tables',table_key);
  select data into current_data from servos_v2.records where collection='tables' and id=table_key for update;
  if coalesce((select archived from servos_v2.records where collection='tables' and id=table_key),false) then raise exception 'INVALID_STATE: reactivate table before editing';end if;
  if current_data is not null and not exists(select 1 from servos_v2.records where collection='tables' and id=table_key and data->>'outletId'=outlet_key and not archived) then raise exception 'VALIDATION_FAILED: table belongs to another outlet';end if;
  if current_data is null and table_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'VALIDATION_FAILED: new table IDs must be UUIDs';end if;
  assigned_id:=nullif(trim(table_row->>'assignedServerId'),'');assigned_name:='Unassigned';
  if assigned_id is not null then
   employee_data:=servos_v2.read_record('employees',assigned_id);
   if employee_data->>'status'<>'ACTIVE' then raise exception 'VALIDATION_FAILED: assigned staff member is unavailable';end if;
   assigned_name:=coalesce(employee_data->>'name','Staff member');
  end if;
  next_data:=coalesce(current_data,'{}'::jsonb)||jsonb_build_object(
   'id',table_key,'propertyId',coalesce(current_data->>'propertyId',(servos_v2.read_record('outlets',outlet_key)->>'propertyId'),'property'),
   'outletId',outlet_key,'label',table_label,'capacity',capacity,'section',section_name,'shape',shape_name,
   'posX',pos_x,'posY',pos_y,'minimumSpend',minimum_spend,'isJoinable',coalesce((table_row->>'isJoinable')::boolean,true),
   'assignedServerId',assigned_id,'assignedServerName',assigned_name,
   'state',coalesce(current_data->>'state','AVAILABLE'),'currentOrderId',current_data->'currentOrderId'
  );
  changes:=changes||servos_v2.put_record('tables',table_key,next_data);
 end loop;
 for current_row in select id,data from servos_v2.records where collection='tables' and not archived and data->>'outletId'=outlet_key order by id for update loop
  if not current_row.id=any(seen_ids) then
   if nullif(current_row.data->>'currentOrderId','') is not null then raise exception 'INVALID_STATE: cannot remove a table with an active order';end if;
   changes:=changes||servos_v2.put_record('tables',current_row.id,current_row.data,true);
  end if;
 end loop;
 return changes;
end$$;

create or replace function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if coalesce((command->>'offlineFinalized')::boolean,false) then raise exception 'PROTOCOL_UNSUPPORTED: signed offline grants required';end if;
 if command->>'operation'='floorplan.save' then return servos_v2.apply_floorplan(command);end if;
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

revoke all on function servos_v2.apply_floorplan(jsonb) from public,anon,authenticated;
commit;
