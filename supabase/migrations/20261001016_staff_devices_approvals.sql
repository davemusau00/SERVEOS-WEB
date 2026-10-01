-- STAGED V2 ONLY. Auth-bound staff profiles, canonical permissions and device administration.
-- Invitation, credentials and recovery remain owned by Supabase Auth; this migration never handles secrets.
begin;

alter table servos_v2.devices add column protocol_version integer not null default 2 check(protocol_version>0);
alter table servos_v2.devices add column last_seen_at timestamptz;
update servos_v2.devices set last_seen_at=created_at;

create table servos_v2.staff_profiles(
 auth_user_id uuid primary key references auth.users(id),
 staff_id text not null unique check(length(trim(staff_id)) between 1 and 128),
 name text not null check(length(trim(name)) between 1 and 200),
 role text not null check(role in ('Admin','Manager','Cashier','Server','Chef','Housekeeper','Accountant','Custom')),
 active boolean not null default true,
 outlet_ids text[] not null default '{}',
 service_areas text[] not null default '{}',
 extra_permissions text[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id)
);
create table servos_v2.manager_approvals(
 token uuid primary key,
 initiator_id uuid not null references auth.users(id),
 approver_id uuid not null references auth.users(id),
 permission text not null,
 target text not null,
 expires_at timestamptz not null,
 check(initiator_id<>approver_id)
);
create table servos_v2.manager_approval_uses(token uuid primary key references servos_v2.manager_approvals(token),used_by uuid not null references auth.users(id),used_at timestamptz not null default now());

create function servos_v2.require_manager_approval(token uuid,permission text,target text,initiator uuid)
returns uuid language plpgsql set search_path='' as $$
declare approval servos_v2.manager_approvals;
begin
 select * into approval from servos_v2.manager_approvals a
 where a.token=$1 and a.permission=$2 and a.target=$3 and a.initiator_id=$4 and a.expires_at>now()
 for update;
 if not found then raise exception 'APPROVAL_INVALID: expired, used, wrong initiator, action, or target';end if;
 if not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=approval.approver_id and s.active and s.role in ('Admin','Manager')) then
  raise exception 'APPROVAL_INVALID: expired, used, wrong initiator, action, or target';
 end if;
 insert into servos_v2.manager_approval_uses(token,used_by) values(approval.token,initiator) on conflict do nothing;
 if not found then raise exception 'APPROVAL_INVALID: expired or already used';end if;
 return approval.approver_id;
end$$;

create function servos_v2.canonical_permissions()
returns text[] language sql immutable set search_path='' as $$
 select array[
 'business.view','business.configure','business.tax.configure',
 'customers.manage','suppliers.manage','assetCategories.manage','roomTypes.manage',
 'staff.view','staff.create','staff.update','staff.deactivate','staff.reset_pin','staff.change_role',
 'pos.sell','pos.open_tab','pos.manage_table','order.fire','order.transfer','order.merge','order.void','order.discount','order.comp','order.refund',
  'payment.record','payment.split','payment.reverse','till.view','till.open','till.close','till.cashMovement','till.override_variance','mpesa.record','mpesa.reconcile','mpesa.discrepancy',
  'credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','credit.override_limit',
 'catalog.view','catalog.manage','pricing.manage','inventory.view','inventory.receive','inventory.transfer','inventory.waste','inventory.count','inventory.adjust',
 'procurement.view','procurement.manage','procurement.receive','procurement.over_receive','procurement.pay',
 'floorplan.view','floorplan.manage','rooms.view','rooms.manage','rooms.operate','rooms.guests.view','folio.view','folio.manage','folio.reverse','folio.room_charge',
 'assets.view','assets.manage','assets.operate','maintenance.view','maintenance.manage','kds.view','kds.update',
 'accounting.view','accounting.manage','reports.view','audit.view','data.import.view','data.import.stage','data.import.execute','backup.create','backup.restore','sync.manual','system.configure','help.view',
 'devices.register','devices.manage','records.view','payments.view','payments.manage'
 ]
$$;

