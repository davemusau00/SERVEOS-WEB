import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { testRoomConcurrency } from '../tests/supabase/concurrency.mjs';

const container = `servos-policy-test-${randomUUID()}`;
const run = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
let started = false;
try {
  run(['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18.6-bookworm']);
  started = true;
  let ready = false;
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = spawnSync(
      'docker',
      ['exec', container, 'psql', '-U', 'postgres', '-Atqc', 'select 1'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (probe.status === 0 && probe.stdout.trim() === '1') {
      consecutiveReady += 1;
      if (consecutiveReady >= 2) { ready = true; break; }
    } else {
      consecutiveReady = 0;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
    throw new Error(
      'Disposable PostgreSQL did not become stably queryable.\n' +
      (logs.stderr || logs.stdout || '')
    );
  }
  const files = ['tests/supabase/bootstrap.sql', ...readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort().map(f => `supabase/migrations/${f}`), 'tests/supabase/protocol.sql'];
  if (process.argv.includes('--expansion')) files.push(...readdirSync('supabase/expansion').filter(f=>f.endsWith('.sql')).sort().map(f=>`supabase/expansion/${f}`),'tests/supabase/expansion.sql','tests/supabase/allocations.sql','tests/supabase/assets.sql','tests/supabase/rooms.sql','tests/supabase/folios.sql','tests/supabase/web-session.sql','tests/supabase/inventory.sql','tests/supabase/smart-items.sql','tests/supabase/procurement.sql','tests/supabase/pos.sql','tests/supabase/staff-devices.sql','tests/supabase/financial-controls.sql','tests/supabase/settings.sql');
  for (const file of files) {
    run(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], readFileSync(file, 'utf8'));
    console.log(`Passed: ${file}`);
  }
  if (process.argv.includes('--expansion')) await testRoomConcurrency(container);
} finally {
  if (started) run(['stop', container]);
}
