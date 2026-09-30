import {readFileSync} from 'node:fs';

const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
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
console.log(`Contract checks passed: ${permissions.permissions.length} permissions, ${Object.keys(roles.roles).length} roles, ${operations.operations.length} operations.`);
