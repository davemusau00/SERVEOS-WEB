# ServOS Web-First Reset: Final Non-Stop Development Sprint

**Repository:** `davemusau00/SERVEOS-WEB`  
**Branch:** `reset/vps-platform`  
**Current checkpoint:** `393c3a69e6bbd5cae007157328361c54a6a8d122`  
**Checkpoint date:** 2026-10-07  
**Branch position at checkpoint:** 84 commits ahead of `main`, 0 behind  
**Current phase:** Revenue-domain migration and production hardening  
**Execution model:** build continuously until release gates are satisfied

---

# 0. EXECUTION MANDATE

This is the final implementation sprint. It is not a planning document and it is not a request to stop after individual milestones.

Continue phase by phase without asking for routine approval.

For every implementation slice:

```text
inspect current code
-> inspect legacy/parity behavior
-> implement smallest architecture-consistent change
-> typecheck
-> unit test
-> PostgreSQL integration test
-> browser acceptance test when operator-facing
-> inspect CI evidence
-> fix failures
-> commit atomically
-> continue
```

Do not pause after:

- one migration,
- one handler,
- one passing test,
- one green local build,
- one working screen,
- one deployment.

Stop only when an action requires external authority that cannot safely be inferred, such as a production destructive migration, unavailable production secret, DNS/SSH credential, payment-provider credential, or physical hardware interaction that cannot be simulated.

Do not ask the user to choose between equivalent internal engineering approaches. Inspect the repository and make the best architecture-consistent choice.

---

# 1. CURRENT REPOSITORY STATE

The project has advanced substantially beyond the earlier version of this sprint.

The platform core is no longer the main risk. The remaining work is increasingly the actual hospitality business system, deployment proof, data migration, hardware printing, and production cutover.

Approximate current maturity:

| Area | Current level |
|---|---:|
| Architecture / target design | 96% |
| API platform/kernel | 95% |
| PostgreSQL core | 90% |
| Command lifecycle/idempotency | 95% |
| Auth/device/session foundation | 89% |
| IndexedDB/PWA sync kernel | 92% |
| Real PWA -> API -> PostgreSQL proof | 85% |
| Catalog | 88% |
| Inventory | 86% |
| POS backend | 60% |
| POS Web operator UX | 40% |
| Payments backend | 55% |
| Till backend | 55% |
| Refund/reversal backend | 45% |
| Business document/print lifecycle | 60% |
| Print Bridge | 5% |
| Procurement | 5-10% |
| Customer credit/finance | 10% |
| Hotel/PMS | 5% |
| Existing-data migration | 10% |
| VPS release/backup tooling | 65-70% |
| Production readiness | about 50% |

The correct overall interpretation is:

```text
core platform        mostly built
catalog              largely migrated
inventory            largely migrated
POS/money            now actively migrating
printing             server/browser lifecycle exists, bridge absent
procurement/PMS      still mostly legacy
migration/cutover    still major work
```

---

# 2. COMPLETED FOUNDATIONS: DO NOT REBUILD

Treat the following as existing architecture to preserve and extend.

## 2.1 Command platform

Already implemented:

- immutable command IDs,
- canonical payload hashing,
- same-ID idempotent replay,
- changed-payload reuse refusal,
- durable command lifecycle,
- `RECEIVED`,
- `PROCESSING`,
- `CONFIRMED`,
- `REJECTED`,
- `CONFLICT`,
- expected-version checks,
- permission checks,
- audit evidence,
- ordered change cursors,
- explicit handler `{ value, records[] }` contract,
- duplicate record detection,
- status-first recovery of uncertain commands,
- retryable infrastructure failures without terminally poisoning the UUID.

Preserve the current rule:

```text
deterministic validation -> REJECTED
permission/domain refusal -> REJECTED
version/business conflict -> CONFLICT
infrastructure/5xx failure -> unresolved and replayable with same UUID
```

Never regress to terminally rejecting transient infrastructure failures.

## 2.2 Real PostgreSQL verification

The API/PostgreSQL CI path exists and has already proven:

- fresh migrations,
- command lifecycle,
- catalog writes,
- command replay,
- conflict replay,
- bootstrap,
- change feed,
- balance revisions,
- real PWA/API/PostgreSQL acceptance.

