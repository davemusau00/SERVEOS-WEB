import {readFileSync} from 'node:fs';

const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
const quoted=value=>JSON.stringify(value);
const sqlQuoted=value=>`'${value.replaceAll("'","''")}'`;
const renderTs=(permissions,roles)=>`/** GENERATED FROM contracts/permissions.json and contracts/roles.json. DO NOT EDIT. */
export const PERMISSION_CONTRACT_VERSION = ${permissions.contractVersion} as const;
export const CANONICAL_PERMISSIONS = Object.freeze(${JSON.stringify(permissions.permissions, null, 2)}) as readonly string[];
export const ROLE_PERMISSION_MODES = Object.freeze(${JSON.stringify(Object.fromEntries(Object.entries(roles.roles).map(([name,definition])=>[name,{mode:definition.mode,permissions:definition.permissions||[]} ])), null, 2)});
export const IMPLICIT_PERMISSIONS = Object.freeze(${JSON.stringify(roles.implicitPermissions, null, 2)}) as readonly string[];
`;
const renderRust=(permissions,roles)=>`// GENERATED FROM contracts/permissions.json and contracts/roles.json. DO NOT EDIT.
pub const PERMISSION_CONTRACT_VERSION: u32 = ${permissions.contractVersion};
pub const CANONICAL_PERMISSIONS: &[&str] = &[${permissions.permissions.map(quoted).join(',')}];
pub const CONTRACT_ROLES: &[&str] = &[${Object.keys(roles.roles).map(quoted).join(',')}];
pub const IMPLICIT_PERMISSIONS: &[&str] = &[${roles.implicitPermissions.map(quoted).join(',')}];
`;
const renderSql=permissions=>`-- GENERATED FROM contracts/permissions.json. DO NOT EDIT.
create or replace function servos_v2.generated_contract_permissions()
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('contractVersion',${permissions.contractVersion},'permissionCount',${permissions.permissions.length});
$$;
`;
const permissions=readJson('contracts/permissions.json');
const roles=readJson('contracts/roles.json');
const operations=readJson('contracts/operations.json');
const allowed=new Set(permissions.permissions);
if(new Set(permissions.permissions).size!==permissions.permissions.length)throw new Error('Duplicate canonical permission');
for(const [role,definition] of Object.entries(roles.roles)){
  const listed=definition.permissions||[];
  for(const permission of listed)if(!allowed.has(permission))throw new Error(`${role} references non-canonical permission ${permission}`);
  if(!['all','allExcept','explicit'].includes(definition.mode))throw new Error(`Unknown role mode for ${role}`);
}
for(const permission of roles.implicitPermissions)if(!allowed.has(permission))throw new Error(`Implicit permission is not canonical: ${permission}`);
const manifest=readFileSync('src/runtime/operationManifest.ts','utf8');
const manifestOperations=[...manifest.matchAll(/operation:\s*'([^']+)'/g)].map(match=>match[1]);
const manifestSet=new Set(manifestOperations);const contractSet=new Set(operations.operations);
if(contractSet.size!==operations.operations.length)throw new Error('Duplicate operation in contracts/operations.json');
const missing=manifestOperations.filter(operation=>!contractSet.has(operation));
const extra=operations.operations.filter(operation=>!manifestSet.has(operation));
if(missing.length||extra.length)throw new Error(`Operation contract drift: missing=${missing.join(',')} extra=${extra.join(',')}`);
const generated=[
  ['src/generated/permission-contract.ts',renderTs(permissions,roles)],
  ['src-tauri/src/generated_permissions.rs',renderRust(permissions,roles)],
  ['supabase/generated/permission_contract.sql',renderSql(permissions)]
];
for(const [file,expected] of generated){
  let actual='';
  try{actual=readFileSync(file,'utf8')}catch{throw new Error(`Missing generated contract artifact: ${file}`)}
  if(actual!==expected)throw new Error(`Generated contract drift: ${file}`);
}
console.log(`Contract checks passed: ${permissions.permissions.length} permissions, ${Object.keys(roles.roles).length} roles, ${operations.operations.length} operations, ${generated.length} generated artifacts.`);
