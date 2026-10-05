# 10 — Receipts, Printing, Branding and Payment QR

## 1. Objective

Make printing web-first, immutable and hardware-tolerant while removing the fragile QR-specific raster path.

## 2. Document ownership

The API/domain layer issues immutable BusinessDocument snapshots for authoritative documents. The PWA caches documents required for reprint/offline operation. Physical printing is a capability of the current device.

Printing modes:

1. Browser print;
2. dedicated kiosk/default-printer mode after hardware acceptance;
3. optional ServOS Print Bridge for guaranteed silent raw ESC/POS.

## 3. Business logo placement

Business logo prints at the **top**.

Customer receipt:

```text
[ BUSINESS LOGO ]
Business name / contact / outlet

CUSTOMER COPY
Receipt / date / cashier

Items
Subtotal / tax / discount
TOTAL
Payment / change / balance

Thank-you

Scan to Pay via One app
[ PAYMENT QR PNG ]

Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440

feed / cut where supported
```

## 4. QR contract

Exact caption:

**Scan to Pay via One app**

QR is uploaded as PNG only.

ServOS does not decode/reconstruct QR modules.

## 5. One image pipeline

Both logo and QR use:

```text
PNG/image asset
   ↓
decode
   ↓
composite transparency onto white
   ↓
resize to printer profile
   ↓
monochrome 1-bit raster when ESC/POS required
   ↓
append_image()
```

Retire:

- QR grid detection;
- module pitch inference;
- quiet-zone reconstruction;
- QR-specific raster packing;
- square/module validation intended to rebuild the code.

Validate only that the PNG is bounded, decodable and printable.

## 6. Immutable snapshots

A receipt/document stores the branding/payment-QR representation or asset version used when issued. Changing business branding later must not silently rewrite historical output.

## 7. Browser print renderer

Each printable document has an HTML/CSS renderer with 80mm print stylesheet:

- explicit width;
- no browser headers/footers where deployment permits;
- predictable margins;
- page-break rules;
- high-contrast monochrome assets;
- large enough text for real thermal output.

Browser print is the universal fallback.

## 8. Raw ESC/POS renderer

When Print Bridge is paired, the PWA sends a typed/signed document job. The bridge produces ESC/POS bytes and uses Windows RAW or LAN TCP transport.

The browser never sends arbitrary raw ESC/POS bytes.

## 9. Print status language

Use accurate states:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Do not claim physical paper success when the protocol cannot prove it.

## 10. Reprints

Reprints use the immutable document snapshot, not current mutable transaction state.

Where appropriate mark:

`REPRINT`

and retain reprint audit metadata.

## 11. Business document family

The same printing architecture handles:

- receipt/refund;
- PO;
- GRN;
- supplier return;
- requisition/transfer;
- stock count/variance;
- cash-up/till close;
- customer credit statement;
- folio statement;
- reservation confirmation;
- housekeeping list;
- maintenance work order;
- KOT/BOT.

## 12. Acceptance

No printing release is accepted from unit tests alone. Physically verify on target printers and paper, including QR scan success, cutter margins, long documents, repeated jobs and disconnect/retry uncertainty.

See `28-SILENT-PRINTING-PRINT-BRIDGE.md` and `23-BUSINESS-DOCUMENT-PRINTING.md`.
