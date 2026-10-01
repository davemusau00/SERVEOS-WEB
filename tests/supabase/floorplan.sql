-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000061','Floorplan test','WEB');
reset role;
update servos_v2.control set enabled=true;
select servos_v2.put_record('outlets','layout-outlet','{"name":"Dining","propertyId":"property"}');

create function pg_temp.floorplan_command(p jsonb,expected_status text default 'SYNCHRONIZED',expected_code text default null,command_id uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;versions jsonb;entry jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version)),'[]') into versions from servos_v2.records;
 for entry in select value from jsonb_array_elements(p->'tables') loop
  if not exists(select 1 from servos_v2.records where collection='tables' and id=entry->>'id') then versions:=versions||jsonb_build_array(jsonb_build_object('collection','tables','id',entry->>'id','version',0));end if;
 end loop;
 c:=jsonb_build_object('id',command_id,'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000061','actorId',auth.uid(),'clientSequence',(select last_sequence+1 from servos_v2.devices where id='10000000-0000-4000-8000-000000000061'),'operation','floorplan.save','payload',p,'expectedVersions',versions);
 r:=public.servos_v2_execute(c);
 if r->>'status'<>expected_status or (expected_code is not null and r->'error'->>'code' is distinct from expected_code) then raise exception 'Unexpected floorplan result: %',r;end if;
 if public.servos_v2_execute(c)<>r then raise exception 'Floorplan replay changed the result';end if;
 return r;
end$$;

select pg_temp.floorplan_command(jsonb_build_object('outletId','layout-outlet','baseline','[]'::jsonb,'tables',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000061','propertyId','property','outletId','layout-outlet','label','A1','capacity',4,'section','Main','shape','SQUARE','posX',10,'posY',20,'minimumSpend',0,'isJoinable',true))));
update servos_v2.records set data=data||'{"state":"IN_USE","currentOrderId":"active-order"}'::jsonb where collection='tables' and id='20000000-0000-4000-8000-000000000061';
select pg_temp.floorplan_command((select jsonb_build_object('outletId','layout-outlet','baseline',jsonb_agg(jsonb_build_object('id',id,'version',version)),'tables',jsonb_build_array((select data||'{"label":"A1-renamed","posX":35}'::jsonb from servos_v2.records where collection='tables' and id='20000000-0000-4000-8000-000000000061'))) from servos_v2.records where collection='tables' and id='20000000-0000-4000-8000-000000000061'));
do $$begin
 if servos_v2.read_record('tables','20000000-0000-4000-8000-000000000061')->>'currentOrderId'<>'active-order' or servos_v2.read_record('tables','20000000-0000-4000-8000-000000000061')->>'label'<>'A1-renamed' then raise exception 'Floorplan overwrote active table ownership or lost layout fields';end if;
end$$;
select pg_temp.floorplan_command((select jsonb_build_object('outletId','layout-outlet','baseline',jsonb_agg(jsonb_build_object('id',id,'version',version)),'tables','[]'::jsonb) from servos_v2.records where collection='tables' and data->>'outletId'='layout-outlet'),'REJECTED','INVALID_STATE');
select pg_temp.floorplan_command(jsonb_build_object('outletId','layout-outlet','baseline',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000061','version',0)),'tables','[]'::jsonb),'CONFLICT','VERSION_CONFLICT');
select pg_temp.floorplan_command(jsonb_build_object('outletId','layout-outlet','baseline',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000061','version',(select version from servos_v2.records where collection='tables' and id='20000000-0000-4000-8000-000000000061'))),'tables',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000061','label','Duplicate','capacity',4,'section','Main','shape','SQUARE','posX',10,'posY',10,'minimumSpend',0),jsonb_build_object('id','30000000-0000-4000-8000-000000000061','label','duplicate','capacity',4,'section','Main','shape','SQUARE','posX',20,'posY',20,'minimumSpend',0))),'REJECTED','DUPLICATE_REFERENCE');
update servos_v2.members set permissions=array['records.view'] where user_id=auth.uid();
select pg_temp.floorplan_command(jsonb_build_object('outletId','layout-outlet','baseline',jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000061','version',(select version from servos_v2.records where collection='tables' and id='20000000-0000-4000-8000-000000000061'))),'tables','[]'::jsonb),'REJECTED','PERMISSION_DENIED');
rollback;
