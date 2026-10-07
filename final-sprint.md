# ServOS Web-First Reset: Final Non-Stop Development Sprint

**Repository:** `davemusau00/SERVEOS-WEB`  
**Branch:** `reset/vps-platform`  
**Baseline reviewed:** `0573ec3d80557550a97073e1ef5c242973b459c3`  
**Baseline date:** 2026-10-07  
**Branch position at review:** 75 commits ahead of `main`, 0 behind  
**Document purpose:** one authoritative, execution-oriented final sprint for completing the Web/PWA + VPS API + PostgreSQL migration, closing all remaining operational gaps, proving deployment readiness, migrating live business data safely, and retiring the old business-authority paths without creating dual writers.

---

## 0. EXECUTION MANDATE

This is a **build-until-done sprint**, not a planning sprint.

The development agent must continue phase by phase without pausing for routine approval. Do not stop after one migration, one module, one passing test, or one successful local build. Keep moving until the acceptance gates in this document are satisfied.

### 0.1 Do not stop for ordinary implementation choices

When implementation details are not explicitly specified:

1. Inspect the existing repository.
2. Inspect `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET`.
3. Inspect the current operation manifest/parity ledger.
4. Inspect the legacy/native/Supabase implementation as behavioral evidence.
5. Choose the smallest architecture-consistent implementation.
6. Add tests.
7. Continue.

Do not ask the user to choose between equivalent internal implementation details.

### 0.2 Stop only when external authority is genuinely required

Pause only when one of these is unavoidable:

- A production-destructive action requires explicit approval.
- A missing external credential, DNS secret, API key, backup destination, payment credential, or SSH credential cannot be derived from repository/environment configuration.
- Physical hardware interaction is required and cannot be simulated.
- Production business data would be overwritten, deleted, or irreversibly migrated.
- A third-party account action requires the user's explicit authentication or consent.

Everything else should be resolved in code and tests.

### 0.3 Continuous engineering loop

For every slice:

```text
inspect
-> implement
-> typecheck
-> unit test
-> integration test
-> browser test where relevant
-> inspect generated evidence
-> fix failures
-> commit atomically
-> continue
```

Never carry known red CI forward into the next major domain.

### 0.4 Commit discipline

Prefer small, coherent commits:

```text
fix(api): ...
feat(pos): ...
feat(inventory): ...
test(api): ...
test(browser): ...
feat(print-bridge): ...
feat(migration): ...
docs(reset): ...
```

Each commit should leave the branch buildable whenever technically possible.

Do not combine unrelated domains into a single mega-commit.

---

# 1. CURRENT STATE AT SPRINT START

The reset is no longer architectural scaffolding. The platform core is substantially real.

Approximate state at this baseline:

| Layer | Approximate maturity |
|---|---:|
| Target architecture | 95% |
| API/platform foundation | 94% |
| PostgreSQL core | 88% |
| Auth/device/session foundation | 88% |
| Command lifecycle/idempotency | 94% |
| IndexedDB/sync/PWA kernel | 92% |
| Catalog migration | 86% |
| Inventory migration | 82% |
| API-authoritative Web workspace | 72% |
| Real API/PostgreSQL browser acceptance | implemented and passing in current API PostgreSQL CI job |
| POS migration | ~10% |
| Payments/tills | ~5% |
| Procurement | ~5% |
| Hotel/PMS | ~5% |
| Documents/printing | ~50% model, ~5% Print Bridge |
| Data migration | ~10% |
| VPS production cutover | ~15-20% |
| Business pilot | not complete |
| Tauri business-authority retirement | not started |

The current platform already includes, and must **not be reimplemented from scratch**:

- API staff authentication.
- API staff session handling.
- device enrollment challenges.
- P-256 browser device identity.
- hashed bearer tokens.
- durable command lifecycle.
- command UUID idempotency.
- payload hash reuse protection.
- expected-version validation.
- retryable infrastructure failure behavior.
- real PostgreSQL command integration tests.
- explicit handler `{ value, records[] }` result contract.
- ordered change feed.
- API change polling.
- authenticated SSE invalidation hints.
- API catalog bootstrap.
- API-only IndexedDB authority scope.
- status-first recovery for uncertain commands.
- signed bounded offline grants.
- offline catalog commands.
- immutable local business documents.
- print job states and append-only local print events.
- browser storage diagnostics.
- recovery evidence export.
- service worker update safety coordination.
- stock masters, products, locations, packages and recipes.
- opening stock.
- balance revision/version tracking.
- full and selected counts.
- stock count history.
- stock transfer.
- waste.
- reviewed stock correction.
- batch preparation.
- sealed/open bottle state.
- weighted batch costing.
- real browser -> API -> PostgreSQL acceptance test infrastructure.
- immutable PWA release packaging.
- VPS release activation/rollback scripts.
- PostgreSQL worker infrastructure.
- encrypted off-VPS backup implementation skeleton.

Preserve these foundations. Extend them.

---

# 2. NON-NEGOTIABLE ARCHITECTURAL RULES

These rules outrank convenience.

## 2.1 One shared authority

The final production authority is:

```text
ServOS PWA
    |
ServOS API
    |
PostgreSQL
```

The browser must never become a direct shared-database client.

No new browser code may write directly to Supabase/PostgreSQL.

## 2.2 No dual business writers

Do not enable PostgreSQL inventory as live authority while legacy POS is still mutating a different stock ledger.

The first production authority cutover cluster must be treated together:

```text
Catalog
+ Inventory
+ POS
+ Payments/Tills
```

