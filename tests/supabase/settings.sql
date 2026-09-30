-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
reset role;
insert into servos_v2.members(user_id,active,permissions) values ('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
update servos_v2.control set enabled=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select servos_v2.put_record('organization','business','{"name":"Settings Test","phone":"0700000000","branding":{"primary":"amber","secondary":"slate"},"receipt":{"footer":"Thank you","copies":2}}');
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-0000-0000-000000000091','Settings test device','WEB');
do $$declare c jsonb;r jsonb;begin
  c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000091','actorId',auth.uid(),'clientSequence',1,'operation','business.settings.save','payload',jsonb_build_object('id','business','data',jsonb_build_object('name','Renamed Settings Test','branding',jsonb_build_object('primary','blue'))),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','organization','id','business','version',1)));
  r:=public.servos_v2_execute(c);if r->>'status' <> 'SYNCHRONIZED' then raise exception 'settings command rejected: %',r;end if;
end$$;
reset role;
do $$begin
  if (select data->>'name' from servos_v2.records where collection='organization' and id='business') <> 'Renamed Settings Test' then raise exception 'settings name was not updated';end if;
  if (select data->>'phone' from servos_v2.records where collection='organization' and id='business') <> '0700000000' then raise exception 'omitted phone was lost';end if;
  if (select data->'branding'->>'secondary' from servos_v2.records where collection='organization' and id='business') <> 'slate' then raise exception 'nested branding was replaced';end if;
  if (select data->'receipt'->>'footer' from servos_v2.records where collection='organization' and id='business') <> 'Thank you' then raise exception 'receipt settings were lost';end if;
end$$;
set local role authenticated;
do $$declare c jsonb;r jsonb;begin
  c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-0000-0000-000000000091','actorId',auth.uid(),'clientSequence',2,'operation','business.settings.save','payload',jsonb_build_object('id','business','data',jsonb_build_object('name','Unsafe','updatedAt','client')),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','organization','id','business','version',2)));
  r:=public.servos_v2_execute(c);if r->>'status' <> 'REJECTED' or r->'error'->>'code' <> 'VALIDATION_FAILED' then raise exception 'protected settings accepted: %',r;end if;
end$$;
reset role;
rollback;
