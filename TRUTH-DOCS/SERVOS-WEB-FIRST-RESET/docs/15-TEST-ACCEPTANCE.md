# 15 — Test and Acceptance Master Matrix

## 1. Philosophy

ServOS passes when real business journeys survive realistic failure. A green unit suite is necessary but not sufficient.

The web-first product must prove application behavior, browser persistence, API authority, business invariants, offline recovery, physical printing and backup restoration.

## 2. Test layers

- **Unit:** calculations and state transitions.
- **Domain integration:** real PostgreSQL transactions.
- **Contract:** command schemas, permissions, documents, protocol versions.
- **API:** auth, idempotency, concurrency, change feed.
- **PWA:** browser UI, service worker, IndexedDB, offline/reconnect.
- **Hardware:** scanner and XP-80T class printers.
- **Print Bridge:** localhost pairing, RAW/TCP transport, uncertainty handling.
- **Migration:** legacy SQLite/Supabase/V2 import/reconciliation.
- **Chaos:** network loss, API restart, DB restart, browser kill, power/reboot simulation.
- **Restore:** server and local recovery evidence.

During refactor retain the existing Native/Rust suite until equivalent tests exist in the new stack.

## 3. Baseline gate

The known merged reset baseline passes 216 JavaScript/source tests and 106 native Rust/domain tests. New work must not casually weaken invariants those tests represent.

## 4. PWA installation/startup

Prove:

- first online load;
- install to Windows desktop/start menu;
- standalone display mode;
- reload;
- browser/machine restart;
- cached offline launch;
- safe service-worker update;
- no forced update during payment/count/check-in;
- storage-persistence status shown to admin;
- corrupted/old IndexedDB migration fails safely and recoverably.

## 5. POS Tier A

- open assigned till;
- barcode/search;
- add/remove quantity/modifier/portion;
- table/tab;
- cash;
- manual M-Pesa evidence;
- card;
- split tender;
- discount approval;
- comp vs void;
- refund;
- immutable receipt;
- reprint;
- close till;
- variance workflow.

## 6. Offline POS

Scenario:

```text
online bootstrap
→ disable internet
→ sell
→ cash payment
→ document created locally
→ close PWA
→ reopen still offline
→ sale remains
→ print/reprint
→ reconnect
→ same command ID confirmed once
→ server and local projection converge
```

Also test grant expiry, disallowed command, lost response, browser crash during sync, duplicate click and two tabs.

## 7. Inventory

- simple packaged item;
- spirit sealed/open;
- opening stock;
- receive packages;
- weighted cost;
- selected count/full-location count;
- barcode scan;
- transfer;
- waste;
- corrections;
- reversal rules;
- recipe/batch consumption;
- no negative stock creation;
- archive dependencies;
- offline count draft/recovery.

## 8. Procurement

- quick supplier;
- draft PO;
- submit/approve/issue policy;
- package quantities;
- full/partial receive;
- rejected goods;
- outstanding remainder;
- over-receipt policy;
- GRN;
- supplier return;
- invoice match;
- duplicate invoice reference;
- supplier payment;
- duplicate payment idempotency;
- cancel remaining PO;
- duplicate/repeat PO.

## 9. Hospitality

Simple flow:

```text
available room
→ Check In
→ inline guest snapshot
→ pay now or later
→ stay
→ Pay & Check Out / Check Out
```

No persistent customer account or deposit required unless policy requires it.

Advanced tests:

- reservation;
- customer profile link;
- deposit;
- folio charges;
- extension;
- room move;
- housekeeping transition;
- maintenance block;
- no-show/cancel;
- double-book prevention.

Offline test initially uses a single reception device holding room authority lease.

## 10. API protocol

- valid command;
- validation failure;
- permission denial;
- stale version;
- same ID/same payload replay;
- same ID/different payload mismatch;
- response lost after commit;
- status lookup;
- concurrent conflicting commands;
- ordered change cursor;
- repeated change batch;
- bootstrap verification;
- unsupported protocol/client update requirement.

## 11. Browser synchronization

- one sync leader across tabs;
- pending commands persist after reload;
- `OUTCOME_UNKNOWN` resolution;
- projection update and cursor commit are atomic;
- conflict does not advance local state falsely;
- revoked device blocks future authority;
- cleared session does not silently erase unresolved command evidence;
- local reset blocked or explicitly confirmed when pending work exists.

## 12. Receipt / QR

- logo top;
- QR PNG only;
- same image pipeline for logo and QR;
- exact text `Scan to Pay via One app`;
- QR prints below text;
- printed QR scans;
- no cutoff;
- historical receipt unchanged after settings update;
- browser print version;
- bridge ESC/POS version;
- 5 consecutive receipts;
- long receipt;
- short receipt.

## 13. Business-document printing

Physical XP-80T tests:

- PO 1 line / 20+ lines;
- PO long names;
- revision/reprint marking;
- GRN partial/rejected;
- supplier return;
- stock count sheet;
- variance report;
- cash-up/till close;
- customer credit statement;
- guest folio statement;
- housekeeping/work order;
- KOT/BOT;
- separate printer roles;
- USB and LAN where supported.

## 14. Print Bridge failure tests

- bridge absent → browser print fallback;
- bridge version incompatible;
- bridge restart;
- Windows restart;
- printer offline;
- cable disconnect during write;
- `DELIVERY_UNCERTAIN` requires explicit duplicate-risk retry;
- same job ID not printed twice automatically;
- malicious/oversized payload rejected;
- request from wrong origin rejected;
- offline signed local job accepted on paired device.

## 15. Responsive viewports

Every Tier-A operator flow at:

- 1024×600;
- 1280×720;
- 1280×800;
- 1366×768;
- 1920×1080;
- 800×1280;
- 390×844.

Assert primary action visibility, internal modal scrolling, no accidental horizontal page scroll, touch targets, keyboard efficiency, scanner safety and soft-keyboard survival.

## 16. Performance

Measure on modest POS hardware:

- PWA cold/warm launch;
- initial bootstrap;
- POS search latency;
- item add/cart update;
- IndexedDB transaction latency;
- change-feed catch-up;
- large stock count;
- front desk board;
- API p50/p95;
- database slow queries;
- service-worker update download size.

The current >1 MB main JS chunk is a known optimization target.

## 17. Security

- cross-business isolation;
- explicit CORS origin;
- CSP;
- revoked/expired session/device;
- one-use approvals;
- rate limits;
- malicious file/CSV input;
- no secrets in logs/PWA bundle;
- DB not public;
- Print Bridge loopback/origin/signature enforcement;
- device private key non-exportability where supported.

## 18. Migration

- config-only business;
- full history;
- stock/value controls;
- open till/tab/folio;
- outstanding credit/AP;
- document numbering;
- unsupported source data blocks visibly;
- repeat import is idempotent;
- old writers fenced after cutover.

## 19. Disaster recovery

- restore PostgreSQL to isolated environment;
- boot matching API;
- recover frontend release;
- enroll replacement PWA device;
- bootstrap projection;
- import local recovery bundle containing unresolved commands;
- resolve each command ID;
- resume without duplicate financial effects.

## 20. Pilot-day release gate

A real business completes a full operating day including at least one controlled network outage and one printer interruption with **no developer database intervention**.

Only then can ServOS 1.0 be called deployable.