Continue extending this suite rather than creating a second integration framework.

## 2.3 PWA authority and local durability

Already present:

- API-only IndexedDB scope,
- durable command outbox,
- projections,
- drafts,
- offline grants,
- immutable business documents,
- print jobs,
- append-only print events,
- storage diagnostics,
- recovery evidence export,
- sync broadcasts,
- service-worker update coordination,
- status-first response-loss recovery.

Do not replace this with a separate offline store.

## 2.4 Authentication and device trust

Already present:

- staff login,
- password changes,
- hashed bearer token lookup,
- browser device key,
- P-256 enrollment proof,
- one-use enrollment challenge,
- enrolled-device API enforcement,
- session logout,
- permission refresh,
- sign-out cleanup,
- disabled/unready behavior.

Remaining hardening belongs in the existing API auth system.

## 2.5 Catalog

Already migrated substantially:

- products,
- stock items,
- stock locations,
- package units,
- recipes,
- Smart Item setup,
- opening stock,
- product and stock projections,
- expected versions,
- API-authority PWA editing.

## 2.6 Inventory

Current API command set includes:

```text
inventory.countLocation
inventory.countSelected
inventory.transfer
inventory.waste
inventory.policy.save
inventory.receive
inventory.reverseMovement
inventory.adjust
inventory.produceBatch
```

Current Inventory capabilities include:

- full stocktake,
- selected count,
- count history,
- count identity snapshots,
- balance revisions,
- sealed/open bottle state,
- transfer,
- waste,
- manager correction,
- batch preparation,
- receiving,
- movement reversal evidence,
- location/stock revision tracking.

Do not redesign Inventory from scratch.

---

# 3. LATEST REVENUE-DOMAIN IMPLEMENTATION

The previous sprint document treated POS/payments/tills as mostly future work. That is no longer accurate.

## 3.1 POS schema/backend now exists

New PostgreSQL migrations include:

```text
018_pos_orders.sql
019_pos_fire_documents.sql
020_till_lifecycle.sql
021_payment_accounts.sql
022_order_payments.sql
023_business_tax_snapshots.sql
024_print_job_lifecycle.sql
025_payment_refunds.sql
```

Current POS commands include:

```text
order.create
order.addItem
order.updateItem
order.removeItem
order.fire
```

The PWA now has:

```text
WebApiPosView
```

and it is integrated into the API-authoritative workspace.

This phase must now finish POS rather than begin it.

## 3.2 Payments now exist in source

Current payment commands include:

```text
payment.record
payment.split
```

The PWA now has:

```text
WebApiPaymentPanel
```

Payment accounts/settings have API-side source support.

## 3.3 Tills now exist in source

Current till commands include:

```text
till.policy.save
till.open
till.cashMovement
till.close
till.reviewVariance
```

The PWA now has:

```text
WebApiTillPanel
```

The till model already includes:

- opening float,
- operator/device ownership,
- outlet,
- cash movements,
- expected cash,
- blind counted cash,
- variance,
- review-required state,
- unresolved-money-command close blocker,
- unsettled-order close blocker.

Extend these semantics. Do not replace them.

## 3.4 Refunds/reversals now exist in source

Current commands include:

```text
payment.refund
payment.reverse
```

The PWA now has:

```text
WebApiRefundsView
```

Current refund logic includes:

- original payment lock,
- order lock,
- payment version,
- order version,
- till ownership,
- remaining refundable amount,
- explicit reason,
- operator confirmation,
- external refund reference for non-cash,
- drawer cash check for cash refund,
- cash ledger posting,
- refund evidence,
- order refunded total,
- payment version bump,
- till version bump,
- refund business document,
- print queue entry.

Retain the current policy that a refund does **not automatically restock inventory**. Stock disposition must be a separate explicit business decision.

## 3.5 Business documents and print lifecycle now exist

Current source includes:

```text
business-documents.mjs
print-commands.mjs
BusinessDocumentRenderer
WebDocumentQueue
```

Print command lifecycle includes:

```text
print.claim
print.report
print.confirm
print.retry
print.cancel
```

The browser already has durable local print states/events.

The remaining gap is physical transport and full document parity, not the conceptual print queue.

