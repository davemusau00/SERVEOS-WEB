import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentProjectionConfirmed} from '../src/runtime/web/paymentConfirmation.ts';
import {commandsShareAggregate} from '../src/runtime/web/commandDependencies.ts';

const entry={id:'cash-command',state:'SYNCHRONIZED',command:{operation:'payment.record',payload:{orderId:'sale',amountMinor:90000}}};
const order=paid=>({collection:'orders',id:'sale',data:{grandTotalMinor:90000,amountPaidMinor:paid}});
const payment=(amount,source='cash-command')=>({collection:'payments',id:source,archived:false,data:{orderId:'sale',sourceCommandId:source,amountMinor:amount}});
test('900 KES command is not displayed confirmed with a stale zero-paid projection',()=>{
 assert.equal(paymentProjectionConfirmed(entry,[order(0),payment(90000)]),false);
 assert.equal(paymentProjectionConfirmed(entry,[order(90000),payment(90000)]),true);
 assert.equal(paymentProjectionConfirmed(entry,[order(90000)]),false);
 assert.equal(paymentProjectionConfirmed({...entry,state:'OUTCOME_UNKNOWN'},[order(90000),payment(90000)]),false);
});
test('partial payment confirms its own evidence without requiring full settlement',()=>{
 const partial={...entry,command:{operation:'payment.record',payload:{orderId:'sale',amountMinor:30000}}};
 assert.equal(paymentProjectionConfirmed(partial,[order(30000),payment(30000)]),true);
 assert.equal(paymentProjectionConfirmed(partial,[order(60000),payment(30000),payment(30000,'earlier')]),true);
 assert.equal(paymentProjectionConfirmed(partial,[order(30000),payment(30000,'other-command')]),false);
});
test('split confirmation requires all matching payment rows',()=>{
 const split={...entry,command:{operation:'payment.split',payload:{orderId:'sale',payments:[{amountMinor:30000},{amountMinor:60000}]}}};
 assert.equal(paymentProjectionConfirmed(split,[order(90000),payment(90000)]),false);
 assert.equal(paymentProjectionConfirmed(split,[order(90000),payment(30000),{...payment(60000),id:'second'}]),true);
});
test('unknown outcome isolates order/till aggregates while retaining conservative stock and missing-baseline safety',()=>{
 const refs=(orderId,tillId)=>[{collection:'orders',id:orderId},{collection:'tillSessions',id:tillId},{collection:'paymentAccounts',id:'cash'}];
 assert.equal(commandsShareAggregate(refs('a','one'),refs('b','two')),false);
 assert.equal(commandsShareAggregate(refs('a','one'),refs('b','one')),true);
 assert.equal(commandsShareAggregate(refs('a','one'),refs('a','two')),true);
 assert.equal(commandsShareAggregate([{collection:'stockItems',id:'wine'}],[{collection:'stockItems',id:'wine'}]),true);
 assert.equal(commandsShareAggregate([],refs('a','one')),true);
});
