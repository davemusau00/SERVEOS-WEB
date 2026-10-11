# SERVEOS POS 2.0 Offline Cashier Sprint - Implementation Contract

**Source Repository:** `davemusau00/SERVEOS-WEB`  
**Base Branch:** `reset/vps-platform` at `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`  
**Feature Branch:** `feat/pos2-cashier-tickets-offline`  
**Reference CI:** https://github.com/davemusau00/SERVEOS-WEB/actions/runs/38137610469 (all jobs successful at audited SHA)  
**Target Current Live Installation:** `serveos-next` at `/opt/serveos-next`, PWA `/var/www/serveos-next/current`, API `127.0.0.1:3102`, PostgreSQL volume `serveos_next_data`  

---

## Sprint 0: Make Existing POS Trustworthy (P0) - LOCAL IMPLEMENTATION; ACCEPTANCE OPEN

### Historical supplied baseline (fresh verification required)
- **Git SHA:** `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`
- **API Image Digest:** TBD (to be captured at G0)
- **PWA Manifest SHA256:** TBD (to be captured at G0)
- **Last shared Production Migration Head:** 72 (072_change_feed_record_monotonicity.sql)
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
- **Feature Flags:** Source defaults OFF; live values NOT VERIFIED (pos2.simpleCashier=false, pos2.waiterTickets=false, pos2.offlineCash=false, pos2.localKitchenTickets=false, pos2.offlineAuthV2=false)
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
- `apps/api/Dockerfile` - repository-root build context, `/app/apps/api` module layout and readable `/app/contracts` (corrected below).

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



## Development checkpoint: 2026-10-12

This checkpoint supersedes the initial planning statuses above. Neither the historical CI URL nor local development tests establish production acceptance. The canonical guide and `Performance.md` remain the requirements; local implementation does not authorize any VPS operation.

| Requirement | Current source behavior | Local evidence / remaining acceptance |
|---|---|---|
| Instant new-sale product taps | In-memory basket updates immediately; server order creation is deferred to Pay. Rejected creation can return to its retained draft. Existing held-order amendments retain server revision checks. | `pos2-cashier.spec.ts`: 73 products, two taps, zero commands before Pay. Barcode adds without a command, and Pay remains visible at 1366x768 and 1024x768; operator acceptance remains open. |
| Payment truth and independent recovery | Confirmation requires original payment evidence plus consistent order projection. Same IDs survive timeout; failed dependencies do not freeze independent aggregates. | Root payment tests and storage replay scenario. Current live 900-KES diagnostic not inspected. |
| Waiter approval | Additive ticket commands, device authorization, revision checks, transactional existing fire/stock handlers and preparation job deduplication. | Real PostgreSQL ticket approval test; full RBAC/operator acceptance still required. |
| Universal thermal rendering | Explicit 80-mm profiles, fail-closed unknown types, 72-mm content, stacked documents, pre-footer QR and concise displayed references. New document numbers are allocated in PostgreSQL; historical snapshots remain intact. | Thermal browser fixtures cover 21 types with 1/15/100 rows, including generated PDF MediaBox width checks at 80 mm and a measured-height print rule. Printer model, physical paper, QR scanning, continuous roll and fiscal evidence remain OPEN. |
| Single-terminal local cash | Signed V2 shift capability, encrypted PIN identity, device-scoped atomic sale/cash/stock/slip/outbox/sequence transaction. Cash remains provisional until confirmed projection is pulled. | Atomic 100-sale ledger/replay fixture; three BAR sales with API unreachable and three PIN-protected reloads pass. Three complete browser-process restarts, continued offline selling, concurrent-tab stale-balance rejection and persistent stop protection also pass. |
| Replay and conflict evidence | `pos.offlineSale.commitV2` reuses canonical pricing/inventory and existing POS/payment transactions. Price/stock conflicts retain cash evidence for reconciliation; retries do not reprint. | PostgreSQL 100-sale/five-replay scenario passes: one payment and preparation ticket per sale, with retained price-conflict evidence. Legacy `order.offlineCashSale` remains supported with its original grant policy. |
| Shift safety | Local creation can be frozen under the device lock. `pos.offlineCapability.finish` requires the complete confirmed shift ledger. Till close rejects outstanding capabilities, including expired ones, and cash reconciliation exceptions. | Current integration scenario includes blocked close, undrained finish and a fully reconciled close. The complete PostgreSQL scenario passes these safeguards; production/operator acceptance remains open. |
| Browser tiers | Feature detection, static readable fallback, capability-gated offline authorization and optional legacy build. SW activation retains its safe-boundary protocol. | Legacy validation build succeeds; all 95 generated modern/legacy assets appear in its precache. Exact older-browser versions are NOT advertised or accepted. |
| API packaging and schema | Root-context image includes module imports and readable nonroot contracts. Readiness validates names/checksums. Candidate migrations are additive 073-076. | Local image import graph/nonroot check PASS. Production restore, migration rehearsal and compatibility/cutover approvals remain OPEN. |

