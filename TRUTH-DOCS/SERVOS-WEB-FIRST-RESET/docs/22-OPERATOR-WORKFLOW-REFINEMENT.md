# 22 — Operator Workflow Refinement Master Plan

## 1. Purpose

ServOS 1.0 must be evaluated by the jobs ordinary staff complete during a real shift, not by the number of modules, operations or database records it contains.

The reset therefore adds a second product gate alongside backend correctness:

> **Every routine workflow must have a short, obvious happy path and a clearly separated exception path.**

The backend may remain strict, audited and transactional. The operator surface should expose only the information required to make the current decision.

This document extends the existing task-first shell, simple-stay, Smart Item and procurement plans with workflows that are currently missing, fragmented, or too technical across `SERVEOS-WEB`, its `V2` branch, `servos-`, and the `ServOs` concept repository.

---

## 2. Cross-workflow interaction rules

Every Tier-A workflow must follow the same interaction contract.

### 2.1 One clear primary action

Examples:

- `Sell`;
- `Check in`;
- `Receive delivery`;
- `Create purchase order`;
- `Count stock`;
- `Close till`;
- `Print`.

Do not make the operator choose between several technically similar buttons before the business intent is known.

### 2.2 Progressive disclosure

Default view shows the routine fields.

`More options` exposes:

- accounting classification;
- internal codes;
- advanced rate/deposit rules;
- detailed approval configuration;
- tax overrides;
- exceptional stock treatment.

### 2.3 Draft → Review → Commit for destructive/financial actions

Use:

```text
enter
  ↓
review
  ↓
confirm
  ↓
command ID allocated/persisted
  ↓
commit
```

Never clear entered data until the command outcome is `CONFIRMED`.

### 2.4 Response loss is a state, not an error toast

For `PENDING` / `OUTCOME_UNKNOWN`:

```text
We are checking whether this was saved.
Do not submit it again.

[ Check status ] [ Open Activity ]
```

### 2.5 Reprints and duplicates are explicit

A reprint must never look like an original print.

For documents where duplicate paper could cause operational confusion, print:

```text
REPRINT
Original document: PO-2026-000123
Reprinted: 05 Oct 2026 23:10
By: Manager Name
```

The business record remains the same document/version; the print attempt is a separate audited event.

---

# 3. Procurement workflow reset

The current production repository already supports PO creation, receipt, invoice matching and supplier payment. It does **not** currently provide a procurement print path, and the ordinary PO flow still jumps too quickly from create to approved.

## 3.1 Configurable procurement policy

A business chooses one policy:

### Simple purchasing

Best for small restaurants, bars and owner-operated businesses.

```text
Create PO
  ↓
Issue immediately
```

The creator must already hold `procurement.approve` or business policy permits auto-approval below the configured threshold.

### Controlled purchasing

```text
Draft
  ↓
Submit for approval
  ↓
Approve / reject
  ↓
Issue to supplier
  ↓
Receive
  ↓
Match invoice
  ↓
Pay
```

Required states:

```text
DRAFT
PENDING_APPROVAL
APPROVED
ISSUED
PARTIALLY_RECEIVED
RECEIVED
INVOICED
PARTIALLY_PAID
PAID
CANCELLED
CLOSED
```

The backend should derive state from authoritative events where possible rather than let clients set arbitrary status strings.

## 3.2 Quick PO creation

Default:

```text
PURCHASE ORDER

Supplier
[ Choose supplier ]  [ + Quick supplier ]

+ Add item
```

Line:

```text
Coca-Cola 330ml
Buy as: Crate of 24
Qty: 5 crates
Price: KES 2,400 / crate

ServOS calculates:
120 bottles
KES 12,000
```

Advanced `Expense` / `Asset` lines remain behind `Add non-stock line`.

## 3.3 Repeat / usual order

Add:

- `Duplicate PO`;
- `Repeat last order from this supplier`;
- `Order usual stock`.

The duplicate is a new draft with a new command/document identity and current prices left editable.

## 3.4 PO issue and print

On approval/issue:

```text
[ Print 80mm ]
[ Preview ]
[ Share / PDF ]   ← Web/A4 capability may follow after thermal acceptance
```

