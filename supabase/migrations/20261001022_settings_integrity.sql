-- STAGED V2 ONLY. Lossless business settings updates.
-- This is a forward migration: 020_admin_operations.sql remains unchanged for existing deployments.
begin;

create function servos_v2.apply_business_settings(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  p jsonb:=command->'payload'; patch jsonb:=p->'data'; current_data jsonb; next_data jsonb;
  key text:=coalesce(nullif(p->>'id',''),'business'); expected bigint;
  field text; result jsonb;
begin
  perform servos_v2.require_permission('business.configure');
  if jsonb_typeof(patch) is distinct from 'object' then raise exception 'VALIDATION_FAILED: business settings';end if;
  if jsonb_typeof(command->'expectedVersions') is distinct from 'array' then raise exception 'VALIDATION_FAILED: expectedVersions';end if;
  select (v->>'version')::bigint into expected from jsonb_array_elements(command->'expectedVersions') v
    where v->>'collection'='organization' and v->>'id'=key;
  if expected is null or (select count(*) from jsonb_array_elements(command->'expectedVersions') v where v->>'collection'='organization' and v->>'id'=key)<>1 then
    raise exception 'VALIDATION_FAILED: one organization baseline required';
  end if;
  select data into current_data from servos_v2.records where collection='organization' and id=key for update;
  if coalesce((select version from servos_v2.records where collection='organization' and id=key),0)<>expected then
    raise exception 'VERSION_CONFLICT: organization changed';
  end if;
  if current_data is null and expected<>0 then raise exception 'VERSION_CONFLICT: organization was removed';end if;

  foreach field in array array(select jsonb_object_keys(patch)) loop
    if field not in ('name','tradingName','legalName','registrationNumber','code','baseCurrency','phone','email','address','ownerName','ownerPhone','ownerEmail','taxPolicyVersion','receiptFooter','branding','receipt') then
      raise exception 'VALIDATION_FAILED: protected or unknown business setting %',field;
    end if;
  end loop;
  foreach field in array array['name','tradingName','legalName','registrationNumber','code','baseCurrency','phone','email','address','ownerName','ownerPhone','ownerEmail','taxPolicyVersion','receiptFooter'] loop
    if patch ? field and jsonb_typeof(patch->field) not in ('string','null') then raise exception 'VALIDATION_FAILED: business setting % must be text',field;end if;
  end loop;
  foreach field in array array['branding','receipt'] loop
    if patch ? field and jsonb_typeof(patch->field) not in ('object','null') then raise exception 'VALIDATION_FAILED: business setting % must be an object',field;end if;
  end loop;
  next_data:=coalesce(current_data,'{}'::jsonb)||(patch-'branding'-'receipt');
  if patch ? 'branding' and jsonb_typeof(patch->'branding')='object' then next_data:=jsonb_set(next_data,'{branding}',coalesce(current_data->'branding','{}'::jsonb)||patch->'branding');end if;
  if patch ? 'receipt' and jsonb_typeof(patch->'receipt')='object' then next_data:=jsonb_set(next_data,'{receipt}',coalesce(current_data->'receipt','{}'::jsonb)||patch->'receipt');end if;
  next_data:=next_data||jsonb_build_object('id',key,'updatedBy',auth.uid(),'updatedAt',now());
  if jsonb_typeof(next_data->'name') is distinct from 'string' or length(trim(next_data->>'name'))<1 then raise exception 'VALIDATION_FAILED: business name';end if;
  result:=servos_v2.put_record('organization',key,next_data);
  return result;
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_settings;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
  if command->>'operation'='business.settings.save' then return servos_v2.apply_business_settings(command);end if;
  return servos_v2.dispatch_before_settings(command);
end$$;
revoke all on function servos_v2.apply_business_settings(jsonb),servos_v2.dispatch(jsonb) from public,anon,authenticated;
commit;