## 3.6 Settings/outlets now exist in API mode

Current source includes:

```text
outlet.save
WebApiSettings
WebOutletSettings
```

The operation manifest has also been updated for inventory policy and outlet configuration.

---

# 4. FIRST IMMEDIATE GATE: MAKE THE LATEST HEAD GREEN

Before continuing large business-domain expansion, establish one current fully green HEAD.

At this checkpoint, earlier commits such as `88cc83b` and `0573ec3` have completed green hosted CI runs.

The latest revenue-domain commits are newer and must not inherit that green status by assumption.

Required same-commit jobs:

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

The current head must also include the dedicated real PWA/API/PostgreSQL acceptance gate.

If any job fails:

```text
classify failure
-> real regression?
-> outdated source assertion?
-> test harness failure?
-> intentional architecture change?
-> fix root cause
-> rerun
```

Do not weaken tests merely to produce green badges.

Do not continue to Procurement or PMS with known red revenue-path tests.

---

# 5. FINISH POS TO PRODUCTION PARITY

The backend and first PWA view now exist. Complete the actual operator journey.

## 5.1 Order lifecycle

Finish and verify:

```text
new order
-> add item
-> edit quantity
-> choose portion/options
-> remove/void line
-> assign customer/table/room where enabled
-> fire
-> receive KOT/BOT evidence
-> payment
-> completion
```

Add missing commands only where required by the canonical operation manifest.

Do not invent duplicate operations when a legacy/parity operation already exists.

## 5.2 POS inventory consumption

POS must mutate the same PostgreSQL Inventory authority.

For direct stock:

```text
sold quantity
-> inventory movement
-> location balance
-> balance revision
```

For recipe product:

```text
sold quantity
-> ingredient consumption
-> movements per ingredient
-> balance revisions
```

For batch product:

```text
sold quantity
-> finished batch stock consumption
```

For spirit/wine portion:

```text
portion ml
-> open quantity first
-> open sealed bottle only when required
-> preserve sealed/open invariant
```

Every stock mutation must occur atomically with the sale/order transition that makes it economically real.

Do not confirm a final sale while silently failing required stock consumption unless explicit negative-stock policy permits it.

## 5.3 Order concurrency

Every editable order requires a canonical order version.

Test two terminals editing one order.

Stale edits must:

- conflict,
- not overwrite,
- show a useful operator message,
- retain intended changes as reviewable state where practical.

## 5.4 Fire/KOT/BOT behavior

`order.fire` must:

- be idempotent,
- snapshot fired lines,
- create immutable kitchen/bar documents,
- queue print jobs,
- never reverse the business command because a printer failed.

Printing is a side effect after authoritative order confirmation.

## 5.5 POS UX

Complete a fast operator surface:

- barcode scanner input,
- search,
- favorites,
- categories,
- touch-friendly product grid,
- portions/selling modes,
- visible running total,
- clear line-level edit,
- customer/table/room assignment only when enabled,
- fire status,
- payment status,
- sync/unknown-outcome visibility without technical jargon.

The API PWA must not surface unmigrated legacy actions.

---

# 6. FINISH PAYMENTS

## 6.1 Required tenders

Support and prove:

- cash,
- manual M-Pesa,
- card/manual external tender,
- split tender.

Customer credit comes in the finance phase unless already required by current parity.

## 6.2 Payment invariants

Every payment requires:

- stable UUID,
- integer minor amount,
- method,
- order/folio source,
- till session,
- staff,
- device,
- occurred-at timestamp,
- optional external reference,
- version,
- immutable audit.

Never create a replacement payment UUID after response loss.

## 6.3 Manual M-Pesa

Production-safe manual flow must provide:

- configured payment account/till/paybill identity,
- optional/required external transaction reference by policy,
- duplicate reference detection,
- clear operator confirmation,
- receipt tender detail,
- configurable payment QR.

Later DARAJA integration must sit on top of this stable accounting model.

## 6.4 Split payment

Prove:

```text
cash + M-Pesa
cash + card
M-Pesa + card
```

Ensure:

- exact total reconciliation,
- no overpayment unless explicit policy,
- each component independently idempotent,
- till cash only changes for cash component.

## 6.5 Payment response-loss tests

Mandatory:

