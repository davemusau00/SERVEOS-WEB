import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_KINDS,validateReportInput,requireCompletionAccess,completionReport} from '../apps/api/src/completion-reports.mjs';
import {coverageDigest} from '../apps/api/src/completion-jobs.mjs';

const id='4f423da6-067b-4b46-a8c5-9545325b7a91';
const valid={kind:'expenses',from:'2026-10-01',to:'2026-10-12',timeZone:'Africa/Nairobi'};
test('only approved report types and strict period/limit values are accepted',()=>{
 assert.equal(REPORT_KINDS.length,8);
 assert.deepEqual(validateReportInput(valid),{...valid,limit:100,offset:0,tillId:null});
 for(const bad of [{kind:'INJECTED'},{from:'2026-02-30'},{to:'2026-09-01'},{limit:0},{offset:-1},{timeZone:'Moon/Nairobi'}]){
  assert.throws(()=>validateReportInput({...valid,...bad}));
 }
 assert.throws(()=>validateReportInput({...valid,kind:'shift-opening'}));
 assert.equal(validateReportInput({...valid,kind:'shift-opening',tillId:id}).tillId,id);
});
test('reports require both reporting and owning-domain access',()=>{
 const report={businessId:id,permissions:['reports.view']};
 assert.throws(()=>requireCompletionAccess(report,'stock-movements'),{status:403});
 assert.throws(()=>requireCompletionAccess(report,'guest-balances'),{status:403});
 assert.throws(()=>requireCompletionAccess(report,'accounting-coverage'),{status:403});
 assert.doesNotThrow(()=>requireCompletionAccess({...report,permissions:['reports.view','inventory.view']},'stock-movements'));
 assert.doesNotThrow(()=>requireCompletionAccess({businessId:id,permissions:['accounting.view']},'expenses'));
});
test('accounting-coverage diagnostics cannot authorize closing the period',async()=>{
 const sql=[];let connections=0;
 const client={query:async(statement,params)=>{
   sql.push([statement,params]);
   if(statement.includes('count(*)'))return {rows:[{count:'1',amount:'23000'}]};
   return {rows:[]};
 },release:()=>{}};
 const pool={connect:async()=>{connections++;return client;}};
 const value=await completionReport(pool,{businessId:id,permissions:['accounting.view']},{...valid,kind:'accounting-coverage'});
 assert.equal(connections,1);assert.equal(value.certified,false);
 assert.equal(value.eligibleForClose,false);assert.equal(value.authoritativeCloseSupported,false);
 assert.equal(value.totals.postedExpenseMinor,23000);
 assert.match(sql[0][0],/REPEATABLE READ READ ONLY/);
 assert.match(sql.at(-1)[0],/COMMIT/);
 assert.ok(sql.some(([q,p])=>q.includes('business_id=$1')&&p[0]===id));
});
test('coverage snapshot hashes are key-order invariant but value-sensitive',()=>{
 assert.equal(coverageDigest({a:1,b:{c:2,d:3}}),coverageDigest({b:{d:3,c:2},a:1}));
 assert.notEqual(coverageDigest({a:1}),coverageDigest({a:2}));
});
