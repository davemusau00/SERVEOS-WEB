-- Forward repair for databases that have already applied expansion 040.
-- Adds dependency-checked nightly rates, rooms, asset categories, and assets; no bookings or balances.
begin;

create or replace function servos_v2.import_csv_data(template text,headers jsonb,cells jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare i integer; header text; field text; value text; result jsonb:='{}'::jsonb; price numeric; amount numeric; seen_fields text[]:='{}';
begin
 if jsonb_array_length(headers)<>jsonb_array_length(cells) then raise exception 'VALIDATION_FAILED: row has a different number of columns than the header';end if;
 for i in 0..jsonb_array_length(headers)-1 loop
  header:=lower(regexp_replace(trim(headers->>i),'[^a-zA-Z0-9]+','_','g'));
  value:=cells->>i;field:=null;
  if header in ('external_id','externalid','record_id','id','staff_id') then field:='externalId';
  elsif header in ('name','product','product_name','item_name','menu_item','stock_item','guest','customer','guest_name','supplier','supplier_name','vendor','full_name') then field:='name';
  elsif header in ('code','sku','product_code','item_code','stock_code','supplier_code','vendor_code') then field:='code';
  elsif header in ('price','selling_price','unit_price','price_kes','base_rate','nightly_rate') then field:='price';
  elsif header in ('category','product_category') then field:='category';
  elsif header='type' then field:=case when template='stockLocations' then 'type' else 'category' end;
  elsif header in ('barcode','ean','upc') then field:='barcode';
  elsif header in ('base_unit','unit','uom','measure') then field:='baseUnit';
  elsif header in ('reorder_level','minimum_stock','par_level') then field:='reorderLevel';
  elsif header in ('phone','mobile','telephone','contact_number') then field:='phone';
  elsif header in ('email','email_address') then field:='email';
  elsif header in ('auth_user_id','auth_id') then field:='authUserId';
  elsif header='role' then field:='role';
  elsif header in ('outlet_ids','outlets') then field:='outletIds';
  elsif header in ('service_areas','serviceareas') then field:='serviceAreas';
  elsif header in ('capacity_adults','adults') then field:='capacityAdults';
  elsif header in ('capacity_children','children') then field:='capacityChildren';
  elsif header='capacity' then field:=case when template='rooms' then 'capacity' else 'maxGuests' end;
  elsif header='max_guests' then field:='maxGuests';
  elsif header in ('notes','description') then field:=header;
  elsif header in ('amenities','room_amenities') then field:='amenities';
  elsif header in ('room_number','number') then field:='number';
  elsif header='room_type_external_id' then field:='roomTypeExternalId';
  elsif header='initial_status' then field:='initialStatus';
  elsif header in ('turnaround_minutes','turnaround') then field:='turnaroundMinutes';
  elsif header='floor' then field:='floor';
  elsif header='wing' then field:='wing';
  elsif header='currency' then field:='currency';
  elsif header in ('tax_basis_points','tax_bps') then field:='taxBasisPoints';
  elsif header='mode' then field:='mode';
  elsif header='min_nights' then field:='minNights';
  elsif header='max_nights' then field:='maxNights';
  elsif header='meal_plan' then field:='mealPlan';
  elsif header in ('depreciation_method','method') then field:='depreciationMethod';
  elsif header='useful_life_months' then field:='usefulLifeMonths';
  elsif header in ('asset_tag','tag') then field:='assetTag';
  elsif header in ('category_external_id','asset_category_external_id') then field:='categoryExternalId';
  elsif header in ('location_external_id','stock_location_external_id','room_or_location_external_id') then field:='locationExternalId';
  elsif header='room_external_id' then field:='roomExternalId';
  elsif header='serial_number' then field:='serialNumber';
  elsif header='status' then field:='status';
  elsif header in ('acquisition_date','acquired_at') then field:='acquiredAt';
  elsif header in ('acquisition_cost','purchase_cost') then field:='acquisitionCost';
  elsif header='warranty_until' then field:='warrantyUntil';
  elsif header in ('kind','location_type','stock_location_type') then field:='type';
  elsif header='active' then field:='active';
  end if;
  if field is not null and value<>'' and not (
   (template='products' and field in ('externalId','name','code','price','category','barcode')) or
   (template='stockItems' and field in ('externalId','name','code','baseUnit','reorderLevel','barcode')) or
   (template='customers' and field in ('externalId','name','phone','email')) or
   (template='suppliers' and field in ('externalId','name','code','phone','email')) or
   (template='stockLocations' and field in ('externalId','name','code','type')) or
   (template='roomTypes' and field in ('externalId','name','code','maxGuests','capacityAdults','capacityChildren','notes','description')) or
   (template='ratePlans' and field in ('externalId','name','roomTypeExternalId','price','currency','taxBasisPoints','mode','notes')) or
   (template='rooms' and field in ('externalId','number','roomTypeExternalId','capacity','turnaroundMinutes','floor','amenities','notes')) or
   (template='assetCategories' and field in ('externalId','name','code','notes','description')) or
   (template='assets' and field in ('externalId','name','assetTag','categoryExternalId','roomExternalId','locationExternalId','serialNumber','acquiredAt','acquisitionCost','warrantyUntil','notes')) or
   (template='staff' and field in ('externalId','name','authUserId','role','outletIds','serviceAreas'))
  ) then raise exception 'VALIDATION_FAILED: populated column is not supported by this template: %',header;end if;
  if field is null and value<>'' then raise exception 'VALIDATION_FAILED: populated CSV column is not mapped: %',header;end if;
  if field is not null then
   if field='barcode' and value<>trim(value) then raise exception 'VALIDATION_FAILED: barcode values cannot start or end with whitespace';end if;
   if field not in ('externalId','barcode') then value:=trim(value);end if;
   if field=any(seen_fields) then raise exception 'VALIDATION_FAILED: multiple CSV columns map to the same field';end if;
   seen_fields:=array_append(seen_fields,field);
   if field in ('price','acquisitionCost') then
    if value !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'VALIDATION_FAILED: price must be a non-negative amount with at most two decimal places; scientific notation is not accepted';end if;
    price:=value::numeric;if price>10000000000 then raise exception 'VALIDATION_FAILED: price is out of range';end if;
    result:=result||jsonb_build_object(case when field='acquisitionCost' then 'acquisitionCostMinor' else 'priceMinor' end,(price*100)::bigint);
   elsif field in ('reorderLevel','capacityAdults','capacityChildren','maxGuests','capacity','turnaroundMinutes','taxBasisPoints','usefulLifeMonths','minNights','maxNights') then
    if value<>'' and value !~ '^[0-9]+([.][0-9]{1,6})?$' then raise exception 'VALIDATION_FAILED: % must be a non-negative number; scientific notation is not accepted',field;end if;
    if value<>'' then amount:=value::numeric;if trunc(amount)<>amount and field<>'reorderLevel' then raise exception 'VALIDATION_FAILED: % must be a whole number',field;end if;result:=result||jsonb_build_object(field,amount);end if;
   elsif field='externalId' then
    if value<>'' then result:=result||jsonb_build_object(field,value);end if;
   elsif field in ('amenities','outletIds','serviceAreas') then result:=result||jsonb_build_object(field,to_jsonb(array(select distinct trim(entry) from unnest(string_to_array(value,';')) as list(entry) where trim(entry)<>'' order by trim(entry))));
   elsif field in ('barcode','phone','email','externalId','roomTypeExternalId','categoryExternalId','locationExternalId','roomExternalId','authUserId') then
    if value<>'' then result:=result||jsonb_build_object(field,value);end if;
   elsif field in ('acquiredAt','warrantyUntil') then
    if value<>'' then perform value::date;result:=result||jsonb_build_object(field,value);end if;
   elsif value<>'' then result:=result||jsonb_build_object(field,value);end if;
  end if;
 end loop;
 if template not in ('products','stockItems','customers','suppliers','stockLocations','roomTypes','ratePlans','rooms','assetCategories','assets','staff') then raise exception 'VALIDATION_FAILED: unsupported import template';end if;
 if template<>'rooms' and nullif(trim(result->>'name'),'') is null then raise exception 'VALIDATION_FAILED: name is required';end if;
 if nullif(result->>'externalId','') is null then raise exception 'VALIDATION_FAILED: external_id is required for stable import identity';end if;
 if template in ('products','stockItems','suppliers') and nullif(trim(result->>'code'),'') is null then raise exception 'VALIDATION_FAILED: code is required';end if;
 if template='products' and not (result ? 'priceMinor') then raise exception 'VALIDATION_FAILED: price is required';end if;
 if template='stockItems' and nullif(trim(result->>'baseUnit'),'') is null then raise exception 'VALIDATION_FAILED: base unit is required';end if;
 if template='stockLocations' then
  result:=result||jsonb_build_object('type',upper(coalesce(nullif(result->>'type',''),'STORE')));
  if result->>'type' not in ('STORE','FRIDGE','BAR','KITCHEN','OTHER') then raise exception 'VALIDATION_FAILED: stock location type';end if;
  result:=result-'priceMinor'-'phone'-'email';
 end if;
 if template='roomTypes' then
  if nullif(trim(result->>'code'),'') is null then raise exception 'VALIDATION_FAILED: room type code is required';end if;
  if not (result ? 'maxGuests') then result:=result||jsonb_build_object('maxGuests',greatest(1,coalesce((result->>'capacityAdults')::numeric,0)+coalesce((result->>'capacityChildren')::numeric,0)));end if;
  if coalesce((result->>'maxGuests')::numeric,0) not between 1 and 1000 then raise exception 'VALIDATION_FAILED: room type capacity must be between 1 and 1000';end if;
 end if;
 if template='ratePlans' then
  if nullif(result->>'roomTypeExternalId','') is null or nullif(result->>'currency','') is null or not (result ? 'priceMinor') or not (result ? 'taxBasisPoints') then raise exception 'VALIDATION_FAILED: rate plan requires room type external ID, currency, nightly rate and tax basis points';end if;
  if result->>'currency'<>'KES' then raise exception 'VALIDATION_FAILED: only KES rate plans are supported';end if;
  if coalesce(result->>'mode','NIGHTLY')<>'NIGHTLY' then raise exception 'VALIDATION_FAILED: only NIGHTLY rate plans can be imported';end if;
  if (result->>'taxBasisPoints')::numeric not between 0 and 10000 or trunc((result->>'taxBasisPoints')::numeric)<>(result->>'taxBasisPoints')::numeric then raise exception 'VALIDATION_FAILED: tax basis points must be a whole number from 0 to 10000';end if;
  result:=result-'roomTypeExternalId'-'mode'||jsonb_build_object('roomTypeId',result->>'roomTypeExternalId','mode','NIGHTLY');
 end if;
 if template='rooms' then
  if nullif(trim(result->>'number'),'') is null or nullif(result->>'roomTypeExternalId','') is null then raise exception 'VALIDATION_FAILED: room number and room type external ID are required';end if;
  if not (result ? 'capacity') or (result->>'capacity')::numeric not between 1 and 1000 or trunc((result->>'capacity')::numeric)<>(result->>'capacity')::numeric then raise exception 'VALIDATION_FAILED: room capacity must be a whole number from 1 to 1000';end if;
  if not (result ? 'turnaroundMinutes') or (result->>'turnaroundMinutes')::numeric not between 0 and 1440 or trunc((result->>'turnaroundMinutes')::numeric)<>(result->>'turnaroundMinutes')::numeric then raise exception 'VALIDATION_FAILED: room turnaround must be 0 to 1440 whole minutes';end if;
  result:=result-'roomTypeExternalId'||jsonb_build_object('roomTypeId',result->>'roomTypeExternalId');
 end if;
 if template='assetCategories' then
  if nullif(trim(result->>'code'),'') is null then raise exception 'VALIDATION_FAILED: asset category code is required';end if;
 end if;
 if template='assets' then
  if nullif(trim(result->>'assetTag'),'') is null or nullif(result->>'categoryExternalId','') is null or ((nullif(result->>'roomExternalId','') is null)=(nullif(result->>'locationExternalId','') is null)) then raise exception 'VALIDATION_FAILED: asset requires a unique tag, category, and exactly one room or stock-location external ID';end if;
  if not (result ? 'acquisitionCostMinor') then raise exception 'VALIDATION_FAILED: acquisition cost is required';end if;
 end if;
 if template='staff' then
  if nullif(result->>'authUserId','') is null or nullif(result->>'role','') is null then raise exception 'VALIDATION_FAILED: staff import requires an existing Auth user ID and an explicit role';end if;
  perform (result->>'authUserId')::uuid;
  if result->>'role' not in ('Admin','Manager','Cashier','Server','Chef','Housekeeper','Accountant','Custom') then raise exception 'VALIDATION_FAILED: unsupported staff role';end if;
 end if;
 if template='customers' then result:=result-'code'-'priceMinor'-'category'-'barcode'-'baseUnit'-'reorderLevel';end if;
 if template='suppliers' then result:=result-'priceMinor'-'category'-'barcode'-'baseUnit'-'reorderLevel';end if;
 if template='products' then result:=result-'phone'-'email'-'baseUnit'-'reorderLevel';end if;
 if template='stockItems' then result:=result-'priceMinor'-'category'-'phone'-'email';end if;
 if template='roomTypes' then result:=result-'priceMinor'-'capacityAdults'-'capacityChildren'-'phone'-'email'-'category'-'barcode'-'baseUnit'-'reorderLevel';end if;
 if template='ratePlans' then result:=result-'price';end if;
 if template='assetCategories' then result:=result-'phone'-'email'-'priceMinor';end if;
 if template='assets' then result:=result-'phone'-'email';end if;
 if template='staff' then result:=result-'phone'-'email'-'code'-'priceMinor'-'barcode'-'category'-'baseUnit'-'reorderLevel';end if;
 return result;
end$$;

create or replace function servos_v2.import_room_domain_command(template_name text,target_id text,row_data jsonb,device_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare room_type_id text;room_type_version bigint;target_collection text;domain_operation text;result jsonb;
begin
 if template_name not in ('rooms','ratePlans') then raise exception 'VALIDATION_FAILED: room import template';end if;
 room_type_id:=servos_v2.required_text(row_data,'roomTypeId');
 select r.version into room_type_version from servos_v2.records r where r.collection='roomTypes' and r.id=room_type_id and not r.archived;
 if room_type_version is null then raise exception 'VALIDATION_FAILED: referenced room type does not exist or is archived';end if;
 target_collection:=case when template_name='rooms' then 'rooms' else 'ratePlans' end;
 domain_operation:=case when template_name='rooms' then 'room.save' else 'ratePlan.save' end;
 result:=jsonb_build_object('operation',domain_operation,'deviceId',device_id,'payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection',target_collection,'id',target_id,'version',0),jsonb_build_object('collection','roomTypes','id',room_type_id,'version',room_type_version)));
 perform servos_v2.assert_version(result,'roomTypes',room_type_id);
 return result;
