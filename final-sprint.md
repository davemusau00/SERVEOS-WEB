# SERVOS FINAL SPRINT
## Web-First Reset, Revenue Completion, Print Bridge, Operational Domains, Migration and Production Cutover

**Repository:** `davemusau00/SERVEOS-WEB`  
**Branch:** `reset/vps-platform`  
**Current remote HEAD:** `6d04abdea9c0892f326ff99c5a9aa94c2576c50a`  
**Checkpoint date:** 2026-10-07  
**Branch position:** 107 commits ahead of `main`, 0 behind  
**Current phase:** Revenue stabilization + Print Bridge execution + remaining business-domain migration  
**Execution mode:** continuous implementation until production acceptance gates pass

---

# 0. PURPOSE

This is the authoritative final sprint instruction from the current live repository state.

Do not treat it as a roadmap that permits stopping after convenient milestones. The sprint ends only when ServOS can run the real business on the Web/PWA authority, through the ServOS API and PostgreSQL, with reliable local printing, safe bounded offline behavior, migrated real data, tested restore/rollback, and no Tauri/Supabase business authority.

For every implementation slice:

```text
inspect existing source
-> inspect parity/oracle behavior
-> implement
-> lint/typecheck
-> unit test
-> PostgreSQL integration test
-> browser acceptance
-> hardware acceptance when applicable
-> inspect evidence
-> fix failures
-> commit atomically
-> continue
```

Stop only when an external action genuinely requires the user, such as production-destructive migration approval, unavailable production secrets, DNS/SSH credentials, payment-provider credentials, or physical hardware interaction that cannot be simulated.

---

# 1. CURRENT COMPLETION BASELINE

| Area | Source Completion | Production Confidence |
|---|---:|---:|
| Architecture / target design | 96% | 90% |
| API command platform | 95% | 88% |
| PostgreSQL core | 91% | 85% |
| Authentication/device/session | 89% | 75% |
| IndexedDB/outbox/sync | 92% | 82% |
| Catalog | 92% | 82% |
| Inventory | 88% | 77% |
| POS backend | 84% | 68% |
| POS operator UX | 70% | 58% |
| Payments/tills | 67% | 58% |
| Refunds/reversals | 63% | 55% |
| Financial journals | 56% | 45% |
| Close-day | 52% | 42% |
| Business documents | 67% | 52% |
| Native printer transport | 60% | 20% |
| Print Bridge service | 55% | 10-15% |
| Procurement | 8% | ~5% |
| Customer credit/finance | 15% | ~10% |
| Hotel/PMS | 5% | ~5% |
| Existing-data migration | 10% | ~5% |
| VPS production cutover | 20% | ~10% |
| Backup restore proof | 15% | ~10% |
| Real business pilot | 0% | 0% |

Roll-up:

```text
PLATFORM / ARCHITECTURE             ~94%
SOURCE IMPLEMENTATION               ~91%
BUSINESS WORKFLOW MIGRATION         ~74%
VERIFIED IMPLEMENTATION             ~72%
PRODUCTION READINESS                ~56%
OVERALL WEB-FIRST RESET             ~82%
```

The remaining work is now dominated by verification, physical printing, remaining business domains, migration and cutover rather than foundational architecture.

---

# 2. CURRENT CI STOP GATE

At this checkpoint, the latest HEAD CI is active.

Already green:

```text
native-domain
cloud-protocol-base
cloud-protocol-v2
```

Still running when this document was generated:

```text
api-postgres
browser-preview
browser-production
desktop-shell
windows-printer-shell
```

Known blocker:

```text
frontend
  npm ci        PASS
  npm run lint  FAIL
```

## Immediate rule

Do not expand into Procurement, PMS, customer credit or another large POS feature wave while the current branch carries a frontend lint/type failure.

Fix the exact current HEAD first.

Required same-commit green matrix:

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
print-bridge (Linux and Windows)
evidence-summary
```

Do not weaken lint/test configuration merely to produce a green badge.

---

# 3. NON-NEGOTIABLE ARCHITECTURE

## One shared authority

```text
PWA
 |
ServOS API
 |
