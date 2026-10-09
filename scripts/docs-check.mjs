import fs from 'node:fs';
import path from 'node:path';

const fail = [];
const required = [
  'README.md', 'docs/README.md', 'docs/STATUS.md', 'docs/architecture.md',
  'docs/repository.md', 'docs/database.md', 'docs/api.md', 'docs/auth.md',
  'docs/offline.md', 'docs/pos.md', 'docs/inventory.md', 'docs/procurement.md',
  'docs/customer-credit.md', 'docs/pms.md', 'docs/finance-assets.md',
  'docs/import.md', 'docs/print-bridge.md', 'docs/deployment.md',
  'docs/backup-restore.md', 'docs/operations.md', 'docs/testing.md',
  'tools/migration/README.md',
];
for (const file of required) if (!fs.existsSync(file)) fail.push(`Missing ${file}`);

const permissions = JSON.parse(fs.readFileSync('contracts/permissions.json', 'utf8'));
const knownPermissions = new Set(permissions.permissions);
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const markdown = ['README.md', ...walk('docs').filter(file => file.endsWith('.md')), ...walk('tools/migration').filter(file => file.endsWith('.md'))];
for (const file of markdown) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [, target] of source.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) {
    if (/^https?:/i.test(target)) continue;
    const resolved = path.normalize(path.join(path.dirname(file), target));
    if (!fs.existsSync(resolved)) fail.push(`${file} has broken link ${target}`);
  }
}

const guideDirectory = 'docs/user-guide';
const guides = fs.readdirSync(guideDirectory).filter(file => file.endsWith('.md')).sort();
if (!guides.length) fail.push('No current user guides are present.');
for (const file of guides) {
  const source = fs.readFileSync(path.join(guideDirectory, file), 'utf8');
  for (const requiredText of ['Section:', 'Roles:', 'Permission:', 'Screen:', '## Overview', '## Procedure', '## What ServOS handles', '## Common mistakes and correction']) {
    if (!source.includes(requiredText)) fail.push(`${file} is missing ${requiredText}`);
  }
  const permissionLine = source.split(/\r?\n/).find(line => line.startsWith('Permission: '))?.slice('Permission: '.length) || '';
  for (const permission of permissionLine.split(',').map(value => value.trim()).filter(value => value && value !== 'none')) {
    if (!knownPermissions.has(permission)) fail.push(`${file} references unknown permission ${permission}`);
  }
}

const helpIndex = JSON.parse(fs.readFileSync('src/generated/help-index.json', 'utf8'));
if (helpIndex.count !== guides.length) fail.push(`Help index count ${helpIndex.count} does not match ${guides.length} guides; run npm run help:build.`);
const guideIds = new Set(guides.map(file => file.replace(/\.md$/i, '')));
for (const article of helpIndex.articles || []) if (!guideIds.has(article.id)) fail.push(`Help index contains removed guide ${article.id}`);

if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log(`Documentation checks passed: ${required.length} current docs, ${guides.length} help guides, ${knownPermissions.size} canonical permissions.`);
