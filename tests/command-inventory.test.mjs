import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderCommandInventory} from '../scripts/command-inventory.mjs';

test('every registered API command declares a permission gate and an offline policy', () => {
  const markdown=renderCommandInventory();
  assert.ok(markdown.includes('Total registered operations:'), 'the inventory counts the registered operations');
  assert.doesNotMatch(markdown,/ \|  \| \| ONLINE_ONLY \|/,'every operation declares a permission');
});

test('the committed command registry inventory matches the registered API commands', () => {
  const committed=readFileSync('docs/generated/command-registry.md','utf8');
  assert.equal(committed,renderCommandInventory(),'docs/generated/command-registry.md is stale. Regenerate it with: node scripts/command-inventory.mjs');
});