Development may migrate modules incrementally, but production activation must prevent two systems from independently changing the same business truth.

## 2.3 PostgreSQL is authoritative shared truth

IndexedDB is for:

- local projections,
- durable command outbox,
- drafts,
- offline grants,
- immutable document snapshots,
- local print jobs,
- diagnostics,
- recovery evidence,
- offline UX.

IndexedDB must never become the canonical shared business database.

## 2.4 Commands are the shared mutation protocol

All shared mutations flow through command handlers.

Canonical shape remains conceptually:

```json
{
  "commandId": "uuid",
  "name": "domain.operation",
  "payload": {},
  "expectedVersions": {},
  "offlineGrantId": null
}
```

Identity and permissions come from authenticated server context.

Never trust client-supplied:

- business ID,
- staff identity,
- role,
- permissions,
- server cursor,
- server timestamp,
- audit actor.

## 2.5 Same command ID after uncertainty

If the request outcome is unknown:

```text
check /v1/commands/:id
-> terminal? consume terminal outcome
-> received/processing? wait/recheck
-> not found? submit the same immutable UUID
```

Never create a replacement UUID merely because the response was lost.

## 2.6 SSE is only a hint

SSE may tell the client that changes exist.

It must never become authoritative delivery.

Authoritative ordering remains:

```text
GET /v1/sync/changes?after=<cursor>
```

## 2.7 Domain handlers must return explicit projections

Keep the current contract:

```ts
{
  value: ...,
  records: [...]
}
```

Do not return to recursive projection inference.

Every externally observable entity changed by one command must be represented in `records[]` in the same transaction.

## 2.8 Nginx, not Caddy

Production VPS remains:

```text
Nginx
-> static PWA
-> loopback API proxy
-> Docker API/worker/Postgres
```

Do not introduce Caddy.

Do not introduce PM2 for the API.

The API should remain containerized.

## 2.9 Printing bridge has no business authority

The Print Bridge may:

- validate trusted localhost requests,
- translate canonical document jobs to printer bytes,
- write Windows RAW,
- write TCP 9100,
- report spool/delivery state.

It must not:

- own orders,
- own payments,
- mutate stock,
- run business rules,
- sync the business database.

## 2.10 Preserve legacy behavior as an oracle, not an authority

Native/Tauri/Supabase logic remains useful for:

- parity,
- business behavior,
- edge cases,
- printer logic,
- fiscal rules,
- room rules,
- procurement behavior.

Do not delete the oracle before parity is proven.

---

# 3. PHASE 0: MAKE THE CURRENT BASELINE COMPLETELY GREEN

Do this before adding POS.

At the reviewed baseline, the latest API/PostgreSQL job already proves:

- API unit/integration suite,
- real PostgreSQL migrations,
- real PWA API PostgreSQL acceptance.

Frontend, cloud base, cloud v2, and native evidence have also moved green in the current run. Browser/desktop/Windows jobs may still be finishing when this document is consumed.

## 3.1 Required same-commit green matrix

The same HEAD must pass:

```text
frontend
api-postgres
browser-preview
browser-production
cloud-protocol-base
cloud-protocol-v2
native-domain
desktop-shell
windows-printer-shell
evidence-summary
```

Do not move to POS with a known failure.

## 3.2 If a job fails

Classify first:

```text
real regression
obsolete test assumption
environment/test harness defect
intentional architecture divergence
```

Then fix the root cause.

Never weaken a test solely to make CI green.

## 3.3 Update stale tests to encode the new architecture

Examples of correct invariants:

```text
Supabase-authority offline command -> fail closed
API authority without signed grant -> fail closed
API authority with valid grant and allowed operation -> queue safely
```

CI source tests must include `api-postgres` in required evidence.

Legacy cloud-v2 tests should remain green while that implementation is retained as a parity oracle.

## 3.4 Phase exit

Do not leave Phase 0 until:

```text
one HEAD
one full CI run
all required jobs green
same-run evidence produced
```

---

# 4. PHASE 1: COMPLETE PLATFORM HARDENING

The foundational architecture is already strong. Close the remaining systemic gaps now so they do not infect POS/payments.

## 4.1 Command lifecycle

Preserve the current rule:

```text
400 deterministic validation -> REJECTED
403 deterministic permission -> REJECTED
409/version/business conflict -> CONFLICT
5xx/infrastructure failure -> unresolved, retryable with same UUID
```

Do not persist a terminal rejection for temporary infrastructure failure.

### Add/retain tests

For every command class:

- initial success.
- same UUID same payload replay.
- same UUID changed payload refusal.
- failure before transaction.
- failure inside transaction.
- rollback leaves no domain side effects.
- replay same UUID after transient failure.
- version conflict persists terminally.
- deterministic validation persists terminally.
- permission denial persists terminally where appropriate.
- command audit correctness.
- change cursor emitted once.

## 4.2 Command protocol version

Add protocol versioning if not yet authoritative:

```json
{
  "protocolVersion": 1
}
```

Reject unsupported future/old protocol versions explicitly.

Do not infer protocol from payload shape.

## 4.3 Shared contracts

Create a shared contract package or generated definitions for:

- command envelope,
- command outcome,
- command status,
- expected versions,
- change page,
- projection record,
- bootstrap manifest/page,
- offline grant,
- business document,
- print job,
- staff session projection.

Avoid hand-maintained server/client drift.

A practical target:

```text
packages/contracts
```

or a generated source path consumed by both browser and API.

## 4.4 Strict API-authority purity

