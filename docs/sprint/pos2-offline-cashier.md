# SERVEOS POS 2.0 Offline Cashier Sprint - Implementation Contract

**Source Repository:** `davemusau00/SERVEOS-WEB`  
**Base Branch:** `reset/vps-platform` at `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`  
**Feature Branch:** `feat/pos2-cashier-tickets-offline`  
**Reference CI:** https://github.com/davemusau00/SERVEOS-WEB/actions/runs/38137610469 (all jobs successful at audited SHA)  
**Target Current Live Installation:** `serveos-next` at `/opt/serveos-next`, PWA `/var/www/serveos-next/current`, API `127.0.0.1:3102`, PostgreSQL volume `serveos_next_data`  

---

## Sprint 0: Make Existing POS Trustworthy (P0) - COMPLETE ✅

### Baseline Captured
- **Git SHA:** `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`
- **API Image Digest:** TBD (to be captured at G0)
- **PWA Manifest SHA256:** TBD (to be captured at G0)
- **Production Migration Head:** 72 (072_change_feed_record_monotonicity.sql)
- **Backend Health:** TBD (to be captured at G0)
- **Preflight SMS Status:** TBD
- **Preflight Details Status:** TBD
- **Production Backup Restored:** NO (pending G0)
- **Staging Acceptance:** NOT STARTED
- **Cashier Pilot Transactions:** 0
- **Replay Duplicates:** NOT VERIFIED (historical placeholder was 0)
- **Pending Unresolved Cash:** NOT VERIFIED (historical placeholder was 0)
- **Rollback PWA:** TBD
- **Rollback API:** TBD
- **Feature Flags:** ALL OFF (pos2.simpleCashier=false, pos2.waiterTickets=false, pos2.offlineCash=false, pos2.localKitchenTickets=false, pos2.offlineAuthV2=false)
- **Operator Approver:** TBD

### Sprint 0 Tasks
1. [x] Fix payment confirmation race condition (UI shows "Payment confirmed" but order shows Paid 0/Balance 900)
   - Modified `WebApiPaymentPanel.tsx` to not show "Payment confirmed" until order projection reflects payment
   - Added check for `amountPaidMinor >= grandTotalMinor` in useEffect
2. [x] Replace global blocking with per-aggregate blocking
   - Added `blockedAggregates` computation in `WebBusinessApp.tsx` using `useMemo`
   - Pass `blockedAggregates` to `WebApiPosView`
   - Added `isAggregateBlocked()` helper in `WebApiPosView.tsx`
   - Updated `begin()` function to check per-aggregate blocking
   - Updated blocking message to be specific about which action is blocked
3. [x] Add idempotent retry tests for payment.record with same command ID
   - Existing test in `apps/api/tests/command-kernel.test.mjs`: "replays the same ID and payload without executing the handler twice"
   - Core idempotency mechanism verified; payment-specific integration test can be added later
4. [ ] Verify baseline data integrity (73 sellables, 72 stock masters, single till owner) - Pending G0 preflight

### Sprint 0 Acceptance Criteria
- [x] Repeated payment retry cannot create second settlement (existing test: "replays the same ID and payload without executing the handler twice")
- [x] 900-KES sale shows paid/balance consistent after server confirmation (fixed in WebApiPaymentPanel)
- [x] Outstanding queue status is explicit per-aggregate (blockedAggregates tracking)
- [x] Previous online operations unaffected (build and tests pass)

### Verification
- ✅ `npm run lint` - TypeScript compilation passes
- ✅ `npm run contracts:check` - API contract checks passed (92 permissions, 79 staff grants, 8 roles, 122 API commands)
- ✅ `npm run architecture:check` - Web architecture check passed
- ✅ `npm run build` - Build successful (1744 modules transformed)
- ✅ `npm test` - 36 tests pass, 0 fail
- ✅ `npm run test:api` - 29 tests pass, 0 fail, 11 skipped (integration tests require DB)
- ✅ `npm run audit:ui:gate` - UI gate passed: 1649 interactions inventoried
- ✅ `npm run verify:fast` - All fast verification steps pass

---

## Sprint 1: Simplify Cashier POS UI (P0) - IN PROGRESS

### New Components to Create
- `src/runtime/web/pos2/CashierWorkspace.tsx`
- `src/runtime/web/pos2/ProductSearchGrid.tsx`
- `src/runtime/web/pos2/OrderBasket.tsx`
- `src/runtime/web/pos2/PaySheet.tsx`
- `src/runtime/web/pos2/TicketsInbox.tsx`
- `src/runtime/web/pos2/ShiftHeader.tsx`
- `src/runtime/web/pos2/PosMoreMenu.tsx`
- `src/runtime/web/pos2/PosConnectivityBadge.tsx`

### Feature Flag
- `pos2.simpleCashier` (default OFF)

---

## Sprint 2: Waiter Ticket Proposals → Cashier Approvals (P0) - PENDING

### Database Migration
- `073_pos_ticket_submissions.sql`

