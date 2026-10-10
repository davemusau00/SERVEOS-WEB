import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildVerifiedCloseDayReportCsv } from '../src/runtime/web/closeDayReportCsv.ts';

const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const makeDocument=(snapshot,extra={})=>({id:'report-1',type:'CLOSE_DAY_REPORT',documentNumber:'CLOSE-001',issuedAt:'2026-10-10T10:00:00.000Z',snapshot,hash:createHash('sha256').update(canonical(snapshot)).digest('hex'),...extra});

test('close-day CSV exports the hash-verified issued snapshot with escaped detail paths',async()=>{
  const snapshot={
    schemaVersion:1,
    business:{businessName:'Cafe, "East"',taxPin:'=HYPERLINK("https://example.invalid")'},
    paymentsByTender:[{method:'CASH',receivedMinor:1234}],
    cash:{expectedMinor:1234,varianceMinor:-12},
    'payment/method':'M-Pesa',
    empty:[],
  };
  const original=structuredClone(snapshot);
  const csv=await buildVerifiedCloseDayReportCsv(makeDocument(snapshot));

  assert.ok(csv.startsWith('"document_number","document_id","issued_at","snapshot_path","value","value_type"\r\n'));
  assert.ok(csv.includes('"/business/businessName","Cafe, ""East""","string"'));
  assert.ok(csv.includes('"/business/taxPin","\'=HYPERLINK(""https://example.invalid"")","string"'), 'spreadsheet formulas in snapshot text are neutralized');
  assert.ok(csv.includes('"/paymentsByTender/0/receivedMinor","1234","number"'));
  assert.ok(csv.includes('"/cash/varianceMinor","-12","number"'), 'negative numeric amounts remain numeric');
  assert.ok(csv.includes('"/payment~1method","M-Pesa","string"'), 'JSON Pointer path separators are escaped');
  assert.ok(csv.includes('"/empty","[]","array"'), 'empty collections are retained');
  assert.deepEqual(snapshot,original,'export does not mutate the immutable report snapshot');
});

test('close-day CSV refuses a mismatched snapshot hash or a non-close-day document',async()=>{
  const valid=makeDocument({schemaVersion:1,cash:{expectedMinor:500}});
  await assert.rejects(()=>buildVerifiedCloseDayReportCsv({...valid,hash:'0'.repeat(64)}),/snapshot hash does not match/u);
  await assert.rejects(()=>buildVerifiedCloseDayReportCsv({...valid,type:'SALES_RECEIPT'}),/Only an issued close-day report/u);
});

test('close-day CSV rejects non-JSON numeric values rather than silently changing them',async()=>{
  const snapshot={schemaVersion:1,cash:{expectedMinor:Number.POSITIVE_INFINITY}};
  await assert.rejects(()=>buildVerifiedCloseDayReportCsv(makeDocument(snapshot)),/cannot be represented safely/u);
});