PostgreSQL
```

No browser direct shared-database mutation. No Supabase business mutation after cutover. No Tauri/SQLite business authority after cutover.

## No dual writers

Never operate legacy and PostgreSQL business writers against the same live business at the same time.

Catalog + Inventory + POS + Payments/Tills must cut over as one business-authority cluster.

## Shared mutations are commands

Preserve:

```text
immutable command UUID
canonical payload hash
permission checks
expected versions
transaction
audit
change records
durable outcome
same UUID after uncertainty
```

## Transient failures remain replayable

```text
deterministic validation -> REJECTED
permission/domain refusal -> REJECTED
version/business conflict -> CONFLICT
infrastructure/5xx -> unresolved and replayable with same UUID
```

## Explicit projection contract

Every handler returns:

```ts
{
  value,
  records
}
```

No recursive projection guessing.

## IndexedDB is local durability, not cloud authority

IndexedDB owns local projections, outbox, drafts, offline grants, immutable document snapshots, print evidence and recovery evidence.

PostgreSQL remains authoritative shared truth.

## SSE is only an invalidation hint

Authoritative synchronization remains ordered change polling by cursor.

---

# 4. PRESERVE COMPLETED PLATFORM WORK

Do not rebuild or replace:

- API login
- password changes
- device enrollment
- P-256 device identity
- hashed bearer sessions
- durable command lifecycle
- idempotent replay
- expected-version locking
- transient failure recovery
- ordered change feed
- SSE invalidation
- API bootstrap
- IndexedDB projections/outbox
- response-loss recovery
- signed bounded offline grants
- service-worker update fencing
- immutable local business documents
- local print jobs/events
- storage diagnostics
- recovery evidence export
- real PWA -> API -> PostgreSQL acceptance
- immutable release packaging
- VPS activation/rollback tooling
- backup implementation skeleton

Extend these systems. Do not create parallel replacements.

---

# 5. CATALOG: VERIFY, DO NOT REDESIGN

Current source already supports:

- products
- stock items
- locations
- package units
- recipes
- selling options
- product modifiers
- modifier ingredient adjustments
- favorites/default selling behavior
- Smart Item opening stock

Required acceptance:

- whole item sale
- portion sale
- package sale
- bottle sale
- recipe sale
- modifier price effect
- modifier stock effect
- stale modifier revision
- archived modifier refusal
- barcode unaffected by active UI filters
- duplicate barcode refusal
- scanner Enter/newline behavior
- response-loss recovery

---

# 6. INVENTORY: FINISH ACCEPTANCE + PROCUREMENT HOOKS

Current source supports:

```text
opening stock
full count
selected count
transfer
waste
policy
receive
movement reversal
manager adjustment
batch preparation
sealed/open bottle state
balance revisions
POS consumption
modifier inventory effects
void return evidence
```

## Receiving

Prove:

- package conversion
- base quantity
- unit cost
- weighted average cost
- sealed bottle receive
- balance revisions
- replay
- concurrent receive
- response loss

## Movement reversal

Prove:

- original movement retained
- compensating movement
- immutable relationship
- no double reversal
- later-activity blocker
- reviewed physical state
- current balance/revision
- original cost
- sealed/open constraints

## Counts

Finish:

- history pagination
- filters
- variance summary
- approval threshold
- actor/date/location
- stale balance revision conflict
- bottle conservation
- multi-terminal race tests

## Requisition/issue

Implement only where required by real parity:

```text
request
-> approve
-> issue
-> acknowledge
```

Use canonical paired stock movements.

## Supplier return

Inventory owns the physical return. Procurement owns supplier accounting.

---

# 7. POS: FREEZE FEATURE EXPANSION AND PROVE IT

Current POS includes:

```text
order.create
order.addItem
order.updateItem
order.removeItem
order.fire
order.void
order.discount
order.compItem
order.comp
round tracking
repeat round
courses
partial firing
preparation notes
preparation states
selling options
modifiers
modifier inventory adjustments
KOT/BOT
zero-value completion
```

The next work should be acceptance, not another feature burst.

## Required end-to-end flow

```text
open till
-> create order
-> select/scan product
-> select selling option
-> select modifiers
-> add preparation note
-> fire selected lines
-> issue KOT/BOT
-> preparation state transitions
-> repeat round
-> add later round
-> pay
-> issue receipt
-> journal
-> till
-> close day
```

## Concurrent order editing

Two terminals must never silently overwrite.

Test concurrency for:

- add line
- quantity edit
- modifier edit
- note edit
- fire
- discount
- comp
- void

## Partial firing

Verify:

- draft lines editable
- fired lines frozen
- later fire emits only new ticket content
- no duplicate stock consumption
- course/round attribution remains correct

## Rounds

Test:

- first round
- repeat round
- changed catalog after earlier round
- modifier changes
- insufficient stock
- response loss
- concurrent repeat from two terminals

## Preparation/KDS

Prove the canonical preparation state model end-to-end, including kitchen and bar station separation, partial tickets, cancellations and uncertain prior delivery.

## Discounts/comps

Verify:

- item comp
- order comp
- discount
- reason
- permission
- no repricing after payment
- frozen tax policy
- stock unaffected
- zero-value receipt

## Void

Verify:

- unpaid order
- partially paid refusal
- paid refusal
- unfired void
- fired void
- sealed return
- waste
- consumed disposition
- manager-correction-needed state
- later stock activity
- KOT/BOT cancellation
- uncertain prior print delivery

Never silently rewind stock history.

---

# 8. PAYMENTS

Current source includes:

```text
payment.record
payment.split
payment.refund
payment.reverse
```

Production baseline:

- cash
- manual M-Pesa
- card/manual external payment
- split tender

## Manual M-Pesa

Verify:

- configured account/till/paybill
- external reference
- duplicate-reference policy
- operator confirmation
- receipt evidence
- optional payment QR

DARAJA is optional for first production if manual M-Pesa is safe and reconciled.

## Split tender

Prove:

```text
cash + M-Pesa
cash + card
M-Pesa + card
```

Cash drawer must change only for cash allocation.

## Response loss

Mandatory:

```text
payment commits
-> response disappears
-> client marks outcome unknown
-> status checks original command UUID
-> exact payment recovered
-> no duplicate money
```

Repeat for split payment.

---

# 9. REFUNDS AND REVERSALS

Preserve:

```text
refund money != automatic stock return
```

Current refund source already includes payment/order locks, remaining refundable amount, till ownership, cash-drawer checks, external refs, immutable evidence, refund documents and print queue integration.

Prove:

- partial refund
- second partial refund
- full remaining reversal
- over-refund refusal
- duplicate UUID replay
- cash refund
- external/manual refund
- closed till behavior
- response loss
- prior refund journal reconciliation

---

# 10. FINANCIAL JOURNALS

Current account model includes:

```text
ASSET_TENDER
REVENUE_SALES
LIABILITY_VAT
LIABILITY_LEVY
```

Every journal must satisfy:

```text
total debit == total credit
```

Prove:

- full payment
- two partial payments
- many small partial payments
- split tender
- new fired lines after partial payment
- partial refund
- multiple partial refunds
- final remaining reversal

Rounding must conserve the original order total exactly.

Missing or inconsistent historical journals must fail closed. Do not guess historical allocations.

---

# 11. TILLS AND CLOSE DAY

Current commands:

```text
till.policy.save
till.open
till.cashMovement
till.close
till.reviewVariance
```

Prove:

```text
open
opening float
cash payment
paid in
paid out
cash refund
expected cash
blind count
variance
manager review
close
```

Close blockers must include unresolved money commands and unsettled orders.

Close-day must prove:

- one immutable report per closed till
- settled sales
- zero-value sales
- tender totals
- refunds
- tax totals
- journal reconciliation
- expected cash
- counted cash
- variance
- unresolved diagnostics

Do not infer credit or hotel folio exposure until those modules exist.

---

# 12. BUSINESS DOCUMENTS

Complete canonical immutable document support for:

```text
SALE_RECEIPT
REFUND_RECEIPT
PAYMENT_ACKNOWLEDGEMENT
KITCHEN_TICKET
BAR_TICKET
KOT_CANCEL
BOT_CANCEL
ORDER_VOID_NOTICE
TILL_CLOSE_SUMMARY
CLOSE_DAY_REPORT
STOCK_TRANSFER
STOCK_COUNT_SHEET
STOCK_VARIANCE_REPORT
PURCHASE_ORDER
GOODS_RECEIPT_NOTE
SUPPLIER_RETURN
CUSTOMER_STATEMENT
CREDIT_PAYMENT_ACK
HOTEL_FOLIO
RESERVATION_CONFIRMATION
HOUSEKEEPING_LIST
MAINTENANCE_WORK_ORDER
```

Historical documents render from immutable snapshots, not current mutable business/catalog state.

---

# 13. PRINT BRIDGE: CURRENT IMPLEMENTATION

The Print Bridge is now a real source subsystem.

Current remote includes:

```text
crates/servos-printer-transport
apps/print-bridge
```

Implemented source includes:

- retained native ESC/POS transport
- Windows RAW
- private-LAN TCP
- bounded printer profiles
- cut/feed behavior
- typed bridge actions
- device signature verification
- trusted pairing
- API-signed bridge claims
- pinned API key verification
- live claim checks
- current permission checks
- approved local printer routing
- strict KOT/BOT rendering
- cancellation rendering
- void notice rendering
- durable local journal
- attempt fencing
- delivery uncertainty handling
- authenticated dispatcher
- request recovery
- PWA transport contracts
- PWA recovery evidence
- recovery UI
- trusted local config
- private serial worker

Do not describe this as "not started."

It is source-complete enough to enter execution and service-integration work.

---

# 14. PRINT BRIDGE: IMMEDIATE NEXT WORK

## Add explicit bridge CI

Create a dedicated CI job for:

```text
crates/servos-printer-transport
apps/print-bridge
```

Run:

```text
cargo fmt --check
cargo clippy
cargo test
cargo build --release
```

The existing Tauri tests are not proof of the standalone bridge.

## Cross-language crypto interoperability

Test:

```text
TypeScript signs -> Rust verifies
API signs claim -> Rust verifies
API signs live check -> Rust verifies
```

Modify each signed field individually and prove failure:

- business ID
- device ID
- bridge ID
- job ID
- job revision
- attempt
- document ID
- document hash
- type
- role
- copies
- expiry

## Request lifecycle

Prove:

```text
PWA SUBMIT
-> signature verification
-> trusted pairing
-> API claim verification
-> live API check
-> current permission
-> approved route
-> strict renderer
-> durable local attempt
-> native transport
-> durable result
-> bounded response
```

## Crash/restart matrix

Crash at:

- before request persistence
- after request persistence
- before attempt creation
- after attempt creation
- before native send
- during native send
- after native acceptance before result commit
- after result commit before browser response

Never automatically resend ambiguous output.

## Local HTTPS host

Source now includes a loopback Node HTTPS host that privately owns the stdio worker, plus a Windows SCM wrapper and manual install/uninstall script. The wrapper runs as LocalService, forwards stop through a private control pipe, drains admitted host requests and never automatically restarts or resends a print. The install script keeps pairing/TLS inputs outside the release bundle and preserves the SQLite journal when unregistering.

This is not an installed or accepted service. Build/sign/package evidence, service execution, LocalService printer ACL acceptance, trusted localhost certificate setup, browser-to-service acceptance and physical printer delivery remain open.

The host boundary is:

```text
localhost HTTPS only
trusted Origin allowlist
strict CORS
bounded bodies
no redirects
no LAN bind
private worker pipe ownership
installer-managed config
```

## Pairing

Implement local approval:

```text
browser device public key
-> local admin approval
-> trusted config
-> per-request reload
```

Support revocation.

No implicit/default trust.

## API outcome reporting

Bridge must map and report:

```text
native accepted -> SENT_TO_SPOOLER
known pre-output failure -> FAILED
possible output -> DELIVERY_UNCERTAIN
```

Server and local attempt evidence must reconcile.

## Normal PWA printing

Recovery controls already exist.

Add normal flow:

```text
claim
-> bridge submit
-> result
-> server outcome
```

Never fall back to browser printing automatically after delivery uncertainty.

---

# 15. PRINT RENDERERS

Current strict renderers focus on KOT/BOT and void/cancel notices.

Add:

- SALE_RECEIPT
- REFUND_RECEIPT
- PAYMENT_ACKNOWLEDGEMENT
- TILL_CLOSE_SUMMARY
- CLOSE_DAY_REPORT
- PURCHASE_ORDER
- GRN
- HOTEL_FOLIO

Canonical 80mm receipt must support:

```text
logo
business identity
tax identity
receipt number
date/time
cashier
items
qty
unit price
discount/comp
line total
tax
grand total
payment method
customer
M-Pesa QR
Scan to Pay via One app
footer
cut
```

QR goes immediately before footer.

Respect physical printer margins.

---

# 16. HARDWARE ACCEPTANCE

Use actual target hardware:

- Countryside Windows AIO
- XP-80T or deployed equivalent
- barcode scanner
- LAN printer where applicable

Test:

- Windows RAW
- TCP 9100
- logo
- QR
- cutter
- long receipt
- KOT
- BOT
- cancellation notice
- void notice
- Unicode fallback
- printer offline
- Windows queue stalled
- power interruption
- bridge restart
- uncertain delivery
- reviewed retry

Print Bridge is not production-ready until this passes.

---

# 17. OFFLINE POS

Do not expand offline POS until online revenue + Print Bridge are stable.

Extend the existing signed-grant system.

Potential first allowlist:

- order.create
- order.addItem
- order.updateItem
- order.removeItem
- order.fire
- cash payment
- explicitly allowed manual external payment
- ordinary stock consumption
- immutable receipt/KOT generation

Keep online-only initially:

- refunds
- high-value discounts/comps
- staff changes
- supplier payments
- major stock corrections
- imports
- destructive recovery

Mandatory restart proof:

```text
offline sale
-> close browser
-> restart
-> reopen offline
-> order/payment/documents still present
-> reconnect
-> same UUIDs synchronize once
```

---

# 18. PROCUREMENT

This is now the largest missing non-hotel domain.

Implement:

- suppliers
- purchase orders
- approvals
- PO issue
- partial/full receive
- GRN
- inventory receive
- supplier return
- supplier invoice
- payable
- supplier payment

Canonical flow:

```text
draft PO
-> approve
-> issue
-> receive
-> GRN
-> stock posting
-> invoice/payable
-> supplier payment
```

Rules:

- partial receiving
- replay-safe receive
- over-receive policy
- package conversion
- cost basis
- duplicate supplier invoice protection
- returns linked to original receipt
- corrections via compensating records

Reuse canonical Inventory receive/reversal logic.

---

# 19. CUSTOMER CREDIT + FINANCE

Migrate:

- named customer credit
- credit limit
- credit charge from order
- credit payment
- statement
- aging
- balance
- manager override
- payment acknowledgement

No anonymous credit.

Finance additionally needs:

- expenses
- supplier payments
- cash movements
- approval controls
- reconciled reports

All money uses integer minor units.

---

# 20. HOTEL / PMS

Migrate:

- room types
- rooms
- rates
- guests
- reservations
- stays
- folios
- folio charges
- folio payments
- room move
- extension
- checkout
- housekeeping
- maintenance blocks

## Double-booking

Use authoritative version/lease semantics.

Prove two-browser race. Only one incompatible reservation/check-in may confirm.

## Restaurant-to-room

POS room charge must require a valid active stay/folio.

No orphan folio charges.

---

# 21. ASSETS + MAINTENANCE

Migrate:

- asset register
- location
- condition
- maintenance work order
- assignment
- cost
- status
- history

Corrections must preserve history.

---

# 22. AUTH PRODUCTION HARDENING

Current auth works.

Finish:

- short-lived access token
- rotating refresh token
- Secure HttpOnly SameSite cookie
- hashed refresh tokens
- replay/family detection
- session list
- session revoke
- device list/revoke
- staff-disable invalidation
- password-change invalidation policy

Do not store refresh credentials in IndexedDB.

Disable/remove initial admin bootstrap secret after setup.

---

# 23. API AUTHORITY PURITY

Permanent browser assertion:

```text
apiAuth active
=> zero /rest/v1/rpc/servos_v2_* business calls
```

Legacy Remote Manager can remain isolated during transition.

---

# 24. FULL BOOTSTRAP / RECOVERY

Upgrade bootstrap into complete business recovery:

```text
manifest
protocol version
schema version
high-water cursor
collection counts
hashes
paged records
temporary install
verification
atomic activation
```

Before projection replacement:

```text
resolve all unresolved command IDs against server
```

Never erase unresolved evidence.

---

# 25. EXISTING COUNTRYSIDE DATA MIGRATION

Build deterministic migration tooling.

Possible sources:

- old terminal SQLite
- Supabase
- CSV exports
- legacy browser state

Stages:

```text
PRECHECK
EXPORT
HASH
IMPORT
VERIFY
READY
COMMIT
```

Manifest:

- source identity
- source version
- export time
- hashes
- counts
- stock totals
- sales totals
- payment totals
- customer credit
- supplier balances
- rooms/stays/reservations
- history/documents

No unexplained difference is acceptable.

Do not rely on hand-written live SQL as the migration strategy.

---

# 26. VPS STAGING

Production-like topology:

```text
Internet
 |