When `apiAuth` is active, business operation paths must make **zero** `servos_v2_*` RPC calls.

Add browser instrumentation/test that fails when API-authority mode performs requests matching:

```text
/rest/v1/rpc/servos_v2_
```

Allow legacy RPC only in explicit legacy/Remote Manager mode until retirement.

Migrate any remaining API-mode:

- guidance persistence,
- inventory capability checks,
- setup helpers,
- task shortcuts,
- staff/profile lookups,
- lifecycle checks,

to API/IndexedDB/static capability metadata.

## 4.5 Authentication hardening

Current API auth is functional. Finish browser production security:

- short-lived access token.
- refresh-token flow.
- refresh token in Secure HttpOnly SameSite cookie.
- refresh rotation.
- hashed refresh token storage.
- refresh family/replay detection.
- logout revokes access and refresh.
- device revoke invalidates device-bound sessions.
- staff disable invalidates active sessions.
- password change invalidates old sessions as policy requires.
- session list/revoke.
- device list/revoke.
- audit for login, failed login threshold, password change, logout, device enrollment/revoke.

Do not store reusable bearer or refresh credentials in IndexedDB.

## 4.6 Bootstrap protocol

Catalog bootstrap is sufficient for the migrated slice, but final PWA recovery needs a general bootstrap protocol.

Implement:

```text
manifest
schema/protocol version
high-water cursor
collection counts
hashes/checksums
paginated records
temporary install
verification
atomic activation
```

Never clear a healthy projection merely because a network request failed.

Never overwrite unresolved local commands during bootstrap.

## 4.7 Change-feed integrity

Retain strict:

- monotonic sequence.
- no cursor rollback.
- no gaps within a page contract.
- record shape validation.
- version monotonicity.
- command ID validation.
- business scope validation.
- transactional application.

Add corruption tests.

## 4.8 Multi-tab consistency

Prove:

- only one active sync cycle per scoped business/device/actor when lock supported.
- BroadcastChannel refresh works.
- command outcome appears in second tab.
- service-worker activation waits for all active tabs.
- newly opened tab during activation causes safe deferral.
- blocked IndexedDB upgrade produces actionable UX.
- late open requests close cleanly.

---

# 5. PHASE 2: FINISH CATALOG AND INVENTORY TO PRODUCTION PARITY

The new Inventory subsystem is already one of the strongest migrated domains. Finish it completely before POS depends on it.

## 5.1 Preserve current migrated operations

Current operations include:

```text
product.save
stockItem.save
stockLocation.save
catalog.createWithOpeningStock

inventory.countLocation
inventory.countSelected
inventory.transfer
inventory.waste
inventory.adjust
inventory.produceBatch
```

All must retain:

- permission checks,
- expected-version checks,
- transactionality,
- audit,
- change records,
- replay safety,
- browser outcome handling.

## 5.2 Canonical balance revision semantics

The recent balance-version work must become a permanent invariant.

Each logical balance:

```text
business + location + stock item
```

must have a revision/version that changes whenever physical stock state changes.

Counts/corrections must validate:

```text
expected quantity
AND
expected balance revision
```

This prevents ABA problems:

```text
10
-> 15 receive
-> 10 sale
```

Quantity returns to 10, but revision changed.

### Apply balance revisions to all stock-changing commands

- opening stock.
- count.
- transfer.
- waste.
- adjustment.
- batch consumption.
- batch output.
- procurement receiving.
- supplier returns.
- POS consumption.
- reversals.

## 5.3 Inventory receive

Implement canonical receiving operation.

Prefer canonical existing operation names from the operation manifest/parity ledger.

Requirements:

- supplier/PO reference optional only where policy allows.
- receive into one stock location.
- package conversion to base quantity.
- barcode/package support.
- weighted average cost.
- sealed/open initial state where applicable.
- balance revision.
- stock movement.
- immutable source document reference.
- expected versions.
- same-command replay.
- no duplicate receipt posting.

## 5.4 Reversal/correction

Implement safe movement reversal.

Never delete historical movements.

Use:

```text
original movement
-> reversal command
-> compensating movement
-> audit link
```

Requirements:

- original movement exists.
- same business.
- not already fully reversed.
- permission required.
- manager reason.
- sufficient resulting stock where negative compensation would underflow.
- explicit relationship to original movement.
- immutable audit.

## 5.5 Requisition/issue

Implement stock requisition where useful for hotel/bar/kitchen stores:

```text
requested
approved
issued
received/acknowledged
cancelled
```

Keep the first production version simple if needed:

- source location.
- destination location.
- rows.
- quantities.
- requester.
- approver.
- issue command.
- paired movements.

## 5.6 Supplier return

Implement stock return to supplier with:

- GRN/receipt reference where available.
- supplier.
- rows.
- cost basis.
- quantity.
- reason.
- stock movement.
- payable/credit adjustment hook.
- immutable return document.

## 5.7 Count workflow finalization

Counts must support:

- full location count.
- selected/quick count.
- unknown barcode resolution.
- count draft.
- resume after browser restart.
- count identity snapshot.
- sealed/open quantities.
- exact vs estimated measurement.
- recipe-consumption baseline.
- stale balance revision detection.
- immutable committed history.
- count history pagination.
- variance summary.
- manager approval threshold if variance exceeds configured tolerance.

Do not fabricate historical stock names for old rows if the snapshot was not stored.

## 5.8 Bottle/open-stock invariants

For a stock item with container size:

```text
base unit = ml
quantity = sealed_count * bottle_size + open_quantity
0 <= open_quantity < bottle_size
sealed_count is whole integer
```

