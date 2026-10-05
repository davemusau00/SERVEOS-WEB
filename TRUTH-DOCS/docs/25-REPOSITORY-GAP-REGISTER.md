# 25 — Repository Gap Register and Reset Addendum

## 1. Purpose

This register records workflow/product gaps found while comparing:

- `davemusau00/SERVEOS-WEB/main`;
- `davemusau00/SERVEOS-WEB/V2`;
- legacy `davemusau00/servos-`;
- concept/prototype `davemusau00/ServOs`.

A missing feature in this register does not automatically mean "build immediately". It means the reset must deliberately decide whether the workflow belongs in ServOS 1.0 and, if so, define one authoritative implementation.

---

## 2. P0 architecture/coherence gaps

### GAP-A01 — One network authority

**Status:** reset requirement.

Current generation contains legacy/V2 authority complexity. New VPS API must be sole network mutation authority.

### GAP-A02 — Terminal SQLite role

SQLite becomes:

- local projection;
- durable command outbox;
- offline authorized execution store;
- printer/hardware survival store.

It is not a competing cloud source of truth.

### GAP-A03 — exact command recovery

Every financial/destructive workflow persists command ID before dispatch and checks that ID after response loss.

V2 correction work validates this direction and should inform the shared command client.

### GAP-A04 — V2 branch divergence

V2 remains 7 ahead / 2 behind the reviewed `main` and contains unmerged business invariants. Resolve per `24-V2-BRANCH-RECONCILIATION.md`.

---

# 3. P0/P1 printing gaps

### GAP-P01 — Purchase-order printing

**Repo evidence:** Native and Web Procurement contain no print call/path while create/receive/match/pay are implemented.

**Required:** immutable/versioned PO document + 80mm thermal print.

### GAP-P02 — General business document spooler

Current queue is `receipt_print_jobs` and native renderer is receipt-specific.

**Required:** general `print_jobs` + typed document renderer.

### GAP-P03 — GRN print

After receiving, operator needs printable Goods Receipt Note.

### GAP-P04 — Stock requisition / transfer paper

No canonical requisition domain in production branch.

`ServOs` prototype contains a useful Stock Requisition UX concept.

### GAP-P05 — Count sheet / variance print

Required for physical/fallback stocktaking.

### GAP-P06 — Close-day / cash-up print

Production Native persists close-day reports but reporting view has no print action.

### GAP-P07 — customer credit statement print

Native displays the statement but does not print it.

### GAP-P08 — folio statement print

Production prints checkout receipt but lacks a full open-folio statement print workflow.

The `ServOs` concept PMS contains a `Print Folio Statement` concept worth adapting.

### GAP-P09 — maintenance/housekeeping/KOT print

No shared operational document printing path exists.

---

# 4. Procurement gaps

### GAP-PR01 — PO state machine

Current ordinary Native creation message says the PO is "created and approved locally".

Need configurable simple vs controlled purchasing policy with draft/approval/issue/cancel/revision states.

### GAP-PR02 — PO edit/cancel/revision

Canonical operation registry has create/receive but no explicit PO approve/cancel/amend/issue commands.

### GAP-PR03 — physical supplier returns

No canonical supplier-return workflow.

V2 `procurement.reverseUnusedReceipt` is only an exact correction of an unused duplicate, not a physical return.

### GAP-PR04 — full receipt/accounting correction

V2 explicitly leaves consumed stock, wrong prices, supplier returns and paid/matched invoices to a future accounting design.

New backend must close this intentionally.

### GAP-PR05 — supplier remittance/statement

No unified Supplier 360 + printable remittance/statement flow.

### GAP-PR06 — purchasing approval thresholds

Need policy such as:

```text
≤ KES 10,000 manager may approve
> KES 10,000 admin/owner required
```

without hardcoding amounts in UI.

---

# 5. Inventory gaps

### GAP-I01 — selected/spot count

V2 adds `inventory.countSelected`; preserve it as separate from full count.

### GAP-I02 — durable Web count state

V2 physical-count wrapper uses `localStorage` rather than IndexedDB BusinessStore.

Replace.

### GAP-I03 — internal requisition

Production has direct transfer but no request/approve/dispatch/receive stock-requisition lifecycle.

### GAP-I04 — supplier return stock movement

Needs explicit outbound supplier-return movement and credit-note linkage.

### GAP-I05 — label/barcode printing

No general label printer document path.

### GAP-I06 — archive blockers/reactivation

V2 improves archive protection and adds reactivation concept. Port as typed lifecycle semantics.

### GAP-I07 — corrections after later activity

Current V2 exact reversal intentionally blocks when later stock/cost activity makes restoration unsafe.

Need guided current-balance/accounting correction path rather than leaving the operator with a dead end.

---

# 6. Hospitality gaps

### GAP-H01 — simple walk-in stay

Current historical reservation model requires customer-linked reservation semantics. Reset requires optional inline guest snapshot and atomic `stay.quickCheckIn`-style backend orchestration.

### GAP-H02 — deposits optional by policy

Deposit/folio machinery remains, but no-deposit walk-in must be first-class.

### GAP-H03 — folio statement document

Separate from checkout receipt.

### GAP-H04 — reservation confirmation / registration card

Operational documents absent from production print system.

### GAP-H05 — tape-chart experience

Production has room/front-desk workspaces; `ServOs` concept repository has a useful Hotel Tape Chart concept.

Consider adapting the visualization after the state machine/API is stable, not before.

### GAP-H06 — housekeeping handoff

Need Today/shift queue and optional paper list.

