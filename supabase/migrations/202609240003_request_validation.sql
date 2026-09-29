-- Additive upgrade: keep existing records and requests intact.
create or replace function public.servos_request_change(operation text,payload jsonb,expected_version bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
 if not public.servos_is_manager() then raise exception 'Manager required'; end if;
 if operation is null or operation not in ('record.save','record.archive')
    or jsonb_typeof(payload) is distinct from 'object'
    or payload->>'collection' is null
    or payload->>'collection' not in ('products','tables','customers','suppliers','priceRules') then
   raise exception 'Remote operation not permitted';
 end if;
 if jsonb_typeof(payload->'id') is distinct from 'string' or length(trim(payload->>'id'))=0 then
   raise exception 'Record identity required';
 end if;
 if expected_version is not null and expected_version<1 then raise exception 'Invalid expected version'; end if;
 if operation='record.archive' and expected_version is null then raise exception 'Archive requires an expected version'; end if;
 if operation='record.save' and jsonb_typeof(payload->'data') is distinct from 'object' then
   raise exception 'Record data must be an object';
 end if;
 insert into public.remote_change_requests(author_id,operation,payload,expected_version)
 values(auth.uid(),operation,payload,expected_version) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.servos_request_change(text,jsonb,bigint) from public;
grant execute on function public.servos_request_change(text,jsonb,bigint) to authenticated;
