-- STAGED V2 ONLY. A reviewed replacement command may correlate to one
-- immutable conflict/rejection, but it must never mutate or replay that row.
begin;

alter function public.servos_v2_execute(jsonb) rename to servos_v2_execute_before_supersedes;

create function public.servos_v2_execute(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  previous servos_v2.commands;
  superseded_id uuid;
  actor_id uuid;
  device_id uuid;
begin
  if command ? 'supersedes' then
    begin
      superseded_id:=(command->>'supersedes')::uuid;
      actor_id:=(command->>'actorId')::uuid;
      device_id:=(command->>'deviceId')::uuid;
    exception when others then
      raise exception 'VALIDATION_FAILED: supersedes must be a UUID';
    end;
    select * into previous from servos_v2.commands where id=superseded_id;
    if not found or previous.actor_id<>actor_id or previous.device_id<>device_id
      or previous.result->>'status' not in ('CONFLICT','REJECTED') then
      raise exception 'VALIDATION_FAILED: supersedes must reference the same device actor conflict or rejection';
    end if;
  end if;
  return public.servos_v2_execute_before_supersedes(command);
end
$$;

revoke all on function public.servos_v2_execute(jsonb) from public,anon;
grant execute on function public.servos_v2_execute(jsonb) to authenticated;
commit;