```text
commit payment
-> drop response
-> browser marks outcome unknown
-> status lookup
-> exact original payment recovered
-> no duplicate payment
```

Repeat for split tender.

---

# 7. FINISH TILLS AND CLOSE-DAY

The base till model exists. Complete operator and manager behavior.

## 7.1 Till flow

Prove:

```text
open till
-> opening float
-> cash payments
-> paid in
-> paid out
-> cash refunds
-> expected cash
-> blind count
-> variance
-> manager review when required
-> close
```

## 7.2 Till ownership

Retain operator/device ownership rules unless business policy explicitly changes them.

Do not allow a random staff/device to spend from another operator's till.

## 7.3 Cash safety

Block:

- negative drawer cash,
- invalid paid-out greater than recorded cash,
- cash refund greater than recorded drawer availability,
- close with unresolved money commands,
- close with unsettled orders.

## 7.4 Day close

Add/complete a close-day summary:

- sales,
- payments by tender,
- cash expected,
- cash counted,
- variance,
- refunds,
- credit,
- open orders,
- unresolved money commands,
- tax summary,
- room/folio exposure when PMS arrives.

Make it printable and immutable.

---

# 8. FINISH REFUNDS AND REVERSALS

The first implementation exists. Harden it.

## 8.1 Refund policy

Retain:

```text
refund money != automatic stock restock
```

When merchandise physically returns, use a separate explicit inventory action.

## 8.2 Partial refund

Test:

- partial amount,
- second partial refund,
- remaining refundable amount,
- over-refund refusal.

## 8.3 Full reversal

Test:

- full remaining amount,
- duplicate reversal replay,
- reversal after prior partial refund,
- closed/invalid till policy.

## 8.4 External tender refund

Require:

- manual confirmation or provider confirmation,
- external return reference,
- audit.

Do not pretend ServOS itself reversed an external payment unless provider integration confirms it.

## 8.5 Refund printing

Ensure refund produces:

```text
REFUND_RECEIPT
-> immutable snapshot
-> print job
```

and reprinting never executes the refund again.

---

# 9. COMPLETE INVENTORY EDGES

Inventory is close, but complete the last operational gaps.

## 9.1 Receiving

`inventory.receive` exists.

Prove and finalize:

- location,
- item,
- package conversion,
- base quantity,
- unit cost,
- weighted average cost,
- bottle physical state,
- immutable receive evidence,
- balance revision,
- movement,
- same-ID replay.

## 9.2 Movement reversal

`inventory.reverseMovement` exists.

Rules:

- never delete original movement,
- compensating movement only,
- original reference,
- no double reversal,
- block reversal if later physical state makes exact reversal unsafe,
- manager reason,
- immutable reversal evidence.

## 9.3 Stock policy

`inventory.policy.save` exists.

Finish configurable policies required by current business:

- negative-stock behavior,
- count tolerance,
- approval threshold,
- receiving policy,
- bottle handling where appropriate.

## 9.4 Requisition/issue

Add if required by operation parity:

```text
request
approve
issue
receive/acknowledge
```

with paired location movements.

## 9.5 Supplier return hook

Add a stock-return operation linked to Procurement GRN/receipt where possible.

Do not implement supplier accounting twice. Inventory return should expose the hook and Procurement should own supplier financial consequences.

## 9.6 Count history

Finish:

- pagination,
- filtering,
- variance summaries,
- actor,
- date,
- location,
- exact identity snapshots.

---

# 10. COMPLETE BUSINESS DOCUMENTS

The renderer and document queue exist. Build the canonical document library.

Required documents:

```text
SALE_RECEIPT
REFUND_RECEIPT
PAYMENT_ACKNOWLEDGEMENT
PURCHASE_ORDER
GOODS_RECEIPT_NOTE
SUPPLIER_RETURN
STOCK_REQUISITION
STOCK_TRANSFER
STOCK_COUNT_SHEET
STOCK_VARIANCE_REPORT
CASH_MOVEMENT_VOUCHER
TILL_CLOSE_SUMMARY
CLOSE_DAY_SUMMARY
CUSTOMER_STATEMENT
CREDIT_PAYMENT_ACK
HOTEL_FOLIO
RESERVATION_CONFIRMATION
HOUSEKEEPING_LIST
MAINTENANCE_WORK_ORDER
KITCHEN_TICKET
BAR_TICKET
```

