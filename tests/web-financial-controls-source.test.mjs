import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('hosted financial controls expose queued workflows without direct database writes',()=>{
  const sql=read('supabase/expansion/018_financial_controls.sql');
  const view=read('src/runtime/web/WebFinancialControlsView.tsx');
  const finance=read('src/runtime/web/WebFinanceView.tsx');
  const pos=read('src/runtime/web/WebPosView.tsx');
  const app=read('src/runtime/web/WebBusinessApp.tsx');
  assert.match(sql,/STAGED V2 ONLY/);
  for(const operation of ['mpesa.receipt','mpesa.discrepancy','mpesa.discrepancy.resolve','mpesa.reconcile','credit.account.save','credit.charge','credit.settle','credit.reconcile','credit.discrepancy.resolve','credit.write_off','credit.override_limit'])assert.match(sql,new RegExp(operation.replace('.','\\.')),operation);
  for(const collection of ['mpesaReceipts','mpesaDiscrepancies','customerCreditAccounts','customerCreditEntries','customerCreditReconciliations','customerCreditDiscrepancies'])assert.match(sql,new RegExp(collection),collection);
  for(const marker of ['Financial controls','Record receipt','Receive payment','Reconcile','Write off','never initiates provider payouts','command(operation,collection,id,payload)'])assert.match(view,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),marker);
  for(const marker of ['credit.charge','Charge to account','Credit limit exceeded','internal receivable'])assert.match(pos,new RegExp(marker.replace('.','\\.')),marker);
  assert.match(app,/WebFinancialControlsView/);
  assert.match(app,/Finance Controls/);
  assert.match(finance,/Promise<CommandOutcome>/);
  assert.match(finance,/isCommandConfirmed\(result\)/);
  assert.match(finance,/OUTCOME_UNKNOWN/);
  assert.match(app,/tab==='Finance'.*command=\{submit\}/);
  assert.match(view,/Promise<CommandOutcome>/);
  assert.match(view,/isCommandConfirmed\(await run\('mpesa\.receipt'/);
  assert.match(view,/isCommandConfirmed\(result\)/);
  assert.match(view,/OUTCOME_UNKNOWN/);
  assert.doesNotMatch(view,/Financial action queued/);
  assert.match(app,/tab==='Finance Controls'.*command=\{submit\}/);
  assert.doesNotMatch(view,/supabase\.from|business_records/);
});

test('protected financial actions require server approval and preserve conservation language',()=>{
  const sql=read('supabase/expansion/018_financial_controls.sql');
  const staff=read('supabase/expansion/016_staff_devices_approvals.sql');
  const view=read('src/runtime/web/WebFinancialControlsView.tsx');
  assert.match(sql,/require_manager_approval\(\(p->>'approvalToken'\)::uuid,'credit\.override_limit'/);
  assert.match(sql,/require_manager_approval\(\(p->>'approvalToken'\)::uuid,'credit\.write_off'/);
  assert.match(staff,/credit\.override_limit/);
  assert.match(staff,/credit\.write_off/);
  assert.match(view,/does not call M-Pesa, move funds, or create a provider payout/);
  assert.match(view,/does not alter the ledger/);
});