Transfers must preserve physical state.

Do not merge two open bottles into an impossible state.

Waste must specify whether it is sealed or open where required.

POS shot consumption must consume open quantity first according to the agreed bottle policy, opening a sealed bottle only when required.

## 5.9 Batch production

Retain:

- input recipe versions.
- output stock version.
- location revision.
- ingredient availability.
- bottle conservation.
- weighted cost.
- immutable batch preparation record.
- input movements.
- output movement.

Add integration cases:

- insufficient ingredient.
- recipe changes after review.
- output stock changes after review.
- partial bottle ingredient.
- multiple ingredient rows.
- same UUID replay.
- rollback after third movement.
- concurrent preparation.

## 5.10 Inventory UI completion

API Inventory workspace should provide:

- stock overview.
- location balances.
- sealed/open state.
- movement history.
- counts.
- count history.
- transfers.
- waste.
- adjustment.
- batch production.
- receive.
- reversal.
- requisition where enabled.
- low stock/reorder hints.

Do not expose legacy-only actions in API mode.

## 5.11 Inventory phase exit

Inventory is not done until:

```text
all inventory writes use API
all inventory reads are projections/API bootstrap
no API-mode Supabase inventory RPC
all mutations have real PostgreSQL integration tests
critical flows have real browser acceptance
balance revisions cover every stock change
```

---

# 6. PHASE 3: ONLINE POS MIGRATION

Do this **online-first**.

Do not introduce offline POS until online POS is proven.

Use the current legacy/native implementation and operation parity ledger as the behavior oracle.

## 6.1 Required POS domain model

PostgreSQL should own at minimum:

- orders.
- order lines.
- line modifiers/options.
- portions/servings.
- order events.
- service destination.
- table/room/customer reference where relevant.
- KOT/BOT routing.
- payments.
- refunds/reversals.
- inventory consumption links.
- receipt/document ID.
- staff/device/till attribution.

## 6.2 Required first commands

Use canonical existing operation names where already defined.

The first usable chain must support:

```text
order create/open
add item
change quantity
remove/void item
apply modifiers/portion
assign customer if relevant
fire/send
record payment
close order
issue receipt
```

Then add:

```text
comp item
comp order
discount
refund
payment reversal
reopen where policy allows
```

## 6.3 Order concurrency

Two terminals may touch the same order.

Every order mutation must carry expected order version.

Reject stale edits with conflict details.

UI must:

- show conflict.
- refresh order.
- retain operator intent as reviewable draft where appropriate.
- never silently overwrite.

## 6.4 Inventory consumption

POS sale must consume inventory in the same authoritative transaction or a provably atomic linked transaction.

For simple stocked item:

```text
sale quantity
-> stock consumption
-> movement
-> balance revision
```

For recipe product:

```text
sale quantity
-> recipe components
-> stock consumption per component
-> movements
-> balance revisions
```

For batch finished product:

```text
sale
-> consume finished batch stock
```

For spirit/wine portion:

```text
portion volume
-> ml consumption
-> sealed/open physical-state update
```

Do not accept a confirmed sale that failed to post required stock consumption unless policy explicitly allows negative stock, and that policy must be visible/audited.

## 6.5 KOT/BOT

Do not tie order confirmation to printer success.

Correct sequence:

```text
business command confirms
-> immutable KOT/BOT document exists
-> print job queued
```

Printer failure must not reverse the order.

## 6.6 POS operator UX

Prioritize speed:

- scanner input.
- product search.
- favorites.
- category quick access.
- clear basket.
- large touch targets.
- portion/bottle choice.
- customer optional.
- tender flow.
- repeat/reprint without duplicate business mutation.
- explicit offline status.

No engineering terminology in operator UI.

## 6.7 POS integration tests

At minimum:

- sale with stock.
- sale with recipe.
- bottle serving.
- bottle whole sale.
- insufficient stock.
- same command replay.
- concurrent same order edit.
- response loss.
- payment response loss.
- printer unavailable.
- second terminal receives order changes.

---

# 7. PHASE 4: PAYMENTS, TILLS AND MONEY CONTROLS

This is high risk. Do not weaken command guarantees.

## 7.1 Tenders

Support:

- cash.
- manual M-Pesa.
- card/manual external tender.
- split tender.
- customer credit where authorized.

DARAJA may follow as an integration layer, but manual M-Pesa must be production-safe first.

## 7.2 Payment command guarantees

A payment must have:

- unique payment ID.
- same-UUID idempotency.
- amount in minor units.
- tender type.
- order/folio link.
- staff/device/till.
- immutable recorded timestamp.
- optional external reference.
- reversal status.
- audit.

Never duplicate a payment because the browser lost a response.

## 7.3 M-Pesa

Manual mode:

- till/paybill configuration.
- optional operator-entered reference.
- duplicate reference warning/policy.
- receipt shows payment method.
- payment QR may be printed where configured.

DARAJA later:

- callback idempotency.
- external transaction uniqueness.
- pending state.
- timeout/reconciliation.
- no client-trusted success.

## 7.4 Till lifecycle

Implement:

```text
open till
opening float
cash sale
paid in
paid out
cash refund
expected cash
blind close count
variance
manager review
close
```

Tills must be scoped by outlet/device/operator policy as defined by business configuration.

## 7.5 Day close

Implement a clear close-day summary:

- sales.
- tenders.
- refunds.
- cash expected/count.
- variance.
- credit.
- tax summary.
- unsettled orders.
- open rooms/folios where relevant.
- unresolved command warnings.

