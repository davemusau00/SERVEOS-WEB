# PR-00 Evidence Pack: Release-Blocking Defect Resolution

**Branch:** `reset/vps-platform`
**Baseline:** `9ed56dd` (spec baseline) / `724bbd4` (sprint start)
**Result commits:** `ef171ad`, `391bb9a` (diagnostic instrumentation, reverted), `7891acb` (final fix)
**Date:** 10 October 2026
**Status:** BROWSER VERIFIED — full real-API browser suite green on desktop and mobile

---

## DEFECT-001: Sales receipt settlement-status inconsistency — RESOLVED

### Root cause
`apps/api/src/payment-commands.mjs` built the immutable sales-receipt snapshot
without a `balanceMinor` field, while
`src/runtime/web/BusinessDocumentRenderer.tsx` (`paymentStatus()`) prints
"Settled when issued" only when `snapshot.balanceMinor === 0`. Every issued
receipt therefore rendered "Settlement balance not recorded in this document…".

### Fix (DEV-FIX-001A/001B)
- The completed-sale receipt snapshot now carries the authoritative settlement
  fact: `balanceMinor = grandTotalMinor − amountPaidMinor − amountCreditedMinor − roomChargeMinor`.
- A hard reconciliation guard rejects issuance unless
  `paid + credited + roomCharged === grandTotalMinor` and the balance is a safe
  non-negative integer (`PAYMENT_RECONCILIATION_FAILED`). Because the receipt is
  only issued for completed orders, a genuine completed sale persists
  `balanceMinor: 0`; partial payments can never be receipted as settled.
- The zero-value sale receipt (`pos-commands.mjs` `zeroReceipt`) now also
  persists `balanceMinor: 0` alongside `noPaymentRequired: true`.
- The snapshot hash is computed from the final complete snapshot
  (`documentHash(receiptSnapshot)`), preserving hash/versioning rules.
  Already-issued documents were not touched; reprints remain immutable.
- No renderer change was needed: `paymentStatus()` already renders
  "Settled when issued" for `balanceMinor === 0` and
  "Balance due when issued: …" for a genuine partial balance. No balance was
  manufactured in the renderer.

### Evidence
- Browser assertion `tests/browser/api-postgres-setup.spec.ts:190`
  ("Payment status: Settled when issued; tender recorded KES 100.00.") passes
  unmodified on desktop and mobile.
- All 37 API tests pass, including the PostgreSQL settlement/receipt-replay
  suite which re-issues and verifies receipt snapshots and hashes.
---

## DEFECT-002: Hotel checkout acceptance failure — RESOLVED

### Root cause (DEV-FIX-002A diagnostics)
Instrumented run captured command name, status, and change-feed contents. The
failure was neither a missing confirmation message nor a checkout-domain
blocker:

1. `roomReservation.walkIn` posts the first booked accommodation period and
   emits `folioEntries` (v1) and `folios` (v2) into the change feed (cursor 16).
2. `folio.postAccommodation` hits the idempotent `folioEntry` path, which
   returns the *existing* entry and the unchanged folio — and the kernel
   re-emitted them into the change feed (cursor 17) with the **same versions**.
3. The client projection (`BusinessStore.applyPage`) enforces strictly
   increasing per-record versions and threw `Non-increasing record version`,
   wedging the change cursor permanently. Every later sync failed, local
   projections froze (folio stuck at v2 / balance KES 2,500), and checkout
   pinned stale expected versions (`folios:2` vs server `3`) → 409
   `VERSION_CONFLICT` rendered as an `alert`, never a `status`.
4. Earlier commands still returned `CONFIRMED` to the operator (the command
   itself had committed), masking the broken projection — precisely the
   "confirmed command but stale projection" class the spec describes.

### Fix (DEV-FIX-002B/C/D)
- **API (authoritative):** new migration
  `apps/api/migrations/072_change_feed_record_monotonicity.sql` adds
  `business_change_records`, and `PostgresStore.insertChange` now filters any
  record whose version is not strictly newer than the last version emitted for
  that record. Idempotent replays no longer poison the feed; the feed now
  satisfies the client monotonicity contract by construction.
- **Client (defense in depth):** `BusinessStore.applyPage` now treats
  re-delivery of a byte-identical record (same version, identical canonical
  content) as an idempotent no-op. Version regressions and same-version
  mutations still throw, so genuine corruption remains detectable.
- No second checkout command is submitted to refresh the screen; the confirmed
  command's change page now applies and the operator receives the stable
  `status` confirmation.
- PostgreSQL verification (DEV-FIX-002C) is asserted in the test itself:
  reservation/stay `CHECKED_OUT`, folio `CLOSED`, balance `0`, accommodation
  and payment entries reconcile, cash tendered recorded.

### Evidence
- Previously failing test "hotel first use creates a room, checks in a guest
  and settles the first stay" passes on both desktop and mobile projects.
- Re-running checkout cannot re-post: checkout is a versioned, idempotent
  command; a rejected/blocked checkout preserves reservation and folio
  (blocked-path assertions remain covered by the domain guards
  `ACCOMMODATION_NOT_POSTED`, balance/deposit checks in
  `hospitality-commands.mjs`).

---

## Tests executed

| Suite | Result |
|---|---|
| `npm run test:api` (37 tests, real PostgreSQL) | 37 pass / 0 fail |
| Real-API browser suite `playwright.api.config.ts` (desktop + mobile, 6 tests) | 6 pass / 0 fail |
| `npm run verify:fast` (lint, contracts, architecture, build, 32 unit tests) | all green |

Environment: disposable PostgreSQL 16 (Docker, port 54329), one throwaway
schema per test, `TEST_DATABASE_URL`-driven.

## Remaining limitations
- The renderer's "partially paid" and "customer account / room charge"
  distinction logic is unchanged and was already correct; dedicated browser
  scenarios for partial-payment receipts beyond the API-tested paths are part
  of PR-04 (POS) regression hardening.
- Physical-print and reporting workstreams (Phases 7–8) are untouched by this
  PR and remain NOT STARTED / IMPLEMENTED, NOT TESTED respectively.