create function servos_v2.role_permissions(role_name text,extras text[] default '{}')
returns text[] language plpgsql immutable set search_path='' as $$
declare all_permissions text[]:=servos_v2.canonical_permissions();base text[];
begin
 base:=case role_name
  when 'Admin' then all_permissions
  when 'Manager' then array(select p from unnest(all_permissions) p where p not in ('business.configure','business.tax.configure','staff.change_role','data.import.execute','backup.restore','system.configure','devices.manage'))
  when 'Cashier' then array['business.view','staff.view','pos.sell','pos.open_tab','pos.manage_table','order.fire','payment.record','payment.split','till.open','till.close','mpesa.record','credit.view','credit.charge','catalog.view','inventory.view','procurement.view','procurement.receive','floorplan.view','folio.room_charge','kds.view','kds.update','help.view','records.view']
  when 'Server' then array['business.view','staff.view','pos.sell','pos.open_tab','pos.manage_table','order.fire','payment.record','mpesa.record','credit.view','credit.charge','catalog.view','floorplan.view','folio.room_charge','kds.view','kds.update','help.view','records.view']
  when 'Chef' then array['business.view','kds.view','kds.update','help.view','records.view']
  when 'Housekeeper' then array['business.view','rooms.view','rooms.operate','help.view','records.view']
  when 'Accountant' then array['business.view','accounting.view','reports.view','payments.view','audit.view','credit.view','credit.settle','credit.reconcile','credit.write_off','mpesa.reconcile','help.view','records.view']
  when 'Custom' then array['business.view','help.view','records.view']
  else null end;
 if base is null or extras is null or not extras <@ all_permissions then raise exception 'VALIDATION_FAILED: unknown role or non-canonical permission';end if;
 base:=array(select distinct p from unnest(base||array['devices.register','records.view']) p order by p);
 if role_name='Admin' and cardinality(extras)>0 then raise exception 'VALIDATION_FAILED: Admin permissions are fixed';end if;
 if role_name='Custom' then return array(select distinct p from unnest(base||extras) p order by p);end if;
 if not extras <@ base then raise exception 'PERMISSION_DENIED: permission exceeds role profile';end if;
 return base;
end$$;

create function servos_v2.sync_staff_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare grants text[];
begin
 if tg_op='DELETE' then raise exception 'Immutable staff profile identity; deactivate instead';end if;
 grants:=servos_v2.role_permissions(new.role,new.extra_permissions);
 insert into servos_v2.members(user_id,active,permissions) values(new.auth_user_id,new.active,grants)
 on conflict(user_id) do update set active=excluded.active,permissions=excluded.permissions;
 insert into servos_v2.records(collection,id,version,data,archived)
 values('employees',new.staff_id,coalesce((select version+1 from servos_v2.records where collection='employees' and id=new.staff_id),1),
 jsonb_build_object('id',new.staff_id,'name',new.name,'role',new.role,'active',new.active,'authUserId',new.auth_user_id,'outletIds',to_jsonb(new.outlet_ids),'serviceAreas',to_jsonb(new.service_areas),'permissions',to_jsonb(grants),'createdAt',new.created_at,'updatedAt',new.updated_at),not new.active)
 on conflict(collection,id) do update set version=excluded.version,data=excluded.data,archived=excluded.archived;
 return new;
end$$;
create trigger staff_profile_sync after insert or update on servos_v2.staff_profiles for each row execute function servos_v2.sync_staff_profile();

-- Existing owners/managers receive explicit staged profiles on first migration.
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,active,created_by,updated_by)
select m.user_id,'auth:'||m.user_id::text,'Staff member',
 case when '*'=any(m.permissions) then 'Admin' else 'Manager' end,m.active,m.user_id,m.user_id
from servos_v2.members m
on conflict(auth_user_id) do nothing;

