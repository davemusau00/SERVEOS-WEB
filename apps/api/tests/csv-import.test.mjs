import test from 'node:test';
import assert from 'node:assert/strict';
import {API_IMPORT_TEMPLATES,parseCsv,validateImportCsv} from '../src/csv-import.mjs';

test('CSV parser preserves quoted commas, escaped quotes, embedded newlines and BOM headers',()=>{
 const parsed=parseCsv('\uFEFFexternal_id,name,notes\r\nitem-1,"Soda, orange","first line\r\nsecond ""quoted"" line"\r\n');
 assert.deepEqual(parsed,[['external_id','name','notes'],['item-1','Soda, orange','first line\r\nsecond "quoted" line']]);
});

test('CSV parser rejects malformed quoting, duplicate headers, credential fields and excessive files',()=>{
 assert.throws(()=>parseCsv('name\n"unclosed'),{code:'CSV_MALFORMED'});
 assert.throws(()=>validateImportCsv('customers','external_id,name,Name\na,Alice,Alice'),{code:'CSV_DUPLICATE_HEADERS'});
 assert.throws(()=>validateImportCsv('customers','external_id,name,password\na,Alice,x'),{code:'CSV_SENSITIVE_COLUMN'});
 assert.throws(()=>parseCsv(`external_id,name\na,${'x'.repeat(2*1024*1024)}`),{code:'PAYLOAD_TOO_LARGE'});
});

test('supported API templates validate create-only master rows and keep unsafe inventory credentials excluded',()=>{
 const product=validateImportCsv('products','external_id,name,code,price,barcode\nproduct-1,Orange Soda,OR-1,1.25,000123\n');
 assert.equal(product.rows[0].status,'VALID');assert.equal(product.rows[0].values.barcode,'000123');
 const invalid=validateImportCsv('products','external_id,name,code,price\nproduct-1,Orange Soda,OR-1,1e3\nproduct-2,Duplicate,OR-1,120\n');
 assert.equal(invalid.rows[0].status,'INVALID');assert.match(invalid.rows[0].errors.join(' '),/Price/u);
 assert.match(invalid.rows[1].errors.join(' '),/duplicates row/u);
 assert.equal(API_IMPORT_TEMPLATES.some(template=>template.key==='employees'),false);
 assert.equal(API_IMPORT_TEMPLATES.some(template=>template.key==='inventory'),false);
});

test('stock-item CSV keeps the supported columns and accepts rows without sealed-container data',()=>{
 const template=API_IMPORT_TEMPLATES.find(item=>item.key==='stockItems');
 assert.deepEqual(template.headers,['external_id','name','code','base_unit','reorder_level','barcode']);
 assert.equal(template.headers.includes('sealed_container_size'),false);
 const parsed=validateImportCsv('stockItems','external_id,name,code,base_unit,reorder_level,barcode\nstock-1,Orange juice,JU-1,liter,0,');
 assert.equal(parsed.rows[0].status,'VALID');
 assert.deepEqual(parsed.rows[0].errors,[]);
});
