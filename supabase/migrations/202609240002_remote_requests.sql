create function public.servos_poll_requests(terminal_id uuid,device_token text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from servos_private.terminal t where t.id=terminal_id and t.active and t.token_hash=encode(extensions.digest(device_token,'sha256'),'hex')) then raise exception 'Terminal authentication failed'; end if;
 update public.remote_change_requests r set status='rejected',result='{"message":"Author no longer has manager access"}'::jsonb where r.status='pending' and not exists(select 1 from servos_private.managers m where m.user_id=r.author_id);
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'authorId',r.author_id,'operation',r.operation,'payload',r.payload,'expectedVersion',r.expected_version) order by r.created_at,r.id) from (select * from public.remote_change_requests where status='pending' order by created_at,id limit 50) r),'[]'::jsonb);
end $$;
revoke all on function public.servos_poll_requests(uuid,text) from public;
grant execute on function public.servos_poll_requests(uuid,text) to anon;

create function public.servos_ack_request(terminal_id uuid,device_token text,request_id uuid,request_status text,request_result jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from servos_private.terminal t where t.id=terminal_id and t.active and t.token_hash=encode(extensions.digest(device_token,'sha256'),'hex')) then raise exception 'Terminal authentication failed'; end if;
 if request_status not in ('applied','rejected','conflict') then raise exception 'Invalid outcome'; end if;
 if request_status='applied' and not exists(select 1 from servos_private.operations o where o.command_id=request_id and o.terminal_id=servos_ack_request.terminal_id) then raise exception 'Upload the applied command before acknowledgement'; end if;
 update public.remote_change_requests r set status=request_status,result=request_result where r.id=request_id and r.status='pending';
end $$;
revoke all on function public.servos_ack_request(uuid,text,uuid,text,jsonb) from public;
grant execute on function public.servos_ack_request(uuid,text,uuid,text,jsonb) to anon;

create function public.servos_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.servos_is_manager() then raise exception 'Manager required'; end if;
 return (select jsonb_build_object('lastSeen',last_seen,'lastSequence',last_sequence) from servos_private.terminal where active);
end $$;
revoke all on function public.servos_health() from public;
grant execute on function public.servos_health() to authenticated;