A document snapshot must contain the historical values needed to render it later.

Never re-render historical receipts from current mutable product/business settings.

---

# 11. CANONICAL 80MM RECEIPT

Complete one canonical renderer that can be shared by browser fallback and Print Bridge.

Requirements:

- 80mm width,
- safe printable margins,
- business logo,
- business identity,
- tax identity,
- receipt/document number,
- timestamp,
- cashier,
- item rows,
- quantity,
- unit price,
- line total,
- tax summary,
- grand total,
- payment method,
- optional customer,
- optional M-Pesa QR,
- caption exactly `Scan to Pay via One app`,
- QR immediately before footer,
- footer,
- cut instruction for bridge.

Long names must wrap without clipping.

Logo/QR must never exceed printable raster width.

---

# 12. BUILD THE PRINT BRIDGE

This remains one of the largest concrete gaps.

Extract the smallest useful bridge from the proven native Rust printer implementation.

Architecture:

```text
PWA
-> localhost bridge
-> Windows RAW or TCP 9100
-> thermal printer
```

The bridge must not contain business authority.

It may only:

- authenticate/pair local client,
- validate trusted origin,
- accept typed bounded document jobs,
- render/translate canonical job,
- send to printer,
- report transport state.

It must not:

- connect to PostgreSQL,
- modify orders,
- modify payments,
- modify stock,
- run ServOS business rules.

## 12.1 Transport

Support:

- Windows RAW,
- TCP 9100.

Reuse existing mature ESC/POS code where possible.

## 12.2 Delivery state

Retain:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Never blindly retry `DELIVERY_UNCERTAIN`.

Require operator acknowledgement of possible duplicate before resend.

## 12.3 Printer roles

Support:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

## 12.4 Hardware acceptance

Test actual target hardware:

- Countryside Windows AIO,
- XP-80T or deployed equivalent,
- barcode scanner,
- actual network/USB printer path.

---

# 13. OFFLINE POS

Do not enable offline POS until online POS, payments and tills are green.

The existing offline grant architecture must be extended, not replaced.

## 13.1 Grant scope

A POS offline grant may bind:

- business,
- device,
- staff,
- outlet,
- till,
- allowed commands,
- expiry,
- quota,
- policy version,
- stock/resource constraints,
- key version,
- signature.

## 13.2 First offline allowlist

Start narrow:

- order create,
- add/update/remove lines,
- fire KOT/BOT,
- cash payment,
- manually evidenced external payment only if policy permits,
- receipt creation,
- deterministic stock consumption.

Keep online-only:

- staff/roles,
- business configuration,
- supplier payments,
- major stock corrections,
- high-value refunds,
- credit overrides,
- imports,
- destructive recovery.

## 13.3 Restart proof

Mandatory acceptance:

```text
disconnect
-> complete allowed sale
-> close browser
-> restart machine/browser offline
-> sale/payment/document still present
-> reconnect
-> same UUIDs synchronize exactly once
```

---

# 14. PROCUREMENT

Migrate after revenue path and printing are stable.

Required:

- suppliers,
- purchase orders,
- PO rows,
- approval,
- issue,
- partial/full receive,
- GRN,
- stock receive,
- supplier invoices,
- payables,
- supplier payments,
- returns.

Core flow:

```text
draft PO
-> approve
-> print/send
-> receive
-> GRN
-> inventory receive
-> invoice/payable
-> supplier payment
```

Do not duplicate Inventory receiving logic. Procurement must call/use the canonical inventory posting semantics.

Tests:

- partial receive,
- duplicate receive replay,
- two-terminal receive conflict,
- cost update,
- supplier return,
- duplicate invoice,
- supplier payment response loss.

---

# 15. CUSTOMER CREDIT AND FINANCE

Migrate:

- named-customer credit,
- credit limit/policy,
- order charge to credit,
- credit payment,
- statement,
- aging,
- balance,
- manager override,
- expenses,
- supplier payments,
- cash movements,
- financial controls.

No anonymous credit.

All financial values use integer minor units.

Corrections are compensating entries, not history deletion.

