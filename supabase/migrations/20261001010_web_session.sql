begin;
alter table servos_v2.control add column business_id uuid not null default extensions.gen_random_uuid();
create function public.servos_v2_session() returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('records.view');grants text[];state servos_v2.control;
begin
 select permissions into grants from servos_v2.members where user_id=who and active;
 select * into state from servos_v2.control where singleton;
 return jsonb_build_object('businessId',state.business_id,'actorId',who,'enabled',state.enabled,'permissions',grants,'policyVersion',md5(array_to_string(array(select unnest(grants) order by 1),'|')));
end$$;
create function public.servos_v2_snapshot(after_collection text default '',after_id text default '',expected_cursor bigint default null,expected_policy text default null,page_size integer default 500) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('records.view');state servos_v2.control;grants text[];policy text;rows jsonb;more boolean;last_row jsonb;
begin
 if after_collection is null or after_id is null or page_size is null or page_size not between 1 and 500 then raise exception 'VALIDATION_FAILED: snapshot page';end if;
 select * into state from servos_v2.control where singleton for share;
 if not state.enabled then raise exception 'PROTOCOL_DISABLED';end if;
 select permissions into grants from servos_v2.members where user_id=who and active for share;
 if not found then raise exception 'PERMISSION_DENIED';end if;
 policy:=md5(array_to_string(array(select unnest(grants) order by 1),'|'));
 if (after_collection<>'' and expected_cursor is null) or (expected_cursor is not null and expected_cursor<>state.cursor) or (expected_policy is not null and expected_policy<>policy) then raise exception 'SNAPSHOT_CHANGED: restart authorized snapshot';end if;
 select coalesce(jsonb_agg(jsonb_build_object('collection',r.collection,'id',r.id,'version',r.version,'data',r.data,'archived',r.archived) order by r.collection,r.id),'[]') into rows
 from (select * from servos_v2.records r where (r.collection,r.id)>(after_collection,after_id) and servos_v2.can_read_collection(r.collection) order by r.collection,r.id limit page_size+1) r;
 more:=jsonb_array_length(rows)>page_size;
 if more then rows:=rows-page_size;end if;
 last_row:=rows->(jsonb_array_length(rows)-1);
 return jsonb_build_object('cursor',state.cursor,'policyVersion',policy,'records',rows,'hasMore',more,'afterCollection',coalesce(last_row->>'collection',after_collection),'afterId',coalesce(last_row->>'id',after_id));
end$$;
revoke all on function public.servos_v2_session(),public.servos_v2_snapshot(text,text,bigint,text,integer) from public,anon;
grant execute on function public.servos_v2_session(),public.servos_v2_snapshot(text,text,bigint,text,integer) to authenticated;
commit;