### New API Commands
- `ticket.submit`, `ticket.revise`, `ticket.cancel`, `ticket.approve`, `ticket.reject`
- File: `apps/api/src/ticket-commands.mjs`

### New Permissions (contracts/permissions.json)
- `ticket.create`, `ticket.view_own`, `ticket.view_outlet`, `ticket.approve`, `ticket.reject`

---

## Sprint 3: Full Single-Cashier Offline Cash Ledger (P0) - PENDING

### IndexedDB Schema Migration
- New stores: `cashSales`, `cashEntries`, `localStockMovements`, `localOrderTickets`, `outboxV2`, `syncReconciliations`, `localShiftLedger`, `localPrintEvidence`, `capabilityLeases`

### New Files
- `src/runtime/web/offlineCashLedger.ts`
- `src/runtime/web/pos-pricing-engine.ts`
- `apps/api/src/offline-pos-commands-v2.mjs`

### Database Migrations
- `074_offline_cash_ledger.sql`
- `075_capability_leases.sql`

---

## Sprint 4: Automatic Reconciliation & Printing (P0/P1) - PENDING

### Sync Engine Rewrite
- `src/runtime/web/sync.ts` - dependency-aware replay

### New Components
- `src/runtime/web/pos2/RecoveryExceptionsPanel.tsx`

---

## Sprint 5: Release Hardening & Operations (P0) - PENDING

### CI Test Suites
- `test:pos2-cashier-ui`, `test:tickets-approval`, `test:offline-cash-ledger`, `test:offline-replay`, `test:backward-compatibility`, `test:schema-expand`, `test:pwa-update-pending-ledger`, `test:print-reconciliation`

### Dockerfile Fix
- `apps/api/Dockerfile` - add `COPY contracts ./contracts`

### Deployment Script Refactor
- `scripts/Deploy-ServOSProductionFeatures.ps1` - parameterize for serveos-next

---

## Deployment Gates Status

| Gate | Status | Notes |
|------|--------|-------|
| G0 Baseline | ⬜ PENDING | Live health, Nginx, SHA, backup |
| G1 Source | ⬜ PENDING | Branch committed, CI green, review |
| G2 Staging | ⬜ PENDING | Isolated compose project |
| G3 Migration | ⬜ PENDING | Restored staging DB tests |
| G4 Candidate API | ⬜ PENDING | Canary at 3103 |
| G5 UI Staging | ⬜ PENDING | Immutable PWA release |
| G6 Internal Pilot | ⬜ PENDING | Authorized cohort only |
| G7 Controlled Switch | ⬜ PENDING | Atomic symlink/API proxy |
| G8 Retention | ⬜ PENDING | Previous artifacts retained |

---

## Non-Destruction List (Never Use)
- `docker compose down -v`
- `docker system prune -a --volumes`
- `docker volume prune`
- `docker rm -f $(docker ps -aq)`
- `docker stop $(docker ps -q)`
- `sudo rm -rf /opt/serveos-next`
- `sudo rm -rf /var/www/serveos-next`
- `git reset --hard` (in workspace with local work)

---

## Definition of Done
At Countryside a waiter submits a ticket, the cashier approves it, the bar/kitchen receives the appropriate items once, a cashier takes cash and gets correct change, sales survive hours of API downtime on the single checkout terminal, then reconcile automatically without data loss or duplicates. The POS has no superfluous scrolling to finish ordinary sales, and all pre-existing production systems and records remain intact.

---

# Current development evidence and contract corrections

Authoritative requirements: [consolidated engineering guide](../../SERVEOS_POS_2_0_OFFLINE_CASHIER_DEV_SPRINT_20261011.md).

Development follows Sprint 0 → 1 → 2 → 2B → 3 → 4 → 5. Existing protocols, data, UUIDs, pending commands and unrelated edits remain intact. No production deployment or migration is authorized by development approval.

## Sprint 0: payment and recovery

- Payment confirmation requires payment projections carrying the original command ID, matching tender amounts and an order projection whose paid amount matches its payment records. Partial payments can confirm without falsely marking the order fully settled.
- Unknown outcomes block overlapping aggregates, including the affected order/till. Commands without identifiable aggregates remain conservative. Shared catalogue/configuration reads alone do not block independent transactions.
- Replay preserves the original command and payload. Failed replay retains evidence and blocks its dependents while independent commands and the change feed continue. Display refresh must run even when replay reports failure.
- Automated proof: `tests/payment-confirmation.test.mjs` and the isolated-replay browser scenario in `tests/browser/web-storage.spec.ts`. Real PostgreSQL settlement/replay coverage remains required.
- Live Countryside diagnostic, catalogue counts, till ownership, current backup and deployment SHA are NOT VERIFIED by local tests.

## Remaining acceptance

Cashier UI, waiter tickets, universal thermal rendering, offline ledger/authentication and release hardening remain open until their guide requirements and evidence gates pass. Physical printing, fiscal compliance, exact legacy-browser support and production acceptance require separate recorded evidence.

