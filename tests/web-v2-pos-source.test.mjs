import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('11D staged POS domain never self-activates v2 and owns the expected order commands',()=>{
  const sql=readFileSync('supabase/expansion/013_pos.sql','utf8');
  assert.match(sql,/STAGED V2 ONLY/);
  assert.doesNotMatch(sql,/update\s+servos_v2\.control\s+set\s+enabled\s*=\s*true/i);
  for(const op of [
    'posPolicy.save','outlet.save','table.save','table.ready','product.salesConfig',
    'order.create','order.addItem','order.updateItem','order.removeItem','order.fire',
    'order.kds','order.repeatRound','order.void'
  ]) assert.match(sql,new RegExp(op.replace('.','\\.')));
  assert.match(sql,/SALE_CONSUMPTION/);
  assert.match(sql,/VOID_RETURN/);
  assert.match(sql,/taxPolicySnapshot/);
  assert.match(sql,/productVersion/);
  assert.doesNotMatch(sql,/\|\|\s*[A-Za-z_]+\s*->>/,'JSON extraction concatenation must be parenthesized');
});

test('web POS submits online settlement through queued commands and preserves manual evidence',()=>{
  const ui=readFileSync('src/runtime/web/WebPosView.tsx','utf8');
  for(const operation of ['order.create','order.addItem','order.fire','order.repeatRound','order.void','payment.record','payment.split','till.open'])assert.ok(ui.includes(operation),operation);
  assert.match(ui,/useBarcodeScanner/);
  assert.match(ui,/receiptDocuments/);
  assert.match(ui,/manually verified that the funds were received/);
  assert.match(ui,/offline payment finalization is disabled/i);
  assert.doesNotMatch(ui,/business_records/);
  assert.doesNotMatch(ui,/supabase\.from/);
});

test('web business workspace exposes the staged POS tab',()=>{
  const app=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(app,/WebPosView/);
  assert.match(app,/'POS'/);
});

test('disposable PostgreSQL harness runs transactional POS payment acceptance',()=>{
  const harness=readFileSync('scripts/test-supabase.mjs','utf8');
  assert.match(harness,/tests\/supabase\/pos\.sql/);
  const acceptance=readFileSync('tests/supabase/pos.sql','utf8');
  for(const invariant of ['Second device table race did not conflict','POS response-loss replay changed result','Void return did not restore stock','Sale stock movement missing','Split did not complete the settled order','Stale second-device payment did not conflict','Receipt snapshot changed after catalog rename'])assert.ok(acceptance.includes(invariant),invariant);
});


test('11D POS stock aggregation explicitly aliases jsonb_each_text key/value columns',()=>{
  const sql=readFileSync('supabase/expansion/013_pos.sql','utf8');
  assert.doesNotMatch(
    sql,
    /select\s+key\s*,\s*value::numeric\s+from\s+jsonb_each_text\(needs\)/i,
    'ambiguous jsonb_each_text key must be explicitly aliased'
  );
  assert.match(sql,/jsonb_each_text\(needs\)\s+as\s+e\(key,value\)/i);
});


test('staged payment migration is isolated and posts manual evidence, journals and receipts',()=>{
  const migration=readFileSync('supabase/expansion/014_pos_payments.sql','utf8');
  assert.match(migration,/STAGED V2 ONLY/);
  assert.doesNotMatch(migration,/update\s+servos_v2\.control\s+set\s+enabled\s*=\s*true/i);
  for(const op of ['payment.record','payment.split','till.open','till.cashMovement','till.close'])assert.ok(migration.includes(op),op);
  assert.match(migration,/manually confirm external payment/i);
  assert.match(migration,/DUPLICATE_REFERENCE/);
  assert.match(migration,/receiptDocuments/);
  assert.match(migration,/post_journal\(command,journal_id,'PAYMENT',payment_id/);
});

test('staged refunds and close-day snapshots preserve immutable financial history',()=>{
  const migration=readFileSync('supabase/expansion/015_refunds_close_day.sql','utf8');
  const app=readFileSync('src/runtime/web/WebPosView.tsx','utf8');
  const finance=readFileSync('src/runtime/web/WebFinanceView.tsx','utf8');
  const refunds=readFileSync('src/runtime/web/WebRefundsView.tsx','utf8');
  assert.match(migration,/STAGED V2 ONLY/);
  assert.doesNotMatch(migration,/update\s+servos_v2\.control\s+set\s+enabled\s*=\s*true/i);
  for(const marker of ['payment.refund','payment.reverse','closeDay.generate','Immutable business history','reports.view','NO_AUTOMATIC_RESTOCK'])assert.ok(migration.includes(marker),marker);
  for(const marker of ['payment.refund','payment.reverse','manually verified the external refund','keeps the original payment immutable'])assert.ok(app.includes(marker),marker);
  for(const marker of ['till.cashMovement','till.close','closeDay.generate','Generate close-day snapshot'])assert.ok(finance.includes(marker),marker);
  for(const marker of ['payment.refund','payment.reverse','Payments &amp; refunds','manually verified the external refund','original payment remains immutable'])assert.ok(refunds.includes(marker),marker);
  const acceptance=readFileSync('tests/supabase/pos.sql','utf8');
  for(const invariant of ['Over-refund','Close-day sales or refund totals','Close-day tender totals','Close-day report was mutable'])assert.ok(acceptance.includes(invariant),invariant);
});

test('staged staff administration binds Auth identities and consumes scoped approvals on the procurement transaction',()=>{
  const migration=readFileSync('supabase/expansion/016_staff_devices_approvals.sql','utf8');
  const procurement=readFileSync('supabase/expansion/012_procurement.sql','utf8');
  const view=readFileSync('src/runtime/web/WebStaffAdminView.tsx','utf8');
  const workspace=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(migration,/STAGED V2 ONLY/);
  assert.doesNotMatch(migration,/update\s+servos_v2\.control\s+set\s+enabled\s*=\s*true/i);
  for(const marker of ['servos_v2.canonical_permissions','servos_v2.role_permissions','staff_profiles','manager_approval_uses','devices.manage','last_seen_at','VERSION_CONFLICT','cannot remove the final active Admin'])assert.ok(migration.includes(marker),marker);
  assert.match(procurement,/require_manager_approval\(\(p->>'approvalToken'\)::uuid,'procurement\.over_receive',p->>'purchaseOrderId',who\)/);
  for(const marker of ['staff.create','staff.update','staff.deactivate','managerApproval.issue','device.revoke','Existing Auth user ID','Issue five-minute one-time approval'])assert.ok(view.includes(marker),marker);
  assert.match(workspace,/WebStaffAdminView/);
  const acceptance=readFileSync('tests/supabase/staff-devices.sql','utf8');
  for(const invariant of ['Staff role escalation was not denied','wrong target','wrong initiator','wrong action','Expired approval was accepted','Approval was reusable','Revoked device command was accepted'])assert.ok(acceptance.includes(invariant),invariant);
});