create function servos_v2.apply_staff_device(command jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare op text:=command->>'operation';p jsonb:=command->'payload';who uuid:=auth.uid();target uuid;staff servos_v2.staff_profiles;role_name text;staff_key text;staff_name text;extras text[];outlets text[];areas text[];expected bigint;current_version bigint;grants text[];changed jsonb;approval_token uuid;
begin
 if op in ('staff.create','staff.update','staff.deactivate') then
  target:=nullif(p->>'authUserId','')::uuid;
  if op='staff.create' then perform servos_v2.require_permission('staff.create');
  elsif op='staff.deactivate' then perform servos_v2.require_permission('staff.deactivate');
  else perform servos_v2.require_permission('staff.update');end if;
  if target is null or not exists(select 1 from auth.users where id=target) then raise exception 'VALIDATION_FAILED: existing Auth user required; use Supabase Auth invitation flow';end if;
  select * into staff from servos_v2.staff_profiles where auth_user_id=target for update;
  if op='staff.create' and found then raise exception 'DUPLICATE_REFERENCE: staff identity';end if;
  if op<>'staff.create' and not found then raise exception 'VALIDATION_FAILED: staff profile missing';end if;
  if target=who and op in ('staff.deactivate','staff.update') and (op='staff.deactivate' or p ? 'role' or p ? 'active') then raise exception 'VALIDATION_FAILED: cannot change your own administrative identity';end if;
  if op<>'staff.create' then
   select version into current_version from servos_v2.records where collection='employees' and id=staff.staff_id;
   select (v->>'version')::bigint into expected from jsonb_array_elements(command->'expectedVersions') v where v->>'collection'='employees' and v->>'id'=staff.staff_id;
   if expected is null or expected<>current_version then raise exception 'VERSION_CONFLICT: reload staff profile';end if;
  end if;
  staff_key:=coalesce(nullif(p->>'staffId',''),staff.staff_id);staff_name:=coalesce(nullif(trim(p->>'name'),''),staff.name);
  role_name:=coalesce(p->>'role',staff.role,'Server');extras:=case when p ? 'extraPermissions' then array(select jsonb_array_elements_text(p->'extraPermissions')) else coalesce(staff.extra_permissions,'{}') end;
  outlets:=case when p ? 'outletIds' then array(select jsonb_array_elements_text(p->'outletIds')) else coalesce(staff.outlet_ids,'{}') end;
  areas:=case when p ? 'serviceAreas' then array(select jsonb_array_elements_text(p->'serviceAreas')) else coalesce(staff.service_areas,'{}') end;
  if op='staff.create' then staff_key:=servos_v2.required_text(p,'staffId');staff_name:=servos_v2.required_text(p,'name');
  end if;
  if role_name='Admin' and (not exists(select 1 from servos_v2.staff_profiles where auth_user_id=who and active and role='Admin') or not (p ? 'role' and p->>'role'='Admin')) then raise exception 'PERMISSION_DENIED: only an existing Admin may assign Admin';end if;
  if op='staff.update' and staff_key<>staff.staff_id then raise exception 'VALIDATION_FAILED: staff identity is immutable';end if;
  if staff.role='Admin' and staff.active and (op='staff.deactivate' or role_name<>'Admin' or p->>'active'='false') and (select count(*) from servos_v2.staff_profiles where active and role='Admin')<=1 then raise exception 'VALIDATION_FAILED: cannot remove the final active Admin';end if;
  grants:=servos_v2.role_permissions(role_name,extras);
  if not grants <@ (select permissions from servos_v2.members where user_id=who) and not (select '*'=any(permissions) from servos_v2.members where user_id=who) then raise exception 'PERMISSION_DENIED: cannot grant permissions the actor does not hold';end if;
  if op='staff.deactivate' then update servos_v2.staff_profiles set active=false,updated_at=now(),updated_by=who where auth_user_id=target;
  elsif op='staff.create' then insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,outlet_ids,service_areas,extra_permissions,created_by,updated_by) values(target,staff_key,staff_name,role_name,outlets,areas,extras,who,who);
  else update servos_v2.staff_profiles set staff_id=staff_key,name=staff_name,role=role_name,outlet_ids=outlets,service_areas=areas,extra_permissions=extras,updated_at=now(),updated_by=who where auth_user_id=target;end if;
  select jsonb_build_array(jsonb_build_object('collection',r.collection,'id',r.id,'version',r.version,'data',r.data,'archived',r.archived)) into changed from servos_v2.records r where r.collection='employees' and r.id=staff_key;
  return changed;
 elsif op='device.revoke' then
  perform servos_v2.require_permission('devices.manage');target:=nullif(p->>'deviceId','')::uuid;
  if target=(command->>'deviceId')::uuid then raise exception 'VALIDATION_FAILED: cannot revoke the current command device';end if;
  update servos_v2.devices set active=false where id=target and active returning id into target;
  if target is null then raise exception 'VALIDATION_FAILED: cannot revoke current or unknown device';end if;
  return jsonb_build_array(jsonb_build_object('collection','deviceEvents','id',target::text,'version',1,'data',jsonb_build_object('id',target,'action','REVOKED','actorId',who,'occurredAt',now())));
 elsif op='managerApproval.issue' then
  perform servos_v2.require_permission('staff.update');target:=nullif(p->>'initiatorId','')::uuid;
  if target is null or target=who then raise exception 'VALIDATION_FAILED: distinct initiator required';end if;
  if not exists(select 1 from servos_v2.staff_profiles where auth_user_id=who and active and role in ('Admin','Manager')) then raise exception 'PERMISSION_DENIED: active Manager or Admin required';end if;
  if p->>'permission' not in (select unnest(servos_v2.canonical_permissions())) or nullif(trim(p->>'target'),'') is null then raise exception 'VALIDATION_FAILED: canonical permission and target required';end if;
  if not exists(select 1 from servos_v2.members where user_id=target and active) then raise exception 'VALIDATION_FAILED: active initiator required';end if;
  approval_token:=nullif(p->>'approvalToken','')::uuid;
  if approval_token is null then raise exception 'VALIDATION_FAILED: client-generated one-time approval token required';end if;
  insert into servos_v2.manager_approvals(token,initiator_id,approver_id,permission,target,expires_at) values(approval_token,target,who,p->>'permission',p->>'target',now()+interval '5 minutes');
  return '[]'::jsonb;
 else raise exception 'PROTOCOL_UNSUPPORTED: staff/device operation';
 end if;
