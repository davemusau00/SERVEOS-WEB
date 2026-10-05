# 23 — Business Document and Thermal Printing Architecture

> **Web-first revision (2026-10-06):** Business documents are now rendered by the PWA. Standard browser printing is the universal fallback. Dedicated Windows terminals may optionally pair with the ServOS Print Bridge for deterministic silent ESC/POS. The bridge contains only hardware transport/spooling and does not become a business authority. See `28-SILENT-PRINTING-PRINT-BRIDGE.md`.


## 1. Why this needs its own subsystem

The current current native printer implementation is receipt-centric:

- `encode_receipt(...)` builds customer/business receipt copies;
- `receipt_print_jobs` is the local durable queue;
- procurement views do not call any print function;
- close-day reports, customer statements, housekeeping and maintenance do not have a common native print route.

ServOS now needs printing for operational documents beyond fiscal/transaction receipts.

Do **not** solve this by making every module invent ESC/POS commands.

Instead create one typed Business Document service and one document print subsystem.

---

## 2. Design rule

```text
Domain record(s)
    ↓
BusinessDocument snapshot
    ↓
layout renderer
    ↓
PrintJob
    ↓
device print subsystem
    ↓
ESC/POS / Windows RAW / LAN
```

Domain modules know **what the document means**.

The renderer knows **how it looks**.

The printer driver knows **how bytes reach paper**.

---

## 3. BusinessDocument model

Suggested central schema:

```ts
BusinessDocument {
  id: string
  businessId: string
  type: BusinessDocumentType
  number: string
  revision: number
  status: 'DRAFT' | 'ISSUED' | 'VOIDED' | 'SUPERSEDED'
  sourceType: string
  sourceId: string
  sourceVersion: number
  issuedAt?: string
  issuedBy?: string
  title: string
  snapshot: JsonObject
  snapshotHash: string
  layoutVersion: number
  createdAt: string
}
```

Once `ISSUED`, the snapshot is immutable.

If the business record changes later, issue a new revision rather than silently changing what an old printed document would contain.

---

## 4. Document types for ServOS 1.0

### Sales / POS

- `SALE_RECEIPT`;
- `REFUND_RECEIPT`;
- `KITCHEN_TICKET`;
- `BAR_TICKET`.

### Procurement

- `PURCHASE_ORDER`;
- `GOODS_RECEIPT_NOTE`;
- `SUPPLIER_RETURN_NOTE`;
- `SUPPLIER_PAYMENT_ADVICE`.

### Inventory

- `STOCK_REQUISITION`;
- `STOCK_TRANSFER_NOTE`;
- `STOCK_COUNT_SHEET`;
- `STOCK_VARIANCE_REPORT`;
- `ITEM_BARCODE_LABEL`.

### Cash / finance

- `TILL_OPEN_SLIP`;
- `CASH_MOVEMENT_VOUCHER`;
- `TILL_CLOSE_SUMMARY`;
- `CLOSE_DAY_REPORT`;
- `CUSTOMER_CREDIT_STATEMENT`.

### Hospitality

- `RESERVATION_CONFIRMATION`;
- `GUEST_REGISTRATION_CARD`;
- `GUEST_FOLIO_STATEMENT`;
- `HOTEL_CHECKOUT_RECEIPT`;
- `HOUSEKEEPING_LIST`;
- `MAINTENANCE_WORK_ORDER`.

More can be added without modifying printer transport code.

---

## 5. PrintJob model

Generalize the current receipt-specific queue.

Suggested local PWA/Print Bridge model:

```ts
PrintJob {
  id: string
  documentId: string
  documentType: string
  documentRevision: number
  printerRole: 'RECEIPT' | 'KITCHEN' | 'BAR' | 'OFFICE' | 'LABEL'
  profileSnapshot: JsonObject
  documentSnapshot: JsonObject
  renderedHash: string
  state:
    | 'QUEUED'
    | 'SENDING'
    | 'SENT'
    | 'DELIVERY_UNCERTAIN'
    | 'FAILED'
    | 'CANCELLED'
  attemptCount: number
  message?: string
  createdAt: string
  updatedAt: string
}
```

Recommended SQLite migration:

```text
receipt_print_jobs
      ↓ migrate/generalize
print_jobs
```

Do not lose unresolved historical receipt jobs during migration.