Block close when required invariants are unresolved.

## 7.6 Money acceptance tests

Include:

- response lost after payment commit.
- retry same UUID.
- duplicate M-Pesa ref.
- split tender.
- over/under cash policy.
- refund permission.
- reversal.
- closed till refusal.
- concurrent close.
- day close with unresolved payment.
- receipt reprint without duplicate payment.

---

# 8. PHASE 5: BUSINESS DOCUMENTS AND PRINTING

Printing must become a first-class Web subsystem without moving business authority into the printer process.

## 8.1 Canonical document types

Support at least:

- SALE_RECEIPT
- PURCHASE_ORDER
- GOODS_RECEIPT_NOTE
- SUPPLIER_RETURN
- STOCK_REQUISITION
- STOCK_TRANSFER
- STOCK_COUNT_SHEET
- STOCK_VARIANCE_REPORT
- STOCK_LABEL
- CASH_MOVEMENT_VOUCHER
- TILL_CLOSE_SUMMARY
- CLOSE_DAY_SUMMARY
- CUSTOMER_STATEMENT
- CREDIT_PAYMENT_ACK
- HOTEL_FOLIO
- RESERVATION_CONFIRMATION
- HOUSEKEEPING_LIST
- MAINTENANCE_WORK_ORDER
- KITCHEN_TICKET
- BAR_TICKET

## 8.2 Immutable document snapshots

Once issued, a historical document must not re-render from mutable current business data.

Snapshot:

- business name.
- logo reference/raster if needed.
- tax details.
- address/contact.
- document number.
- line descriptions.
- amounts.
- taxes.
- tender.
- customer/guest.
- timestamps.
- staff.
- QR/payment information.
- footer.

Changes to business settings later must not alter old receipts.

## 8.3 Receipt formatting

Build a canonical 80mm renderer.

Must handle:

- 80mm paper.
- safe physical margins.
- logo.
- business identity.
- receipt number.
- date/time.
- cashier.
- item lines.
- quantity.
- unit price.
- amount.
- totals.
- payment.
- optional M-Pesa till QR.
- caption exactly: `Scan to Pay via One app`
- QR before footer.
- footer.
- cut.

Do not let logo or QR exceed printable width.

## 8.4 Browser fallback

Implement print CSS fallback for ordinary browser printing.

This is not silent-print authority.

## 8.5 Print Bridge

Extract a tiny local bridge from proven Rust/Tauri printer logic.

Requirements:

```text
localhost only
origin allowlist
device/bridge pairing
typed print jobs
bounded payload
no arbitrary raw bytes from browser
no database
no business rules
```

Transports:

- Windows RAW.
- TCP 9100 where configured.

Reuse proven:

- ESC/POS raster.
- logo rendering.
- cut commands.
- XP-80T handling.

## 8.6 Print state

Retain:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Never blind-retry `DELIVERY_UNCERTAIN`.

Require explicit possible-duplicate acknowledgement before resend.

## 8.7 Printer roles

Support assignment:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

Routing belongs in business configuration, not hard-coded UI.

## 8.8 Print tests

- bridge unavailable.
- spool success.
- spool error.
- process dies after send.
- uncertain delivery.
- explicit retry.
- logo.
- QR.
- long receipt.
- KOT.
- bar ticket.
- Unicode/safe character handling.
- printer cut-off margins.

---

# 9. PHASE 6: OFFLINE POS

Only start after online POS/payments are reliable.

## 9.1 Offline authority

Offline execution requires a signed server grant.

Grant must bind:

- grant ID.
- business.
- staff.
- device.
- issued time.
- expiry.
- policy version.
- allowed commands.
- quota.
- optional outlet.
- optional till.
- optional stock/resource constraints.
- key version.
- signature.

## 9.2 Initial offline command allowlist

Start narrow:

- order create.
- add/remove/update order lines.
- fire KOT/BOT.
- cash payment.
- manually evidenced M-Pesa/card if policy explicitly allows.
- receipt creation.
- ordinary stock consumption.
- selected safe room flows only after room leasing exists.

Keep online-only initially:

- staff/roles.
- configuration.
- supplier payment.
- major stock correction.
- high-value refund.
- credit override.
- destructive recovery.
- imports.
- admin.

## 9.3 Local optimistic projection

Offline command must:

```text
reserve grant quota
-> persist immutable command
-> update local pending projection
-> create document/print job where safe
```

The local reducer must mirror server semantics only for explicitly offline-capable operations.

Do not build a second independent business rules engine.

## 9.4 Restart guarantee

Test:

```text
offline sale
-> browser closes
-> machine restarts
-> browser opens offline
-> order/payment still visible
-> network returns
-> exact same command IDs synchronize once
```

## 9.5 Conflict UX

If server rejects/conflicts after reconnect:

- retain evidence.
- show actionable review item.
- never silently disappear sale/payment.
- never duplicate payment.
- guide manager resolution.

---

# 10. PHASE 7: PROCUREMENT

Migrate after POS/till/printing foundations are stable.

## 10.1 Core entities

- suppliers.
- purchase orders.
- PO rows.
- approvals.
- receipts/GRNs.
- supplier returns.
- supplier invoices.
- payables.
- supplier payments.

## 10.2 Workflow

```text
draft PO
-> approve
-> issue/print
-> receive partial/full
-> GRN
-> inventory receive
-> invoice/payable
-> supplier payment
```

## 10.3 Rules

