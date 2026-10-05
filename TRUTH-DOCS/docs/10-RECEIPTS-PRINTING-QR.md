# 10 — Receipts, Printing, Branding and Payment QR

## 1. Objective

Make receipts reliable, immutable and visually conventional while removing the fragile QR-specific image-analysis pipeline.

## 2. Canonical receipt ownership

The backend creates the immutable receipt document when a transaction is confirmed.

Terminal owns physical ESC/POS printing and printer queue behavior.

Web can display/download receipt documents but does not claim native printer success unless a supported local printing bridge exists.

## 3. Business logo placement

The business logo moves to the **top** of the receipt.

Customer copy order:

```text
BUSINESS LOGO
Business name
Address / phone / email / outlet

CUSTOMER COPY
Receipt no / date / cashier

items...
subtotal / tax / discount
TOTAL
payment / change / balance

thank-you message

Scan to Pay via One app
[ PAYMENT QR ]

Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440

feed
cut
```

## 4. QR requirement

Exact caption:

**Scan to Pay via One app**

The QR is always uploaded as a PNG.

ServOS does not decode, reconstruct or reinterpret it.

## 5. Delete the special QR algorithm

Retire concepts such as:

- QR grid detection;
- module pitch inference;
- dark bounding box discovery;
- quiet-zone reconstruction;
- QR-specific raster packing;
- module-density validation intended to rebuild a code.

The business owns correctness of the supplied QR content.

ServOS owns faithful printing of the PNG.

## 6. Shared receipt-image pipeline

Use one primitive:

`prepareReceiptImage()`

for:

- logo;
- payment QR;
- future small receipt image assets.

Steps:

1. validate MIME/header;
2. decode PNG/image;
3. composite alpha onto white;
4. resize within configured printer width;
5. generate preview image;
6. threshold/dither into printer-compatible 1-bit raster;
7. persist dimensions/hash/raster;
8. render centered.

QR uses the same pipeline as logo.

The only QR-specific rules are product rules:

- PNG only;
- sensible maximum dimensions/file size;
- recommended square image;
- preview before save.

Do not inspect encoded QR modules.

## 7. Image storage

Brand asset version:

```text
id
kind LOGO | PAYMENT_QR
mime image/png
sha256
original bytes
prepared raster width/height/data
createdAt
createdBy
```

Business setting references an active asset version.

## 8. Receipt snapshot

At sale/payment commit, copy the actual raster/version into or reference an immutable version guaranteed to be retained.

Historic reprint must not change because the owner uploaded a new logo or QR tomorrow.

## 9. Layout version

New receipts use a new `layoutVersion`.

Historic layouts remain renderable.

Do not rewrite old documents just to match new branding placement.

## 10. Customer vs business copy

Customer copy:

- business logo top;
- customer transaction detail;
- payment QR near bottom when enabled;
- KingsForge footer.

Business copy:

- business logo top;
- business record detail;
- no payment QR unless a future explicit requirement says otherwise;
- no unnecessary customer-sensitive detail;
- KingsForge footer.

## 11. Printer queue

Transaction completion and printing are separate states.

```text
sale CONFIRMED
receipt CREATED
printer job QUEUED
printer job PRINTING
printer job PRINTED / FAILED
```

A printer failure never changes a paid sale back to unpaid.

Retry/reprint uses the immutable receipt.

## 12. Native raster API

Rust printer layer should know only:

```text
printCenteredRaster(raster)
printText(...)
feed(...)
cut()
```

It should not contain two unrelated implementations for logo and QR.

## 13. Printer profiles

Store profile:

- 80mm width/dots;
- columns;
- logo max width;
- QR max width;
- feed lines;
- cut mode;
- code page/UTF-8 strategy;
- interface/queue identifier.

## 14. Preview

Settings → Branding & Receipts should preview approximately:

- logo size;
- business header;
- sample total;
- QR caption;
- QR placement;
- footer;
- paper width.

Preview is advisory. Physical printer acceptance remains mandatory.

## 15. QR acceptance

Using a real business QR PNG and XP-80T:

- upload PNG;
- save;
- restart app;
- make sale;
- print customer copy;
- logo appears at top;
- exact caption appears;
- QR appears below caption;
- printed QR scans from a phone;
- footer not cut off;
- business copy correct;
- five consecutive receipts correct;
- long receipt correct;
- reprint identical;
- replacing QR affects only new receipts;
- disabling QR removes it only from new receipts.

## 16. Print data security

Receipt printer jobs/logs should not retain more card/payment secret data than the receipt itself requires.

Never print API secrets, full auth tokens or device credentials.

---

# Reset Addendum — General Business Document Printing

Receipt printing becomes one specialization of a broader Business Document spooler.

## 17. Generalize the current receipt queue

The current Native queue is receipt-specific. Replace/generalize:

```text
receipt_print_jobs
```

with:

```text
print_jobs
```

while migrating unresolved historical receipt jobs safely.

The generic queue must retain the strong existing ideas:

- durable local queue;
- one claimant per send;
- `DELIVERY_UNCERTAIN` state;
- explicit duplicate/retry confirmation;
- audited admin cancellation;
- printer profile snapshot.

## 18. Supported document families

ServOS 1.0 should use the same spooler for:

- sale/refund/hotel receipts;
- Purchase Orders;
- Goods Receipt Notes;
- supplier return notes;
- stock requisitions/transfers;
- count sheets/variance reports;
- till cash vouchers and close summaries;
- customer credit statements;
- folio statements;
- housekeeping lists;
- maintenance work orders;
- KOT/BOT tickets;
- item/barcode labels.

See `23-BUSINESS-DOCUMENT-PRINTING.md` for the full contract.

## 19. Printer roles

Add role routing:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

A single physical XP-80T may serve several roles in a small business; larger businesses can map them to separate queues/IPs.

## 20. Current source mismatch to reset requirement

The currently reviewed `printer.rs` still:

- renders receipt-specific customer/business copies;
- treats payment QR with a dedicated QR path;
- appends the logo at the end of the customer copy.

Those are source facts, not the desired reset architecture.

The reset still requires:

- business logo at the top;
- payment QR PNG treated through the same bounded raster primitive as logo;
- exact caption `Scan to Pay via One app`;
- business documents rendered by typed document renderers rather than receipt hacks.

