import test from 'node:test';
import assert from 'node:assert/strict';
import { documentCopyStatus, documentPaperProfile, documentPreviewAttempt, DOCUMENT_DEVELOPER_FOOTER } from '../src/runtime/web/documentPaperProfiles.ts';

test('customer receipts, refunds and kitchen tickets use the narrow thermal profile', () => {
  for (const type of ['SALES_RECEIPT', 'PAYMENT_ACKNOWLEDGEMENT', 'REFUND_RECEIPT', 'KOT', 'BOT', 'KOT_CANCEL', 'BOT_CANCEL', 'ORDER_VOID_NOTICE']) {
    assert.equal(documentPaperProfile(type), 'thermal-80mm', type);
  }
});

test('reports and business documents select explicit A4 profiles', () => {
  assert.equal(documentPaperProfile('CLOSE_DAY_REPORT'), 'a4-landscape');
  for (const type of ['PURCHASE_ORDER', 'GOODS_RECEIPT', 'GUEST_FOLIO', 'GUEST_CHECKOUT', 'CUSTOMER_CREDIT_INVOICE', 'SUPPLIER_RETURN_NOTE']) {
    assert.equal(documentPaperProfile(type), 'a4-portrait', type);
  }
  assert.equal(documentPaperProfile('FUTURE_DOCUMENT'), 'a4-portrait', 'unknown types fail safe to A4');
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