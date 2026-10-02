-- STAGED V2 ONLY. Explicit business authority mode.
--
-- A single boolean cannot express a cutover. `enabled=false` fences the legacy
-- writer but also blocks the terminal from installing its final v2 baseline,
-- and `enabled=true` both fences legacy and grants v2 writes, leaving no
-- maintenance window. Replace it with an explicit mode:
--
--   LEGACY_LOCAL  servos_upload allowed, v2 execute blocked.
--   CUTOVER_PREP  servos_upload frozen, v2 bootstrap/snapshot/pull allowed,
--                 v2 execute blocked. This is the missing maintenance window.
--   SHARED_V2     servos_upload blocked, v2 execute allowed.
begin;

alter table servos_v2.control add column if not exists authority_mode text not null default 'LEGACY_LOCAL';
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='servos_v2' and table_name='control' and column_name='authority_mode') then
    execute 'alter table servos_v2.control drop constraint if exists control_authority_mode';
  end if;
end$$;
alter table servos_v2.control add constraint control_authority_mode
  check(authority_mode in ('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2'));

-- `enabled` is retained as a derived compatibility flag for existing callers,
-- but it is no longer the authority. Existing sessions that only read `enabled`
-- keep working; new code reads authority_mode.
update servos_v2.control set authority_mode=case when enabled then 'SHARED_V2' else 'LEGACY_LOCAL' end where singleton;

-- Immutable server-side transition evidence.
create table if not exists servos_v2.authority_transitions(
  id uuid primary key default extensions.gen_random_uuid(),
  from_mode text not null,
  to_mode text not null check(to_mode in ('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2')),
  actor_id uuid not null references auth.users(id),
  cutover_id text,
  reason text not null check(length(trim(reason)) between 1 and 500),
  occurred_at timestamptz not null default now()
);
create trigger servos_v2_authority_transitions_immutable before update or delete on servos_v2.authority_transitions
  for each row execute function servos_v2.immutable();

-- Resolve the current authority under a lock. Callers that gate on `enabled`
-- must now call this so CUTOVER_PREP is not silently treated as enabled.
create or replace function servos_v2.authority() returns text
language plpgsql security definer set search_path='' as $$
declare state servos_v2.control;
begin
  select * into state from servos_v2.control where singleton for share;
  if not found then raise exception 'VALIDATION_FAILED: control row missing'; end if;
  return state.authority_mode;
end$$;
revoke all on function servos_v2.authority() from public,anon,authenticated;

-- True only when v2 is the sole business authority.
create or replace function servos_v2.shared_v2_active() returns boolean
language plpgsql security definer set search_path='' as $$
begin
  return (select authority_mode from servos_v2.control where singleton)='SHARED_V2';
end$$;
revoke all on function servos_v2.shared_v2_active() from public,anon,authenticated;

-- Admin-only authority transition. Forward-only, audited, and never
-- client-elevatable: the actor is auth.uid() and an Admin staff profile is
-- required. There is no parameter through which a caller names itself.
create or replace function public.servos_v2_set_authority_mode(next_mode text, reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); state servos_v2.control; from_mode text; to_mode text;
begin
  if who is null then raise exception 'PERMISSION_DENIED: authentication required' using errcode='42501'; end if;
  if not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=who and s.active and s.role='Admin') then
    raise exception 'PERMISSION_DENIED: Admin staff profile required' using errcode='42501';
  end if;
  if next_mode is null or next_mode not in ('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2') then
    raise exception 'VALIDATION_FAILED: authority mode';
  end if;
  if reason is null or length(trim(reason)) not between 1 and 500 then
    raise exception 'VALIDATION_FAILED: a recorded reason is required';
  end if;
  select * into state from servos_v2.control where singleton for update;
  from_mode:=state.authority_mode;
  to_mode:=next_mode;
  if from_mode=to_mode then
    return jsonb_build_object('authorityMode',to_mode,'changed',false);
  end if;
  if not ((from_mode='LEGACY_LOCAL' and to_mode='CUTOVER_PREP') or (from_mode='CUTOVER_PREP' and to_mode='SHARED_V2')) then
    raise exception 'VALIDATION_FAILED: authority must move forward LEGACY_LOCAL -> CUTOVER_PREP -> SHARED_V2';
  end if;
  -- Moving to SHARED_V2 requires a verified cutover, so a half-finished import
  -- cannot hand the business to v2 with unknown contents. The cutover tables are
  -- introduced by a later migration, so their absence is detected explicitly
  -- rather than assumed to mean "verified".
  if to_mode='SHARED_V2' and (to_regclass('servos_v2.cutovers') is null or not exists(
    select 1 from servos_v2.cutovers c where c.business_id=state.business_id and c.status in ('READY','COMMITTED')
  )) then
    raise exception 'VALIDATION_FAILED: a verified v2 cutover is required before SHARED_V2';
  end if;
  update servos_v2.control set authority_mode=to_mode,enabled=(to_mode='SHARED_V2') where singleton;
  insert into servos_v2.authority_transitions(from_mode,to_mode,actor_id,reason) values(from_mode,to_mode,who,trim(reason));
  return jsonb_build_object('authorityMode',to_mode,'previousMode',from_mode,'changed',true,'v2WritesEnabled',to_mode='SHARED_V2');
