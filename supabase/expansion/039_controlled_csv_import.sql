-- STAGED V2 ONLY. Controlled import for the Web's four published master-data templates.
-- Imports never create historical transactions, inventory balances, movements, or payments.
begin;

create table servos_v2.import_sources (
 batch_id text primary key,
 source_hash text not null,
 csv_text text not null,
 preview_rows jsonb,
 staged_by uuid not null,
 staged_at timestamptz not null default now()
);
alter table servos_v2.import_sources enable row level security;
revoke all on table servos_v2.import_sources from public,anon,authenticated;

create function servos_v2.parse_import_csv(source text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare rows jsonb:='[]'::jsonb; cells jsonb:='[]'::jsonb; value text:=''; first_line text;
 delimiter text:=','; quoted boolean:=false; i integer:=1; n integer:=length(source); ch text; next_ch text;
begin
 if source is null or n<1 or n>2000000 then raise exception 'VALIDATION_FAILED: CSV must be between 1 byte and 2 MB';end if;
 if left(source,1)=U&'\FEFF' then source:=substr(source,2);n:=length(source);end if;
 first_line:=split_part(replace(source,chr(13),''),chr(10),1);
 if length(first_line)-length(replace(first_line,chr(9),''))>length(first_line)-length(replace(first_line,',','')) then delimiter:=chr(9);end if;
 while i<=n loop
  ch:=substr(source,i,1);next_ch:=substr(source,i+1,1);
  if ch='"' then
   if quoted and next_ch='"' then value:=value||'"';i:=i+1;
   else quoted:=not quoted;end if;
  elsif ch=delimiter and not quoted then
   cells:=cells||jsonb_build_array(value);value:='';
   if jsonb_array_length(cells)>100 then raise exception 'VALIDATION_FAILED: CSV has more than 100 columns';end if;
  elsif (ch=chr(10) or ch=chr(13)) and not quoted then
   if ch=chr(13) and next_ch=chr(10) then i:=i+1;end if;
   cells:=cells||jsonb_build_array(value);value:='';
   if exists(select 1 from jsonb_array_elements(cells) c where length(trim(c#>>'{}'))>0) then rows:=rows||jsonb_build_array(cells);end if;
   cells:='[]'::jsonb;
   if jsonb_array_length(rows)>20001 then raise exception 'VALIDATION_FAILED: CSV exceeds 20000 data rows';end if;
  else value:=value||ch;end if;
  i:=i+1;
 end loop;
 if quoted then raise exception 'VALIDATION_FAILED: CSV has an unclosed quoted field';end if;
 cells:=cells||jsonb_build_array(value);
 if exists(select 1 from jsonb_array_elements(cells) c where length(trim(c#>>'{}'))>0) then rows:=rows||jsonb_build_array(cells);end if;
 if jsonb_array_length(rows)<2 then raise exception 'VALIDATION_FAILED: CSV needs a header and at least one data row';end if;
 if jsonb_array_length(rows)>20001 then raise exception 'VALIDATION_FAILED: CSV exceeds 20000 data rows';end if;
 return rows;
end$$;

create function servos_v2.import_csv_data(template text,headers jsonb,cells jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare i integer; header text; field text; value text; result jsonb:='{}'::jsonb; price numeric; seen_fields text[]:='{}';
begin
 if jsonb_array_length(headers)<>jsonb_array_length(cells) then raise exception 'VALIDATION_FAILED: row has a different number of columns than the header';end if;
 for i in 0..jsonb_array_length(headers)-1 loop
  header:=lower(regexp_replace(trim(headers->>i),'[^a-zA-Z0-9]+','_','g'));
  value:=cells->>i;field:=null;
  if header in ('external_id','externalid','record_id','id') then field:='externalId';
  elsif header in ('name','product','product_name','item_name','menu_item','stock_item','guest','customer','guest_name','supplier','supplier_name','vendor','full_name') then field:='name';
  elsif header in ('code','sku','product_code','item_code','stock_code','supplier_code','vendor_code') then field:='code';
  elsif header in ('price','selling_price','unit_price','price_kes') then field:='price';
  elsif header in ('category','type','product_category') then field:='category';
  elsif header in ('barcode','ean','upc') then field:='barcode';
  elsif header in ('base_unit','unit','uom','measure') then field:='baseUnit';
  elsif header in ('reorder_level','minimum_stock','par_level') then field:='reorderLevel';
  elsif header in ('phone','mobile','telephone','contact_number') then field:='phone';
  elsif header in ('email','email_address') then field:='email';
  end if;
  if field is null and value<>'' then raise exception 'VALIDATION_FAILED: populated CSV column is not mapped: %',header;end if;
  if field is not null then
   if field='barcode' and value<>trim(value) then raise exception 'VALIDATION_FAILED: barcode values cannot start or end with whitespace';end if;
   if field not in ('externalId','barcode') then value:=trim(value);end if;
   if field=any(seen_fields) then raise exception 'VALIDATION_FAILED: multiple CSV columns map to the same field';end if;
   seen_fields:=array_append(seen_fields,field);
   if field='price' then
    if value !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'VALIDATION_FAILED: price must be a non-negative amount with at most two decimal places; scientific notation is not accepted';end if;
    price:=value::numeric;if price>10000000000 then raise exception 'VALIDATION_FAILED: price is out of range';end if;
    result:=result||jsonb_build_object('priceMinor',(price*100)::bigint);
   elsif field='reorderLevel' then
    if value<>'' and value !~ '^[0-9]+([.][0-9]{1,6})?$' then raise exception 'VALIDATION_FAILED: reorder level must be a non-negative quantity; scientific notation is not accepted';end if;
    if value<>'' then result:=result||jsonb_build_object(field,value::numeric);end if;
   elsif field='externalId' then
    if value<>'' then result:=result||jsonb_build_object(field,value);end if;
   elsif field in ('barcode','phone','email') then
    if value<>'' then result:=result||jsonb_build_object(field,value);end if;
   elsif value<>'' then result:=result||jsonb_build_object(field,value);end if;
  end if;
 end loop;
 if template not in ('products','stockItems','customers','suppliers') then raise exception 'VALIDATION_FAILED: unsupported import template';end if;
 if nullif(trim(result->>'name'),'') is null then raise exception 'VALIDATION_FAILED: name is required';end if;
 if template in ('products','stockItems','suppliers') and nullif(trim(result->>'code'),'') is null then raise exception 'VALIDATION_FAILED: code is required';end if;
 if template='products' and not (result ? 'priceMinor') then raise exception 'VALIDATION_FAILED: price is required';end if;
 if template='stockItems' and nullif(trim(result->>'baseUnit'),'') is null then raise exception 'VALIDATION_FAILED: base unit is required';end if;
 if template='customers' then result:=result-'code'-'priceMinor'-'category'-'barcode'-'baseUnit'-'reorderLevel';end if;
 if template='suppliers' then result:=result-'priceMinor'-'category'-'barcode'-'baseUnit'-'reorderLevel';end if;
 if template='products' then result:=result-'phone'-'email'-'baseUnit'-'reorderLevel';end if;
 if template='stockItems' then result:=result-'priceMinor'-'category'-'phone'-'email';end if;
 return result;
end$$;

create or replace function servos_v2.apply_admin_operations(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();key text;batch jsonb;raw_rows jsonb;headers jsonb;cells jsonb;row_data jsonb;preview jsonb:='[]'::jsonb;line jsonb;changes jsonb:='[]'::jsonb;domain_command jsonb;
 row_no integer;row_total integer;target_id text;template text;source_hash text;plan_hash text;message text;valid_count integer:=0;seen_ids text[]:='{}';seen_codes text[]:='{}';candidate text;source_csv text;row_results jsonb:='[]'::jsonb;
begin
 if op='admin.import.stage' then
  perform servos_v2.require_permission('data.import.stage');
  template:=servos_v2.required_text(p,'templateKey');
  if template not in ('products','stockItems','customers','suppliers') then raise exception 'VALIDATION_FAILED: unsupported import template';end if;
  raw_rows:=servos_v2.parse_import_csv(p->>'csvText');headers:=raw_rows->0;row_total:=jsonb_array_length(raw_rows)-1;
  if length(coalesce(p->>'fileName','')) not between 1 and 255 then raise exception 'VALIDATION_FAILED: import file name';end if;
  key:=coalesce(nullif(p->>'id',''),'import-'||(command->>'id'));source_hash:=md5(p->>'csvText');
  source_csv:=p->>'csvText';
  insert into servos_v2.import_sources(batch_id,source_hash,csv_text,staged_by) values(key,source_hash,source_csv,who) on conflict(batch_id) do nothing;
  if not exists(select 1 from servos_v2.import_sources s where s.batch_id=key and s.source_hash=source_hash and s.csv_text=source_csv) then raise exception 'IMPORT_SOURCE_CONFLICT: batch ID already belongs to different content';end if;
  return servos_v2.put_record('importBatches',key,jsonb_build_object('id',key,'fileName',p->>'fileName','templateKey',template,'status','STAGED','rowCount',row_total,'sourceHash',source_hash,'stagedBy',who,'stagedAt',now(),'validation','SERVER_DRY_RUN_REQUIRED','importKind','MASTER_DATA_ONLY'));
 elsif op='admin.import.dryRun' then
  perform servos_v2.require_permission('data.import.stage');key:=servos_v2.required_text(p,'batchId');batch:=servos_v2.read_record('importBatches',key);
  if batch->>'status' not in ('STAGED','DRY_RUN_BLOCKED','DRY_RUN_READY') then raise exception 'INVALID_STATE: import batch cannot be dry-run from its current state';end if;
  template:=batch->>'templateKey';
  select s.csv_text,s.source_hash into source_csv,source_hash from servos_v2.import_sources s where s.batch_id=key for update;
  if source_csv is null or source_hash<>batch->>'sourceHash' or md5(source_csv)<>source_hash then raise exception 'IMPORT_SOURCE_CHANGED: staged CSV missing or hash mismatch';end if;
  if template in ('products','stockItems') then perform servos_v2.require_any_permission(array['catalog.manage']);
  elsif template='suppliers' then perform servos_v2.require_any_permission(array['procurement.manage']);
  elsif template='customers' then perform servos_v2.require_any_permission(array['customers.manage']);end if;
  raw_rows:=servos_v2.parse_import_csv(source_csv);headers:=raw_rows->0;row_total:=jsonb_array_length(raw_rows)-1;
  for row_no in 1..row_total loop
   cells:=raw_rows->row_no;row_data:=null;message:=null;target_id:=null;
   begin
    row_data:=servos_v2.import_csv_data(template,headers,cells);
    target_id:=coalesce(nullif(row_data->>'externalId',''),'import-'||md5(key||':'||row_no));
    row_data:=row_data-'externalId';
    if length(target_id)>128 then raise exception 'VALIDATION_FAILED: external ID exceeds 128 characters';end if;
    if target_id=any(seen_ids) then raise exception 'DUPLICATE_REFERENCE: duplicate external ID within file';end if;
    seen_ids:=array_append(seen_ids,target_id);
    candidate:=lower(coalesce(row_data->>'code',''));
    if candidate<>'' and candidate=any(seen_codes) then raise exception 'DUPLICATE_REFERENCE: duplicate code within file';end if;
    if candidate<>'' then seen_codes:=array_append(seen_codes,candidate);end if;
    if template='products' then
     domain_command:=jsonb_build_object('operation','product.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','products','id',target_id,'version',0)));
    elsif template='stockItems' then
     domain_command:=jsonb_build_object('operation','stockItem.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockItems','id',target_id,'version',0)));
    elsif template='suppliers' then
     domain_command:=jsonb_build_object('operation','supplier.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','suppliers','id',target_id,'version',0)));
    else
     domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection','customers','id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id',target_id,'version',0)));
    end if;
    begin
     if template in ('products','stockItems') then perform servos_v2.apply_catalog_inventory(domain_command);
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
   row_results:=row_results||jsonb_build_array(jsonb_build_object('rowNumber',row_no,'status',line->>'status','reason',concat_ws(' | ',case when line->>'status'='REJECTED' then 'Rejected: '||(line->>'reason') end,'Preview: '||concat_ws(', ',nullif('name '||(line->'data'->>'name'),'name '),nullif('code '||(line->'data'->>'code'),'code '),nullif('barcode '||(line->'data'->>'barcode'),'barcode '),case when line->'data' ? 'priceMinor' then 'price minor units '||(line->'data'->>'priceMinor') end,nullif('base unit '||(line->'data'->>'baseUnit'),'base unit ')))));
  end loop;
  plan_hash:=md5(preview::text);
  update servos_v2.import_sources set preview_rows=preview where batch_id=key;
  return servos_v2.put_record('importBatches',key,batch||jsonb_build_object('status',case when valid_count=row_total then 'DRY_RUN_READY' else 'DRY_RUN_BLOCKED' end,'previewRows',row_results,'validRowCount',valid_count,'rejectedRowCount',row_total-valid_count,'planHash',plan_hash,'dryRunBy',who,'dryRunAt',now(),'validation','SERVER_DRY_RUN_COMPLETE'));
 elsif op='admin.import.apply' then
  perform servos_v2.require_permission('data.import.execute');key:=servos_v2.required_text(p,'batchId');batch:=servos_v2.read_record('importBatches',key);
  if batch->>'status'<>'DRY_RUN_READY' then raise exception 'INVALID_STATE: only a fully valid server dry-run can be applied';end if;
  select s.csv_text,s.source_hash,s.preview_rows into source_csv,source_hash,preview from servos_v2.import_sources s where s.batch_id=key for update;
  if source_csv is null or preview is null or source_hash<>batch->>'sourceHash' or md5(source_csv)<>source_hash or md5(preview::text)<>batch->>'planHash' then raise exception 'IMPORT_PLAN_CHANGED: source missing or plan changed; create a new dry run';end if;
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
   elsif template='suppliers' then
    domain_command:=jsonb_build_object('operation','supplier.save','payload',jsonb_build_object('id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','suppliers','id',target_id,'version',0)));
    changes:=changes||servos_v2.apply_procurement(domain_command);
   else
    domain_command:=jsonb_build_object('operation','record.save','payload',jsonb_build_object('collection','customers','id',target_id,'data',row_data),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id',target_id,'version',0)));
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

revoke all on function servos_v2.parse_import_csv(text),servos_v2.import_csv_data(text,jsonb,jsonb),servos_v2.apply_admin_operations(jsonb) from public,anon,authenticated;
commit;
