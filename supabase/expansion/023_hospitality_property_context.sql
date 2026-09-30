begin;

-- Expose only the policy fields required by Web hospitality workflows. The
-- property record also contains business contact and tax identity data, so it
-- remains outside ordinary operational snapshots.
create or replace function public.servos_v2_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=servos_v2.require_permission('records.view');
 grants text[];
 state servos_v2.control;
 property_data jsonb:='{}'::jsonb;
begin
 select permissions into grants from servos_v2.members where user_id=who and active;
 select * into state from servos_v2.control where singleton;
 select data into property_data from servos_v2.records where collection='property' and id='property' and not archived;
 return jsonb_build_object(
  'businessId',state.business_id,
  'actorId',who,
  'enabled',state.enabled,
  'permissions',grants,
  'policyVersion',md5(array_to_string(array(select unnest(grants) order by 1),'|')),
  'propertyContext',jsonb_build_object(
   'timeZone',coalesce(nullif(property_data->>'timezone',''),'Africa/Nairobi'),
   'nightlyCheckoutTime',coalesce(nullif(property_data->>'nightlyCheckoutTime',''),'10:00'),
   'dayStayCutoffTime',coalesce(nullif(property_data->>'dayStayCutoffTime',''),'18:00'),
   'roomTypeId',nullif(property_data->>'roomStayRoomTypeId',''),
   'ratePlanId',nullif(property_data->>'roomStayRatePlanId','')
  )
 );
end$$;

revoke all on function public.servos_v2_session() from public,anon;
grant execute on function public.servos_v2_session() to authenticated;
commit;
