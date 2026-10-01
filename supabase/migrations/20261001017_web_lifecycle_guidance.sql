-- STAGED V2 ONLY. Hosted commissioning/readiness and actor-scoped web guidance.
-- Browser storage may cache these values, but the hosted business remains authoritative.
begin;

alter table servos_v2.control
  add column lifecycle_stage text not null default 'INTAKE'
    check (lifecycle_stage in ('INTAKE','SETUP','READY_FOR_GO_LIVE','LIVE')),
  add column intake_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(intake_profile)='object'),
  add column setup_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(setup_state)='object');

create table servos_v2.guidance_progress(
  business_id uuid not null,
  actor_id uuid not null references auth.users(id),
  guide_id text not null check(length(trim(guide_id)) between 1 and 160),
  guide_version integer not null check(guide_version>0),
  state text not null check(state in ('IN_PROGRESS','COMPLETED','DISMISSED')),
  current_step_id text,
  completed_step_ids jsonb not null default '[]'::jsonb
    check(jsonb_typeof(completed_step_ids)='array'),
  updated_at timestamptz not null default now(),
  primary key(business_id,actor_id,guide_id)
);
create index guidance_progress_actor_idx on servos_v2.guidance_progress(business_id,actor_id,updated_at desc);

create or replace function public.servos_v2_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  who uuid:=servos_v2.require_permission('records.view');
  grants text[];
  state servos_v2.control;
  stage text;
  checks jsonb;
begin
  select permissions into grants from servos_v2.members where user_id=who and active;
  select * into state from servos_v2.control where singleton;
  -- Projects enabled before hosted lifecycle was introduced remain operational.
  stage:=case when state.enabled and state.lifecycle_stage='INTAKE' then 'LIVE' else state.lifecycle_stage end;
  checks:=jsonb_build_array(
    jsonb_build_object('id','business','label','Business details','complete',coalesce((state.setup_state->>'business')::boolean,false)),
    jsonb_build_object('id','serviceAreas','label','Service areas','complete',coalesce((state.setup_state->>'serviceAreas')::boolean,false)),
    jsonb_build_object('id','stockAreas','label','Storage places','complete',coalesce((state.setup_state->>'stockAreas')::boolean,false)),
    jsonb_build_object('id','catalog','label','Items and menu','complete',coalesce((state.setup_state->>'catalog')::boolean,false)),
    jsonb_build_object('id','staff','label','Staff access','complete',coalesce((state.setup_state->>'staff')::boolean,false))
  );
  return jsonb_build_object(
    'businessId',state.business_id,
    'actorId',who,
    'enabled',state.enabled,
    'permissions',grants,
    'policyVersion',md5(array_to_string(array(select unnest(grants) order by 1),'|')),
    'lifecycleStage',stage,
    'intakeProfile',state.intake_profile,
    'setupState',state.setup_state,
    'readiness',jsonb_build_object('ready',stage='LIVE' or (stage='READY_FOR_GO_LIVE' and state.enabled), 'checks',checks)
  );
end$$;

create or replace function public.servos_v2_web_lifecycle(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  state servos_v2.control;
  next_setup jsonb;
  required text[]:=array['business','serviceAreas','stockAreas','catalog','staff'];
  step text;
begin
  if jsonb_typeof(coalesce(payload,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'VALIDATION_FAILED: lifecycle payload';
  end if;
  select * into state from servos_v2.control where singleton for update;

  if action='intake.save' then
    perform servos_v2.require_permission('business.configure');
    if jsonb_typeof(payload->'profile') is distinct from 'object'
       or length(trim(coalesce(payload->'profile'->>'tradingName',''))) not between 1 and 200 then
      raise exception 'VALIDATION_FAILED: business trading name';
    end if;
    update servos_v2.control set intake_profile=payload->'profile',lifecycle_stage='SETUP',enabled=false where singleton;
  elsif action='setup.complete' then
    perform servos_v2.require_permission('business.configure');
    step:=nullif(trim(payload->>'step'),'');
    if step is null or not step=any(required) then raise exception 'VALIDATION_FAILED: setup step';end if;
    next_setup:=state.setup_state||jsonb_build_object(step,true);
    update servos_v2.control set setup_state=next_setup,lifecycle_stage='SETUP',enabled=false where singleton;
  elsif action='readiness.refresh' then
    perform servos_v2.require_permission('business.view');
    if (select bool_and(coalesce((state.setup_state->>item)::boolean,false)) from unnest(required) item) then
      update servos_v2.control set lifecycle_stage='READY_FOR_GO_LIVE' where singleton and not enabled;
    end if;
  elsif action='go_live' then
    perform servos_v2.require_permission('business.configure');
    if not (select bool_and(coalesce((state.setup_state->>item)::boolean,false)) from unnest(required) item) then
      raise exception 'INVALID_STATE: complete every setup check before Go Live';
    end if;
    update servos_v2.control set lifecycle_stage='LIVE',enabled=true where singleton;
  else
    raise exception 'PROTOCOL_UNSUPPORTED: web lifecycle action';
  end if;
  return public.servos_v2_session();
end$$;

create function public.servos_v2_guidance_progress()
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('help.view');business uuid;
begin
  select business_id into business from servos_v2.control where singleton;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'guideId',guide_id,'guideVersion',guide_version,'state',state,
    'currentStepId',current_step_id,'completedStepIds',completed_step_ids,'updatedAt',updated_at
  ) order by updated_at desc) from servos_v2.guidance_progress where business_id=business and actor_id=who),'[]'::jsonb);
end$$;

create function public.servos_v2_guidance_save(progress jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.require_permission('help.view');business uuid;row servos_v2.guidance_progress;
begin
  select business_id into business from servos_v2.control where singleton;
  if jsonb_typeof(progress) is distinct from 'object'
     or length(trim(coalesce(progress->>'guideId',''))) not between 1 and 160
     or (progress->>'guideVersion')::integer is null
     or progress->>'state' not in ('IN_PROGRESS','COMPLETED','DISMISSED')
     or jsonb_typeof(coalesce(progress->'completedStepIds','[]'::jsonb)) is distinct from 'array' then
    raise exception 'VALIDATION_FAILED: guidance progress';
  end if;
  insert into servos_v2.guidance_progress(business_id,actor_id,guide_id,guide_version,state,current_step_id,completed_step_ids)
  values(business,who,progress->>'guideId',(progress->>'guideVersion')::integer,progress->>'state',nullif(progress->>'currentStepId',''),coalesce(progress->'completedStepIds','[]'::jsonb))
  on conflict(business_id,actor_id,guide_id) do update set
    guide_version=excluded.guide_version,state=excluded.state,current_step_id=excluded.current_step_id,
    completed_step_ids=excluded.completed_step_ids,updated_at=now()
  returning * into row;
  return jsonb_build_object('guideId',row.guide_id,'guideVersion',row.guide_version,'state',row.state,'currentStepId',row.current_step_id,'completedStepIds',row.completed_step_ids,'updatedAt',row.updated_at);
end$$;

revoke all on function public.servos_v2_session(),public.servos_v2_web_lifecycle(text,jsonb),public.servos_v2_guidance_progress(),public.servos_v2_guidance_save(jsonb) from public,anon;
grant execute on function public.servos_v2_session(),public.servos_v2_web_lifecycle(text,jsonb),public.servos_v2_guidance_progress(),public.servos_v2_guidance_save(jsonb) to authenticated;
commit;