Nginx
 |--- static PWA
 |
 +--- API hostname -> 127.0.0.1:3101
                     |
                 API container
                     |
                private network
                 /          \
           PostgreSQL       worker
                 \
                  backup
```

Requirements:

- PostgreSQL private
- HTTPS
- strict CORS
- API loopback
- immutable release dirs
- atomic symlink activation
- rollback

Improve `/health/ready` to verify the expected migration level, not merely migration-table existence.

---

# 27. BACKUP RESTORE

Backup is not accepted until restoration works.

Run:

```text
production-like DB
-> encrypted backup
-> off-VPS destination
-> clean target DB
-> restore
-> start API
-> health
-> login
-> verify catalog
-> verify inventory
-> verify POS
-> verify payments
-> verify journals
-> verify command/audit history
```

Record restore evidence.

---

# 28. OBSERVABILITY + SECURITY

Expose diagnostics:

```text
app SHA
API release
schema version
business
staff
device
last sync
cursor
pending commands
unknown outcomes
conflicts
print queue
bridge status
storage persistence
API health
backup age
```

Redact:

- bearer tokens
- refresh tokens
- private keys
- signing secrets
- passwords

Before production verify:

- HTTPS
- strict CORS
- secure headers
- no stack leaks
- parameterized SQL
- least-privilege DB user
- login/enrollment throttling
- request limits
- device/session revoke
- signing-key rotation
- bridge localhost only
- no arbitrary browser ESC/POS
- no arbitrary shell/file access
- no production secrets in repo/logs/artifacts

---

# 29. FULL STAGING ACCEPTANCE

Run:

```text
login
device enrollment
catalog
stock
receive
count
transfer
waste
batch
POS
selling option
modifier
course
round
KOT/BOT
preparation
discount
comp
void
cash
M-Pesa
split
refund
till
journal
close day
receipt
Print Bridge
PO/GRN
customer credit
reservation
check-in
folio
checkout
backup
restore
rollback
```

No skipped revenue-path steps.

---

# 30. REAL BUSINESS PILOT

Run one controlled real operating day.

Capture:

- operators
- devices
- opening stock
- opening tills
- orders
- rounds
- payments
- M-Pesa
- refunds
- print events
- bridge uncertainty
- stock movement
- room activity
- closing cash
- closing stock

Reconcile:

```text
sales
payments
refunds
tenders
cash
M-Pesa
journals
tax
stock
credit
rooms/folios
```

A non-reconciling pilot returns to development.

---

# 31. PRODUCTION CUTOVER

Sequence:

```text
green release
-> verified backup
-> freeze legacy writers
-> final export
-> hash
-> final import
-> reconcile
-> activate API/PWA
-> activate Print Bridge
-> smoke test
-> operate
-> monitor
```

Never run dual business authorities.

---

# 32. LEGACY RETIREMENT

After successful production operation:

Disable/remove:

- Supabase browser business mutation
- Tauri/SQLite business authority
- legacy snapshot writer
- duplicate sync writers

Retain useful:

- parity fixtures
- migration compatibility
- printer transport source
- historical tests
- historical DB migrations

---

# 33. CURRENT EXECUTION ORDER FROM `6d04abd`

```text
1. FIX FRONTEND LINT ON CURRENT HEAD

