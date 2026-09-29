# Completion ledger

This ledger distinguishes source implementation from executed verification.

| Slice | Backend | Installed UI | Docs | Executed evidence here | Acceptance status |
|---|---|---|---|---|---|
| Floorplan + table.ready | implemented | implemented | updated | source inspection; native suite pending | source implemented |
| Native capability RBAC | implemented | permission-driven shell | RBAC guide | docs/source checks pending final run | source implemented |
| Manager single-use approval | implemented | approval dialog | RBAC guide | native execution pending | source implemented |
| Intake → enrollment → setup → Go Live | implemented | implemented | onboarding + guide | native execution pending | source implemented |
| Catalog/portions/modifiers/recipes/pricing | implemented | implemented | user guide | native/frontend execution pending | source implemented |
| Bar POS/KDS/table lifecycle | implemented | implemented | user guide | native/frontend execution pending | source implemented |
| Payments/M-Pesa/split/refund | implemented | implemented | user guide | native execution pending | source implemented |
| Inventory receipt/count/transfer/waste | implemented | implemented | user guide | native execution pending | source implemented |
| Till/cash movements/close day | implemented | implemented | user guide | native execution pending | source implemented |
| Offline Help Center | generated from Markdown | implemented | 40 articles | generator/docs checks executable with Node | locally generatable |
| Task-first Home, Quick Add actions, product/stock master simplification, and guidance foundation | native-only | Home, grouped permission-filtered navigation, manage-checked Quick Add actions, task-first product and stock forms, Storage Places naming, catalog/inventory empty states, common native error translation, route-aware guide steps, per-guide progress labels, Help tour launcher, shell orientation tour | coordination plan + source specs | 79 Node tests, lint, Rust suite (59 tests), atomic Rust regressions, desktop/mobile variant and atomic stock setup browser cases, docs and diff checks passed; see [test evidence](TEST_EVIDENCE.md) | partial foundation; receiving, room/property workflows, onboarding and guides remain queued |
| Web/native parity inventory and platform-intake/Help/tour execution plan | documented | parity matrix, web lifecycle definition, intake/setup/readiness scope, shared Help and guide contract, phased acceptance plan | [Web parity execution plan](WEB_PARITY_EXECUTION_PLAN.md) | documentation artifact only; implementation and browser acceptance remain open | planned |
| Phase 2: location-first Stock Count | native SQLite command | place-first full-count, variance review, one confirmed commit, audited stock adjustments | [delivery plan](UX_GUIDANCE_DELIVERY_PLAN.md) | focused Rust atomicity/auth/stale-count tests; desktop/mobile browser mock confirms no draft writes and one command on confirmation; see [test evidence](TEST_EVIDENCE.md) | implemented and locally verified; terminal/device acceptance remains open |
| Phase 3: continuous scanner count session | native SQLite draft store + inventory.countLocation | staff-scoped resumable scans, scan-unit increments, unknown-code handling, review before commit | [delivery plan](UX_GUIDANCE_DELIVERY_PLAN.md) | focused native persistence/isolation tests and desktop/mobile browser mock; see [test evidence](TEST_EVIDENCE.md) | implemented and locally verified; physical scanner and packaged-terminal acceptance remain open |
| CI/deploy scripts | source implemented | n/a | runbook | syntax/source checks required | source implemented |

When a target-machine check passes, add the commit, OS/device, exact command, date and result to [TEST_EVIDENCE.md](TEST_EVIDENCE.md).
# Expansion ledger — 2026-09-26

