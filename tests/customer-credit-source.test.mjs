import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(file,'utf8');

test('customer credit is a dedicated native financial ledger',()=>{
  const store=read('src-tauri/src/store.rs');
  const credit=read('src-tauri/src/customer_credit.rs');
  const migration=read('src-tauri/migrations/013_customer_credit.sql');
  assert.match(store,/customer_credit::execute/);
  assert.match(store,/customerCredit\.charge/);
  assert.match(store,/customerCredit\.settle/);
  assert.match(store,/order\.assignCustomer/);
  assert.match(credit,/Customer Accounts Receivable/);
  assert.match(credit,/credit\.override_limit/);
  assert.match(credit,/balanceDeltaMinor/);
  assert.match(credit,/fifo_allocations/);
  assert.match(credit,/M-Pesa transaction code is already recorded/);
  assert.match(migration,/customerCreditEntries/);
  assert.match(migration,/customerCreditReconciliations/);
  assert.match(migration,/PRAGMA user_version=13/);
});

test('credit charge closes sale without pretending receivable is cash paid',()=>{
  const credit=read('src-tauri/src/customer_credit.rs');
  assert.match(credit,/amountCredited/);
  assert.match(credit,/paymentMethod.*CUSTOMER_CREDIT/s);
  assert.match(credit,/kind":"CHARGE"/);
  assert.match(credit,/sourceType":"ORDER"/);
  assert.doesNotMatch(credit,/amountPaid"\]\s*=/);
});

test('credit settlement is wired to till, M-Pesa and reconciliation',()=>{
  const credit=read('src-tauri/src/customer_credit.rs');
  const operations=read('src/native/NativeOperationsViews.tsx');
  assert.match(credit,/creditCollectionsCash/);
  assert.match(credit,/expectedCashInDrawer/);
  assert.match(credit,/purpose":"CUSTOMER_CREDIT_SETTLEMENT"/);
  assert.match(credit,/customerCredit\.discrepancy/);
  assert.match(operations,/Credit collections/);
});

test('POS and customer masters expose authoritative customer account workflows',()=>{
  const pos=read('src/native/NativePOSView.tsx');
  const master=read('src/native/NativeMasterDataView.tsx');
  const shell=read('src/native/NativeBarShell.tsx');
  const view=read('src/native/NativeCustomerCreditView.tsx');
  assert.match(pos,/Charge to account/);
  assert.match(pos,/order\.assignCustomer/);
  assert.match(pos,/customerCredit\.charge/);
  assert.match(master,/Credit Account/);
  assert.match(shell,/Customer Accounts/);
  assert.match(view,/Receive Payment/);
  assert.match(view,/Reconcile/);
  assert.match(view,/Write off/);
});

test('release gate and docs move installed terminal to schema 13',()=>{
  const verify=read('scripts/verify-release-0.2.ps1');
  const builder=read('scripts/build-terminal-installer.ps1');
  const upgrade=read('docs/EXISTING_TERMINAL_UPGRADE.md');
  assert.match(verify,/013_customer_credit\.sql/);
  assert.match(verify,/Schema:\s+13/);
  assert.match(builder,/SQLiteSchema\s*=\s*13/);
  assert.match(upgrade,/schema 13/i);
});