end$$;

revoke all on function servos_v2.apply_staff_device(jsonb) from public,anon,authenticated;
alter function servos_v2.dispatch(jsonb) rename to dispatch_before_staff;

create function servos_v2.dispatch(command jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if command->>'operation' like 'staff.%' or command->>'operation' like 'device.%' or command->>'operation'='managerApproval.issue' then return servos_v2.apply_staff_device(command);end if;
 return servos_v2.dispatch_before_staff(command);
end$$;

alter function servos_v2.can_read_collection(text) rename to can_read_collection_before_staff;
create function servos_v2.can_read_collection(collection_name text)
returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];
begin
 if collection_name<>'deviceEvents' then return servos_v2.can_read_collection_before_staff(collection_name);end if;
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 return grants is not null and ('*'=any(grants) or grants&&array['devices.manage','audit.view']);
end$$;

create function public.servos_v2_list_devices() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform servos_v2.require_permission('devices.manage');
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.label,'class',d.kind,'ownerId',d.owner_id,'active',d.active,'lastSequence',d.last_sequence,'lastSeenAt',d.last_seen_at,'protocolVersion',d.protocol_version,'createdAt',d.created_at) order by d.created_at) from servos_v2.devices d),'[]'::jsonb);
end$$;

create function servos_v2.touch_device_seen() returns trigger language plpgsql set search_path='' as $$
begin update servos_v2.devices set last_seen_at=now() where id=new.device_id;return new;end$$;
create trigger commands_update_device_seen after insert on servos_v2.commands for each row execute function servos_v2.touch_device_seen();

create trigger approval_use_immutable before update or delete on servos_v2.manager_approval_uses for each row execute function servos_v2.immutable();

revoke all on function servos_v2.require_manager_approval(uuid,text,text,uuid),public.servos_v2_list_devices(),servos_v2.can_read_collection(text),servos_v2.dispatch(jsonb) from public,anon,authenticated;
grant execute on function public.servos_v2_list_devices() to authenticated;
commit;