- partial receiving.
- over-receive policy.
- package conversion.
- cost update.
- duplicate supplier invoice prevention.
- immutable GRN.
- correction through reversal/return, not deletion.
- stock and financial postings tied to source records.

## 10.4 Procurement documents

Produce:

- PO.
- GRN.
- supplier return.
- payment voucher/acknowledgement.

## 10.5 Tests

- partial receipt.
- duplicate receipt replay.
- receive same PO from two terminals.
- cost changes.
- supplier return.
- invoice duplicate.
- supplier payment response loss.
- rollback on stock failure.

---

# 11. PHASE 8: CUSTOMER CREDIT AND FINANCE

Preserve the canonical credit path already established in parity evidence.

## 11.1 Customer credit

Support:

- named customer.
- credit limit/policy.
- charge from order.
- payment.
- statement.
- aging.
- balance.
- manager override.
- audit.

No anonymous credit.

## 11.2 Finance controls

Implement/migrate:

- expenses.
- supplier payments.
- cash movements.
- refunds.
- till adjustments.
- approval controls.
- daily summaries.
- audit views.

## 11.3 Financial integrity

Use integer minor currency units for monetary amounts.

Do not use floating point for final money posting.

Every financial write must be:

- idempotent.
- immutable or reversable through compensating entry.
- attributed.
- auditable.

---

# 12. PHASE 9: HOTEL / PMS

Migrate only after the core command platform is proven under money and inventory load.

## 12.1 Core entities

- room types.
- rooms.
- rate plans.
- reservations.
- guests.
- stays.
- folios.
- folio charges.
- payments.
- housekeeping.
- room maintenance/blocking.

## 12.2 Room concurrency

Prevent double booking.

Use authoritative version/lease semantics around:

- reservation allocation.
- check-in.
- room move.
- extension.
- checkout.

Two browsers must not confirm the same room for incompatible stays.

## 12.3 Flows

Implement:

```text
reservation
walk-in
check-in
room charge
restaurant-to-room charge
additional folio charge
payment
room move
extend stay
checkout
housekeeping status
maintenance block
```

## 12.4 Offline hotel

Do not enable broadly at first.

Initial offline room capability should be narrow and resource-leased.

If required, grant one terminal authority for a bounded outlet/resource scope.

## 12.5 PMS tests

- same-room race.
- reservation overlap.
- walk-in.
- room move.
- partial folio payment.
- restaurant charge to room.
- checkout with unpaid balance policy.
- extension collision.
- room maintenance block.
- housekeeping transition.

---

# 13. PHASE 10: ASSETS AND MAINTENANCE

Migrate existing asset/maintenance behavior after core hotel flows.

Support:

- asset register.
- location.
- condition.
- maintenance work order.
- assignee.
- cost.
- status.
- notes.
- history.

Do not allow deletion to erase maintenance history.

---

# 14. PHASE 11: BUSINESS INTAKE, IMPORTS AND DATA MIGRATION

This is a hard production gate.

Do not rely on hand-written production SQL.

## 14.1 New business intake

Support CSV or guided import for:

- business details.
- outlets.
- staff.
- catalog.
- stock masters.
- packages.
- stock opening balances.
- suppliers.
- customers.
- rooms/rates where relevant.

## 14.2 Import safety

Every import must have:

- validation preview.
- row errors.
- exact accepted/rejected count.
- idempotent import identity.
- dry run where practical.
- no partial hidden success.
- audit.

## 14.3 Existing Countryside migration

Create a one-time migration tool for the existing business state.

Sources may include:

- legacy terminal/SQLite.
- Supabase V2.
- exported CSV.
- existing Web state.

The tool must create a manifest:

```text
source identity
export timestamp
source schema/version
file hashes
record counts
financial totals
stock totals
room/reservation totals
history counts
```

## 14.4 Migration staging

Use explicit stages:

```text
PRECHECK
EXPORT
HASH
IMPORT
VERIFY
READY
COMMIT
```

Never overwrite source data during migration.

## 14.5 Reconciliation

Before cutover compare:

- product count.
- stock item count.
- stock total by item/location.
- customer credit balances.
- supplier balances.
- tender totals.
- sales totals.
- open orders.
- rooms.
- current stays.
- future reservations.
- documents/history counts.

Difference must be zero or explicitly explained/approved.

## 14.6 No dual-writer cutover

Final production migration:

```text
backup old authority
-> freeze old business writers
-> final export
-> final import
-> verify
-> activate API/PWA authority
-> smoke test
```

Do not run legacy and new writers concurrently.

---

# 15. PHASE 12: VPS STAGING AND PRODUCTION TOPOLOGY

Target topology:

```text
Internet
   |
Nginx
   |---------------- static PWA /var/www/serveos/current
   |
   +---------------- / API hostname -> 127.0.0.1:3101
                               |
                           API container
                               |
                       private Docker network
                        /               \
                 PostgreSQL           worker
                        \
                         backup job
```

## 15.1 API

- bind loopback host port only.
- no public Postgres.
- `/health/live`.
- `/health/ready`.
- readiness must verify expected migration level, not merely existence of migration ledger.
- graceful shutdown.
- connection-pool bounds.
- request-size bounds consistent with Nginx.
- structured logging.

## 15.2 PWA release

Keep immutable SHA releases.

Deployment:

```text
build
-> package
-> hash manifest
-> upload new release
-> validate hashes
-> atomic current symlink switch
```

Rollback:

```text
switch symlink to prior verified release
```

Do not overwrite current release contents in place.

## 15.3 Environment

Separate:

- development.
- CI.
- staging.
- production.

No production secret in repository.

