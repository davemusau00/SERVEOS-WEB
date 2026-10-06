# ServOS Simple Operations — Condensed Finish Train

**Repository:** `davemusau00/servos-`
**Verified planning baseline:** `b164247a138171ee8549a5c5b3384acb4ee1a566`
**Status:** development authority for remaining Simple Operations work after implemented Phases 1–3.
**Scope:** installed/native ServOS first. Web-v2 authority/cutover remains separate.

## Current verified baseline

Already implemented and locally verified:
- task-first Home and permission-filtered navigation;
- Quick Add deep actions;
- human-readable error translation and empty states;
- product families, physical variants and sale formats;
- atomic `catalog.createWithOpeningStock`;
- Storage Places terminology;
- atomic location-first `inventory.countLocation`;
- persistent per-staff/per-location scanner drafts in SQLite schema 11;
- repeated keyboard-wedge scanning using `scanUnitQuantity`;
- unknown-code assignment/dismissal and restart/resume;
- guidance engine, route-aware steps and per-staff progress;
- full procurement, rooms/front desk, assets/maintenance and controlled-import engines.

## Protected invariants

The remaining work must not:
- reset Intake/enrollment or replace the business;
- rewrite existing business history;
- bypass native commands, audit, optimistic locking, manager approval or Go Live rules;
- directly mutate inventory from UI draft state;
- make staged PostgreSQL authoritative over the LIVE native business;
- require internet for ordinary terminal operation;
- treat scanner/import/guidance drafts as business-ledger state;
- claim physical terminal/scanner acceptance from browser mocks.

# Condensed finish sequence

```text
F1  OPERATIONS COMPLETE
    Simple Receive Delivery
    + stock.receive guide
    + focused receive/scanner acceptance

F2  HOSPITALITY + FIRST USE
    Simple Rooms
    + Simple Property / Report Problem
    + first-login onboarding
    + first-sale / stock-count / receive guides

F3  DATA INTAKE + RELEASE HARDENING
    Friendly CSV + Paste from Excel
    + column mapping
    + usability acceptance
    + packaged-terminal / physical-scanner evidence
    + final docs cleanup
```

---

# F1 — Operations Complete

## Goal

Turn supplier receiving into the same kind of obvious task flow now achieved for stock counting.

Staff-facing flow:

```text
RECEIVE DELIVERY

Supplier
[ EABL ]

Invoice / Delivery ref
[ INV-3482 ]

Storage Place
[ Main Store ]

[ Scan barcode or search ]

Tusker 500ml
24 bottles
KES 165 / bottle

Coke 300ml
48 bottles
KES 60 / bottle

[ Review Delivery ]
[ Confirm Delivery ]
```

## Reuse the existing procurement engine

The current native implementation already owns:
- `purchaseOrder.create`;
- `purchaseOrder.receive`;
- scanner-assisted receiving;
- package / `scanUnitQuantity` conversion;
- partial receipt and rejected quantities;
- manager approval for over-receipt;
- GRN creation;
- weighted cost;
- supplier payable;
- journal;
- invoice matching;
- supplier payment recording;
- audit/outbox.

Do not create a second inventory-only supplier receiving path.

## Existing-PO path

When an APPROVED or PARTIALLY_RECEIVED PO exists, the simple UI should collect the friendly receive draft and commit through the established `purchaseOrder.receive` operation.

## Ad-hoc delivery path

Do not implement "delivery arrived without PO" as two independent frontend commits.

If ad-hoc delivery is required, add one native orchestration operation, for example:

```text
procurement.receiveDelivery
```

It may atomically:

```text
create/approve procurement order
→ post goods receipt
→ stock movements
→ weighted cost
→ supplier payable
→ journal
→ audit/outbox
```

Authorization:
- existing-PO receive requires `procurement.receive`;
- ad-hoc receive requires purchasing + receiving authority, or established manager approval;
- a receiving-only operator must not gain purchasing authority implicitly.

Reuse existing internal procurement helpers inside one SQLite transaction where possible.

## Scanner rules

- exact barcode/SKU identity only;
- each physical scan adds configured `scanUnitQuantity`;
- unknown/ambiguous codes remain draft-only and visible;
- scan/review must not mutate business records;
- final confirmation sends one authoritative receive command.

