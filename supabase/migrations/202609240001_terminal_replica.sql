-- Dedicated project for one business. Only a project operator can provision managers.
create schema if not exists servos_private;
create extension if not exists pgcrypto with schema extensions;
create table servos_private.managers(user_id uuid primary key references auth.users(id), role text not null check(role in ('owner','manager')));
create table servos_private.terminal(id uuid primary key, owner_id uuid not null references auth.users(id), token_hash text not null, active boolean not null default true, last_sequence bigint not null default 0, last_seen timestamptz);
create unique index one_active_terminal on servos_private.terminal(active) where active;
create table servos_private.operations(terminal_id uuid references servos_private.terminal(id), sequence bigint not null, command_id uuid not null unique, envelope jsonb not null, primary key(terminal_id,sequence));
create table public.business_records(collection text not null,id text not null,version bigint not null,data jsonb not null,archived boolean not null default false,primary key(collection,id));
create table public.remote_change_requests(id uuid primary key default gen_random_uuid(),author_id uuid not null references auth.users(id),expected_version bigint,operation text not null,payload jsonb not null,status text not null default 'pending' check(status in ('pending','applied','rejected','conflict')),created_at timestamptz not null default now(),result jsonb);
alter table public.business_records enable row level security;
alter table public.remote_change_requests enable row level security;
revoke all on public.business_records,public.remote_change_requests from anon,authenticated;
revoke all on schema servos_private from public,anon,authenticated;

create function public.servos_is_manager() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from servos_private.managers where user_id=auth.uid())$$;
revoke all on function public.servos_is_manager() from public;
grant execute on function public.servos_is_manager() to authenticated;
grant select on public.business_records,public.remote_change_requests to authenticated;
create policy manager_read on public.business_records for select to authenticated using(public.servos_is_manager());
create policy manager_requests_read on public.remote_change_requests for select to authenticated using(public.servos_is_manager());

create function public.servos_enroll(business_name text,installation_id uuid,device_secret text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from servos_private.managers where user_id=auth.uid() and role='owner') then raise exception 'Owner enrollment required'; end if;
 if length(trim(business_name))=0 then raise exception 'Business name required'; end if;
 if installation_id is null or device_secret is null or length(device_secret)<64 then raise exception 'Installation credentials required'; end if;
 if exists(select 1 from servos_private.terminal t where t.id=installation_id) then
  if not exists(select 1 from servos_private.terminal t where t.id=installation_id and t.active and t.owner_id=auth.uid() and t.token_hash=encode(extensions.digest(device_secret,'sha256'),'hex')) then raise exception 'Installation enrollment mismatch'; end if;
 else
  insert into servos_private.terminal(id,owner_id,token_hash) values(installation_id,auth.uid(),encode(extensions.digest(device_secret,'sha256'),'hex'));
 end if;
 return jsonb_build_object('terminalId',installation_id);
end $$;
revoke all on function public.servos_enroll(text,uuid,text) from public;
grant execute on function public.servos_enroll(text,uuid,text) to authenticated;

create function public.servos_upload(terminal_id uuid,device_token text,operations jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_sequence bigint; op jsonb; change jsonb; op_sequence bigint; prior jsonb;
begin
 select t.last_sequence into current_sequence from servos_private.terminal t where t.id=terminal_id and t.active and t.token_hash=encode(extensions.digest(device_token,'sha256'),'hex') for update;
 if not found then raise exception 'Terminal authentication failed'; end if;
 if jsonb_typeof(operations)<>'array' or jsonb_array_length(operations)>100 then raise exception 'Invalid batch'; end if;
 for op in select value from jsonb_array_elements(operations) loop
  op_sequence:=(op->>'sequence')::bigint;
  select o.envelope into prior from servos_private.operations o where o.terminal_id=servos_upload.terminal_id and o.sequence=op_sequence;
  if found then
   if prior<>op then raise exception 'Replay payload mismatch'; end if;
   continue;
  end if;
  if op_sequence<>current_sequence+1 then raise exception 'Sequence gap'; end if;
  insert into servos_private.operations values(terminal_id,op_sequence,(op->>'commandId')::uuid,op);
  for change in select value from jsonb_array_elements(op->'changes') loop
   if (change->>'version')::bigint<=0 or jsonb_typeof(change->'data')<>'object' then raise exception 'Invalid record'; end if;
   insert into public.business_records(collection,id,version,data,archived) values(change->>'collection',change->>'id',(change->>'version')::bigint,change->'data',(change->>'archived')::boolean)
   on conflict(collection,id) do update set version=excluded.version,data=excluded.data,archived=excluded.archived where public.business_records.version<excluded.version;
  end loop;
  current_sequence:=op_sequence;
 end loop;
 update servos_private.terminal t set last_sequence=current_sequence,last_seen=now() where t.id=terminal_id;
 return jsonb_build_object('acknowledgedSequence',current_sequence,'lastSeen',now());
end $$;
revoke all on function public.servos_upload(uuid,text,jsonb) from public;
grant execute on function public.servos_upload(uuid,text,jsonb) to anon;

create function public.servos_request_change(operation text,payload jsonb,expected_version bigint default null) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
 if not public.servos_is_manager() then raise exception 'Manager required'; end if;
 if operation not in ('record.save','record.archive') or payload->>'collection' not in ('products','tables','customers','suppliers','priceRules') then raise exception 'Remote operation not permitted'; end if;
 insert into public.remote_change_requests(author_id,operation,payload,expected_version) values(auth.uid(),operation,payload,expected_version) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.servos_request_change(text,jsonb,bigint) from public;
grant execute on function public.servos_request_change(text,jsonb,bigint) to authenticated;
