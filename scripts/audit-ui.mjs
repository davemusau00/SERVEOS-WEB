import fs from 'node:fs';
import path from 'node:path';

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const rows = [];
for (const file of walk('src').filter(f => /\.tsx$/.test(f))) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const kinds = [...line.matchAll(/<(button|input|select|textarea|form)\b|\b(onClick|onSubmit|onChange)\s*=|\bcase\s+['"]([^'"]+)['"]\s*:/g)];
    for (const match of kinds) rows.push({ id: `${file.replaceAll('\\', '/')}:${i + 1}:${match.index}`, file: file.replaceAll('\\', '/'), line: i + 1, kind: match[1] || match[2] || 'route', source: line.trim(), status: 'unverified', permission: 'requires workflow review', persistence: 'requires workflow review', offline: 'requires workflow review', acceptance: 'exercise action; verify validation, durable state, permission denial, reload and sync' });
  });
}
fs.mkdirSync('docs/generated', { recursive: true });
fs.writeFileSync('docs/generated/UI_INTERACTION_INVENTORY.json', JSON.stringify({ generatedBy: 'npm run audit:ui', scope: 'Static controls, handlers and route cases; runtime card and modal review still required', count: rows.length, interactions: rows }, null, 2) + '\n');
console.log(`Inventoried ${rows.length} UI controls, handlers and routes. These are not acceptance results.`);
