import {readFileSync} from 'node:fs';
import {createApiCommandRegistry} from '../apps/api/src/command-registry.mjs';

const permissions = JSON.parse(readFileSync('contracts/permissions.json', 'utf8'));
const roles = JSON.parse(readFileSync('contracts/roles.json', 'utf8'));
const canonical = new Set(permissions.permissions);
const staffAssignable = new Set(permissions.staffAssignable);
const unique = (values, label) => {
  if (!Array.isArray(values) || new Set(values).size !== values.length) throw new Error(`${label} must be a unique list.`);
};

unique(permissions.permissions, 'Canonical permissions');
unique(permissions.staffAssignable, 'Staff assignable permissions');
if (staffAssignable.size === 0 || [...staffAssignable].some(permission => !canonical.has(permission))) {
  throw new Error('Staff assignable permissions must be a non-empty subset of the canonical permissions.');
}
for (const permission of roles.implicitPermissions || []) {
  if (!canonical.has(permission)) throw new Error(`Implicit permission is not canonical: ${permission}`);
}
for (const [role, definition] of Object.entries(roles.roles || {})) {
  if (!['all', 'allExcept', 'explicit'].includes(definition.mode)) throw new Error(`Unknown permission mode for ${role}.`);
  const assigned = definition.permissions || [];
  unique(assigned, `${role} role permissions`);
  for (const permission of assigned) {
    if (!staffAssignable.has(permission)) throw new Error(`${role} references a permission that staff cannot be granted: ${permission}`);
  }
}

const registry = createApiCommandRegistry();
for (const [name, definition] of registry) {
  if (!/^[a-z][A-Za-z0-9.]*$/.test(name)) throw new Error(`Invalid API command name: ${name}`);
  if (typeof definition.handler !== 'function') throw new Error(`${name} has no command handler.`);
  const declared = [definition.permission, ...(definition.permissionAny || [])].filter(Boolean);
  if (!declared.length) throw new Error(`${name} has no permission requirement.`);
  for (const permission of declared) {
    if (permission !== '*' && !canonical.has(permission)) throw new Error(`${name} uses an unknown permission: ${permission}`);
  }
}

console.log(`API contract checks passed: ${canonical.size} permissions, ${staffAssignable.size} staff grants, ${Object.keys(roles.roles).length} roles, ${registry.size} API commands.`);