## 15.4 Resource monitoring

Add practical VPS monitoring:

- CPU.
- RAM.
- disk.
- Postgres volume.
- backup age.
- API health.
- worker health.
- failed jobs.
- DB connection saturation.
- error rate.

Avoid unnecessary observability platforms. A simple reliable baseline is sufficient.

---

# 16. PHASE 13: BACKUP AND RESTORE

Backup is incomplete until restoration succeeds.

## 16.1 Production backup

Required:

- PostgreSQL custom dump or approved physical strategy.
- encryption with age.
- off-VPS copy via configured remote.
- retention.
- size validation.
- failure alert.
- backup timestamp evidence.

## 16.2 Restore rehearsal

Automate:

```text
create disposable clean PostgreSQL
-> download encrypted backup
-> decrypt
-> restore
-> run required migrations
-> start API against restored DB
-> verify health
-> verify business totals
-> verify authentication
-> verify catalog/inventory
-> verify command/audit history
```

Record evidence.

## 16.3 Browser recovery bundle

Local `.serveosbackup`/recovery export is not server backup.

It may contain:

- projections.
- unresolved commands.
- cursor.
- immutable docs.
- print jobs.
- diagnostics.

It must not contain reusable secrets.

On a new browser:

```text
authenticate/enroll
-> server bootstrap
-> restore unresolved local evidence only if required
-> check each command UUID against server before replay
```

Never replace PostgreSQL with a browser snapshot.

---

# 17. PHASE 14: PRINT HARDWARE ACCEPTANCE

Use actual target devices.

At minimum test:

- Countryside Windows AIO POS.
- XP-80T/80mm thermal printer or actual deployed equivalent.
- barcode scanner.
- target Android tablet browser/PWA where relevant.

Verify:

- receipt width.
- cut.
- QR scan.
- logo.
- long lines.
- Kenyan currency.
- KOT/BOT.
- print queue clear/recovery.
- bridge startup.
- reconnect.
- delivery uncertainty.
- reprint.

Do not call printing production-ready based only on unit tests.

---

# 18. PHASE 15: SECURITY HARDENING

Before production cutover:

## 18.1 API

- strict CORS origin.
- HTTPS only outside localhost.
- secure headers.
- no debug stack leak.
- parameterized queries.
- DB role least privilege.
- rate-limit login.
- rate-limit enrollment.
- rate-limit high-cost endpoints where necessary.
- request body caps.
- audit admin actions.

## 18.2 Sessions

- access expiry.
- refresh rotation.
- revoke.
- device binding.
- disabled staff invalidation.
- password-change enforcement.

## 18.3 Offline

- signature key rotation.
- grant expiry.
- quota.
- command allowlist.
- business/device/staff scope.
- server replay accounting.
- policy version.

## 18.4 Print Bridge

- localhost.
- trusted origins.
- pairing.
- no arbitrary file access.
- no arbitrary shell.
- no arbitrary printer bytes.
- bounded payload.

## 18.5 Production secrets

After initial setup:

- disable/remove initial admin bootstrap secret.
- rotate temporary credentials.
- verify no secrets in logs/artifacts.
- verify no secrets in recovery exports.

---

# 19. PHASE 16: OBSERVABILITY AND SUPPORTABILITY

Operators should not need a developer to answer basic questions.

Provide diagnostics for:

- API online/offline.
- current business.
- current staff.
- enrolled device.
- sync cursor.
- pending commands.
- uncertain commands.
- conflicts/rejections.
- storage persisted status.
- IndexedDB usage.
- pending print jobs.
- last successful sync.
- app release SHA.
- API release/version.
- schema/migration level.

Admin support export must redact:

- access tokens.
- refresh tokens.
- private keys.
- offline grant signing material.
- password fields.

---

# 20. PHASE 17: PRODUCTION PILOT AND CUTOVER

No direct leap from development to full production.

## 20.1 Staging rehearsal

Use production-like infrastructure and representative data.

Rehearse:

- migration.
- login.
- enrollment.
- product.
- stock.
- POS.
- M-Pesa manual.
- cash.
- printing.
- count.
- transfer.
- PO.
- GRN.
- room flow.
- backup.
- restore.
- release rollback.

## 20.2 Pilot

Run one controlled real-business pilot.

Record:

- start time.
- operators.
- devices.
- opening stock/till.
- transactions.
- printer failures.
- network events.
- command conflicts.
- close-day reconciliation.

## 20.3 Required pilot reconciliation

End of day:

```text
sales total
payments by tender
cash expected
cash counted
M-Pesa total
refunds
open orders
stock movements
stock balances
credit movements
room charges
```

must reconcile.

## 20.4 Cutover authorization

Production activation requires:

- green full CI.
- migration rehearsal passed.
- backup/restore rehearsal passed.
- printer hardware acceptance passed.
- pilot reconciliation passed.
- rollback procedure tested.
- no known P0/P1 correctness issue.

---

# 21. FINAL NATIVE/LEGACY RETIREMENT

Only after the Web-first system has operated successfully.

## 21.1 Retire business authority

Remove/disable:

- browser Supabase business writer.
- Tauri business database authority.
- legacy snapshot writer path.
- legacy terminal business mutations.

## 21.2 Keep only what remains necessary

Potentially retain/extract:

- printer bridge code.
- parity fixtures.
- migration compatibility tools.
- historical test evidence.

## 21.3 Remove dead dependencies only after proof

Then clean:

- obsolete Supabase runtime business dependencies.
- obsolete Tauri business modules.
- unused migration gates.
- old feature flags.
- stale docs.
- dead tests.

