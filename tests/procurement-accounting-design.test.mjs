import test from 'node:test';
import assert from 'node:assert/strict';

// Proposed accounting examples only. No posting handler is enabled by these tests.
const balanced=lines=>assert.equal(lines.reduce((sum,line)=>sum+(line.debit||0)-(line.credit||0),0),0);
test('accounting proposal preserves receipt value and separates settled credit from actual payment',()=>{
  const invoice=12*100000, corrected=12*90000, difference=invoice-corrected;
  const remaining=8*(100000-90000), consumed=4*(100000-90000);
  assert.equal(difference,remaining+consumed);
  balanced([{account:'GRNI',debit:invoice},{account:'Inventory',credit:invoice}]);
  balanced([{account:'Supplier liability',debit:difference},{account:'Inventory',credit:remaining},{account:'COGS',credit:consumed}]);
  const actualPayment=invoice;
  balanced([{account:'Supplier credit receivable',debit:difference},{account:'Inventory',credit:remaining},{account:'COGS',credit:consumed}]);
  assert.equal(actualPayment,1200000);
  balanced([{account:'Supplier credit receivable',debit:2*90000},{account:'Inventory',credit:2*90000}]);
  balanced([{account:'Bank',debit:invoice},{account:'Supplier liability',credit:invoice}]);
});
