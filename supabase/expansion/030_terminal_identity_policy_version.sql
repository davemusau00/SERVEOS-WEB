-- STAGED V2 ONLY. Keep the terminal identity's permission fingerprint in
-- lockstep with servos_v2_session so the native shadow cannot be reused after
-- an operator's grants change.
begin;

create or replace function public.servos_v2_terminal_identity(device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=servos_v2.require_permission('records.view');
 device servos_v2.devices;
 staff servos_v2.staff_profiles;
 grants text[];
begin
 select * into device from servos_v2.devices d where d.id=$1 and d.active;
 if not found then raise exception 'DEVICE_REVOKED or not paired' using errcode='42501'; end if;
 select * into staff from servos_v2.staff_profiles s where s.auth_user_id=who and s.active;
 if not found then raise exception 'PERMISSION_DENIED: active Auth-bound staff profile required' using errcode='42501'; end if;
 select permissions into grants from servos_v2.members where user_id=who and active;
 return jsonb_build_object(
  'actorId',who,'staffId',staff.staff_id,'name',staff.name,'role',staff.role,
  'permissions',grants,
  'policyVersion',md5(array_to_string(array(select unnest(grants) order by 1),'|')),
  'deviceId',device.id,'lastSequence',device.last_sequence,
  'businessId',(select business_id from servos_v2.control where singleton),
  'enabled',(select enabled from servos_v2.control where singleton),
  'cursor',(select cursor from servos_v2.control where singleton)
 );
end$$;
revoke all on function public.servos_v2_terminal_identity(uuid) from public,anon;
grant execute on function public.servos_v2_terminal_identity(uuid) to authenticated;
commit;
