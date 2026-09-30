-- STAGED ONLY. Not part of the legacy migration directory.
-- Domain coverage and allocation issuance must pass acceptance before activation.
begin;
create schema servos_v2;
revoke all on schema servos_v2 from public,anon,authenticated;
create table servos_v2.control(singleton boolean primary key default true check(singleton),enabled boolean not null default false,cursor bigint not null default 0 check(cursor>=0));
insert into servos_v2.control default values;
create table servos_v2.members(user_id uuid primary key references auth.users(id),active boolean not null default true,permissions text[] not null);
insert into servos_v2.members(user_id,permissions) select user_id,case when role='owner' then array['*'] else array['customers.manage','suppliers.manage','records.view'] end from servos_private.managers;
create table servos_v2.devices(id uuid primary key,owner_id uuid not null references auth.users(id),label text not null check(length(label) between 1 and 120),kind text not null check(kind in ('DESKTOP','WEB')),active boolean not null default true,last_sequence bigint not null default 0,created_at timestamptz not null default now());
create table servos_v2.records(collection text not null,id text not null,version bigint not null check(version>0),data jsonb not null check(jsonb_typeof(data)='object'),archived boolean not null default false,primary key(collection,id));
create table servos_v2.commands(id uuid primary key,device_id uuid not null references servos_v2.devices(id),actor_id uuid not null references auth.users(id),client_sequence bigint not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),unique(device_id,client_sequence));
create table servos_v2.changes(sequence bigint primary key,command_id uuid not null unique references servos_v2.commands(id) deferrable initially deferred,actor_id uuid not null,device_id uuid not null,occurred_at timestamptz not null default now(),records jsonb not null);
create table servos_v2.audit(id uuid primary key default extensions.gen_random_uuid(),command_id uuid not null unique references servos_v2.commands(id) deferrable initially deferred,actor_id uuid not null,device_id uuid not null,operation text not null,result_status text not null,occurred_at timestamptz not null default now());
create function servos_v2.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Immutable transaction history';end$$;
create trigger commands_immutable before update or delete on servos_v2.commands for each row execute function servos_v2.immutable();
create trigger audit_immutable before update or delete on servos_v2.audit for each row execute function servos_v2.immutable();
create trigger changes_immutable before update or delete on servos_v2.changes for each row execute function servos_v2.immutable();

create function servos_v2.require_permission(permission text) returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or not exists(select 1 from servos_v2.members m where m.user_id=who and m.active and ('*'=any(m.permissions) or permission=any(m.permissions))) then raise exception 'PERMISSION_DENIED: %',permission using errcode='42501';end if;
 return who;
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;