2. GET ONE FULL SAME-COMMIT GREEN CI RUN

3. RUN EXPLICIT PRINT-BRIDGE CI (Linux and Windows; workflow source is present)
   cargo fmt
   clippy
   test
   release build

4. PROVE TS <-> RUST <-> API SIGNATURE INTEROPERABILITY

5. PROVE PRINT-BRIDGE CRASH/RESTART/UNCERTAINTY BEHAVIOR

6. COMPLETE LOCAL HTTPS BRIDGE HOST + SIGNED INSTALLER/SERVICE ACCEPTANCE
   source host, SCM wrapper and manual install/uninstall are present; build, packaging, execution and target acceptance remain open

7. WIRE NORMAL PWA PRINT SUBMISSION + SERVER OUTCOME REPORTING

8. COMPLETE RECEIPT/REFUND/CLOSE-DAY BRIDGE RENDERERS

9. RUN REAL XP-80T HARDWARE ACCEPTANCE

10. RUN FULL POS ACCEPTANCE
    modifiers
    courses
    rounds
    preparation
    discounts
    comps
    voids
    multi-terminal conflicts
    response loss

11. COMPLETE PAYMENT/TILL/JOURNAL/CLOSE-DAY RECONCILIATION

12. ENABLE NARROW OFFLINE POS ONLY AFTER ONLINE REVENUE IS GREEN

