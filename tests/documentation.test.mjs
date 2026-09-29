import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

test('documentation index has no broken local document links', () => {
  for (const name of readdirSync('docs').filter(n => n.endsWith('.md'))) {
    const file = resolve('docs', name); const text = readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
      if (!/^https?:/.test(target)) assert.ok(existsSync(resolve(dirname(file), target)), `${name}: missing ${target}`);
    }
  }
});