## Friendly wording

Prefer:
- Receive Delivery
- Supplier
- Delivery reference
- Storage Place
- Delivered
- Damaged / rejected
- Cost per bottle / pack / unit

Keep PO/GRN/accounting language in advanced/history surfaces.

## Expected files

```text
src/native/NativeProcurementView.tsx
src/native/NativeHomeView.tsx
src/native/quickActions.ts
src/native/errors/domainErrorMessages.ts
src/guidance/core.ts
src-tauri/src/store.rs
src-tauri/src/tests.rs
tests/browser/preview.spec.ts
tests/guidance-source.test.mjs
docs/user-guide/19-receiving.md
docs/UX_GUIDANCE_DELIVERY_PLAN.md
docs/COMPLETION_LEDGER.md
docs/TEST_EVIDENCE.md
```

Add a SQLite migration only if durable receiving drafts are truly needed.

## F1 guide

Add `stock.receive` only after the final interaction stabilizes.

Guide success must observe a successful committed receive operation. Scanning, review or failed commands cannot complete it.

## F1 acceptance

Native:
- existing-PO receive still behaves identically underneath the simple UI;
- ad-hoc orchestration, if added, is atomic;
- failure leaves no partial PO/GRN/stock/payable/journal;
- duplicate command replay is idempotent;
- `scanUnitQuantity` conversion is correct;
- duplicate/reference protections remain;
- over-receive still requires approval;
- receiving-only user cannot self-escalate;
- rejected quantity creates neither stock nor payable value.

Browser desktop + mobile:
- Home `Receive Delivery` opens the simple flow;
- scan changes draft only;
- review creates no business command;
- one confirmation sends one receive command;
- unknown code shows a human next step;
- committed success does not invite duplicate submission.

---

# F2 — Hospitality + First Use

This merges the former Rooms, Property, onboarding and workflow-guide phases because the underlying engines already exist.

## A. Simple Rooms

```text
ADD ROOM

Room number
[ 104 ]

Type
[ Standard ]

[ Add Room ]

More details ▾
```

Inherit safe defaults:
- capacity;
- normal rate;
- turnaround;
- housekeeping state;
- maintenance availability.

If no room type exists, offer inline creation:

```text
Name
Sleeps
Normal nightly price
```

Where atomicity matters, add native orchestration such as `room.quickCreate`.

## B. Bulk rooms

```text
101-110
Type: Standard
Floor: 1

[ Create 10 Rooms ]
```

Validate the whole batch before writing. Prefer one transaction such as `room.bulkCreate`. Duplicate/conflicting room numbers must prevent partial creation.

## C. Simple Property

Staff-facing section:

```text
Property
├─ Assets
├─ Repairs
└─ Maintenance
```

Simple creation:

```text
ADD PROPERTY

What is it?
[ Samsung 43" TV ]

Where is it?
[ Room 104 ]

[ Add ]

More details ▾
```

Preserve permanent tags, category, custody, room/storage assignment, lifecycle, inspection, maintenance and procurement-commissioning rules.

Use `asset.quickCreate` only if needed to preserve atomic invariants. Do not weaken `asset.save`.

## D. Report Problem

Expose `Report Problem` on room and asset surfaces and map it to the existing `maintenance.report`.

No second maintenance state machine.

## E. First-login onboarding

Use the existing per-staff guidance progress store:

```text
WELCOME, MARY

You're signed in as Server.

You can:
✓ Make sales
✓ Manage tabs
✓ Take allowed payments

[ Make your first sale ]
[ Learn ServOS ]
[ Explore myself ]
```

Capabilities come from actual permissions, not role name alone.

Onboarding must be:
- dismissible;
- non-blocking;
- restart durable;
- versioned;
- outside business records/outbox.

## F. Workflow guides

Add:
- `pos.first-sale`
- `stock.count`
- `stock.receive`

Advance only from successful committed operations.

## Expected files