---

# 16. HOTEL / PMS

Migrate after POS/money is stable.

Required:

- room types,
- rooms,
- rates,
- reservations,
- guests,
- stays,
- folios,
- folio charges,
- room payments,
- room moves,
- checkout,
- housekeeping,
- maintenance blocks.

## 16.1 Double-booking protection

Use authoritative versions/leases.

Prove a real race:

```text
browser A selects room
browser B selects same room
only one incompatible reservation/check-in confirms
```

## 16.2 Restaurant-to-room

POS must support posting a restaurant/bar charge to an active guest folio only with valid stay/folio authority.

---

# 17. ASSETS AND MAINTENANCE

Migrate:

- asset register,
- location,
- condition,
- maintenance work order,
- assignment,
- cost,
- status,
- history.

Never delete maintenance history to correct mistakes.

---

# 18. AUTHENTICATION HARDENING

The current API auth works. Finish production browser-session security.

Add:

- short-lived access token,
- rotating refresh token,
- Secure HttpOnly SameSite cookie,
- hashed refresh token storage,
- refresh family/replay detection,
- revoke device,
- revoke staff sessions,
- session/device administration,
- forced credential reset where required.

Do not store reusable refresh credentials in IndexedDB.

After initial setup, remove/disable `INITIAL_ADMIN_SETUP_SECRET`.

---

# 19. API-AUTHORITY PURITY

The API workspace must operate with Supabase unavailable.

Add an automated browser assertion:

```text
API authority
-> zero requests matching /rest/v1/rpc/servos_v2_*
```

Any remaining API-mode guidance, capability, navigation, setup or business dependency must move to:

- API,
- IndexedDB,
- static/shared contract data.

Legacy Remote Manager may retain legacy RPC during transition.

---

# 20. SHARED CONTRACTS

Formalize shared server/browser types for:

- command envelope,
- command status,
- command outcome,
- change page,
- projection record,
- bootstrap manifest,
- offline grant,
- business document,
- print job,
- session projection.

Prefer one generated/shared source package.

Do not allow client/server payloads to drift silently.

Add protocol versioning where not already explicit.

---

# 21. BOOTSTRAP AND RECOVERY

Upgrade the current catalog bootstrap into a complete recovery protocol.

Target:

```text
manifest
schema/protocol version
high-water cursor
collection counts
hash/checksums
paged records
temporary IndexedDB install
verification
atomic activation
```

Never wipe unresolved local commands.

When rebuilding:

```text
check unresolved command IDs against server
-> resolve terminal outcomes
-> retain unresolved evidence
-> install server projection
```

Browser recovery evidence is not a PostgreSQL backup.

---

# 22. EXISTING DATA MIGRATION

This remains a hard production blocker.

Build a deterministic migration tool for the existing Countryside data.

Potential sources:

- legacy terminal SQLite,
- Supabase V2,
- exported CSV,
- legacy Web state.

Migration stages:

```text
PRECHECK
EXPORT
HASH
IMPORT
VERIFY
READY
COMMIT
```

Manifest must include:

- source identity,
- export timestamp,
- source version,
- hashes,
- record counts,
- stock totals,
- financial totals,
- open orders,
- customer balances,
- supplier balances,
- rooms/stays/reservations,
- history counts.

Before production activation reconcile:

```text
products
stock items
stock balances by location
customers
customer credit
suppliers
supplier balances
sales
payments
refunds
tills
rooms
stays
reservations
documents
```

No unexplained difference is acceptable.

---

# 23. NO DUAL WRITERS

Production cutover must prevent this:

```text
legacy POS writes stock A
while
new PostgreSQL Inventory writes stock B
```

Catalog + Inventory + POS + Payments/Tills form one production authority cluster.

Cutover:

```text
backup old authority
-> freeze legacy writers
-> final export
-> import
-> reconcile
-> activate API/PWA authority
-> smoke test
```

Do not run both business authorities concurrently.

---

# 24. VPS STAGING

Deploy production-like staging before live cutover.

Target topology:

```text
Internet
 |
Nginx
 |---- static PWA /var/www/serveos/current
 |
 +---- API hostname -> 127.0.0.1:3101
                      |
                  API container
                      |
              private Docker network
               /             \
          PostgreSQL         worker
               \
                backup
```

