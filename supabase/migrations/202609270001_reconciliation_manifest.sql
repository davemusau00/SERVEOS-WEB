-- SERVOS_PATCH_02A_RECONCILIATION
-- Read-only, device-authenticated legacy replica manifest for pre-cutover reconciliation.
-- This function never writes business_records, terminal state, operations, or requests.
create function public.servos_reconciliation_manifest(
  terminal_id uuid,
  device_token text,
  after_collection text default null,
  after_id text default null,
  page_size integer default 500
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  requested integer := least(greatest(coalesce(page_size,500),1),1000);
  page jsonb;
  last_collection text;
  last_id text;
  has_more boolean := false;
begin
  if not exists(
    select 1
    from servos_private.terminal t
    where t.id=servos_reconciliation_manifest.terminal_id
      and t.active
      and t.token_hash=encode(extensions.digest(device_token,'sha256'),'hex')
  ) then
    raise exception 'Terminal authentication failed';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection',q.collection,
        'id',q.id,
        'version',q.version,
        'data',q.data,
        'archived',q.archived
      )
      order by q.collection,q.id
    ),
    '[]'::jsonb
  )
  into page
  from (
    select b.collection,b.id,b.version,b.data,b.archived
    from public.business_records b
    where after_collection is null
       or (b.collection,b.id) > (after_collection,coalesce(after_id,''))
    order by b.collection,b.id
    limit requested
  ) q;

  if jsonb_array_length(page)>0 then
    last_collection := page->(jsonb_array_length(page)-1)->>'collection';
    last_id := page->(jsonb_array_length(page)-1)->>'id';
    select exists(
      select 1 from public.business_records b
      where (b.collection,b.id) > (last_collection,last_id)
    ) into has_more;
  end if;

  return jsonb_build_object(
    'mode','READ_ONLY_CLOUD_REPLICA',
    'generatedAt',now(),
    'terminal',(
      select jsonb_build_object(
        'id',t.id,
        'lastSequence',t.last_sequence,
        'lastSeen',t.last_seen
      )
      from servos_private.terminal t
      where t.id=servos_reconciliation_manifest.terminal_id
    ),
    'operations',jsonb_build_object(
      'count',(
        select count(*)
        from servos_private.operations o
        where o.terminal_id=servos_reconciliation_manifest.terminal_id
      )
    ),
    'records',page,
    'hasMore',has_more,
    'nextCursor',case
      when last_collection is null then null
      else jsonb_build_object('collection',last_collection,'id',last_id)
    end
  );
end $$;

revoke all on function public.servos_reconciliation_manifest(uuid,text,text,text,integer) from public;
grant execute on function public.servos_reconciliation_manifest(uuid,text,text,text,integer) to anon;
