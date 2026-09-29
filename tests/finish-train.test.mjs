import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, suggestMapping, mappedCsv } from '../src/native/importMapping.ts';
import { GUIDES, validateGuides } from '../src/guidance/core.ts';
import { matchesGuideCommit } from '../src/guidance/workflow.ts';

test('friendly import handles quoted CSV and Excel tabs without losing text or leading zeros', () => {
  const rows = parseDelimited('ID,Product,Price\r\n001,"Tea, large",120\r\n002,"Two\nlines",50', ',');
  const targets = ['external_id', 'name', 'selling_price'];
  const mapping = suggestMapping(rows[0], targets);
  const result = parseDelimited(mappedCsv(rows, targets, mapping), ',');
  assert.deepEqual(result[1], ['001', 'Tea, large', '120']);
  assert.equal(result[2][1], 'Two\nlines');
  assert.deepEqual(parseDelimited('ID\tName\n001\t"A ""quoted"" name"', '\t')[1], ['001', 'A "quoted" name']);
});
test('friendly import rejects malformed rows, duplicated headers and credentials', () => {
  for (const text of ['id,name\n1', 'id,id\n1,2', 'id,password\n1,secret', 'id,staff_pin\n1,123456', 'id,name\n1,"unfinished']) assert.throws(() => parseDelimited(text, ','));
  assert.doesNotThrow(() => parseDelimited('id,kra_pin\n1,P123', ','));
});
test('operational guide registry is valid and progress requires matching committed resource', () => {
  assert.deepEqual(validateGuides(GUIDES), []);
  const operations = ['inventory.countLocation'];
  const context = { key: 'locationId', id: 'main' };
  assert.equal(matchesGuideCommit(operations, context, { operation: 'inventory.countLocation', payload: { locationId: 'main' } }), true);
  assert.equal(matchesGuideCommit(operations, context, { operation: 'inventory.countLocation', payload: { locationId: 'bar' } }), false);
  assert.equal(matchesGuideCommit(operations, context, { operation: 'runtime_save_inventory_count_draft', payload: { locationId: 'main' } }), false);
  assert.equal(matchesGuideCommit(operations, null, { operation: 'inventory.countLocation', payload: { locationId: 'main' } }), false);
});
