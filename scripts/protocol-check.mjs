import fs from 'node:fs';

const required = [
  ['src-tauri/src/store.rs', ['pub const ALL_PERMISSIONS', 'pub fn execute']],
  ['src/runtime/web/BusinessStore.ts', ['class BusinessStore', 'async enqueue(']],
  ['supabase/expansion/001_protocol.sql', ['servos_upload', 'unique(device_id,client_sequence)']],
];
const failures = [];
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) { failures.push(`Missing protocol source: ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
if (!fs.existsSync('supabase/expansion')) failures.push('Missing Supabase expansion directory');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Protocol source check passed: ${required.length} authority sources inspected.`);