13. MIGRATE PROCUREMENT

14. MIGRATE CUSTOMER CREDIT + FINANCE

15. MIGRATE HOTEL/PMS

16. MIGRATE ASSETS/MAINTENANCE

17. FINISH AUTH REFRESH/REVOCATION

18. FINISH FULL BOOTSTRAP/RECOVERY

19. BUILD COUNTRYSIDE DATA MIGRATION

20. DEPLOY VPS STAGING

21. PROVE ENCRYPTED BACKUP RESTORE

22. RUN COMPLETE STAGING CUTOVER REHEARSAL

23. RUN REAL BUSINESS PILOT

24. FREEZE LEGACY WRITERS

25. FINAL MIGRATION + PRODUCTION CUTOVER

26. RECONCILE FIRST PRODUCTION DAY

27. RETIRE TAURI/SUPABASE BUSINESS AUTHORITY

28. CLEAN DEAD LEGACY CODE
```

---

# 34. RELEASE GATES

## Gate A: Current branch integrity

```text
frontend PASS
api-postgres PASS
browser-preview PASS
browser-production PASS
cloud-protocol-base PASS
cloud-protocol-v2 PASS
native-domain PASS
desktop-shell PASS
windows-printer-shell PASS
print-bridge (Linux and Windows) PASS
evidence-summary PASS
```

## Gate B: Print Bridge

```text
bridge compile PASS
bridge unit tests PASS
crypto interoperability PASS
claim expiry/revoke PASS
crash recovery PASS
HTTPS host PASS
installer/service PASS
XP-80T PASS
uncertain delivery PASS
reviewed retry PASS
```

## Gate C: Revenue

```text
POS PASS
inventory consumption PASS
payments PASS
refunds PASS
till PASS
journals PASS
close day PASS
receipts PASS
KOT/BOT PASS
```

## Gate D: Business domains

```text
procurement PASS
customer credit PASS
finance PASS
hotel/PMS PASS
assets/maintenance PASS
```

## Gate E: Recovery/cutover

```text
data migration PASS
reconciliation PASS
backup restore PASS
release rollback PASS
browser rebuild PASS
pilot PASS
no dual writers PASS
```

---

# 35. DEFINITION OF DONE

ServOS is done when:

> A staff member can enroll a new browser device, authenticate to the ServOS API, run catalog, inventory, POS, payments, tills, refunds, procurement, customer credit, finance and hotel workflows against PostgreSQL, print reliable 80mm documents through the installed trusted Print Bridge, continue explicitly authorized workflows during temporary connectivity loss, recover uncertain commands using their original IDs, rebuild a browser from server truth, restore the server from encrypted off-VPS backup, migrate the existing Countryside business with reconciled evidence, complete a real business day, and operate without Tauri or Supabase as business authority.

Final evidence:

```text
FULL CI                         PASS
REAL PWA -> API -> POSTGRES     PASS
MULTI-TERMINAL POS              PASS
RESPONSE LOSS                   PASS
INVENTORY                       PASS
POS                             PASS
PAYMENTS                        PASS
REFUNDS                         PASS
TILL                            PASS
JOURNALS                        PASS
CLOSE DAY                       PASS
PRINT BRIDGE                    PASS
XP-80T HARDWARE                 PASS
OFFLINE RESTART                 PASS
PROCUREMENT                     PASS
CUSTOMER CREDIT                 PASS
FINANCE                         PASS
HOTEL/PMS                       PASS
MIGRATION RECONCILIATION        PASS
BACKUP RESTORE                  PASS
RELEASE ROLLBACK                PASS
REAL BUSINESS PILOT             PASS
FIRST-DAY RECONCILIATION        PASS
NO DUAL WRITERS                 PASS
```

---

# 36. FINAL EXECUTION RULE

The remaining work is no longer about proving the architecture is possible. It is about proving the complete system is trustworthy.

Do not chase feature count. Do not create another framework. Do not redesign the architecture.

Drive the current system through:

```text
green CI
-> Print Bridge execution
-> real printer
-> full revenue acceptance
-> remaining business domains
-> migration
-> restore
-> staging
-> pilot
-> production cutover
-> legacy retirement
```

If any later phase exposes a broken earlier invariant, repair the invariant, add regression evidence, then continue.

The sprint ends with a production system, not with a large diff.
