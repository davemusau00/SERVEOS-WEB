import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const finance=readFileSync(new URL('../src/runtime/web/WebFinanceView.tsx',import.meta.url),'utf8');

test('till close requires a physical count scoped to the active till and operator',()=>{
  assert.match(finance,/countedCashDraft\.tillId===openTill\.id&&countedCashDraft\.actorId===session\.actorId/);
  assert.match(finance,/const countedCashValue=countedCash/);
  assert.match(finance,/countedCash!==''/);
  assert.match(finance,/placeholder="Count the drawer"/);
  assert.match(finance,/countedCashMinor===null/);
  assert.match(finance,/amount<0/);
});
