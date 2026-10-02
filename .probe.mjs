import { readFileSync } from 'node:fs';
const text = readFileSync('tests/supabase/cutover.sql', 'utf8');
const lines = text.split('\n');
console.log('lines=' + lines.length);
lines.forEach((line, i) => {
  if (line.includes('LEGACY_SQLITE_CUTOVER') || line.includes('into result')) {
    console.log(`${i + 1}: ${line}`);
  }
});