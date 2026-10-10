import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMoneyToMinor,parsePercentToBasisPoints,parseQuantity} from '../src/utils/fiscal.js';

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

test('quantities reject invalid values and enforce unit precision',()=>{
  assert.equal(parseQuantity('1'),1);
  assert.equal(parseQuantity('0.001'),0.001);
  assert.throws(()=>parseQuantity('1.0001'),/at most 3 decimal places/);
  assert.throws(()=>parseQuantity('-1'),/non-negative/);
  assert.throws(()=>parseQuantity('NaN'),/finite/);
  assert.throws(()=>parseQuantity('Infinity'),/finite/);
  assert.throws(()=>parseQuantity('1.5',{integer:true}),/whole number/);
  assert.throws(()=>parseQuantity('999999999999999999999'),/allowed range/);
});

test('active web product editors require an explicit tax class',()=>{
  const catalog=readFileSync('src/runtime/web/WebCatalogInventory.tsx','utf8');
  const smartItem=readFileSync('src/runtime/web/SmartItemDialog.tsx','utf8');
  assert.match(catalog,/Tax class<select required/);
  assert.match(smartItem,/Tax classification<select required/);
  assert.doesNotMatch(catalog,/taxClassId:'A_STANDARD'/);
  assert.doesNotMatch(smartItem,/taxClassId:'A_STANDARD'/);
});

test('API physical stock count validates precise quantities and preserves sealed/open balance',()=>{
  const countDialog=readFileSync('src/runtime/web/WebPhysicalCountDialog.tsx','utf8');
  const apiCommands=readFileSync('apps/api/src/catalog-commands.mjs','utf8');
  assert.match(countDialog,/parseQuantity\(value\.quantity\)/);
  assert.match(countDialog,/countedSealedContainers = sealed/);
  assert.match(countDialog,/countedOpenQuantity = open/);
  assert.match(apiCommands,/Counted liquid must equal whole sealed containers plus open quantity below one container/);
});
