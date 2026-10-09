import fs from 'node:fs';
import path from 'node:path';

// Runtime roots only. One-time migration and archived evidence live outside these directories.
const roots = ['src', 'apps/api/src'];
const patterns = [
  'VITE_' + 'SUPABASE_',
  '@' + 'supabase/',
  'servos' + '_v2_',
  '/rest/' + 'v1',
  '__TAURI' + '_INTERNALS__',
  '@' + 'tauri-apps/',
  'invo' + 'ke(',
  'LEGACY' + '_LOCAL',
];
const extensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const marker of patterns) {
        if (source.includes(marker)) violations.push(`${file}: forbidden runtime marker ${marker}`);
      }
    }
  }
}

for (const root of roots) {
  if (!fs.existsSync(root)) throw new Error(`Missing runtime source root: ${root}`);
  walk(root);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`Web architecture check passed across ${roots.join(' and ')}.`);
