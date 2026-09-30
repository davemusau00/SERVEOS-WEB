import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native room rate dialog strips UI-only price before ratePlan.save',()=>{
  const source=readFileSync('src/native/NativeRoomsView.tsx','utf8');
  assert.match(source,/const\s*\{\s*price\s*,\s*\.\.\.data\s*\}\s*=\s*v/);
  assert.match(source,/priceMinor:\s*parseMoneyToMinor\(price\)/);
  assert.doesNotMatch(source,/onSave\(\{\.\.\.v,priceMinor:/);
});

test('11C staged procurement domain is present but never self-activates v2',()=>{
  const sql=readFileSync('supabase/expansion/012_procurement.sql','utf8');
  assert.match(sql,/STAGED V2 ONLY/);
  assert.doesNotMatch(sql,/update\s+servos_v2\.control\s+set\s+enabled\s*=\s*true/i);
  for(const operation of [
    'supplier.save','purchaseOrder.create','purchaseOrder.receive',
    'supplierPayable.matchInvoice','supplierPayable.pay','asset.commission'
  ]) assert.match(sql,new RegExp(operation.replace('.','\\.')));
  assert.match(sql,/Immutable business history/);
  assert.match(sql,/DUPLICATE_REFERENCE: supplier invoice/);
  assert.match(sql,/averageUnitCostMinor/);
  assert.doesNotMatch(sql,/\\|\\|\\s*line\\s*->>/,'unsafe JSON extraction concatenation must be parenthesized');
});

test('web procurement workspace uses BusinessCommandV2 queue rather than direct table writes',()=>{
  const ui=readFileSync('src/runtime/web/WebProcurementView.tsx','utf8');
  assert.match(ui,/purchaseOrder\.create/);
  assert.match(ui,/purchaseOrder\.receive/);
  assert.match(ui,/supplierPayable\.matchInvoice/);
  assert.match(ui,/invoiceReviewed/);
  assert.match(ui,/compared the supplier invoice with the approved purchase order and accepted goods receipt/);
  assert.match(ui,/!invoiceReviewed/);
  assert.match(ui,/supplierPayable\.pay/);
  assert.match(ui,/asset\.commission/);
  assert.match(ui,/useBarcodeScanner/);
  assert.match(ui,/stockItemId:stockId/);
  assert.doesNotMatch(ui,/business_records/);
  assert.doesNotMatch(ui,/supabase\.from/);
});

test('transactional web workspace exposes Procurement and disposable SQL harness includes acceptance test',()=>{
  const app=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(app,/WebProcurementView/);
  assert.match(app,/'Procurement'/);
  const harness=readFileSync('scripts/test-supabase.mjs','utf8');
  assert.match(harness,/tests\/supabase\/procurement\.sql/);
  const acceptance=readFileSync('tests/supabase/procurement.sql','utf8');
  assert.match(acceptance,/Weighted average cost wrong/);
  assert.match(acceptance,/response-loss replay changed result/);
  assert.match(acceptance,/Immutable business history/);
  assert.match(acceptance,/DUPLICATE_REFERENCE/);
});