### GAP-H07 — maintenance work-order integration

Need one path from room/asset problem → maintenance task → out-of-order state → completion → return-to-service.

---

# 7. POS/KDS gaps

### GAP-S01 — KOT/BOT thermal fallback

Production has KDS but no generic thermal service-ticket printing.

### GAP-S02 — printer routing by service area

Need Kitchen/Bar/Receipt printer roles.

### GAP-S03 — reprint semantics

Operational tickets and documents need visible `REPRINT` marking and audit.

### GAP-S04 — repeat-round exact configuration

Ensure portions/modifiers/notes are reconstructed exactly, then current availability is revalidated.

### GAP-S05 — exception vocabulary

Void, comp, refund and correction contracts must remain distinct across API/Web/Terminal.

---

# 8. Finance/shift gaps

### GAP-F01 — shift handover

Native has till close/backup/sync but no explicit two-operator handover workflow.

The `ServOs` Staff/Cash concept contains handover ideas worth product analysis, but not direct code migration.

### GAP-F02 — printed cash voucher

Paid in/out needs optional evidence print.

### GAP-F03 — close-day report distribution

Persisted report exists; add thermal summary and later A4 export.

### GAP-F04 — tender exception inbox

M-Pesa reconciliation exists. Today/Manager should show unresolved mismatches rather than requiring navigation hunting.

---

# 9. Staff/RBAC gaps

### GAP-R01 — role contract convergence

One canonical role/permission matrix across API, Web and Terminal.

### GAP-R02 — workspace visibility

Navigation permission should represent task eligibility, not generic record-read permissions.

### GAP-R03 — step-up approval UX

No UUID/token shuffling. Use a reusable manager approval dialog/device-local step-up.

### GAP-R04 — shift/station assignment

Later operational improvement: assign cashier/server/storekeeper to outlet/station/till so Today and permissions are context-aware.

---

# 10. Web/responsive gaps

### GAP-W01 — IndexedDB for durable workflow drafts

No sensitive or significant workflow should rely on raw localStorage state.

### GAP-W02 — modal recovery

Unknown outcomes need recovery controls inside the modal/sheet.

### GAP-W03 — mobile/tablet task layouts

Tables must become cards/sheets on narrow layouts for operational work.

### GAP-W04 — offline language

Web draft must say `Saved as local draft`, not promise automatic transaction sync until that path is truly implemented.

---

# 11. Setup/import gaps

### GAP-C01 — business profiles

Restaurant/bar/hotel/resort/retail capability bundles should configure shell and defaults without forking the database.

### GAP-C02 — post-import readiness

Import result must lead directly to unresolved setup issues.

### GAP-C03 — hardware commissioning

Printer/scanner acceptance should be a named Go-Live checkpoint.

---

# 12. Security/cleanup gaps

### GAP-X01 — V2 probe artifacts

Do not merge `.pc.txt`, `.probe_chain.txt`, `probe-run.ps1` or ad-hoc probe SQL into production reset.

### GAP-X02 — source tree debris

Legacy `servos-` still contains `.bak` source files. Treat as archive-only evidence, not code to move.

### GAP-X03 — generic record writes

Do not recreate `record.save` as the normal mutation vocabulary in the new backend. Critical domains receive typed endpoints/commands.

### GAP-X04 — direct DB access

No browser or Terminal production code receives PostgreSQL credentials or direct mutation RPC access.

---

# 13. Recommended implementation packages added to roadmap

## Package WF-01 — Business Document Core

- document table/model;
- numbering;
- immutable issued snapshots;
- layout versioning;
- reprint audit.

## Package WF-02 — Generic Terminal Print Queue

- migrate receipt queue;
- typed renderer;
- printer roles;
- LAN/USB transport;
- uncertain delivery handling.

## Package WF-03 — Procurement Lifecycle

- draft/approval/issue/revision/cancel;
- PO print;
- GRN print;
- supplier return;
- correction paths.

## Package WF-04 — Stock Requisition

- request/approval/dispatch/receive;
- transfer in transit;
- print docs.

## Package WF-05 — Operational Print Pack

- count sheet;
- variance report;
- till close;
- customer statement;
- folio statement;
- maintenance/housekeeping.

## Package WF-06 — KOT/BOT Routing

- printer roles;
- service-area routes;
- queue/reprint.

## Package WF-07 — Shift Handover

- outgoing/incoming acknowledgement;
- unresolved-work summary;
- cash/printer/sync blockers.

## Package WF-08 — V2 Salvage

Execute `24-V2-BRANCH-RECONCILIATION.md` before branch retirement.

---

# 14. Priority

### Before pilot

Must have:

- generic print queue foundation;
- PO/GRN thermal print;
- selected/full count correctness;
- simple hotel walk-in;
- reliable receipt printing;
- till close/cash-up;
- response-loss recovery;
- V2 business-rule salvage.

### Before broad hospitality rollout

Add:

- folio statements;
- housekeeping/maintenance documents;
- supplier returns;
- controlled requisitions;
- KOT/BOT routing.

### Later

- CRM/loyalty concepts;
- payroll/staff HR depth from prototype;
- eTIMS;
- guest self-ordering QR menu;
- advanced multi-property SaaS console.

---

# 15. Definition of closure

A gap is closed only when:

```text
contract
+ backend transaction
+ permissions
+ audit
+ Web UX
+ Terminal UX where applicable
+ offline rule
+ document/print rule where applicable
+ responsive tests
+ failure/retry tests
+ operator acceptance
```

all agree.