### Local validation boundary

- Source checks: lint, contracts (131 commands), architecture, docs and UI audit have passed locally; all 44 root tests pass. Rerun relevant checks after further changes.
- The full PostgreSQL run on the disk-backed disposable local database encountered WAL-sync stalls and integration timeouts. It was stopped and rerun against a separate **disposable PostgreSQL 16** instance using temporary memory-backed data storage. This is transaction/integration testing, not backup/restore or production disk-durability evidence.
- Local Docker packaging check: `API_IMPORT_GRAPH=PASS CONTRACTS_READABLE=PASS NONROOT=PASS`; candidate image digest is not a deployed artifact.
- Production gates G0-G8, hosted CI/code review, actual printer acceptance, fiscal approval and real-device browser acceptance remain OPEN. No source flag is enabled by default and no production migration or deployment was performed.

- Recovery exports now gather the selected original sale and its related cash, stock, ticket, outbox, shift, reconciliation and print evidence in one read-only transaction. Signed capabilities are excluded, actor ownership is checked, and files are explicitly evidence-only. The 100-sale browser fixture verifies related record counts and absence of the signed capability.

- Full local API suite: `npm run test:api` passes all 43 tests, with zero skips, against disposable PostgreSQL 16. Full built-PWA suite: `npm run test:browser:production` passes 43 tests with one intentional duplicate mobile browser-process-restart skip; the enrolled desktop restart scenario passes. No physical printer delivery or real older-browser claim follows from these results.

- Local printing recovery now retains an append-only attempt/state history alongside each current claim. Automatic duplicate requests are refused; operator-checked marked reprints remain available after a restart. The cash-ledger browser scenario verifies two attempts, four history events and cleared delivery uncertainty without a new sale or stock debit. This records software behavior, not physical printing acceptance.

- Real API browser suite: `npm run test:browser:api` passes all six desktop/mobile scenarios after correcting historical developer-footer and A4 assertions to the consolidated thermal policy. Sale, printer uncertainty/retry, refund, close-day, hotel and persisted API projection flows pass. Print transport is instrumented; physical delivery is not accepted.

### Remaining source and release work

The full guide is not complete. Remaining source acceptance includes a complete manager cash-exception resolution workflow, local shift counting and reconciled device/staff handoff, presentation of provisional stock balances across inventory screens, a historical API binary against the expanded schema, a full waiting-worker upgrade/rollback with outstanding cash, and an isolated deployment archive/symlink rollback rehearsal. These are separate from the completed local regression checks and must not be inferred from their results.

External gates remain open: hosted CI/review, fresh live baseline and unresolved-command review, two independently restorable backup generations, isolated VPS staging, approved migration/canary/cutover, actual printer model/driver/continuous paper/QR tests, fiscal approval and exact real-device browser inventory. Current production flags, schema and release are unverified; no production action was taken.

## Authorized update preparation: 2026-10-12

The user explicitly authorized an API/PWA update with POS2 activation after fixing manager reconciliation, shift/handoff and pending-ledger upgrade/rollback. Physical printer acceptance was explicitly excluded from this deployment gate; it remains unverified and is not recorded as passed. Financial authorization, cash evidence, backups and scoped deployment safeguards remain binding.

