import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApiCommandRegistry} from '../apps/api/src/command-registry.mjs';

test('API command registry is complete, unique and uses canonical permissions', () => {
  const permissions = JSON.parse(readFileSync('contracts/permissions.json', 'utf8'));
  const registry = createApiCommandRegistry();
  assert.ok(registry.size >= 100);
  assert.equal(registry.size, new Set(registry.keys()).size);
  for (const [name, definition] of registry) {
    assert.match(name, /^[a-z][A-Za-z0-9.]*$/);
    assert.equal(typeof definition.handler, 'function', `${name} handler`);
    const declared = [definition.permission, ...(definition.permissionAny || [])].filter(Boolean);
    assert.ok(declared.length, `${name} permission declaration`);
    for (const permission of declared) {
      assert.ok(permission === '*' || permissions.permissions.includes(permission), `${name}: ${permission}`);
    }
  }
});

test('API role templates are the same checked contract used by staff commands', () => {
  const source = readFileSync('apps/api/src/staff-commands.mjs', 'utf8');
  const permissions = JSON.parse(readFileSync('contracts/permissions.json', 'utf8'));
  const roles = JSON.parse(readFileSync('contracts/roles.json', 'utf8'));
  assert.ok(source.includes("'../../../contracts/permissions.json'"));
  assert.ok(source.includes("'../../../contracts/roles.json'"));
  assert.ok(permissions.staffAssignable.includes('staff.create'));
  assert.equal(roles.roles.Manager.mode, 'allExcept');
  assert.ok(roles.roles.Manager.permissions.includes('staff.create'));
});
