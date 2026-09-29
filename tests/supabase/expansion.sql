-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
insert into servos_v2.members values('00000000-0000-4000-8000-000000000002',true,array['records.view','devices.register']) on conflict(user_id) do update set active=true,permissions=array['records.view','devices.register'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Desktop','DESKTOP');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000002','Browser','WEB');
reset role;
do $$declare c jsonb;failed boolean:=false;begin
 c:=jsonb_build_object('id',pg_catalog.gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId','00000000-0000-4000-8000-000000000001','clientSequence',1,'operation','record.save');
 begin perform public.servos_v2_execute(c);exception when others then failed:=sqlerrm like '%PROTOCOL_DISABLED%';end;
 if not failed then raise exception 'v2 allowed writes before cutover';end if;
end$$;
update servos_v2.control set enabled=true;
set local role authenticated;
do $$declare c jsonb;r jsonb;again jsonb;failed boolean:=false;page jsonb;begin
 c:=jsonb_build_object('id','20000000-0000-4000-8000-000000000001','schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId','00000000-0000-4000-8000-000000000001','clientSequence',1,'operation','record.save','expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id','customer-1','version',0)),'payload',jsonb_build_object('collection','customers','id','customer-1','data',jsonb_build_object('name','Customer One')));
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'create failed: %',r;end if;
 again:=public.servos_v2_execute(c);if again<>r then raise exception 'replay result changed';end if;
 begin perform public.servos_v2_execute(jsonb_set(c,'{payload,data,name}','"Tampered"'));exception when others then failed:=sqlerrm like '%REPLAY_MISMATCH%';end;
 if not failed then raise exception 'changed replay accepted';end if;
 c:=c||jsonb_build_object('id','20000000-0000-4000-8000-000000000002','deviceId','10000000-0000-4000-8000-000000000002');
 r:=public.servos_v2_execute(c);if r->>'status'<>'CONFLICT' then raise exception 'second device overwrote stale baseline: %',r;end if;
 c:=c||jsonb_build_object('id','20000000-0000-4000-8000-000000000003','clientSequence',2,'expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id','customer-1','version',1)),'operation','record.archive');
 r:=public.servos_v2_execute(c);if r->>'status'<>'SYNCHRONIZED' then raise exception 'archive failed: %',r;end if;
 page:=public.servos_v2_pull(0,1);if jsonb_array_length(page->'changes')<>1 or (page->>'hasMore')::boolean is not true then raise exception 'pagination failed';end if;
 page:=public.servos_v2_pull((page->>'cursor')::bigint,100);if page->'changes'->0->'records'->0->>'archived'<>'true' then raise exception 'tombstone missing: %',page;end if;
 failed:=false;begin perform public.servos_upload('10000000-0000-4000-8000-000000000001','ignored','[]');exception when others then failed:=true;end;
 if not failed then raise exception 'legacy writer still enabled';end if;
end$$;
reset role;
do $$begin
 if (select count(*) from servos_v2.commands)<>3 then raise exception 'dedup failed';end if;
 if (select count(*) from servos_v2.changes)<>2 then raise exception 'conflict created record change';end if;
 if (select count(*) from servos_v2.audit)<>3 then raise exception 'audit missing';end if;
 begin update servos_v2.audit set operation='tampered';raise exception 'audit update allowed';exception when others then if sqlerrm not like '%Immutable transaction history%' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000003','Restricted','WEB');
do $$declare r jsonb;begin
 r:=public.servos_v2_execute(jsonb_build_object('id',pg_catalog.gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000003','actorId','00000000-0000-4000-8000-000000000002','clientSequence',1,'operation','record.save','expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id','forbidden','version',0)),'payload',jsonb_build_object('collection','customers','id','forbidden','data',jsonb_build_object('name','Forbidden'))));
 if r->>'status'<>'REJECTED' or r->'error'->>'code'<>'PERMISSION_DENIED' then raise exception 'permission bypass: %',r;end if;
end$$;
reset role;
do $$begin if exists(select 1 from servos_v2.records where id='forbidden') then raise exception 'rejected command wrote data';end if;end$$;
rollback;
