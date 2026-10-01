import fs from 'node:fs';
import { canonicalNameFor, migrationPath, canonicalMigrations, expansionChain } from './canonical-migrations.mjs';

const protocolSource = migrationPath(canonicalNameFor('001_protocol.sql'));
const required = [
  ['src-tauri/src/store.rs', ['pub const ALL_PERMISSIONS', 'pub fn execute']],
  ['src/runtime/web/BusinessStore.ts', ['class BusinessStore', 'async enqueue(']],
  [protocolSource, ['servos_upload', 'unique(device_id,client_sequence)']],
];
const failures = [];
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) { failures.push(`Missing protocol source: ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
// The canonical migration set must be complete and self-contained under supabase/migrations.
try {
  const list = canonicalMigrations();
  if (list.length !== 4 + expansionChain().length) {
    failures.push(`Canonical migration set is ${list.length} files; expected ${4 + expansionChain().length}`);
  }
} catch (error) {
  failures.push(error.message);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Protocol source check passed: ${required.length} authority sources inspected; ${canonicalMigrations().length} canonical migrations resolved.`);
