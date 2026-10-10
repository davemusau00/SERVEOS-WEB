import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { API_IMPORT_TEMPLATES, validateImportCsv } from '../apps/api/src/csv-import.mjs';

test('operator CSV templates come from the API manifest and have unique headers', () => {
  assert.equal(API_IMPORT_TEMPLATES.length, 13);
  for (const template of API_IMPORT_TEMPLATES) {
    if (template.key === 'sellableItems') {
      assert.ok(template.headers.includes('code'), 'sellableItems uses product code as its import reference');
      assert.ok(template.required.includes('code'), 'sellableItems requires its product code');
    } else assert.ok(template.headers.includes('external_id'), `${template.key} requires external_id`);
    assert.equal(new Set(template.headers).size, template.headers.length, `${template.key} has duplicate headers`);
    for (const forbidden of ['password', 'password_confirm', 'device_token', 'device_secret', 'access_token', 'publishable_key', 'cloud_key']) {
      assert.equal(template.headers.includes(forbidden), false, `${template.key} must not contain ${forbidden}`);
    }
  }
  assert.equal(existsSync('import-templates'), false, 'static duplicate import templates must not be restored');
});

test('stock item CSV uses the current API columns and omits sealed-container data when absent', () => {
  const template = API_IMPORT_TEMPLATES.find(item => item.key === 'stockItems');
  assert.deepEqual(template.headers, ['external_id', 'name', 'code', 'base_unit', 'reorder_level', 'barcode']);
  assert.equal(template.headers.includes('sealed_container_size'), false);
  const result = validateImportCsv('stockItems', 'external_id,name,code,base_unit,reorder_level,barcode\nstock-1,Orange juice,JU-1,liter,0,');
  assert.equal(result.rows[0].status, 'VALID');
  assert.deepEqual(result.rows[0].errors, []);
});
test('sellableItems example template covers the standard hospitality catalogue shapes and validates cleanly', () => {
  const template = API_IMPORT_TEMPLATES.find(item => item.key === 'sellableItems');
  assert.ok(Array.isArray(template.examples) && template.examples.length >= 8, 'the example template includes the standard product shapes');
  const modeIndex = template.headers.indexOf('stock_mode');
  const modes = new Set(template.examples.map(example => example[modeIndex]));
  for (const mode of ['SERVICE', 'TRACKED', 'SPIRIT', 'WINE', 'STOCK_ONLY']) assert.ok(modes.has(mode), `examples cover stock_mode ${mode}`);
  const escape = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const csv = [template.headers.join(','), ...template.examples.map(example => {
    assert.equal(example.length, template.headers.length, `example ${example[1]} matches the header count`);
    return example.map(escape).join(',');
  })].join('\r\n');
  const result = validateImportCsv('sellableItems', csv);
  assert.equal(result.rows.length, template.examples.length);
  for (const row of result.rows) assert.deepEqual(row.errors, [], `example row ${row.rowNumber} (${row.externalId}) must be structurally valid`);
});
