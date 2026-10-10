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

test('simple item import validates sellable service, tracked, bottle, and stock-only rows',()=>{
 const template=API_IMPORT_TEMPLATES.find(item=>item.key==='sellableItems');
 const line=values=>template.headers.map(header=>values[header]||'').join(',');
 const rows=[
  {name:'Room service',code:'ROOM-SVC',stock_mode:'SERVICE',price:'250',tax_class_id:'A_16',service_area:'ROOMS',outlet_names:'Front Desk'},
  {name:'Soda can',code:'SODA-CAN',stock_mode:'TRACKED',price:'120',tax_class_id:'B_0',service_area:'BAR',outlet_names:'Main Bar',stock_location_name:'Main Store',base_unit:'ml',units_per_package:'24',quantity_per_unit:'330',purchase_price:'1800',opening_packages:'2',reorder_level:'500'},
  {name:'House spirit',code:'HOUSE-SPIRIT',stock_mode:'SPIRIT',price:'150',tax_class_id:'A_16',service_area:'BAR',outlet_names:'Main Bar',stock_location_name:'Main Store',base_unit:'ml',units_per_package:'12',quantity_per_unit:'750',purchase_price:'24000',opening_packages:'1',container_size:'750',portion_size:'45',selling_mode:'SERVING_AND_BOTTLE',whole_container_price:'1800'},
  {name:'Bar napkins',code:'NAPKIN',stock_mode:'STOCK_ONLY',stock_location_name:'Main Store',base_unit:'each',units_per_package:'100',quantity_per_unit:'1',purchase_price:'500',opening_packages:'4'},
 ];
 const result=validateImportCsv('sellableItems',`${template.headers.join(',')}\n${rows.map(line).join('\n')}\n`);
 assert.deepEqual(result.rows.map(row=>row.status),['VALID','VALID','VALID','VALID']);
 assert.deepEqual(result.rows.map(row=>row.externalId),['ROOM-SVC','SODA-CAN','HOUSE-SPIRIT','NAPKIN']);
 const invalid=validateImportCsv('sellableItems',`${template.headers.join(',')}\n${line({...rows[1],tax_class_id:'FAKE'})}\n`);
 assert.match(invalid.rows[0].errors.join(' '),/tax_class_id/u);
 assert.equal(validateImportCsv('sellableItems',`${template.headers.join(',')}\n${line({...rows[2],quantity_per_unit:'700'})}\n`).rows[0].status,'INVALID');
 assert.equal(validateImportCsv('sellableItems',`${template.headers.join(',')}\n${line({...rows[0],stock_location_name:'Main Store'})}\n`).rows[0].status,'INVALID');
});

test('stock-item CSV keeps the supported columns and accepts rows without sealed-container data',()=>{
 const template=API_IMPORT_TEMPLATES.find(item=>item.key==='stockItems');
 assert.deepEqual(template.headers,['external_id','name','code','base_unit','reorder_level','barcode']);
 assert.equal(template.headers.includes('sealed_container_size'),false);
 assert.throws(()=>validateImportCsv('stockItems','external_id,name,code,base_unit,sealed_container_size\nstock-1,Orange juice,JU-1,liter,750'),{code:'CSV_UNSUPPORTED_COLUMNS'});
 const parsed=validateImportCsv('stockItems','external_id,name,code,base_unit,reorder_level,barcode\nstock-1,Orange juice,JU-1,liter,0,');
 assert.equal(parsed.rows[0].status,'VALID');
 assert.deepEqual(parsed.rows[0].errors,[]);
});

test('rate-plan CSV rejects currencies the API would otherwise silently store as KES',()=>{
 const unsupported=validateImportCsv('ratePlans','external_id,name,room_type_external_id,nightly_rate,currency\nrate-usd,USD rate,room-standard,12.50,USD');
 assert.equal(unsupported.rows[0].status,'INVALID');
 assert.match(unsupported.rows[0].errors.join(' '),/Only KES is supported/u);
 const supported=validateImportCsv('ratePlans','external_id,name,room_type_external_id,nightly_rate,currency\nrate-kes,KES rate,room-standard,12.50,KES');
 assert.equal(supported.rows[0].status,'VALID');
});
