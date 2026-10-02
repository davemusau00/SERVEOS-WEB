-- Disposable PostgreSQL acceptance only. Never run against a business project.
--
-- The authority-mode matrix. A single boolean cannot express a cutover, so
-- this suite proves the maintenance window that used to be missing:
--
--   LEGACY_LOCAL  servos_upload allowed, v2 execute blocked
--   CUTOVER_PREP  servos_upload frozen, snapshot/pull allowed, v2 execute blocked
--   SHARED_V2     servos_upload blocked, v2 execute allowed
begin;

insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by)
values('00000000-0000-4000-8000-000000000001','authority-admin','Authority Admin','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
on conflict(auth_user_id) do update set role='Admin',active=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

-- Default is the pre-cutover mode, derived from the legacy boolean.
do $$begin
  if servos_v2.authority()<>'LEGACY_LOCAL' then raise exception 'Default authority must be LEGACY_LOCAL, got %',servos_v2.authority();end if;
  if servos_v2.shared_v2_active() then raise exception 'Shared v2 must be inactive by default';end if;
end$$;

-- A valid v2 command must be refused while v2 is not yet the authority.
do $$declare failed boolean:=false;begin
  begin perform public.servos_v2_execute(jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId',auth.uid(),'clientSequence',1,'operation','record.save','payload',jsonb_build_object('collection','customers','id','mode-gate','data',jsonb_build_object('name','Mode Gate')),'expectedVersions','[]'::jsonb));exception when others then failed:=sqlerrm like '%PROTOCOL_DISABLED%';end;
  if not failed then raise exception 'v2 execute must be refused before SHARED_V2';end if;
  if exists(select 1 from servos_v2.records where collection='customers' and id='mode-gate') then raise exception 'Refused command still wrote a record';end if;
end$$;

-- Forward-only transitions, with a recorded reason.
do $$declare failed boolean:=false;begin
  begin perform public.servos_v2_set_authority_mode('SHARED_V2','skip the maintenance window');exception when others then failed:=sqlerrm like '%must move forward%';end;
  if not failed then raise exception 'Authority must not skip CUTOVER_PREP';end if;
  failed:=false;
  begin perform public.servos_v2_set_authority_mode('CUTOVER_PREP','');exception when others then failed:=sqlerrm like '%reason is required%';end;
  if not failed then raise exception 'An authority transition must require a reason';end if;
end$$;

-- SHARED_V2 requires a verified cutover: a half-finished import cannot win.
do $$declare failed boolean:=false;begin
  perform public.servos_v2_set_authority_mode('CUTOVER_PREP','Freeze the legacy writer for bootstrap');
  if servos_v2.authority()<>'CUTOVER_PREP' then raise exception 'CUTOVER_PREP was not entered';end if;
  begin perform public.servos_v2_set_authority_mode('SHARED_V2','Activate without a verified cutover');exception when others then failed:=sqlerrm like '%verified v2 cutover is required%';end;
  if not failed then raise exception 'SHARED_V2 must require a verified cutover';end if;
  if servos_v2.authority()<>'CUTOVER_PREP' then raise exception 'A refused transition must not change the authority';end if;
end$$;

-- CUTOVER_PREP is the missing maintenance window: the legacy writer is frozen
-- while read-only v2 baseline installation still works.
do $$declare page jsonb;session jsonb;failed boolean:=false;begin
  begin perform public.servos_upload('10000000-0000-4000-8000-000000000009','fixture-device-token','[]'::jsonb);exception when others then failed:=sqlerrm like '%frozen during cutover preparation%';end;
  if not failed then raise exception 'CUTOVER_PREP must freeze the legacy writer';end if;
  -- The snapshot RPC remains usable so the terminal can install its baseline.
  session:=public.servos_v2_session();
  page:=public.servos_v2_snapshot('','',null,session->>'policyVersion',1);
  if page->'records' is null then raise exception 'Snapshot must remain available during CUTOVER_PREP';end if;
  -- But business writes are still refused.
  failed:=false;
  begin perform public.servos_v2_execute(jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000001','actorId',auth.uid(),'clientSequence',1,'operation','record.save','payload',jsonb_build_object('collection','customers','id','prep-write','data',jsonb_build_object('name','Prep Write')),'expectedVersions','[]'::jsonb));exception when others then failed:=sqlerrm like '%PROTOCOL_DISABLED%';end;
  if not failed then raise exception 'CUTOVER_PREP must still refuse v2 business writes';end if;
end$$;

-- Identity exposes the explicit mode so a terminal never infers it from a bool.
do $$declare identity jsonb;begin
  identity:=public.servos_v2_terminal_identity('10000000-0000-4000-8000-000000000001');
  if identity->>'authorityMode'<>'CUTOVER_PREP' then raise exception 'Identity must expose the authority mode';end if;
  if identity->>'sharedV2'<>'false' then raise exception 'Identity must expose shared v2 state';end if;
end$$;

-- Transition evidence is immutable and records who moved the business.
do $$declare failed boolean:=false;begin
  if (select count(*) from servos_v2.authority_transitions)<>1 then raise exception 'The CUTOVER_PREP transition was not recorded';end if;
  if (select actor_id from servos_v2.authority_transitions limit 1)<>auth.uid() then raise exception 'Transition actor must be the authenticated Admin';end if;
  begin update servos_v2.authority_transitions set reason='tampered';exception when others then failed:=true;end;
  if not failed then raise exception 'Authority transition evidence must be immutable';end if;
  begin delete from servos_v2.authority_transitions;exception when others then failed:=true;end;
  if not failed then raise exception 'Authority transition evidence must not be deletable';end if;
end$$;

-- Non-Admin actors cannot move the authority.
do $$declare failed boolean:=false;begin
  update servos_v2.staff_profiles set role='Cashier' where auth_user_id=auth.uid();
  begin perform public.servos_v2_set_authority_mode('SHARED_V2','attempt from a non-Admin');exception when others then failed:=sqlerrm like '%Admin staff profile required%';end;
  if not failed then raise exception 'A non-Admin must not be able to move the authority';end if;
  update servos_v2.staff_profiles set role='Admin' where auth_user_id=auth.uid();
end$$;

-- Once a cutover is verified, SHARED_V2 becomes reachable and v2 writes open.
do $$declare result jsonb;begin
  create table if not exists servos_v2.cutovers(business_id uuid,status text);
  insert into servos_v2.cutovers(business_id,status) values((select business_id from servos_v2.control where singleton),'READY');
  result:=public.servos_v2_set_authority_mode('SHARED_V2','Verified v2 cutover committed');
  if result->>'authorityMode'<>'SHARED_V2' then raise exception 'SHARED_V2 was not reached: %',result;end if;
  if result->>'v2WritesEnabled'<>'true' then raise exception 'SHARED_V2 must enable v2 business writes';end if;
  if not servos_v2.shared_v2_active() then raise exception 'shared_v2_active must be true under SHARED_V2';end if;
  drop table servos_v2.cutovers;
end$$;

rollback;