```text
src/native/NativeRoomsView.tsx
src/native/NativeFrontDeskView.tsx
src/native/NativeAssetsView.tsx
src/native/NativeHomeView.tsx
src/native/NativeBarShell.tsx
src/guidance/core.ts
src/guidance/GuidanceProvider.tsx
src-tauri/src/store.rs
src-tauri/src/tests.rs
tests/browser/preview.spec.ts
tests/guidance-source.test.mjs
docs/user-guide/*
docs/UX_GUIDANCE_DELIVERY_PLAN.md
docs/COMPLETION_LEDGER.md
docs/TEST_EVIDENCE.md
```

## F2 acceptance

Rooms:
- single quick create;
- inline type + default rate + room;
- bulk range all-or-nothing;
- duplicate number blocked;
- existing types reused;
- existing reservation/housekeeping/maintenance rules unchanged.

Property:
- generated/scanned asset tag remains unique;
- room/storage assignment valid;
- lifecycle unchanged;
- `Report Problem` creates the existing maintenance order;
- permission filtering enforced.

Guidance:
- onboarding isolated per staff;
- permission-derived actions;
- dismiss/resume/restart behavior;
- guides complete only on committed operations;
- route changes remain permission checked;
- desktop/mobile targets remain recoverable.

---

# F3 — Data Intake + Release Hardening

## A. Friendly data intake

Rename the ordinary entry to:

```text
Bring In Existing Data
```

Keep the existing authoritative pipeline:

```text
stage
→ validate
→ dry run
→ review
→ apply
```

Front-door choices:
- Products / Price List
- Stock List
- Rooms
- Assets
- Customers
- Suppliers
- Staff

Support:
- Upload CSV
- Paste from Excel

Do not delay completion on XLSX if CSV + paste satisfies the workflow safely.

## B. Column mapper

Example:

```text
Your column        ServOS field
Item Name       →  Product Name
Sell Price      →  Selling Price
Barcode No      →  Barcode
Qty             →  Starting Quantity
Store           →  Storage Place
```

The mapper produces canonical staged input. It does not bypass validation/dry run/application.

## C. Dependency resolution

Unknown safe dependencies may be proposed but must appear in dry-run review before creation.

Never fuzzy-merge business records automatically.

## D. Usability acceptance

On the installed terminal, an unfamiliar operator should be able to:
1. add Coke 300ml;
2. add Jameson 750ml bottle/single/double;
3. add Jameson 1L;
4. add Chicken & Chips;
5. add an ingredient;
6. place stock in Main Store;
7. count Main Store;
8. move stock to bar;
9. receive supplier delivery;
10. add rooms 101-110;
11. add a TV to Room 104;
12. report the TV problem;
13. import/paste an existing list.

Success means they do not need to understand:
- stock master;
- external_id;
- rate plan;
- asset category;
- record collection;
- price rule;
- GRN internals.

## E. Physical terminal evidence

Record real target-device evidence for:
- packaged Windows startup;
- USB scanner continuous count;
- receive-delivery scanner flow;
- unknown barcode behavior;
- 80mm receipt output;
- offline count-draft restart/resume;
- ordinary offline sale;
- backup/recovery;
- no v2 authority activation.

Record commit, OS/device, hardware, exact procedure/date/result in `docs/TEST_EVIDENCE.md`.

## F. Final gate

```powershell
npm run lint
npm test
node scripts/test-supabase.mjs --expansion
npm run test:browser
npm run test:native
npm run test:desktop
npm run build
npm run audit:ui
npm run docs:check
git diff --check
```

---

# Separate train

Do not mix this finish train with:

```text
12A Desktop v2 adapter / migration rehearsal
12B controlled authority cutover
12C signed offline grants
```

The Simple Operations finish train must not activate staged PostgreSQL v2 or introduce dual writers.

# Speed rules

1. Reuse proven domain commands before adding new ones.
2. Add orchestration only where frontend sequencing can leave partial business state.
3. Complete one real-world job end-to-end per patch.
4. Do not split onboarding and workflow guides into separate releases now.
5. Do not split Rooms and Property into separate releases.
6. Do not block Friendly Import on XLSX.
7. Draft first, commit once.
8. Explicit review before financial/destructive commits.
9. Keep advanced screens available to authorized users.
10. No production-readiness claim without target-device evidence.