end$$;

create or replace function servos_v2.import_asset_domain_command(target_id text,row_data jsonb,device_id uuid,command_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare category_id text:=servos_v2.required_text(row_data,'categoryExternalId');room_id text:=nullif(row_data->>'roomExternalId','');location_id text:=nullif(row_data->>'locationExternalId','');asset_data jsonb;ref_version bigint;
begin
 select version into ref_version from servos_v2.records where collection='assetCategories' and id=category_id and not archived for share;
 if ref_version is null then raise exception 'VALIDATION_FAILED: referenced asset category does not exist or is archived';end if;
 if room_id is not null then
  select version into ref_version from servos_v2.records where collection='rooms' and id=room_id and not archived for share;
  if ref_version is null then raise exception 'VALIDATION_FAILED: referenced room does not exist or is archived';end if;
 else
  select version into ref_version from servos_v2.records where collection='stockLocations' and id=location_id and not archived for share;
  if ref_version is null then raise exception 'VALIDATION_FAILED: referenced stock location does not exist or is archived';end if;
 end if;
 asset_data:=(row_data-'externalId'-'assetTag'-'categoryExternalId'-'roomExternalId'-'locationExternalId'-'acquisitionCostMinor')||jsonb_build_object('tag',row_data->'assetTag','assetCategoryId',category_id,'purchaseCostMinor',row_data->'acquisitionCostMinor')||case when room_id is not null then jsonb_build_object('roomId',room_id) else jsonb_build_object('locationId',location_id) end;
 return jsonb_build_object('id',command_id,'operation','asset.save','deviceId',device_id,'payload',jsonb_build_object('id',target_id,'data',asset_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','assets','id',target_id,'version',0)));
end$$;

create or replace function servos_v2.apply_admin_operations(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();key text;batch jsonb;raw_rows jsonb;headers jsonb;cells jsonb;row_data jsonb;preview jsonb:='[]'::jsonb;line jsonb;changes jsonb:='[]'::jsonb;domain_command jsonb;
 row_no integer;row_total integer;target_id text;template text;v_source_hash text;plan_hash text;message text;preview_summary text;valid_count integer:=0;seen_ids text[]:='{}';seen_codes text[]:='{}';seen_tags text[]:='{}';seen_auth_users text[]:='{}';candidate text;source_csv text;row_results jsonb:='[]'::jsonb;
begin
 if op='admin.import.stage' then
  perform servos_v2.require_permission('data.import.stage');
  template:=servos_v2.required_text(p,'templateKey');
  if template not in ('products','stockItems','customers','suppliers','stockLocations','roomTypes','ratePlans','rooms','assetCategories','assets','staff') then raise exception 'VALIDATION_FAILED: unsupported import template';end if;
  raw_rows:=servos_v2.parse_import_csv(p->>'csvText');headers:=raw_rows->0;row_total:=jsonb_array_length(raw_rows)-1;
  if length(coalesce(p->>'fileName','')) not between 1 and 255 then raise exception 'VALIDATION_FAILED: import file name';end if;
  key:=coalesce(nullif(p->>'id',''),'import-'||(command->>'id'));
  if exists(select 1 from servos_v2.records where collection='importBatches' and id=key) then raise exception 'DUPLICATE_REFERENCE: batch ID has already been used; stage this source with a new batch ID';end if;
  v_source_hash:=md5(p->>'csvText');
  source_csv:=p->>'csvText';
  insert into servos_v2.import_sources(batch_id,source_hash,csv_text,staged_by) values(key,v_source_hash,source_csv,who) on conflict(batch_id) do nothing;
  if not exists(select 1 from servos_v2.import_sources s where s.batch_id=key and s.source_hash=v_source_hash and s.csv_text=source_csv) then raise exception 'IMPORT_SOURCE_CONFLICT: batch ID already belongs to different content';end if;
  return servos_v2.put_record('importBatches',key,jsonb_build_object('id',key,'fileName',p->>'fileName','templateKey',template,'status','STAGED','rowCount',row_total,'sourceHash',v_source_hash,'stagedBy',who,'stagedAt',now(),'validation','SERVER_DRY_RUN_REQUIRED','importKind',case when template='staff' then 'AUTH_BOUND_STAFF' else 'MASTER_DATA_ONLY' end));
 elsif op='admin.import.dryRun' then
  perform servos_v2.require_permission('data.import.stage');key:=servos_v2.required_text(p,'batchId');
  select r.data into batch from servos_v2.records r where r.collection='importBatches' and r.id=key and not r.archived for update;
  if batch is null then raise exception 'VALIDATION_FAILED: import batch missing';end if;
  if batch->>'status' not in ('STAGED','DRY_RUN_BLOCKED','DRY_RUN_READY') then raise exception 'INVALID_STATE: import batch cannot be dry-run from its current state';end if;
  template:=batch->>'templateKey';
  select s.csv_text,s.source_hash into source_csv,v_source_hash from servos_v2.import_sources s where s.batch_id=key for update;
  if source_csv is null or v_source_hash<>batch->>'sourceHash' or md5(source_csv)<>v_source_hash then raise exception 'IMPORT_SOURCE_CHANGED: staged CSV missing or hash mismatch';end if;
  if template='products' then perform servos_v2.require_any_permission(array['catalog.manage']);
  elsif template='stockItems' then perform servos_v2.require_any_permission(array['catalog.manage','inventory.adjust']);
  elsif template='suppliers' then perform servos_v2.require_any_permission(array['procurement.manage']);
  elsif template='customers' then perform servos_v2.require_any_permission(array['customers.manage']);
  elsif template='stockLocations' then perform servos_v2.require_any_permission(array['inventory.adjust']);
  elsif template='roomTypes' then perform servos_v2.require_any_permission(array['roomTypes.manage']);
  elsif template in ('ratePlans','rooms') then perform servos_v2.require_permission('rooms.manage');
  elsif template='assetCategories' then perform servos_v2.require_permission('assetCategories.manage');
  elsif template='assets' then perform servos_v2.require_permission('assets.manage');
  elsif template='staff' then perform servos_v2.require_permission('staff.create');end if;
  raw_rows:=servos_v2.parse_import_csv(source_csv);headers:=raw_rows->0;row_total:=jsonb_array_length(raw_rows)-1;
  for row_no in 1..row_total loop
   cells:=raw_rows->row_no;row_data:=null;message:=null;target_id:=null;
   begin
    row_data:=servos_v2.import_csv_data(template,headers,cells);
    target_id:=row_data->>'externalId';
    row_data:=row_data-'externalId';
    if length(target_id)>128 then raise exception 'VALIDATION_FAILED: external ID exceeds 128 characters';end if;
    if lower(target_id)=any(seen_ids) then raise exception 'DUPLICATE_REFERENCE: duplicate external ID within file';end if;
    seen_ids:=array_append(seen_ids,lower(target_id));
    candidate:=lower(coalesce(row_data->>'code',''));
    if candidate<>'' and candidate=any(seen_codes) then raise exception 'DUPLICATE_REFERENCE: duplicate code within file';end if;
    if candidate<>'' then seen_codes:=array_append(seen_codes,candidate);end if;
    if template='assets' then
     candidate:=lower(coalesce(row_data->>'assetTag',''));
     if candidate=any(seen_tags) then raise exception 'DUPLICATE_REFERENCE: duplicate asset tag within file';end if;
     seen_tags:=array_append(seen_tags,candidate);
    end if;
    if template='staff' then
     candidate:=lower(row_data->>'authUserId');
     if candidate=any(seen_auth_users) then raise exception 'DUPLICATE_REFERENCE: Auth user appears more than once in this staff import';end if;
     seen_auth_users:=array_append(seen_auth_users,candidate);
    end if;
    if template='products' then
     domain_command:=jsonb_build_object('operation','product.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','products','id',target_id,'version',0)));
    elsif template='stockItems' then
     domain_command:=jsonb_build_object('operation','stockItem.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockItems','id',target_id,'version',0)));
    elsif template='stockLocations' then
     domain_command:=jsonb_build_object('operation','stockLocation.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockLocations','id',target_id,'version',0)));
    elsif template in ('rooms','ratePlans') then
     domain_command:=servos_v2.import_room_domain_command(template,target_id,row_data,(command->>'deviceId')::uuid);
    elsif template='assets' then
     domain_command:=servos_v2.import_asset_domain_command(target_id,row_data,(command->>'deviceId')::uuid,md5(key||':'||target_id)::uuid);
    elsif template='assetCategories' then
     domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection','assetCategories','id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','assetCategories','id',target_id,'version',0)));
    elsif template='staff' then
     domain_command:=jsonb_build_object('operation','staff.create','payload',jsonb_build_object('authUserId',row_data->'authUserId','staffId',target_id,'name',row_data->'name','role',row_data->'role')||case when row_data ? 'outletIds' then jsonb_build_object('outletIds',row_data->'outletIds') else '{}'::jsonb end||case when row_data ? 'serviceAreas' then jsonb_build_object('serviceAreas',row_data->'serviceAreas') else '{}'::jsonb end);
    elsif template='suppliers' then
     domain_command:=jsonb_build_object('operation','supplier.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','suppliers','id',target_id,'version',0)));
    else
     domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection',case when template='roomTypes' then 'roomTypes' else 'customers' end,'id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection',case when template='roomTypes' then 'roomTypes' else 'customers' end,'id',target_id,'version',0)));
    end if;
    begin
     if template in ('products','stockItems','stockLocations') then perform servos_v2.apply_catalog_inventory(domain_command);
     elsif template in ('rooms','ratePlans') then perform servos_v2.apply_rooms(domain_command);
     elsif template='assets' then perform servos_v2.apply_assets(domain_command);
     elsif template='staff' then perform servos_v2.apply_staff_device(domain_command);
     elsif template='suppliers' then perform servos_v2.apply_procurement(domain_command);
     else perform servos_v2.apply_master(domain_command);end if;
     raise exception using errcode='Z0001',message='IMPORT_DRY_RUN_ROLLBACK';
    exception when sqlstate 'Z0001' then null;
    end;
   line:=jsonb_build_object('rowNumber',row_no,'targetId',target_id,'status','READY','data',row_data);valid_count:=valid_count+1;
   exception when others then
    get stacked diagnostics message=message_text;
    line:=jsonb_build_object('rowNumber',row_no,'targetId',target_id,'status','REJECTED','data',coalesce(row_data,'{}'::jsonb),'reason',message);
   end;
   preview:=preview||jsonb_build_array(line);
   preview_summary:=concat_ws(', ',
    nullif('name '||(line->'data'->>'name'),'name '),
    nullif('code '||(line->'data'->>'code'),'code '),
    nullif('barcode '||(line->'data'->>'barcode'),'barcode '),
    case when line->'data' ? 'priceMinor' then 'price minor units '||(line->'data'->>'priceMinor') end,
    nullif('base unit '||(line->'data'->>'baseUnit'),'base unit '),
    case when line->'data' ? 'type' then 'Type '||(line->'data'->>'type') end,
    case when line->'data' ? 'maxGuests' then 'Maximum guests '||(line->'data'->>'maxGuests') end,
    case when line->'data' ? 'number' then 'Room '||(line->'data'->>'number') end,
    case when line->'data' ? 'roomTypeId' then 'Room type '||(line->'data'->>'roomTypeId') end,
    case when line->'data' ? 'taxBasisPoints' then 'Tax basis points '||(line->'data'->>'taxBasisPoints') end
   );
   row_results:=row_results||jsonb_build_array(jsonb_build_object(
    'rowNumber',row_no,
    'status',line->>'status',
    'reason',concat_ws(' | ',case when line->>'status'='REJECTED' then 'Rejected: '||(line->>'reason') end,'Preview: '||preview_summary)
   ));
  end loop;
  plan_hash:=md5(preview::text);
  update servos_v2.import_sources set preview_rows=preview where batch_id=key;
  return servos_v2.put_record('importBatches',key,batch||jsonb_build_object('status',case when valid_count=row_total then 'DRY_RUN_READY' else 'DRY_RUN_BLOCKED' end,'previewRows',row_results,'validRowCount',valid_count,'rejectedRowCount',row_total-valid_count,'planHash',plan_hash,'dryRunBy',who,'dryRunAt',now(),'validation','SERVER_DRY_RUN_COMPLETE'));
 elsif op='admin.import.cancel' then
  perform servos_v2.require_permission('data.import.stage');key:=servos_v2.required_text(p,'batchId');
  select r.data into batch from servos_v2.records r where r.collection='importBatches' and r.id=key and not r.archived for update;
  if batch is null then raise exception 'VALIDATION_FAILED: import batch missing';end if;
  if batch->>'status' not in ('STAGED','DRY_RUN_BLOCKED','DRY_RUN_READY') then raise exception 'INVALID_STATE: only an unapplied import batch can be cancelled';end if;
  perform servos_v2.required_text(p,'reason');
  delete from servos_v2.import_sources where batch_id=key;
  return servos_v2.put_record('importBatches',key,batch||jsonb_build_object('status','CANCELLED','cancelledBy',who,'cancelledAt',now(),'cancellationReason',trim(p->>'reason'),'sourcePurged',true));
 elsif op='admin.import.apply' then
  perform servos_v2.require_permission('data.import.execute');key:=servos_v2.required_text(p,'batchId');
  select r.data into batch from servos_v2.records r where r.collection='importBatches' and r.id=key and not r.archived for update;
  if batch is null then raise exception 'VALIDATION_FAILED: import batch missing';end if;
  if batch->>'status'<>'DRY_RUN_READY' then raise exception 'INVALID_STATE: only a fully valid server dry-run can be applied';end if;
  select s.csv_text,s.source_hash,s.preview_rows into source_csv,v_source_hash,preview from servos_v2.import_sources s where s.batch_id=key for update;
  if source_csv is null or preview is null or v_source_hash<>batch->>'sourceHash' or md5(source_csv)<>v_source_hash or md5(preview::text)<>batch->>'planHash' then raise exception 'IMPORT_PLAN_CHANGED: source missing or plan changed; create a new dry run';end if;
  template:=batch->>'templateKey';
  for row_no in 0..jsonb_array_length(preview)-1 loop
   line:=preview->row_no;target_id:=line->>'targetId';row_data:=line->'data';
   if line->>'status'<>'READY' then raise exception 'INVALID_STATE: import contains rejected rows';end if;
   if template='products' then
    domain_command:=jsonb_build_object('operation','product.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','products','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_catalog_inventory(domain_command);
   elsif template='stockItems' then
    domain_command:=jsonb_build_object('operation','stockItem.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockItems','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_catalog_inventory(domain_command);
   elsif template='stockLocations' then
    domain_command:=jsonb_build_object('operation','stockLocation.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockLocations','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_catalog_inventory(domain_command);
   elsif template in ('rooms','ratePlans') then
    domain_command:=servos_v2.import_room_domain_command(template,target_id,row_data,(command->>'deviceId')::uuid);
    changes:=changes||servos_v2.apply_rooms(domain_command);
   elsif template='assets' then
    domain_command:=servos_v2.import_asset_domain_command(target_id,row_data,(command->>'deviceId')::uuid,md5(key||':'||target_id)::uuid);
    changes:=changes||servos_v2.apply_assets(domain_command);
   elsif template='assetCategories' then
    domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection','assetCategories','id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','assetCategories','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_master(domain_command);
   elsif template='staff' then
    domain_command:=jsonb_build_object('operation','staff.create','payload',jsonb_build_object('authUserId',row_data->'authUserId','staffId',target_id,'name',row_data->'name','role',row_data->'role')||case when row_data ? 'outletIds' then jsonb_build_object('outletIds',row_data->'outletIds') else '{}'::jsonb end||case when row_data ? 'serviceAreas' then jsonb_build_object('serviceAreas',row_data->'serviceAreas') else '{}'::jsonb end);
    changes:=changes||servos_v2.apply_staff_device(domain_command);
   elsif template='suppliers' then
    domain_command:=jsonb_build_object('operation','supplier.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','suppliers','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_procurement(domain_command);
   else
    domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection',case when template='roomTypes' then 'roomTypes' else 'customers' end,'id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection',case when template='roomTypes' then 'roomTypes' else 'customers' end,'id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_master(domain_command);
   end if;
  end loop;
  delete from servos_v2.import_sources where batch_id=key;
  changes:=changes||servos_v2.put_record('importBatches',key,batch||jsonb_build_object('status','APPLIED','appliedBy',who,'appliedAt',now(),'appliedRowCount',jsonb_array_length(preview)));
  return changes;
 elsif op='business.settings.save' then
  perform servos_v2.require_permission('business.configure');key:=coalesce(nullif(p->>'id',''),'business');perform servos_v2.assert_version(command,'organization',key);batch:=p->'data';
  if jsonb_typeof(batch) is distinct from 'object' then raise exception 'VALIDATION_FAILED: business settings';end if;
  return servos_v2.put_record('organization',key,batch||jsonb_build_object('updatedBy',who,'updatedAt',now()));
 elsif op='backup.request' then
  perform servos_v2.require_permission('backup.create');key:='backup-'||(command->>'id');return servos_v2.put_record('backupRequests',key,jsonb_build_object('id',key,'status','REQUESTED','reason',servos_v2.required_text(p,'reason'),'requestedBy',who,'requestedAt',now(),'provider','HOSTED_BACKUP_REHEARSAL'));
 end if;
 raise exception 'PROTOCOL_UNSUPPORTED: administration operation';
end$$;

revoke all on function servos_v2.import_csv_data(text,jsonb,jsonb),servos_v2.import_room_domain_command(text,text,jsonb,uuid),servos_v2.import_asset_domain_command(text,jsonb,uuid,uuid),servos_v2.apply_admin_operations(jsonb) from public,anon,authenticated;
commit;

