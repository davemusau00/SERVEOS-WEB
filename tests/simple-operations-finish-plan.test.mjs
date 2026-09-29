import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('remaining Simple Operations work is condensed to three vertical patches',()=>{
  const plan=read('docs/SIMPLE_OPERATIONS_FINISH_TRAIN.md');
  const delivery=read('docs/UX_GUIDANCE_DELIVERY_PLAN.md');

  for(const marker of [
    'F1  OPERATIONS COMPLETE',
    'F2  HOSPITALITY + FIRST USE',
    'F3  DATA INTAKE + RELEASE HARDENING',
    'purchaseOrder.receive',
    'procurement.receiveDelivery',
    'inventory.countLocation',
    'catalog.createWithOpeningStock',
    'pos.first-sale',
    'stock.count',
    'stock.receive',
    '12A Desktop v2 adapter / migration rehearsal'
  ]) assert.ok(plan.includes(marker),marker);

  assert.match(delivery,/Condensed finish train/);
  assert.match(delivery,/SIMPLE_OPERATIONS_FINISH_TRAIN\.md/);
  assert.match(delivery,/F1 Operations Complete/);
  assert.match(delivery,/F2 Hospitality \+ First Use/);
  assert.match(delivery,/F3 Data Intake \+ Release Hardening/);
  assert.match(delivery,/historical decomposition/);
});

test('finish train preserves ledger and authority boundaries',()=>{
  const plan=read('docs/SIMPLE_OPERATIONS_FINISH_TRAIN.md');
  assert.match(plan,/must not activate staged PostgreSQL v2 or introduce dual writers/i);
  assert.match(plan,/Draft first, commit once/);
  assert.match(plan,/No production-readiness claim without target-device evidence/);
});
