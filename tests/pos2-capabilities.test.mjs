import test from 'node:test';
import assert from 'node:assert/strict';
import {pos2Capabilities} from '../apps/api/src/pos2-capabilities.mjs';
const actor={businessId:'business',staffId:'staff',deviceId:'device',permissions:['pos.sell']};
test('simple cashier defaults off and requires exact authenticated business/staff/device cohort',()=>{
 const cohort=JSON.stringify([{businessId:'business',staffId:'staff',deviceId:'device'}]);
 assert.equal(pos2Capabilities(actor,'')['pos2.simpleCashier'],false);
 assert.equal(pos2Capabilities(actor,'broken')['pos2.simpleCashier'],false);
 assert.equal(pos2Capabilities(actor,cohort)['pos2.simpleCashier'],true);
 for(const field of ['businessId','staffId','deviceId'])assert.equal(pos2Capabilities({...actor,[field]:'other'},cohort)['pos2.simpleCashier'],false);
 assert.equal(pos2Capabilities({...actor,permissions:['ticket.create']},cohort)['pos2.simpleCashier'],false);
 assert.equal(pos2Capabilities(actor,'[{"businessId":"business"}]')['pos2.simpleCashier'],false);
});
