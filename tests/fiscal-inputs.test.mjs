import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMoneyToMinor,parsePercentToBasisPoints} from '../src/utils/fiscal.js';

test('operator percentages convert exactly to basis points',()=>{
  assert.equal(parsePercentToBasisPoints('16'),1600);
  assert.equal(parsePercentToBasisPoints('16.25'),1625);
  assert.equal(parsePercentToBasisPoints('100'),10000);
  assert.throws(()=>parsePercentToBasisPoints('16.123'),/at most two decimal places/);
  assert.throws(()=>parsePercentToBasisPoints('100.01'),/between 0% and 100%/);
});

test('money inputs convert exact decimal strings to minor units',()=>{
  assert.equal(parseMoneyToMinor('500.00'),50000);
  assert.equal(parseMoneyToMinor('0.05'),5);
  assert.throws(()=>parseMoneyToMinor('1.001'),/at most two decimal places/);
  assert.throws(()=>parseMoneyToMinor('-1'),/non-negative/);
});

test('interactive product creation requires an explicit tax class',()=>{
  const web=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  const catalog=readFileSync('src/runtime/web/WebCatalogInventory.tsx','utf8');
  const nativeQuick=readFileSync('src/native/QuickProductDialog.tsx','utf8');
  const nativeCatalog=readFileSync('src/native/NativeCatalogView.tsx','utf8');
  assert.match(web,/key:'taxClassId',label:'Tax class',type:'select'/);
  assert.match(catalog,/Tax class<select required/);
  assert.match(nativeQuick,/Tax class<select required/);
  assert.match(nativeCatalog,/Tax class<select required/);
  assert.doesNotMatch(web,/taxClassId:'A_STANDARD'/);
  assert.doesNotMatch(catalog,/taxClassId:'A_STANDARD'/);
  assert.doesNotMatch(nativeQuick,/taxClassId:\s*'A_STANDARD'/);
  assert.doesNotMatch(nativeCatalog,/taxClassId:'A_STANDARD'/);
});
