-- STAGED V2 ONLY. A terminal is paired once; active Auth-bound operators
-- authenticate individually and the server remains the permission authority.
begin;

create function public.servos_v2_terminal_identity(device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('records.view');device servos_v2.devices;staff servos_v2.staff_profiles;grants text[];
begin
 select * into device from servos_v2.devices d where d.id=$1 and d.active;
 if not found then raise exception 'DEVICE_REVOKED or not paired' using errcode='42501';end if;
 select * into staff from servos_v2.staff_profiles s where s.auth_user_id=who and s.active;
 if not found then raise exception 'PERMISSION_DENIED: active Auth-bound staff profile required' using errcode='42501';end if;
 select permissions into grants from servos_v2.members where user_id=who and active;
 return jsonb_build_object('actorId',who,'staffId',staff.staff_id,'name',staff.name,'role',staff.role,'permissions',grants,'deviceId',device.id,'businessId',(select business_id from servos_v2.control where singleton),'enabled',(select enabled from servos_v2.control where singleton));
end$$;
revoke all on function public.servos_v2_terminal_identity(uuid) from public,anon;
grant execute on function public.servos_v2_terminal_identity(uuid) to authenticated;

-- Idempotent registration recovery must not transfer device ownership when a
-- different authorized operator retries after an interrupted first pair.
alter function public.servos_v2_register_device(uuid,text,text) rename to servos_v2_register_device_before_shared_terminal;
create function public.servos_v2_register_device(device_id uuid,label text,kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('devices.register');existing servos_v2.devices;
begin
 if device_id is null or length(trim(label)) not between 1 and 120 or kind not in ('DESKTOP','WEB') then raise exception 'VALIDATION_FAILED: device';end if;
 insert into servos_v2.devices(id,owner_id,label,kind) values($1,who,trim($2),$3) on conflict(id) do nothing;
 select * into existing from servos_v2.devices d where d.id=$1;
 if not found or not existing.active or existing.kind<>$3 then raise exception 'DEVICE_REVOKED or registration mismatch' using errcode='42501';end if;
 return jsonb_build_object('id',existing.id,'label',existing.label,'kind',existing.kind,'lastSequence',existing.last_sequence);
end$$;
revoke all on function public.servos_v2_register_device(uuid,text,text) from public,anon;
grant execute on function public.servos_v2_register_device(uuid,text,text) to authenticated;

-- Preserve the established dispatcher, sequence, replay, audit, and permission
-- checks. The original pairing owner is only registration metadata; access is
-- based on the active business Auth session and active paired device.
alter function public.servos_v2_execute(jsonb) rename to servos_v2_execute_before_shared_terminal;
create function public.servos_v2_execute(command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('records.view');device_key uuid;original_owner uuid;result jsonb;
begin
 begin device_key:=(command->>'deviceId')::uuid;exception when others then raise exception 'VALIDATION_FAILED: device ID';end;
 select owner_id into original_owner from servos_v2.devices where id=device_key and active for update;
 if not found then raise exception 'DEVICE_REVOKED or not paired' using errcode='42501';end if;
 -- The legacy inner dispatcher has an owner equality check. Temporarily satisfy
 -- it under this row lock, then restore registration metadata in the same txn.
 if original_owner<>who then update servos_v2.devices set owner_id=who where id=device_key;end if;
 result:=public.servos_v2_execute_before_shared_terminal(command);
 if original_owner<>who then update servos_v2.devices set owner_id=original_owner where id=device_key;end if;
 return result;
end$$;
revoke all on function public.servos_v2_execute(jsonb) from public,anon;
grant execute on function public.servos_v2_execute(jsonb) to authenticated;
commit;