create function public.servos_v2_register_device(device_id uuid,label text,kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('devices.register');existing servos_v2.devices;
begin
 if device_id is null or length(trim(label)) not between 1 and 120 or kind not in ('DESKTOP','WEB') then raise exception 'VALIDATION_FAILED: device';end if;
 insert into servos_v2.devices(id,owner_id,label,kind) values(device_id,who,trim(label),kind) on conflict(id) do nothing;
 select * into existing from servos_v2.devices d where d.id=device_id;
 if existing.owner_id<>who or not existing.active or existing.kind<>kind then raise exception 'DEVICE_REVOKED or registration mismatch' using errcode='42501';end if;
 return jsonb_build_object('id',existing.id,'label',existing.label,'kind',existing.kind,'lastSequence',existing.last_sequence);
end$$;

create function public.servos_v2_execute(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('records.view');device servos_v2.devices;previous servos_v2.commands;
 command_id uuid;device_id uuid;client_seq bigint;collection_name text;record_id text;master_data jsonb;expected bigint;current_record servos_v2.records;
 outcome text:='SYNCHRONIZED';error_text text;error_code text;next_cursor bigint;audit_id uuid:=extensions.gen_random_uuid();result jsonb;changed jsonb:='[]';versions jsonb:='[]';
begin
 if jsonb_typeof(command)<>'object' or command->>'schemaVersion'<>'2' or command->>'actorId' is distinct from who::text then raise exception 'PROTOCOL_UNSUPPORTED or actor mismatch';end if;
 command_id:=(command->>'id')::uuid;device_id:=(command->>'deviceId')::uuid;client_seq:=(command->>'clientSequence')::bigint;
 if command_id is null or device_id is null or client_seq is null or client_seq<1 then raise exception 'VALIDATION_FAILED: identity/sequence';end if;
 -- A transactional clock avoids a pull cursor skipping a later-committing sequence.
 perform 1 from servos_v2.control where singleton and enabled for update;
 if not found then raise exception 'PROTOCOL_DISABLED: migration acceptance required';end if;
 select * into device from servos_v2.devices d where d.id=device_id for update;
 if not found or not device.active or device.owner_id<>who then raise exception 'DEVICE_REVOKED or not owned' using errcode='42501';end if;
 select * into previous from servos_v2.commands c where c.id=command_id;
 if found then
  if previous.request<>command or previous.actor_id<>who or previous.device_id<>device_id then raise exception 'REPLAY_MISMATCH';end if;
  return previous.result;
 end if;
 if client_seq<>device.last_sequence+1 then raise exception 'SEQUENCE_GAP';end if;
 begin
  if command->>'operation' not in ('record.save','record.archive','record.reactivate') then raise exception 'PROTOCOL_UNSUPPORTED: domain operation not enabled';end if;
  collection_name:=command->'payload'->>'collection';record_id:=command->'payload'->>'id';master_data:=command->'payload'->'data';
  if collection_name not in ('customers','suppliers','assetCategories','roomTypes') or collection_name is null then raise exception 'VALIDATION_FAILED: collection requires dedicated commands';end if;
  perform servos_v2.require_permission(collection_name||'.manage');
  if record_id is null or length(record_id) not between 1 and 128 then raise exception 'VALIDATION_FAILED: record ID';end if;
  if jsonb_typeof(command->'expectedVersions') is distinct from 'array' then raise exception 'VALIDATION_FAILED: expected versions';end if;
  select (v->>'version')::bigint into expected from jsonb_array_elements(command->'expectedVersions') v where v->>'collection'=collection_name and v->>'id'=record_id;
  if expected is null or expected<0 or (select count(*) from jsonb_array_elements(command->'expectedVersions') v where v->>'collection'=collection_name and v->>'id'=record_id)<>1 then raise exception 'VALIDATION_FAILED: one baseline version required';end if;
  select * into current_record from servos_v2.records r where r.collection=collection_name and r.id=record_id for update;
  if coalesce(current_record.version,0)<>expected then raise exception 'VERSION_CONFLICT: reload the record';end if;
  if command->>'operation'='record.save' then
   if current_record.archived then raise exception 'VALIDATION_FAILED: reactivate before editing';end if;
   if jsonb_typeof(master_data) is distinct from 'object' or jsonb_typeof(master_data->'name') is distinct from 'string' or length(trim(master_data->>'name')) not between 1 and 200 then raise exception 'VALIDATION_FAILED: name';end if;
   -- Only descriptive master fields: never accept balances, points, stock or workflow state.
   if exists(select 1 from jsonb_object_keys(master_data) k where k not in ('name','code','phone','email','notes','description','contactPerson','kraPin','paymentTermsDays','maxGuests','features')) then raise exception 'VALIDATION_FAILED: unsupported master field';end if;
   if collection_name='suppliers' and (coalesce(length(trim(master_data->>'code')),0)=0 or coalesce((master_data->>'paymentTermsDays')::integer,0)<0) then raise exception 'VALIDATION_FAILED: supplier code/terms';end if;
   if collection_name='roomTypes' and coalesce((master_data->>'maxGuests')::integer,0) not between 1 and 1000 then raise exception 'VALIDATION_FAILED: room capacity';end if;
   if nullif(trim(master_data->>'code'),'') is not null and exists(select 1 from servos_v2.records r where r.collection=collection_name and r.id<>record_id and not r.archived and lower(r.data->>'code')=lower(master_data->>'code')) then raise exception 'DUPLICATE_REFERENCE: code';end if;
   master_data:=jsonb_set(master_data,'{id}',to_jsonb(record_id));
   insert into servos_v2.records values(collection_name,record_id,expected+1,master_data,false) on conflict(collection,id) do update set version=excluded.version,data=excluded.data;
  else
   if current_record.id is null then raise exception 'VALIDATION_FAILED: record missing';end if;
   if command->>'operation'='record.archive' and exists(select 1 from servos_v2.records r where not r.archived and (r.data->>'customerId'=record_id or r.data->>'supplierId'=record_id or r.data->>'roomTypeId'=record_id or r.data->>'assetCategoryId'=record_id)) then raise exception 'VALIDATION_FAILED: active references';end if;
   if command->>'operation'='record.reactivate' and nullif(current_record.data->>'code','') is not null and exists(select 1 from servos_v2.records r where r.collection=collection_name and r.id<>record_id and not r.archived and lower(r.data->>'code')=lower(current_record.data->>'code')) then raise exception 'DUPLICATE_REFERENCE: code';end if;
   update servos_v2.records r set version=expected+1,archived=(command->>'operation'='record.archive') where r.collection=collection_name and r.id=record_id;
  end if;
  select jsonb_build_array(jsonb_build_object('collection',r.collection,'id',r.id,'version',r.version,'data',r.data,'archived',r.archived)),jsonb_build_array(jsonb_build_object('collection',r.collection,'id',r.id,'version',r.version)) into changed,versions from servos_v2.records r where r.collection=collection_name and r.id=record_id;
 exception when others then
  get stacked diagnostics error_text=message_text;
  error_code:=split_part(error_text,':',1);outcome:=case when error_code='VERSION_CONFLICT' then 'CONFLICT' else 'REJECTED' end;
  changed:='[]';versions:='[]';
 end;
 if outcome='SYNCHRONIZED' then
  update servos_v2.control set cursor=cursor+1 where singleton returning cursor into next_cursor;
  insert into servos_v2.changes(sequence,command_id,actor_id,device_id,records) values(next_cursor,command_id,who,device_id,changed);
 end if;
 result:=jsonb_build_object('commandId',command_id,'status',outcome,'recordVersions',versions,'auditReference',audit_id);
 if next_cursor is not null then result:=result||jsonb_build_object('serverSequence',next_cursor);end if;
 if error_text is not null then result:=result||jsonb_build_object('error',jsonb_build_object('code',error_code,'message',error_text,'retryable',false));end if;
 insert into servos_v2.commands(id,device_id,actor_id,client_sequence,request,result) values(command_id,device_id,who,client_seq,command,result);
 insert into servos_v2.audit(id,command_id,actor_id,device_id,operation,result_status) values(audit_id,command_id,who,device_id,command->>'operation',outcome);
 update servos_v2.devices d set last_sequence=client_seq where d.id=device_id;
 return result;
end$$;

create function public.servos_v2_pull(after_sequence bigint default 0,page_size integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare upper_cursor bigint;page jsonb;
begin
 perform servos_v2.require_permission('records.view');
 if after_sequence<0 or page_size not between 1 and 500 then raise exception 'VALIDATION_FAILED: cursor/page';end if;
 select coalesce(jsonb_agg(jsonb_build_object('sequence',c.sequence,'commandId',c.command_id,'actorId',c.actor_id,'deviceId',c.device_id,'occurredAt',c.occurred_at,'records',c.records) order by c.sequence),'[]'),coalesce(max(c.sequence),after_sequence) into page,upper_cursor from (select * from servos_v2.changes where sequence>after_sequence order by sequence limit page_size) c;
 return jsonb_build_object('cursor',upper_cursor,'changes',page,'hasMore',exists(select 1 from servos_v2.changes where sequence>upper_cursor));
end$$;

-- Preserve the old API while preventing concurrent legacy writes after v2 cutover.
alter function public.servos_upload(uuid,text,jsonb) rename to servos_legacy_upload;
revoke all on function public.servos_legacy_upload(uuid,text,jsonb) from public,anon,authenticated;
create function public.servos_upload(terminal_id uuid,device_token text,operations jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from servos_v2.control where singleton and not enabled for share;
 if not found then raise exception 'PROTOCOL_UNSUPPORTED: legacy writer fenced after cutover';end if;
 return public.servos_legacy_upload(terminal_id,device_token,operations);
end$$;
revoke all on function public.servos_upload(uuid,text,jsonb) from public,authenticated;
grant execute on function public.servos_upload(uuid,text,jsonb) to anon;
revoke all on function public.servos_v2_register_device(uuid,text,text),public.servos_v2_execute(jsonb),public.servos_v2_pull(bigint,integer) from public,anon;
grant execute on function public.servos_v2_register_device(uuid,text,text),public.servos_v2_execute(jsonb),public.servos_v2_pull(bigint,integer) to authenticated;
commit;