No Caddy.

No public PostgreSQL.

No PM2 requirement for the API.

## 24.1 Readiness

Improve `/health/ready` so it verifies expected migration level, not merely the existence of the migration table.

Also verify:

- DB connectivity,
- critical schema level,
- required configuration.

## 24.2 Release

Continue immutable release directories and SHA-256 manifests.

Activation:

```text
stage
-> validate
-> atomically switch current symlink
```

Rollback must switch to a previously verified release without modifying its contents.

---

# 25. BACKUP AND RESTORE

Encrypted off-VPS backup source exists.

It is not production-ready until restore succeeds.

Automate a rehearsal:

```text
download backup
-> decrypt
-> restore into clean Postgres
-> run required migrations
-> start API
-> health check
-> verify login
-> verify totals
-> verify catalog/inventory/orders/payments
-> verify command/audit history
```

Record evidence.

Add monitoring for:

- backup age,
- backup size,
- backup failure.

---

# 26. PRODUCTION OBSERVABILITY

Expose useful diagnostics without requiring developer access.

Operator/admin diagnostics should include:

- app release SHA,
- API version/release,
- schema/migration level,
- business,
- staff,
- device,
- online/offline,
- last successful sync,
- current cursor,
- pending commands,
- unknown commands,
- conflicts,
- print queue,
- IndexedDB persistence,
- storage usage,
- API health.

Support exports must redact:

- bearer tokens,
- refresh tokens,
- device private keys,
- signing material,
- passwords.

---

# 27. SECURITY HARDENING

Before cutover verify:

- HTTPS outside localhost,
- strict CORS,
- secure headers,
- no stack leakage,
- parameterized SQL,
- rate-limited login,
- rate-limited enrollment,
- bounded request bodies,
- least-privilege DB role,
- audit for admin actions,
- device/session revocation,
- offline grant expiry/quota/scope,
- signing-key rotation policy,
- no production secrets in repo/logs/artifacts.

Print Bridge:

- localhost only,
- trusted origin,
- pairing,
- bounded typed jobs,
- no arbitrary shell,
- no arbitrary files,
- no arbitrary printer bytes from browser JS.

---

# 28. STAGING REHEARSAL

A full production-like rehearsal must cover:

```text
fresh VPS release
database migration
login
device enrollment
catalog
opening stock
inventory count
receive
transfer
waste
adjust
batch prep
POS order
fire
inventory consumption
cash payment
manual M-Pesa
split payment
refund
till close
receipt
KOT/BOT
Print Bridge
PO/GRN
room reservation/check-in/folio/checkout
backup
restore
release rollback
```

Record every failure and rerun until clean.

---

# 29. REAL BUSINESS PILOT

Do one controlled real-business day before permanent authority cutover.

Capture:

- devices,
- operators,
- opening stock,
- opening tills,
- sales,
- tenders,
- M-Pesa,
- refunds,
- print failures,
- sync interruptions,
- conflicts,
- room activity,
- closing counts.

End-of-day reconciliation must prove:

```text
sales total
= tender totals
= order/payment ledger

cash expected
vs cash counted

M-Pesa ledger
vs external evidence

refund ledger
vs returned payments

stock opening
+ receives
+ transfers in
- transfers out
- waste
- recipe/batch/pos consumption
+ adjustments
= closing stock

room/folio charges
= guest balances/payments
```

Do not production-cut over after a pilot that does not reconcile.

---

# 30. NATIVE/LEGACY RETIREMENT

Only retire old authority after successful production operation.

Disable/remove:

- Supabase browser business writer,
- legacy snapshot writer,
- Tauri/SQLite business authority,
- duplicate cloud mutation path.

Retain where useful:

- Print Bridge code,
- parity fixtures,
- migration compatibility,
- historical tests.

Do not delete required historical DB migrations.

---

# 31. CURRENT PRIORITY ORDER FROM `393c3a69`

Execute in this order.