| Expansion slice | Source | Evidence / remaining work |
|---|---|---|
| Documentation | written before code | contracts, workflows, audit, receipts, migration/runbook, acceptance; docs checks passed |
| Native receipt documents/layout/history | implemented | payment-transaction capture, cash/change, immutable migration, history/reprint, both copies/footer, print portal; native/browser tests passed; physical output pending |
| Live business settings | identity, tax/message, payment methods and printer/till editors implemented | atomic identity/version and printer validation tested; broader settings remain pending |
| Vercel provisioning | config, authenticated production entry, explicit demo flag | no Vercel deployment performed; web remains existing remote manager |
| Cloud v2 protocol | staged command dispatcher and permission-filtered feed | disposable PostgreSQL tests passed for protocol and domain handlers; production disabled |
| Allocations | private stock/interval/custody primitives | disposable tests passed; signed grants, issuance/handover UI and domain command integration pending |
| Browser storage/sync | staged IndexedDB queue, pull cursor/tombstones, retry and automatic worker | browser reload/rollback/lost-response tests passed; not wired to live transactional UI |
| Offline shell | build-generated service worker, opt-in registration | browser offline reload/private-response exclusion tests passed; shell only, not transactional offline rights; queue-aware cache retirement pending |
| Rooms | staged masters, reservations, housekeeping, check-in/out, room moves and paid extensions | disposable database overlap, snapshot, stay/move, paid-extension rollback and booking-race checks passed; UI and end-to-end acceptance pending |
| Folios | staged accommodation catch-up, services, deposits/application, cash/manual settlement and charge reversals | disposable database replay, revenue/tax/receivable/deposit conservation, checkout and payment-reference checks passed; cloud receipts, refunds, credit/POS transfers and UI remain pending |
| POS settlement / 11E partial | staged migrations 014–015, Web POS payment/refund and Finance close-day workspace | disposable PostgreSQL covers cash/split/manual MPesa/card settlement, replay/conflicts, partial/full refunds/reversal, over-refund, immutable journals/receipts/reports and close-day totals; desktop/mobile browser flow passes. ROOM_CHARGE, MPesa statement reconciliation, full report health/inventory/void coverage and production use remain pending |
| Staff / devices / approvals 11F partial | staged migration 016 and authenticated Staff workspace | Auth-bound profiles, canonical role permission ceilings, device listing/revocation, role/escalation and revoked-device SQL acceptance; approval expiry/action/target/initiator/replay checks; over-receipt approval consumed in procurement transaction. Auth invitation/recovery, custom permission UI, shared physical device operators, hosted validation and local token protection remain pending |
| Assets | staged lifecycle, custody history and maintenance commands | database maintenance stock/journal/payable atomicity and replay checks passed; acquisition integration, UI and end-to-end acceptance pending |
| Existing-module expansion | specification and existing desktop baseline | cloud operational integration and end-to-end acceptance pending |
| Multi-device cutover/recovery | not performed | live migration, real two-device trading and replacement-device rehearsal pending |

Baseline and executed checks are recorded in [test evidence](TEST_EVIDENCE.md). See [phase gates](EXPANSION_PLAN.md). The expansion is not complete or deployed.

## ServOS 0.2.0 Simple Operations closure

| Slice | Backend | Installed UI | RC evidence | Acceptance |
|---|---|---|---|---|
| Simple Receive Delivery | existing PO receive + atomic ad-hoc orchestration | scanner/search/review/confirm | source contract + desktop/mobile RC browser test | local verification required; physical scanner pending |
| Simple Rooms + bulk rooms | room.quickCreate | minimal room/type/rate + batch review | source/native coverage + RC browser flow | local verification required; terminal acceptance pending |
| Simple Property + Report Problem | asset.quickCreate + maintenance.report | name/location-first property and plain-language report | source/native coverage + RC browser property flow | local verification required |
| Staff Welcome + workflow guides | per-staff guidance persistence | permission-aware welcome + committed-operation guides | source guide checks + RC browser welcome flow | local verification required |
| Friendly CSV / Excel-paste import | controlled import pipeline | mapping + preview + stage | parser/source coverage + RC browser paste/stage flow | local verification required; XLSX out of scope |
| Existing-terminal 0.2.0 upgrade | additive schema 12 migration | no Intake reset | upgrade + acceptance runbooks | rehearsal and physical acceptance pending |

## Customer tabs and credit accounts

| Slice | Native authority | UI | Acceptance |
|---|---|---|---|
| Named customer tabs | order customer snapshot + assign command | POS tab/customer link | native/source gate required |
| Credit policy | customerCreditAccounts | Customer Accounts | native/source gate required |
| Credit sale | immutable customerCreditEntries + A/R journal | Charge to account | native/source/browser gate required |
| Credit settlement | CASH/M-Pesa/CARD + A/R journal | Receive Payment | native/source gate required |
| Reconciliation | immutable reconciliation + explicit discrepancies | Customer Accounts | native/source gate required |
| Close day | credit sales/collections/outstanding | Reports | native/source gate required |