- Additive migration 077 adds reconciliation revision/audit fields, a unique server-sale association and an append-only checkout-handoff record. Prior migrations remain unchanged.
- Manager recovery links original received-cash evidence only to an already-issued, fully cash-paid matching sale in the original shift, with identical items/prices/taxes and physical stock consumption. It rejects external tenders, wrong amounts, refunds and duplicate associations. It does not create a second payment or stock debit, or silently reprice the original snapshot. A genuinely mismatched transaction remains an exception requiring an explicit legitimate correction through existing authorized workflows.
- Handoff requires a frozen original ledger, every original ID confirmed, all old capabilities ended, all shifts closed/reviewed and no unknown server command. The old terminal stays locally frozen; the receiving enrolled device must open and provision its own shift.
- Local cash counts store the physical counted amount, original IDs, pending IDs and an immutable provisional count snapshot. Counting does not finalize the server shift.
- Actual generated service-worker upgrade/rollback exercises the shared application safe-boundary check, retains the original cash ID/amount and both caches, and refuses activation while cash remains pending.
- Fresh read-only live baseline: `serveos-next` serves PWA `7a3462292dc3`, API 3102 is healthy with 72 migrations; Countryside has 73 products and 72 stock masters. The server has no RECEIVED/PROCESSING commands; two terminal conflicts are KDS actions. The open Admin shift identifies device `67376099-9ac8-4c80-9cdd-4ec69c3ad4a2` as the checkout candidate. Unrelated HTTPS origins return 200/307/307 with valid TLS.
- Two consistent backups of the new live database are retained under restricted `/opt/serveos-next/checkpoints/pos2-20261012-update`. Both have encrypted off-VPS Windows-user-protected copies and have been decrypted/restored into isolated local PostgreSQL databases. Each restore contains 72 migrations, 73 products, 72 stock masters and one 90,000-minor-unit payment. Backup storage and restored data are private and are not repository artifacts.

Preparation status at that checkpoint: PREPARING. The verified update below supersedes that historical deployment status.

## Verified production update: 2026-10-12

Deployment status: DEPLOYED at `ce59c2b2caeb5aeab5734b605a43086799812801`. See [the complete release evidence](../releases/pos2-20261012-update.md) for artifacts, test boundaries, backups, activation and recovery.

- Manager matching/reconciliation, local provisional shift counts, reconciled checkout handoff and pending-ledger worker upgrade/rollback are implemented and tested. Genuine mismatches remain explicit financial exceptions; no invented settlement is accepted.
- All five hosted CI jobs passed. The canonical candidate passed 43 isolated VPS API tests, staged browser login/stock/cash workflows and real signed offline PIN/reload/reconnect reconciliation. Old/new API binaries replayed the original payment against a migrated restore without money/stock changes.
- Production migrations 073–077 are applied. API 3103 and PWA `ce59c2b2caeb` are live; API 3102 and PWA `7a3462292dc3` are retained. All 53 published PWA assets matched the manifest over HTTPS; the fresh browser login and worker smoke passed.
- All five cohorts are enabled for four existing staff/device pairs, subject to RBAC, with one authoritative checkout binding. Its earlier shift is now closed. The operator must open/provision a new owned shift and kiosk PIN before offline selling; deployment issued no live lease or example payment.
- Three encrypted off-VPS backup generations are restore-verified. Existing KES 900 payment/order totals, catalogue counts and stock fingerprint are unchanged; server unresolved count is zero. Protected origins remain 200/307/307 with valid TLS.
- Physical printing was waived as a deployment gate by the user and remains unverified. Fiscal approval, exact older-browser support, full operator acceptance and provisional inventory presentation across all screens remain open. The entire guide is not declared complete.
- Retain the V2 decoder for outstanding local cash even when creation/UI is disabled. Old API schema compatibility alone does not make a rollback to its legacy protocol safe for V2 queues.
