import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CI gates the web, API/PostgreSQL, production browser and Print Bridge product', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const job of ['frontend:', 'api-postgres:', 'browser-production:', 'print-bridge:']) {
    assert.match(workflow, new RegExp(`\\n  ${job}`));
  }
  for (const stale of ['native-domain:', 'cloud-protocol-', 'desktop-shell:', 'windows-printer-shell:', 'release-candidate:']) {
    assert.ok(!workflow.includes(stale), `CI must not gate removed architecture: ${stale}`);
  }
  for (const command of ['npm run lint', 'npm run contracts:check', 'npm run build', 'npm test', 'npm run architecture:check', 'npm run docs:check']) {
    assert.ok(workflow.includes(command), command);
  }
  assert.ok(workflow.includes('TEST_DATABASE_URL: postgres://'));
  assert.ok(workflow.includes('npm run test:api'));
  assert.ok(workflow.includes('npm run test:browser:api'));
  assert.ok(workflow.includes('npm run test:browser:production'));
  assert.ok(workflow.includes('apps/print-bridge/Cargo.toml'));
  assert.ok(workflow.includes('crates/servos-printer-transport/Cargo.toml'));
  assert.ok(workflow.includes('windows-service'));
  for (const removed of ['tauri', 'native:dev', 'native:build', 'test:native', 'test:desktop', 'check:desktop', 'test:cloud']) {
    assert.equal(packageJson.scripts[removed], undefined, `Removed package script ${removed}`);
  }
});