end$$;
revoke all on function public.servos_v2_set_authority_mode(text,text) from public,anon;
grant execute on function public.servos_v2_set_authority_mode(text,text) to authenticated;

-- Legacy upload fence, re-expressed against the explicit mode. LEGACY_LOCAL
-- uploads; CUTOVER_PREP freezes the legacy writer for the maintenance window;
-- SHARED_V2 blocks it permanently.
alter function public.servos_upload(uuid,text,jsonb) rename to servos_upload_before_authority_mode;
create function public.servos_upload(terminal_id uuid,device_token text,operations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from servos_v2.control where singleton and authority_mode='LEGACY_LOCAL' for share;
  if not found then
    perform 1 from servos_v2.control where singleton and authority_mode='CUTOVER_PREP' for share;
    if found then raise exception 'PROTOCOL_UNSUPPORTED: legacy writer frozen during cutover preparation';end if;
    raise exception 'PROTOCOL_UNSUPPORTED: legacy writer fenced after cutover';
  end if;
  return public.servos_upload_before_authority_mode(terminal_id,device_token,operations);
end$$;
revoke all on function public.servos_upload(uuid,text,jsonb) from public,authenticated;
grant execute on function public.servos_upload(uuid,text,jsonb) to anon;

-- v2 command execution requires SHARED_V2. This is what makes CUTOVER_PREP a
-- real freeze: bootstrap and baseline installation work, but no business
-- mutation can be committed mid-cutover.
alter function public.servos_v2_execute(jsonb) rename to servos_v2_execute_before_authority_mode;
create function public.servos_v2_execute(command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare mode text;
begin
  select authority_mode into mode from servos_v2.control where singleton for share;
  if mode is distinct from 'SHARED_V2' then
    raise exception 'PROTOCOL_DISABLED: v2 business writes require SHARED_V2 authority (current mode: %)',coalesce(mode,'unknown');
  end if;
  return public.servos_v2_execute_before_authority_mode(command);
end$$;
revoke all on function public.servos_v2_execute(jsonb) from public,anon;
grant execute on function public.servos_v2_execute(jsonb) to authenticated;

-- Identity responses must carry the explicit mode so a terminal never has to
-- infer the authority from a boolean. Preserve the established identity checks
-- and append the mode to the response.
alter function public.servos_v2_terminal_identity(uuid) rename to servos_v2_terminal_identity_before_authority_mode;
create function public.servos_v2_terminal_identity(device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
select public.servos_v2_terminal_identity_before_authority_mode($1)
       || jsonb_build_object('authorityMode',servos_v2.authority(),'sharedV2',servos_v2.shared_v2_active());
end$$;
revoke all on function public.servos_v2_terminal_identity(uuid) from public,anon;
grant execute on function public.servos_v2_terminal_identity(uuid) to authenticated;

commit;