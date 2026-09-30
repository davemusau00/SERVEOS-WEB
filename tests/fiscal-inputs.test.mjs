import test from 'node:test';
import assert from 'node:assert/strict';
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
