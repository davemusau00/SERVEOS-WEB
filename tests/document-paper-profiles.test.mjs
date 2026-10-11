import test from 'node:test';
import assert from 'node:assert/strict';
import { documentCopyStatus, documentPaperProfile, documentPreviewAttempt, formatDocumentMoney, DOCUMENT_DEVELOPER_FOOTER,THERMAL_DOCUMENT_TYPES } from '../src/runtime/web/documentPaperProfiles.ts';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

test('customer receipts, refunds and kitchen tickets use the narrow thermal profile', () => {
  for (const type of ['SALES_RECEIPT', 'PAYMENT_ACKNOWLEDGEMENT', 'REFUND_RECEIPT', 'KOT', 'BOT', 'KOT_CANCEL', 'BOT_CANCEL', 'ORDER_VOID_NOTICE']) {
    assert.equal(documentPaperProfile(type), 'thermal-80mm', type);
  }
});

test('every supported report and business document has an explicit thermal profile; unknown types fail closed', () => {
  for(const type of THERMAL_DOCUMENT_TYPES)assert.equal(documentPaperProfile(type),'thermal-80mm',type);
  for(const type of ['FUTURE_DOCUMENT','toString','__proto__'])assert.throws(()=>documentPaperProfile(type),/Unsupported thermal document/);
  const renderer=readFileSync('src/runtime/web/BusinessDocumentRenderer.tsx','utf8');
  const titleMap=renderer.match(/const titles:Record<string,string>=\{([^}]+)\}/)?.[1];
  assert.ok(titleMap,'renderer must enumerate supported titles');
  for(const match of titleMap.matchAll(/([A-Z][A-Z_]+):/g))assert.equal(documentPaperProfile(match[1]),'thermal-80mm',match[1]);
  assert.doesNotMatch(renderer,/a4-portrait|a4-landscape|size:\s*A4|210mm|297mm/);
});

test('reprints are labeled from the attempt count without changing the issued document snapshot', () => {
  assert.equal(documentCopyStatus(0), 'ORIGINAL');
  assert.equal(documentCopyStatus(1), 'ORIGINAL');
  assert.equal(documentCopyStatus(2), 'REPRINT');
  assert.equal(documentCopyStatus(Number.NaN), 'ORIGINAL');
});

test('preview copy status follows the upcoming retry without relabeling an uncertain original attempt', () => {
  assert.equal(documentPreviewAttempt(0, 'QUEUED'), 1);
  assert.equal(documentPreviewAttempt(1, 'DELIVERY_UNCERTAIN'), 1);
  assert.equal(documentPreviewAttempt(1, 'QUEUED'), 2);
  assert.equal(documentPreviewAttempt(1, 'FAILED'), 2);
});

test('document footer uses the required operator-visible developer contact', () => {
  assert.equal(DOCUMENT_DEVELOPER_FOOTER, 'Developed By Kingsforge, 0746157440');
});

test('document money formatting applies KES exactly once and rejects non-minor-unit values', () => {
  assert.equal(formatDocumentMoney(10000), 'KES 100.00');
  assert.equal(formatDocumentMoney(10050), 'KES 100.50');
  assert.equal(formatDocumentMoney(-125), 'KES -1.25');
  assert.equal(formatDocumentMoney(null), '—');
  assert.equal(formatDocumentMoney(1.5), '—');
});


test('all active web print paths reject wide-paper branches',()=>{
 const visit=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);else if(/\.(tsx?|mjs)$/.test(entry.name)){const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/a4-portrait|a4-landscape|size\s*:\s*A4|210\s*mm|297\s*mm/i,file);}}};
 visit('src/runtime/web');
});
