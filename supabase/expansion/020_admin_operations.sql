-- STAGED V2 ONLY. Administration, controlled import requests and Auth lifecycle authorization.
-- Auth secrets remain in the Edge Function; this SQL only authorizes the request.
begin;

create or replace function servos_v2.apply_admin_operations(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();key text;payload jsonb;row_count integer;hash text;changes jsonb:='[]';
begin
 if op='admin.import.stage' then
   perform servos_v2.require_permission('data.import.stage');
   if length(coalesce(p->>'csvText',''))<1 or length(p->>'csvText')>10000000 then raise exception 'VALIDATION_FAILED: import file size';end if;
   key:=coalesce(nullif(p->>'id',''),'import-'||(command->>'id'));row_count:=greatest(0,array_length(regexp_split_to_array(p->>'csvText',E'\r?\n'),1)-1);hash:=md5(p->>'csvText');
   changes:=changes||servos_v2.put_record('importBatches',key,jsonb_build_object('id',key,'fileName',servos_v2.required_text(p,'fileName'),'templateKey',servos_v2.required_text(p,'templateKey'),'status','STAGED','rowCount',row_count,'sourceHash',hash,'stagedBy',who,'stagedAt',now(),'validation','PENDING_SERVER_REVIEW'));
   return changes;
 elsif op='admin.import.apply' then
   perform servos_v2.require_permission('data.import.execute');key:=servos_v2.required_text(p,'batchId');payload:=servos_v2.read_record('importBatches',key);
   if payload->>'status' not in ('READY','DRY_RUN_READY') then raise exception 'INVALID_STATE: import requires a reviewed dry-run plan';end if;
   return servos_v2.put_record('importBatches',key,payload||jsonb_build_object('status','APPLIED','appliedBy',who,'appliedAt',now()));
 elsif op='business.settings.save' then
   perform servos_v2.require_permission('business.configure');key:=coalesce(nullif(p->>'id',''),'business');perform servos_v2.assert_version(command,'organization',key);payload:=p->'data';
   if jsonb_typeof(payload) is distinct from 'object' then raise exception 'VALIDATION_FAILED: business settings';end if;
   return servos_v2.put_record('organization',key,payload||jsonb_build_object('updatedBy',who,'updatedAt',now()));
 elsif op='backup.request' then
   perform servos_v2.require_permission('backup.create');key:='backup-'||(command->>'id');return servos_v2.put_record('backupRequests',key,jsonb_build_object('id',key,'status','REQUESTED','reason',servos_v2.required_text(p,'reason'),'requestedBy',who,'requestedAt',now(),'provider','HOSTED_BACKUP_REHEARSAL'));
 end if;
 raise exception 'PROTOCOL_UNSUPPORTED: administration operation';
end$$;

alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_admin;
create or replace function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false;end if;if '*'=any(grants) then return true;end if;
 if collection_name in ('importBatches','backupRequests','organization') then return grants&&array['business.view','business.configure','data.import.view','data.import.stage','data.import.execute','backup.create'];end if;
 return servos_v2.can_read_collection_before_admin(collection_name);
end$$;

create function public.servos_v2_auth_lifecycle(action text,email text,redirect_to text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform servos_v2.require_permission('staff.create');
 if action not in ('invite','reset') or email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'VALIDATION_FAILED: Auth lifecycle request';end if;
 if redirect_to is not null and length(redirect_to)>1000 then raise exception 'VALIDATION_FAILED: redirect URL';end if;
 return jsonb_build_object('authorized',true,'action',action,'email',lower(trim(email)),'redirectTo',redirect_to,'requestedBy',auth.uid());
end$$;

alter function servos_v2.dispatch(jsonb) rename to dispatch_before_admin;
create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation' like 'admin.%' or command->>'operation'='business.settings.save' or command->>'operation'='backup.request' then return servos_v2.apply_admin_operations(command);end if;
 return servos_v2.dispatch_before_admin(command);
end$$;

revoke all on function servos_v2.apply_admin_operations(jsonb),servos_v2.can_read_collection_before_admin(text),servos_v2.can_read_collection(text),servos_v2.dispatch(jsonb),public.servos_v2_auth_lifecycle(text,text,text) from public,anon,authenticated;
grant execute on function public.servos_v2_auth_lifecycle(text,text,text) to authenticated;
commit;