```text
1. make latest HEAD fully green

2. finish POS integration tests and browser acceptance
   order create/add/update/remove/fire
   multi-terminal order conflict
   stock consumption
   KOT/BOT

3. finish payment tests and operator UX
   cash
   manual M-Pesa
   split
   response-loss recovery

4. finish till tests/UX
   open
   cash movement
   blind close
   variance review
   close-day

5. finish refund/reversal tests
   partial
   full
   cash
   non-cash external reference
   no automatic restock

6. complete Inventory receiving/reversal acceptance
   package conversion
   cost
   bottle state
   later-activity reversal blockers

7. complete immutable business documents and 80mm renderer

8. build and hardware-test Print Bridge

9. extend signed grants for offline POS
   only after online revenue path is stable

10. migrate Procurement

11. migrate customer credit/Finance

12. migrate Hotel/PMS

13. migrate Assets/Maintenance

14. complete shared contracts + auth refresh lifecycle

15. build full business bootstrap/recovery

16. implement Countryside migration/reconciliation

17. deploy isolated VPS staging

18. prove encrypted backup restore

19. perform complete staging cutover rehearsal

20. run controlled real-business pilot

21. freeze legacy writers and perform final production migration

22. monitor/reconcile production

23. retire Tauri/Supabase business authority

24. clean dead legacy code
```

---

# 32. RELEASE GATES

## Gate A: Revenue platform

Required before expanding to Procurement/PMS:

```text
latest full CI green
real PWA -> API -> Postgres green
POS order flow green
POS stock consumption green
payments green
tills green
refunds green
documents green
```

## Gate B: Physical operation

Required before staging pilot:

```text
80mm renderer green
Print Bridge green
XP-80T hardware acceptance
barcode scanner acceptance
printer uncertainty/retry behavior green
```

## Gate C: Operational domains

Required before full-business staging:

```text
Procurement
Customer credit/Finance
Hotel/PMS
Assets/Maintenance
```

with PostgreSQL integration and browser acceptance.

## Gate D: Recovery

Required before live cutover:

```text
data migration rehearsal
reconciliation
backup restore
release rollback
browser rebuild/re-enroll
```

## Gate E: Production

Required:

```text
all P0/P1 issues closed
full CI green
hardware green
migration green
restore green
pilot green
close-day reconciliation green
rollback tested
no dual writers
```

---

# 33. DEFINITION OF DONE

The final sprint ends only when this statement is true:

> A staff member can enroll a new browser device, authenticate to the ServOS API, run catalog, inventory, POS, payments, tills, refunds, procurement, finance and hotel workflows against PostgreSQL, print reliable 80mm documents through the local Print Bridge, continue explicitly authorized operations during temporary connectivity loss, recover uncertain commands by their original IDs, rebuild the browser from server truth, restore the server from encrypted off-VPS backup, migrate the existing Countryside business with reconciled evidence, complete a real business day, and operate without Tauri or Supabase as business authority.

Final evidence:

```text
FULL CI                         PASS
REAL PWA -> API -> PG           PASS
MULTI-TERMINAL POS              PASS
RESPONSE LOSS                   PASS
INVENTORY                       PASS
POS                             PASS
PAYMENTS                        PASS
TILL                            PASS
REFUNDS                         PASS
DOCUMENTS                       PASS
PRINT BRIDGE                    PASS
HARDWARE PRINT                  PASS
OFFLINE RESTART                 PASS
PROCUREMENT                     PASS
FINANCE/CREDIT                  PASS
HOTEL/PMS                       PASS
MIGRATION RECONCILIATION        PASS
BACKUP RESTORE                  PASS
RELEASE ROLLBACK                PASS
REAL BUSINESS PILOT             PASS
CLOSE-DAY RECONCILIATION        PASS
NO DUAL WRITERS                 PASS
```

---

# 34. FINAL EXECUTION RULE

Do not optimize for commit count.

Do not stop because a subsystem "mostly works."

Continue through:

```text
green revenue platform
-> physical printing
-> offline revenue
-> procurement
-> finance
-> PMS
-> migration
-> staging
-> restore
-> pilot
-> production cutover
-> legacy retirement
```

If a later phase reveals a broken earlier invariant, repair the earlier invariant, add regression evidence, and resume.

The final goal is not a newer ServOS branch.

The final goal is a **single-authority, recoverable, hardware-proven, test-proven, browser-first ServOS that can run the actual resort without losing stock, money, rooms, documents, or transaction history.**
