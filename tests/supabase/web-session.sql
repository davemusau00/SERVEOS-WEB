begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
update servos_v2.control set enabled=true;
select servos_v2.put_record('property','property','{"timezone":"Africa/Nairobi","nightlyCheckoutTime":"11:00","dayStayCutoffTime":"17:00","kraPin":"SENSITIVE-TEST-VALUE"}');
select servos_v2.put_record('customers','a','{"name":"First"}');
select servos_v2.put_record('customers','b','{"name":"Second"}');
select servos_v2.put_record('employees','private','{"name":"Private employee"}');
do $$declare session jsonb;page jsonb;failed boolean:=false;begin
 session:=public.servos_v2_session();page:=public.servos_v2_snapshot('','',null,session->>'policyVersion',1);
 if session->'propertyContext'->>'timeZone'<>'Africa/Nairobi' or session->'propertyContext'->>'nightlyCheckoutTime'<>'11:00' or session->'propertyContext'->>'dayStayCutoffTime'<>'17:00' then raise exception 'Hospitality property context missing';end if;
 if session::text like '%SENSITIVE-TEST-VALUE%' then raise exception 'Session leaked a non-whitelisted property field';end if;
 if page->>'hasMore'<>'true' or page->'records'->0->>'id'<>'a' then raise exception 'Snapshot first page wrong';end if;
 page:=public.servos_v2_snapshot(page->>'afterCollection',page->>'afterId',(page->>'cursor')::bigint,session->>'policyVersion',1);
 if page->'records'->0->>'id'<>'b' then raise exception 'Snapshot keyset skipped record';end if;
 update servos_v2.control set cursor=cursor+1;
 begin perform public.servos_v2_snapshot('customers','b',0,session->>'policyVersion',1);exception when others then failed:=sqlerrm like '%SNAPSHOT_CHANGED%';end;
 if not failed then raise exception 'Snapshot mixed server cursors';end if;
 update servos_v2.members set permissions=array['records.view'] where user_id=auth.uid();failed:=false;
 begin perform public.servos_v2_snapshot('','',null,session->>'policyVersion',1);exception when others then failed:=sqlerrm like '%SNAPSHOT_CHANGED%';end;
 if not failed then raise exception 'Snapshot ignored permission change';end if;
end$$;

-- Hosted lifecycle and guidance are authoritative, resumable, and isolated by actor.
do $$declare session jsonb;progress jsonb;begin
  update servos_v2.members set permissions=array['*'],active=true where user_id='00000000-0000-4000-8000-000000000001';
  insert into servos_v2.members(user_id,active,permissions) values('00000000-0000-4000-8000-000000000002',true,array['help.view','records.view']) on conflict(user_id) do update set active=true,permissions=excluded.permissions;
  update servos_v2.control set enabled=false,lifecycle_stage='INTAKE',setup_state='{}'::jsonb;
  session:=public.servos_v2_web_lifecycle('intake.save',jsonb_build_object('profile',jsonb_build_object('tradingName','Hosted Test Business')));
  if session->>'lifecycleStage'<>'SETUP' then raise exception 'Hosted intake did not enter setup';end if;
  perform public.servos_v2_web_lifecycle('setup.complete',jsonb_build_object('step','business'));
  perform public.servos_v2_web_lifecycle('setup.complete',jsonb_build_object('step','serviceAreas'));
  perform public.servos_v2_web_lifecycle('setup.complete',jsonb_build_object('step','stockAreas'));
  perform public.servos_v2_web_lifecycle('setup.complete',jsonb_build_object('step','catalog'));
  perform public.servos_v2_web_lifecycle('setup.complete',jsonb_build_object('step','staff'));
  session:=public.servos_v2_web_lifecycle('readiness.refresh','{}'::jsonb);
  if session->>'lifecycleStage'<>'READY_FOR_GO_LIVE' then raise exception 'Hosted readiness did not become actionable';end if;
  session:=public.servos_v2_web_lifecycle('go_live','{}'::jsonb);
  if session->>'lifecycleStage'<>'LIVE' or session->>'enabled'<>'true' then raise exception 'Hosted Go Live failed';end if;
  progress:=public.servos_v2_guidance_save(jsonb_build_object('guideId','servos.core','guideVersion',1,'state','IN_PROGRESS','currentStepId','status','completedStepIds',jsonb_build_array('start')));
  if progress->>'currentStepId'<>'status' then raise exception 'Guidance progress was not saved';end if;
  if jsonb_array_length(public.servos_v2_guidance_progress())<>1 then raise exception 'Guidance progress was not returned';end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  if jsonb_array_length(public.servos_v2_guidance_progress())<>0 then raise exception 'Guidance leaked across actors';end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
end$$;
update servos_v2.members set permissions=array['records.view'] where user_id=auth.uid();
set local role authenticated;
do $$declare page jsonb;begin
 page:=public.servos_v2_snapshot();if jsonb_array_length(page->'records')<>2 then raise exception 'Snapshot leaked private employee';end if;
end$$;
reset role;
update servos_v2.members set active=false where user_id=auth.uid();
set local role authenticated;
do $$begin
 begin perform public.servos_v2_session();raise exception 'Revoked session allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
