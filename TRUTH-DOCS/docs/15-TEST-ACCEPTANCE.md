# 15 — Test and Acceptance Master Matrix

## 1. Philosophy

ServOS passes when real business journeys survive realistic failure, not when only unit tests are green.

## 2. Test layers

### Unit

Pure calculations/state transitions.

### Domain integration

Real PostgreSQL transactions.

### Contract

Schemas, command registry, permissions and client/server compatibility.

### API

Authentication, queries, commands, errors, idempotency, concurrency.

### Web browser

Desktop/tablet/mobile viewports.

### Terminal

React + Tauri/Rust/SQLite.

### Hardware

XP-80T, barcode scanner, Windows target machine.

### Migration

Legacy export/import/reconciliation.

### Chaos/failure

Network loss, process kill, response loss, VPS/database outage.

## 3. Tier A — selling

Prove:

- open till;
- barcode/search item;
- add quantity/modifier/portion;
- table/tab;
- cash payment;
- M-Pesa manual payment;
- card;
- split tender;
- discount with policy;
- comp vs void semantics;
- refund;
- immutable receipt;
- printer retry/reprint;
- close till;
- cash variance policy.

## 4. Tier A — inventory

- create packaged item;
- create spirit/servings;
- opening stock;
- receive package;
- weighted cost;
- count location;
- unknown barcode;
- transfer;
- waste;
- admin correction;
- sealed/open conservation;
- recipe consumption;
- batch production.

## 5. Tier A — procurement

- quick supplier;
- draft PO;
- approval;
- package quantities;
- full receive;
- partial receive;
- rejected goods;
- second receipt;
- over-receipt approval;
- price mismatch;
- invoice match;
- duplicate invoice reference;
- supplier payment;
- duplicate payment replay.

## 6. Tier A — rooms

- create simple room setup;
- quick walk-in check-in without profile;
- pay now;
- pay later;
- checkout;
- optional guest-profile link;
- future reservation;
- deposit;
- extension;
- move;
- room service charge;
- housekeeping clean;
- block/out of order;
- concurrent double-book prevention.

## 7. API protocol

- valid command;
- invalid schema;
- permission denial;
- stale version;
- same ID replay;
- same ID different payload;
- response lost after commit;
- command lookup;
- concurrent commands;
- ordered changes;
- cursor retry;
- bootstrap verification;
- unsupported client protocol.

## 8. Terminal offline

- disconnect before shift;
- disconnect mid-shift;
- supported sale completes;
- unsupported action blocks with explanation;
- receipt prints offline;
- restart while offline;
- queued commands persist;
- reconnect/replay;
- grant expiry;
- server rejects over-budget command into reconciliation state;
- no duplicate transaction.

## 9. Web offline

- app shell may load cached where appropriate;
- transaction action clearly unavailable/draft-only;
- draft survives refresh if promised;
- reconnect requires/revalidates submission;
- UI never claims an offline draft is synced when it is not.

## 10. Receipt/QR

- business logo top;
- QR PNG shared raster pipeline;
- exact caption;
- printed QR scans;
- historic receipt unchanged after branding update;
- 5 consecutive prints;
- long receipt;
- cutter/feed;
- failed printer job retry.

## 11. Responsive

Every critical flow at:

- 1024×600;
- 1280×720;
- 1280×800;
- 1366×768;
- 1920×1080;
- 800×1280;
- 390×844.

Assert:

- primary actions visible;
- no accidental page horizontal scroll;
- dialogs scroll internally;
- sticky footer reachable;
- keyboard/touch work;
- scanner does not corrupt unrelated fields.

## 12. Security

- cross-business access blocked;
- expired token;
- revoked device;
- role change takes effect;
- manager approval one-use;
- brute-force/rate limit;
- malicious upload;
- CSV formula injection neutralized;
- secrets absent from logs;
- database not publicly reachable.

## 13. Migration

- clean business with configuration only;
- business with live history;
- quantities/control totals;
- open till;
- open folio;
- outstanding credit/AP;
- receipt numbers;
- unsupported legacy data produces blocker, not silent loss;
- repeat import does not duplicate.

## 14. Disaster recovery

- restore DB to clean VPS/environment;
- start API;
- re-enroll/bootstrap replacement Terminal;
- revoke lost Terminal;
- reconnect offline command evidence according to recovery procedure.

## 15. Performance

Load realistic dataset:

- thousands of items;
- months of orders/receipts;
- large movement history;
- room history;
- many audit rows.

Measure:

- POS search;
- Front Desk load;
- daily report;
- change-feed catch-up;
- API p95;
- DB slow queries.

## 16. Release sign-off

Release requires evidence from one exact SHA/image set.

No "tested roughly the same code last week" acceptance.

---

# Acceptance Addendum — Operator Workflows and Business Documents

## 17. Procurement document printing

On a real XP-80T prove:

- one-line PO;
- 20+ line PO;
- long supplier/item names;
- package quantities and totals;
- approval fields;
- PO reprint clearly marked;
- GRN after partial receipt;
- GRN with rejection/reason;
- supplier return note;
- cutter/feed behavior;
- USB and LAN profiles where supported.

No procurement print is accepted from browser preview alone.

## 18. Generic print queue

Prove mixed queue ordering:

```text
receipt
→ PO
→ kitchen ticket
→ count sheet
→ receipt
```

Then test:

- printer offline;
- paper out where observable by operator;
- app restart;
- `DELIVERY_UNCERTAIN`;
- retry after physical check;
- stale/cancelled job;
- reprint audit.

A failed print must not roll back the originating business transaction.

## 19. Purchase-order lifecycle

Test simple and controlled policies:

- draft;
- submit;
- approve/reject;
- issue;
- revise before receipt;
- cancel before receipt;
- cancel remaining quantity after partial receipt;
- duplicate/repeat order;
- unauthorized approval;
- response loss on approval/issue.

## 20. Supplier returns/corrections

Prove separately:

- unused duplicate receipt reversal;
- physical supplier return;
- return after partial consumption must block/adjust appropriately;
- supplier credit-note match;
- wrong price/accounting correction;
- paid invoice correction requires authorized accounting path.

## 21. Requisition/transfer

- direct small-business transfer;
- request → approve → dispatch → receive;
- partial dispatch;
- destination discrepancy;
- network loss after dispatch;
- no double stock addition/removal.

## 22. Stock count print and selected count

- blind printed sheet contains no expected quantity;
- assisted sheet does;
- selected count affects selected scope only;
- full count still requires full location;
- browser draft survives refresh in IndexedDB;
- unresolved scan blocks finalization.

## 23. Shift and finance documents

Prove:

- paid-in/out voucher;
- till-close summary;
- close-day thermal summary;
- customer credit statement;
- customer payment acknowledgment.

## 24. Hospitality documents

Prove:

- reservation confirmation;
- optional guest registration card;
- open-folio statement without checkout;
- hotel checkout receipt;
- housekeeping list;
- maintenance work order.

## 25. KOT/BOT

- service-area route;
- KDS + printer coexistence;
- printer failure does not unfire order;
- reprint marked;
- modifier/note wrapping;
- ticket ordering under burst load.

## 26. V2 salvage acceptance

Before retiring V2 branch, every V2-only business rule must be mapped to:

- ported test;
- new backend implementation;
- intentional discard rationale; or
- archived historical evidence.

