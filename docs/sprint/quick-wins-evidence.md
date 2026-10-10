# Quick-Win Evidence Pack: Easy-Gap Round (post PR-00)

**Branch:** `reset/vps-platform`
**Date:** 10 October 2026
**Scope:** Lowest-effort remaining gaps, prioritized as directed, each with named acceptance evidence.

---

## 1. DEV-FIX-001D: Receipt settlement regression coverage — UNIT/API VERIFIED

`apps/api/tests/pos-lifecycle.integration.test.mjs` now proves, against real PostgreSQL:

- A completed split settlement (cash + M-Pesa) issues a sales receipt whose
  snapshot carries `balanceMinor: 0`, the exact `paidMinor`, zero credit and
  room-charge, and one settlement line per recorded tender.
- A **partial payment** keeps the order `FIRED`, issues **no sales receipt**,
  and the payment acknowledgement snapshot records the true outstanding
  balance (`balanceMinor = grand − tendered`).
- Settling the remainder completes the order and issues a receipt with
  `balanceMinor: 0` and `refundedAmountMinor: 0`.
- A **zero-value sale** (fully comped fired order) issues a receipt with
  `noPaymentRequired: true`, `balanceMinor: 0`, `totalMinor: 0`, no payments.

Fixture note: the partial-payment scenario uses a STANDARD (stockless) product
so the surrounding hardcoded stock-version sequences remain untouched.

## 2. DEFECT-002 follow-up: change-feed idempotency locked in — BROWSER VERIFIED

`tests/browser/web-storage.spec.ts` adds
"change feed re-delivery of an identical record is an idempotent no-op":
- identical re-delivery does not throw and advances the cursor;
- same-version content mutation throws `Conflicting record content at the same
  version` and rolls back the page (cursor unchanged);
- version regression throws `Non-increasing record version` (cursor unchanged).

All 6 web-storage browser tests pass (desktop).

## 3. PR-01 §1.2: Command registry inventory — DOCUMENTATION VERIFIED

- `scripts/command-inventory.mjs` imports every registered API command registry
  and generates `docs/generated/command-registry.md` (operation, permission,
  alternative permissions, approval permission, offline policy, grouped by
  domain, with a total count).
- `tests/command-inventory.test.mjs` fails if any command lacks a permission
  gate or if the committed inventory drifts from the live registries.

## 4. DEV-IMPORT-002: Example first-load template — UNIT/TEMPLATE VERIFIED

- The `sellableItems` API template manifest now ships a downloadable example
  (8 rows) covering the spec's required shapes: 24-piece soda crate (TRACKED,
  24-per-package maths), single bottled beer, whisky with 45 ml shot and
  bottle pricing (SPIRIT, ml conservation), wine sold by glass, stock-only
  maize flour, stock-only cooking oil, a no-stock service, and a room-related
  service (`service_area ROOMS`).
- `importTemplates` exposes `examples`; the Import Center gained a
  "Download example template" button producing proper CSV escaping.
- `tests/import-templates.test.mjs` requires all stock_mode shapes to be
  present and re-validates the example through `validateImportCsv` — every row
  must be structurally VALID.

---

## Tests executed this round

| Suite | Result |
|---|---|
| `npm run test:api` (37 tests, real PostgreSQL) | 37 pass / 0 fail |
| `npm test` (35 unit tests incl. 4 new) | 35 pass / 0 fail |
| `npm run verify:fast` (lint, contracts, architecture, build) | all green |
| web-storage browser spec (desktop, 6 tests) | 6 pass / 0 fail |

## Status classifications

| Item | Status |
|---|---|
| DEV-FIX-001D settlement matrix (API level) | UNIT/API VERIFIED (browser receipt-flow scenarios belong to PR-04) |
| Change-feed idempotency | BROWSER VERIFIED |
| Command registry inventory | DOCUMENTATION VERIFIED (per-command input contracts remain future work) |
| sellableItems example template | UNIT/TEMPLATE VERIFIED (a live 100-row import remains PR-02's gate) |