Thermal printing is specified in `23-BUSINESS-DOCUMENT-PRINTING.md`.

## 3.5 PO change/cancellation

Before any receipt:

- amend quantities/prices;
- add/remove lines;
- cancel with reason;
- issue a revised version.

After receipt has started:

- do not mutate history;
- remaining unreceived quantity may be cancelled/closed;
- received quantities remain immutable business evidence.

A revised issued PO gets a new document version:

```text
PO-2026-000123 · REV 2
```

## 3.6 Receiving

Default to outstanding quantities.

```text
[ Receive everything ]
[ Something is different ]
```

Exception view exposes:

- delivered quantity;
- rejected quantity;
- rejection reason;
- partial receipt;
- over-receipt approval;
- wrong package;
- delivery note;
- supplier invoice reference.

After commit offer:

```text
Goods received.
[ Print GRN ] [ Receive another ] [ View PO ]
```

## 3.7 Supplier return

This is a distinct physical workflow and must not be modelled as "undo receive".

```text
Supplier Return
  ↓
select receipt/PO and items
  ↓
quantity physically leaving business
  ↓
reason
  ↓
approval if required
  ↓
stock transfer out / supplier-return movement
  ↓
supplier debit/credit-note expectation
  ↓
print Supplier Return Note
```

Canonical operations should include a dedicated return domain, for example:

```text
supplierReturn.create
supplierReturn.approve
supplierReturn.dispatch
supplierReturn.matchCreditNote
supplierReturn.cancel
```

Do **not** overload `procurement.reverseUnusedReceipt`. That V2 operation is intentionally a correction for an unused duplicate recording where goods never physically moved.

## 3.8 Receipt/cost correction

Three distinct concepts must remain separate:

```text
RECORDING CORRECTION
wrong duplicate record; physical world did not change

SUPPLIER RETURN
physical goods leave the business

ACCOUNTING ADJUSTMENT
price/invoice/credit-note correction after later activity
```

The V2 branch provides a useful guarded `procurement.reverseUnusedReceipt` prototype. Preserve its evidence/version concepts, but the new VPS backend must provide complete accounting correction semantics rather than leaving wrong-price/paid-invoice cases stranded.

---

# 4. Internal stock requisition and controlled transfer

The `ServOs` concept repository contains a useful `StockRequisitionModal`, but the canonical production operation set currently jumps directly to `inventory.transfer`.

That is insufficient for businesses with a central store and several bars/kitchens/outlets.

## 4.1 Simple direct transfer

For small businesses with permission:

```text
Bar Store
→ Main Bar
2 crates + 3 loose bottles
[ Transfer ]
```

## 4.2 Controlled requisition

For larger businesses:

```text
Outlet requests stock
      ↓
Store reviews
      ↓
Approve / adjust / reject
      ↓
Dispatch
      ↓
Receiving outlet confirms
      ↓
Transfer closes
```

Suggested states:

```text
DRAFT
REQUESTED
APPROVED
PICKING
DISPATCHED
RECEIVED
REJECTED
CANCELLED
```

Required documents:

- Stock Requisition;
- Stock Transfer / Dispatch Note;
- Receiving confirmation;
- discrepancy record.

The system must not decrement destination/source twice merely because dispatch and receipt are separate operator steps. Domain ownership of stock-in-transit must be explicit.

---

# 5. Stock count workflow refinement

## 5.1 Full count

Existing whole-location semantics remain the authoritative close/count workflow.

## 5.2 Selected / spot count

The V2 branch adds `inventory.countSelected`. Preserve the business idea.

Use it for:

- checking five high-risk spirits;
- verifying one shelf;
- correcting a suspicious balance after investigation;
- cycle counting without closing the whole store.

Do not silently make a selected count equivalent to the full location count.

## 5.3 Printed blind count sheet

A real business needs a paper fallback.

Offer:

```text
[ Print count sheet ]

Mode:
● Blind count     ← expected quantities hidden
○ Assisted count  ← expected quantities shown
```

Thermal sheet may contain:

```text
BAR STORE STOCK COUNT
05 OCT 2026 22:00
Counter: __________________

Tusker 500ml
Full crates: ______
Loose bottles: ______

Jameson 750ml
Sealed bottles: ______
Open ml: ______
```

After digital count completion:

```text
[ Print variance report ]
```

with before/count/delta/reason/actor.

## 5.4 Count persistence

Browser physical-count drafts must live in IndexedDB through the shared Web local store, not raw `localStorage`.

The V2 branch currently demonstrates the selected-count UI but its Web wrapper persists reviewed physical counts via `localStorage`; do not carry that implementation into the reset.

---

# 6. Inventory archive/reactivation

The V2 branch adds two useful ideas:

- block stock-item archive when unresolved PO quantities still reference it;
- `record.reactivate` for restoring intentionally archived records.

The reset should formalize lifecycle rules:

```text
ACTIVE
ARCHIVED
```

Archive blockers must explain exactly what is unresolved:

> 3 open purchase-order lines still reference this item.

Actions:

```text
[ View open orders ]
[ Cancel remaining quantities ]
[ Keep item active ]
```

Reactivation restores the record but never rewrites history.

---

# 7. Barcode and label printing

Add a stock-label workflow separate from transaction receipt printing.

Use cases:

- shelf labels;
- kitchen quick-scan cards;
- dish/barcode cards;
- stock-master labels;
- asset tags later.

A label document should support:

- item name;
- selling/purchase package;
- human-readable code;
- Code 128 / EAN barcode when valid;
- optional price;
- generated timestamp/version.

Do not generate fake EAN/UPC values without checksum/namespace rules. Internal Code 128 values are safer when ServOS owns the identifier.

---

# 8. POS and service workflows needing refinement

## 8.1 Kitchen/bar ticket fallback

KDS exists in the production codebase, but there is no generalized thermal KOT/BOT print subsystem.

Add configurable service routing:

```text
Kitchen item
  → KDS
  → optional Kitchen Printer

Bar item
  → Bar KDS
  → optional Bar Printer
```

A ticket includes:

- order/table/tab;
- server;
- fired time;
- item quantity;
- modifiers/notes;
- course/route;
- `REPRINT` marker where applicable.

Printer failure must not unfire the order.

## 8.2 Hold/fire/course clarity

Operational UI should distinguish:

```text
Ordered
Held
Sent/Fired
Preparing
Ready
Served
Voided
```

Do not let KDS terminology leak differently between Terminal and Web.

## 8.3 Repeat round

Repeat round must preserve:

- exact portion;
- modifiers;
- quantity;
- route;

while rechecking current item availability/policy.

---

# 9. Shift/till workflow refinement

The native repo already supports till count/close and close-day generation, but reports are screen-only and the shift-handover workflow is thin.

## 9.1 Opening

After opening till offer an optional opening slip:

```text
TILL OPENED
Terminal
Staff
Opening float
Timestamp
```

## 9.2 Paid in/out

Every cash movement should be printable as a small voucher when required.

```text
CASH PAID OUT
KES 2,000
Reason: market vegetables
Staff: ...
Approval: ...
```

## 9.3 Handover

Add explicit shift handover where businesses use rotating cashiers:

```text
Outgoing operator
      ↓
count / unresolved tabs / printer queue / pending sync
      ↓
Incoming operator review
      ↓
handover confirmation
```

Do not make handover a hidden side effect of locking the terminal.

## 9.4 Till close / close-day print

After confirmed close:

```text
[ Print cash-up summary ]
[ Generate full report ]
```

The production repo already persists `closeDayReports` but has no native print action in that reporting view.

---

# 10. Customer credit workflow refinement

The current native credit screen contains a useful on-screen statement, reconciliation and write-off workflow but no print path.

Add:

- Print customer statement;
- Print payment acknowledgment;
- Print/write-off approval evidence where business policy requires;
- statement date range;
- opening balance / charges / settlements / adjustments / closing balance;
- optional due-date summary.

A statement is not a fiscal receipt and must have its own document type.

---

# 11. Supplier account workflow refinement

Add a Supplier 360 detail page showing:

- open POs;
- goods receipts;
- unmatched receipts;
- invoices;
- current payable;
- payment history;
- returns/credit notes;
- contact/payment terms.

Print/share outputs:

- PO;
- GRN;
- return note;
- remittance/payment advice;
- supplier activity statement.

---

# 12. Hospitality/front-desk workflow refinement

The Simple Stay reset remains the default. Additional routine workflows should become equally direct.

## 12.1 Walk-in

```text
Available room
→ Check in
→ guest name
→ nights / rate
→ pay now or later
→ done
```

No persistent customer account required.

## 12.2 Reservation confirmation

After reservation:

```text
[ Print confirmation ]
[ Share confirmation ]
```

## 12.3 Guest registration card

Optional by property policy:

- guest snapshot;
- room;
- arrival/departure;
- ID/reference fields;
- signature space;
- terms acknowledgement.

## 12.4 Folio statement

The concept `ServOs` PMS contains a browser `Print Folio Statement` action. The production repo currently prints immutable hotel checkout receipts but does not expose an equivalent full folio-statement print workflow.

Add:

```text
[ Print guest bill ]
```

at any point without closing the folio.

## 12.5 Checkout

Simple checkout:

```text
Balance 0
[ Check out ]
```

or:

```text
KES 3,000 due
[ Pay & Check Out ]
```

Advanced deposit/application/refund remains available only where configured.

## 12.6 Housekeeping handoff

Add optional thermal print:

```text
HOUSEKEEPING LIST
Morning shift

101  DIRTY      Checkout
102  STAYOVER   Service requested
103  CLEAN      Inspection pending
```

Digital board remains primary; print is a resilient field artifact.

## 12.7 Maintenance work order

Maintenance should be printable with:

- room/asset;
- fault;
- priority;
- reported by/time;
- assignee;
- safety/out-of-order status;
- completion/sign-off area.

---

# 13. Assets and maintenance refinement

The current production repo contains deep Native asset workflows, while Web depth remains uneven.

Add task-first actions:

```text
Report problem
Assign
Start work
Complete
Return to service
```

Procurement-to-asset commissioning must preserve one acquisition truth:

- receiving an asset line creates an acquisition candidate;
- commissioning creates the asset;
- it must never simultaneously become normal consumable stock unless the line is explicitly split.

Print Asset Handover / Maintenance Work Order where useful.

---

# 14. Refund / void / correction operator language

Keep verbs separate:

```text
VOID
cancel an order/item before normal financial completion or according to policy

COMP
business absorbs price intentionally

REFUND
money is returned after payment

CORRECTION
recorded business fact was wrong; immutable compensating evidence is created

SUPPLIER RETURN
physical purchased goods leave the business
```

Every UI must explain stock and money effects before confirmation.

---

# 15. Imports and setup workflow refinement

Import Center should end in a usable business, not merely imported rows.

After import show:

```text
Imported
42 items
5 suppliers
10 rooms

Needs attention
3 products missing selling price
1 duplicate barcode
2 rooms missing rate

[ Fix issues ]
```

CSV templates should use business language and example rows.

---

# 16. Daily operator home

`Today` should be role-specific and exception-first.

Examples:

### Storekeeper

- deliveries expected;
- low stock;
- open requisitions;
- counts due;
- unresolved barcode scans.

### Receptionist

- arrivals;
- departures;
- rooms dirty/out of order;
- guest balances;
- reservation conflicts.

### Manager

- open tills;
- large variances;
- approval requests;
- failed printer jobs;
- unmatched M-Pesa;
- overdue supplier/customer balances.

Do not turn Today into a decorative analytics dashboard.

---

# 17. Workflow acceptance rule

A workflow is accepted only when it proves:

1. first-time user can identify the next action;
2. routine path does not expose advanced internals;
3. all required backend invariants still run;
4. failed/unknown outcome preserves the operator's work;
5. duplicate submission cannot duplicate the business effect;
6. Terminal and Web use the same command contract;
7. offline behavior is explicit;
8. print artifacts, when applicable, come from an immutable/versioned document snapshot;
9. responsive acceptance passes at required POS/tablet/mobile sizes;
10. audit trail explains who did what and why.