---

## 6. Print states and duplicate safety

Printing is not the business transaction.

```text
PO issued
   ✓

print job
QUEUED → SENDING → SENT
                  ↘ DELIVERY_UNCERTAIN
```

A printer failure must never un-issue a PO, un-receive stock, reopen a closed till or change a guest balance.

For uncertain delivery:

> The printer connection opened but ServOS cannot know whether paper came out.

Require:

```text
[ I checked the printer; retry ]
```

before another send where duplicate paper could cause confusion.

---

# 7. Thermal Purchase Order specification

## 7.1 Why 80mm PO printing matters

For many small suppliers, bars, hotels and rural/SME operations, the quickest usable artifact is the same thermal printer already sitting at the counter.

A PO should therefore be printable immediately from PWA/Print Bridge without needing Word, PDF or a full-size office printer.

## 7.2 Layout

Recommended 80mm layout:

```text
           [ BUSINESS LOGO ]

        BUSINESS TRADING NAME
        Phone / Email
        Address / PIN if configured

          PURCHASE ORDER
          PO-2026-000123
          REV 1 · ISSUED
--------------------------------
Date: 05 Oct 2026 22:14
Supplier: ABC DISTRIBUTORS
Phone: 07xx xxx xxx
Deliver to: Main Store
Created by: Davies
Approved by: Manager
--------------------------------
ITEMS

Coca-Cola 330ml
5 crates × KES 2,400
120 bottles       KES 12,000

Tusker 500ml
3 crates × KES 3,200
60 bottles         KES 9,600
--------------------------------
TOTAL             KES 21,600
--------------------------------
Notes:
Deliver before 12:00.

This is a purchase order.
It is not proof of payment.

Supplier acknowledgement:
Name: ______________________
Sign: ______________________
Date: ______________________

ServOS reference:
PO-2026-000123
```

Logo placement uses the same top-image pipeline as receipt branding.

The M-Pesa payment QR is **not** printed on a purchase order unless a future explicit business-document design requires it. The receipt QR requirement remains customer-payment specific.

## 7.3 Package language

Always print how the operator/supplier thinks:

```text
5 crates × 24 bottles
```

not merely:

```text
120 canonical units
```

Canonical quantity may be shown as supporting text where useful.

## 7.4 Prices

Configurable business policy:

```text
PO print prices:
● Show prices
○ Hide prices
```

Default: show prices.

## 7.5 Signature/approval

Where the business uses approval:

- Created by;
- Approved by;
- approval timestamp;
- optional supplier acknowledgment.

Do not print secret approval tokens.

---

# 8. Goods Receipt Note (GRN)

After `purchaseOrder.receive` confirms, offer `Print GRN`.

Layout includes:

```text
GOODS RECEIPT NOTE
GRN-2026-000456
PO: PO-2026-000123
Supplier
Delivery note
Supplier invoice ref
Storage location
Received by / time

Item
Ordered
Previously received
Delivered today
Rejected
Accepted
Outstanding

Rejection reasons
```

The GRN is evidence of what the business accepted, not proof the supplier invoice has been approved for payment.

---

# 9. Supplier Return Note

Must clearly say goods physically left the business.

Include:

- return number;
- supplier;
- related PO/GRN where known;
- item/package quantities;
- reason;
- condition;
- expected credit-note reference;
- dispatched by;
- approved by;
- supplier/driver acknowledgment.

Never represent a supplier return using `RECEIPT_REVERSAL` language on the printed artifact.

---

# 10. Stock requisition / transfer

## Requisition

```text
Requested by: Main Bar
From: Central Store

Tusker     2 crates
Jameson    3 bottles
```

## Dispatch / transfer

```text
Issued by
Received by
Quantity requested
Quantity dispatched
Quantity received
Discrepancy
```

For controlled transfers, the destination receipt closes the workflow.

---

# 11. Stock count sheets

Support:

- blind sheet;
- assisted sheet;
- selected/spot count;
- full-location count.

Blind sheets must not include current expected stock.

Use physical entry vocabulary and blank writing space.

---

# 12. Cash/till documents

Thermal printer is useful for:

### Paid in/out voucher

Evidence for petty operational cash movement.

### Till close summary

Include:

- opening float;
- cash sales;
- cash collections;
- paid in/out;
- expected drawer;
- actual count;
- variance;
- variance reason;
- cashier;
- manager approval if applicable.

### Close-day summary

The full report can remain available digitally, with a concise thermal management copy.

---

# 13. Credit/customer documents

Customer statement includes:

```text
opening balance
charges
payments
write-offs/adjustments clearly labelled
closing balance
due dates
```

Payment acknowledgment is separate from the full statement.

---

# 14. Hospitality documents

## Guest folio statement

Can be printed while the stay remains open.

Do not require checkout merely to hand a guest their current bill.

## Registration card

Optional property-policy artifact.

## Reservation confirmation

Printable/sharable without creating a financial receipt.

## Housekeeping list

Resilient offline paper worklist for room attendants.

## Maintenance work order

Printable job card for engineering/maintenance staff.

---

# 15. KOT/BOT printer routing

Add printer roles:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

Route configuration may be outlet/service-area aware.

Example:

```text
Food → Kitchen Printer
Cocktails → Bar Printer
Receipts → Front Counter
```

KDS and thermal tickets may run together.

A printer failure must create a visible operational alert but must not alter the order state.

---

# 16. Renderer architecture

Replace receipt-specific hardcoding with shared primitives:

```rust
DocumentRenderer
  .text(...)
  .rule()
  .pair(left,right)
  .center(...)
  .bold(...)
  .raster(...)
  .barcode(...)
  .feed(...)
  .cut()
```

Higher-level renderers:

```text
render_sale_receipt
render_purchase_order
render_grn
render_stock_count_sheet
render_till_close
render_folio_statement
```

All output is bounded by a validated `PrinterProfile`.

---

# 17. Image pipeline

Business logo and payment QR use one safe raster primitive.

The reset still requires:

- business logo at top of receipt;
- uploaded payment QR must be PNG;
- payment QR processed as an ordinary bounded raster image;
- caption exactly `Scan to Pay via One app`;
- no special QR module/grid parser.

Business documents can reuse the logo raster. They do not automatically inherit the payment QR.

---

# 18. Web printing

Web cannot claim native printer success.

Web options:

1. browser print-friendly 80mm layout;
2. A4 document/PDF layout;
3. `Print on PWA/Print Bridge` command/request when a paired PWA/Print Bridge is online, implemented only after device-command safety is proven.

For 1.0, direct reliable ESC/POS ownership remains PWA/Print Bridge-side.

---

# 19. Print preview

Before print, show:

- document type/number;
- revision;
- printer role/profile;
- approximate 80mm preview;
- copy count;
- reprint warning if applicable.

Routine receipt auto-print can remain policy-driven without preview.

---

# 20. Document numbering

Separate sequences:

```text
RCPT-
PO-
GRN-
RET-
REQ-
TRF-
CSH-
FOL-
MWO-
```

Numbers are business-scoped and centrally allocated online.

For authorized offline PWA/Print Bridge documents, the offline grant must contain reserved numbering ranges so duplicates cannot occur after reconnect.

---

# 21. Reprint audit

Record:

```text
printJobId
documentId
documentRevision
printer/device
actor
reason when policy requires
first print / reprint
attempt
transport result
timestamps
```

Reprint never mutates the original business document.

---

# 22. Migration from receipt_print_jobs

1. preserve current unresolved receipt jobs;
2. add/generalize `print_jobs` table;
3. map receipt jobs to `documentType=SALE_RECEIPT/HOTEL_CHECKOUT_RECEIPT`;
4. keep existing outcome/uncertain-delivery semantics;
5. switch receipt UI to generic spooler;
6. add PO/GRN/etc;
7. remove receipt-only queue code once historical jobs are resolved/migrated.

---

# 23. Hardware acceptance

At minimum test on XP-80T:

- sale receipt;
- PO with 1 line;
- PO with 20+ lines;
- long wrapped supplier/item names;
- GRN with rejected quantities;
- blind stock sheet;
- till close;
- customer statement;
- folio statement;
- kitchen ticket;
- logo rendering;
- payment QR receipt rendering;
- cutter on/off;
- USB queue;
- LAN 9100;
- paper out/failure;
- delivery uncertain/retry;
- five sequential documents of mixed types.

Physical paper acceptance is required. Byte-stream tests alone are insufficient.
