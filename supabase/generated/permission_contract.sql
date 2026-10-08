-- GENERATED FROM contracts/permissions.json. DO NOT EDIT.
create or replace function servos_v2.generated_contract_permissions()
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('contractVersion',1,'permissionCount',92);
$$;
