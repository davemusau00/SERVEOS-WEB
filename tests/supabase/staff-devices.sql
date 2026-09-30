-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by)
values('00000000-0000-4000-8000-000000000001','admin','Owner','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
on conflict(auth_user_id) do update set role='Admin',active=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
update servos_v2.control set enabled=true;
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000061','Admin workstation','DESKTOP');
reset role;

create function pg_temp.staff_command(op text,p jsonb,device_key uuid default '10000000-0000-4000-8000-000000000061') returns jsonb language plpgsql as $$
declare c jsonb;r jsonb;seq bigint;actor uuid:=auth.uid();
begin
 select last_sequence+1 into seq from servos_v2.devices where id=device_key;
 c:=jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId',device_key,'actorId',actor,'clientSequence',seq,'operation',op,'payload',p,'expectedVersions','[]'::jsonb);
 return public.servos_v2_execute(c);
end$$;

do $$declare r jsonb;begin
 if not 'payment.record'=any(servos_v2.role_permissions('Cashier')) then raise exception 'Cashier profile missing canonical POS rights';end if;
 if 'devices.manage'=any(servos_v2.role_permissions('Manager')) then raise exception 'Manager profile escalated device administration';end if;
 if servos_v2.role_permissions('Admin') @> array['payments.view','records.view','devices.manage'] is false then raise exception 'Admin profile missing staged permissions';end if;
 if servos_v2.role_permissions('Admin') @> array[
   'customers.manage','suppliers.manage','assetCategories.manage','roomTypes.manage',
   'till.view','till.cashMovement','accounting.manage'
 ] is false then raise exception 'Admin profile dropped established domain permissions';end if;
 if 'till.cash_movement'=any(servos_v2.canonical_permissions()) then raise exception 'Deprecated till.cash_movement permission spelling remains canonical';end if;
 perform servos_v2.require_permission('roomTypes.manage');
 perform servos_v2.require_permission('customers.manage');
 perform servos_v2.require_permission('assetCategories.manage');
 perform servos_v2.require_permission('suppliers.manage');
 perform servos_v2.require_permission('till.cashMovement');
 r:=pg_temp.staff_command('staff.create',jsonb_build_object('authUserId','00000000-0000-4000-8000-000000000002','staffId','server-2','name','Second operator','role','Server','outletIds',jsonb_build_array('main'),'serviceAreas',jsonb_build_array('floor')));
 if r->>'status'<>'SYNCHRONIZED' then raise exception 'Staff creation failed: %',r;end if;
 if not exists(select 1 from servos_v2.staff_profiles where auth_user_id='00000000-0000-4000-8000-000000000002' and role='Server' and outlet_ids=array['main']) then raise exception 'Staff binding/assignment missing';end if;
 if not exists(select 1 from servos_v2.members where user_id='00000000-0000-4000-8000-000000000002' and 'pos.sell'=any(permissions) and not 'devices.manage'=any(permissions)) then raise exception 'Role permissions not synchronized';end if;
 if jsonb_array_length(public.servos_v2_list_devices())<>1 then raise exception 'Device inventory did not return the registered device';end if;
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare identity jsonb;begin
 identity:=public.servos_v2_terminal_identity('10000000-0000-4000-8000-000000000061');
 if identity->>'staffId'<>'server-2' or identity->>'actorId'<>'00000000-0000-4000-8000-000000000002' then raise exception 'Terminal did not resolve the signed-in operator identity: %',identity;end if;
end$$;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000062','Server tablet','WEB');
reset role;
do $$declare r jsonb;begin
 r:=pg_temp.staff_command('staff.update',jsonb_build_object('authUserId','00000000-0000-4000-8000-000000000002','role','Admin'),'10000000-0000-4000-8000-000000000062');
 if r->>'status'<>'REJECTED' or r->'error'->>'code'<>'PERMISSION_DENIED' then raise exception 'Staff role escalation was not denied: %',r;end if;
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$declare r jsonb;token uuid:='50000000-0000-4000-8000-000000000001';expired uuid;failed boolean:=false;begin
 r:=pg_temp.staff_command('managerApproval.issue',jsonb_build_object('initiatorId','00000000-0000-4000-8000-000000000002','permission','procurement.over_receive','target','po-77','approvalToken',token));
 if r->>'status'<>'SYNCHRONIZED' then raise exception 'Approval issue failed: %',r;end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 failed:=false;
 begin perform servos_v2.require_manager_approval(token,'procurement.over_receive','different-po','00000000-0000-4000-8000-000000000002');exception when others then failed:=sqlerrm like '%APPROVAL_INVALID%';end;
 if not failed then raise exception 'Approval accepted for wrong target';end if;
 failed:=false;begin perform servos_v2.require_manager_approval(token,'procurement.over_receive','po-77','00000000-0000-4000-8000-000000000001');exception when others then failed:=sqlerrm like '%APPROVAL_INVALID%';end;
 if not failed then raise exception 'Approval accepted for wrong initiator';end if;
 failed:=false;begin perform servos_v2.require_manager_approval(token,'procurement.pay','po-77','00000000-0000-4000-8000-000000000002');exception when others then failed:=sqlerrm like '%APPROVAL_INVALID%';end;
 if not failed then raise exception 'Approval accepted for wrong action';end if;
 perform servos_v2.require_manager_approval(token,'procurement.over_receive','po-77','00000000-0000-4000-8000-000000000002');
 failed:=false;begin perform servos_v2.require_manager_approval(token,'procurement.over_receive','po-77','00000000-0000-4000-8000-000000000002');exception when others then failed:=sqlerrm like '%APPROVAL_INVALID%';end;
 if not failed then raise exception 'Approval was reusable';end if;
 expired:=gen_random_uuid();
 insert into servos_v2.manager_approvals(token,initiator_id,approver_id,permission,target,expires_at) values(expired,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','procurement.over_receive','po-expired',now()-interval '1 second');
 failed:=false;begin perform servos_v2.require_manager_approval(expired,'procurement.over_receive','po-expired','00000000-0000-4000-8000-000000000002');exception when others then failed:=sqlerrm like '%APPROVAL_INVALID%';end;
 if not failed then raise exception 'Expired approval was accepted';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 r:=pg_temp.staff_command('device.revoke',jsonb_build_object('deviceId','10000000-0000-4000-8000-000000000062'));
 if r->>'status'<>'SYNCHRONIZED' or (select active from servos_v2.devices where id='10000000-0000-4000-8000-000000000062') then raise exception 'Device revocation failed: %',r;end if;
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 begin perform public.servos_v2_execute(jsonb_build_object('id',gen_random_uuid(),'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000062','actorId',auth.uid(),'clientSequence',2,'operation','record.save','payload',jsonb_build_object('collection','customers','id','revoked-device','data',jsonb_build_object('name','Must not save')),'expectedVersions',jsonb_build_array(jsonb_build_object('collection','customers','id','revoked-device','version',0))));
 raise exception 'Revoked device command was accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