Do not delete historical migration files required to understand deployed databases.

---

# 22. DOMAIN TEST TEMPLATE

Every new API command should receive the same minimum test shape.

## Unit

- valid payload.
- malformed payload.
- permission denied.
- unsupported state.
- business-scope reference validation.

## PostgreSQL integration

- success.
- same UUID replay.
- changed payload under same UUID.
- expected-version conflict.
- rollback on handler failure.
- audit row.
- change feed rows.
- entity versions.
- balance revisions if stock related.

## Browser

- submit from real UI.
- confirmed state.
- reload.
- second tab/device sync.
- error UI.
- conflict UI.
- outcome unknown recovery.

## Security

- wrong business reference.
- revoked device.
- expired session.
- disabled staff.
- missing permission.

---

# 23. RELEASE GATES

## Gate A: Platform

Must pass before POS:

- all current CI green.
- real PWA/API/PostgreSQL test green.
- transient failure replay green.
- handler records contract enforced.
- balance revisions green.
- API-authority no-Supabase-RPC test green.

## Gate B: Revenue

Must pass before staging:

- online POS.
- stock consumption.
- payments.
- till.
- receipt documents.
- browser print fallback.
- critical concurrency tests.

## Gate C: Operational

Must pass before pilot:

- Print Bridge.
- procurement receiving.
- backup restore.
- migration rehearsal.
- logging/diagnostics.
- production release/rollback rehearsal.

## Gate D: Hospitality

Must pass before full hotel deployment:

- room/reservation race tests.
- check-in/checkout.
- folio/payment.
- housekeeping.
- maintenance blocking.
- print documents.

## Gate E: Production

Must pass before authority cutover:

- all CI green.
- all P0/P1 defects closed.
- production data verified.
- rollback point exists.
- pilot passed.
- reconciliation passed.
- backup restore passed.

---

# 24. PRIORITY ORDER FROM THE CURRENT HEAD

Execute in this order without wandering into lower-priority work.

```text
1. finish current CI run and make the exact HEAD fully green

2. add API-authority zero-Supabase-RPC enforcement

3. finish shared contracts/protocol versioning

4. complete Inventory:
   receive
   reversal
   requisition/issue
   supplier return hook
   count/history pagination
   approval thresholds
   full balance-revision coverage

5. build online POS:
   order
   lines
   modifiers
   fire
   stock consumption

6. build payments/tills:
   cash
   manual M-Pesa
   split
   refund/reversal
   till open/close
   cash movement
   day close

7. finish documents + canonical 80mm renderer

8. extract Print Bridge and prove XP-80T

9. build offline POS with bounded grants

10. migrate procurement

11. migrate customer credit/finance

12. migrate rooms/PMS

13. migrate assets/maintenance

14. implement new-business imports

15. implement full existing-data migration/reconciliation

16. deploy isolated VPS staging

17. prove backup restore

18. perform full staging cutover rehearsal

19. run controlled real-business pilot

20. cut production authority

21. retire old business writers

22. clean dead legacy code
```

---

# 25. DO NOT SPEND SPRINT TIME ON THESE DISTRACTIONS

Unless a gate requires them, do not add:

- microservices.
- Redis.
- Kafka.
- Kubernetes.
- a second frontend.
- a separate Android native app.
- new UI themes.
- speculative analytics warehouse.
- AI features.
- generic workflow engines.
- new framework migrations.
- Caddy.
- PM2.
- a second offline rules engine.

Use the architecture already selected.

---

# 26. DEFINITION OF DONE

The Web-first reset is complete only when the following statement is true:

> A staff member can open ServOS as an installed PWA on a new enrolled device, authenticate against the ServOS API, operate catalog, inventory, POS, payments, tills, procurement and hotel workflows against PostgreSQL, continue approved operations through temporary connectivity loss, print reliable 80mm documents through browser fallback or the local Print Bridge, recover uncertain commands by their original IDs, rebuild the browser from server truth, restore the server from an encrypted off-VPS backup, migrate an existing ServOS business with reconciled evidence, and complete a full business day without relying on Tauri/Supabase as business authority.

Required final evidence:

```text
FULL CI                         PASS
REAL PWA -> API -> PG           PASS
MULTI-TAB                       PASS
RESPONSE LOSS                   PASS
OFFLINE RESTART                 PASS
POS                             PASS
PAYMENTS                        PASS
TILL                            PASS
INVENTORY                       PASS
PROCUREMENT                     PASS
HOTEL                           PASS
PRINT BRIDGE                    PASS
HARDWARE PRINT                  PASS
MIGRATION RECONCILIATION        PASS
BACKUP RESTORE                  PASS
RELEASE ROLLBACK                PASS
BUSINESS PILOT                  PASS
CLOSE-DAY RECONCILIATION        PASS
NO DUAL WRITERS                 PASS
```

---

# 27. FINAL EXECUTION RULE

Do not interpret this sprint as a checklist that permits stopping after a convenient milestone.

Treat it as one continuous build:

```text
platform proof
-> inventory completion
-> POS
-> money
-> printing
-> offline
-> procurement
-> finance
-> hotel
-> migration
-> staging
-> restore
-> pilot
-> cutover
-> retirement
```

If a phase exposes a defect in an earlier phase, return to the earlier invariant, fix it, add regression evidence, then continue forward.

The objective is not "more commits."

The objective is a **single-authority, recoverable, test-proven, browser-first ServOS that can replace the current live business stack without losing money, stock, rooms, documents, or operator confidence.**
