# SERVOS FINAL SWEEP — DEVELOPMENT INSTRUCTION

## Mission

Finish the Web/API/PostgreSQL reset in one continuous engineering pass.

**Repository:** `davemusau00/SERVEOS-WEB`  
**Branch:** `reset/vps-platform`  
**Reviewed baseline HEAD:** `a12676dfe7ec2c20d73c86fdf2dc275288566f08`  
**Branch delta at review:** 191 commits ahead of `main`, 0 behind  
**Migration high-water at review:** `068_pos_order_merge.sql`

The only intentionally excluded task is:

```text
ACTUAL CURRENT COUNTRYSIDE DATA MIGRATION
```

Do not extract, normalize, map, import, reconcile, freeze or cut over the existing Countryside terminal data during this sweep.

Everything else required to make ServOS ready to receive that data later must be finished now.

---

# 1. EXECUTION MODE

This is a final sweep, not another feature-expansion phase.

Do not stop at “source implemented”.

Do not write “tests deferred”.

Do not leave known failing CI, unapplied migrations, concurrency holes, response-loss gaps, accounting mismatches, browser-recovery gaps, unsafe printer retry behavior, or silent legacy writers.

Continue until each domain’s acceptance gate passes.

If a test exposes a defect:

```text
fix behavior
add regression coverage
rerun the narrow gate
rerun the full gate
continue
```

Do not weaken tests just to obtain green.

---

# 2. SCOPE FREEZE

Permitted:

```text
finish established workflows
fix required UX
close invariants
add missing constraints
add tests
add audit/reconciliation evidence
finish existing documents
finish security/recovery/deployment behavior
remove/fence legacy writers
refresh documentation
```

Not permitted:

```text
new unrelated business modules
new speculative dashboards
new migration UI for Countryside
new shared database authority
new browser-direct business mutation
new Tauri business authority
new Supabase business authority
```

---

# 3. ARCHITECTURE TO PRESERVE

Shared authority:

```text
PWA
 |
ServOS API
 |
PostgreSQL
```

Shared mutation:

```text
UI intent
-> durable command UUID
-> canonical payload
-> authentication
-> permission
-> expected versions
-> manager approval if required
-> PostgreSQL transaction
-> immutable/audited evidence
-> ordered change feed
-> durable outcome
-> local projection
```

Browser rebuild:

```text
authenticated snapshot
-> manifest/high-water
-> deterministic pages
-> SHA-256 verification
-> staged IndexedDB install
-> count/hash validation
-> atomic activation
-> change-feed continuation
```

Printing:

```text
PWA
-> signed localhost HTTPS
-> Print Bridge
-> API claim verification
-> durable print journal
-> Rust renderer/transport
-> Windows RAW or TCP 9100
-> physical printer
```

No dual writers.

---

# 4. CURRENT SOURCE STATE

The branch already contains substantial implementation for:

```text
API command kernel
PostgreSQL authority
Auth / Staff / Device / Session
rotating access + refresh tokens
manager approvals
bootstrap snapshots
Catalog
Inventory
POS
courses / preparation / rounds
floorplan / table service
order transfer
order merge
payments / refunds
tills
financial journals
close day
Procurement
supplier payables / credits
Customer Credit
Print Bridge
offline cash POS foundation
Hotel / PMS
Finance / Expenses
Assets / Maintenance
VPS / backup foundations
```

Recent migrations:

```text
057 staff management
058 device events
059 session events
060 refresh tokens
061 refresh rotation recovery
062 bootstrap snapshots
063 hospitality core
064 hospitality folios
065 finance/assets
066 POS room charges
067 floorplan tables
068 POS order merge
```

Do not redesign. Finish and prove.

---

# 5. PHASE 0 — RESTORE A FULL GREEN BASELINE

Current recent CI evidence:

```text
frontend:
  lint   PASS
  build  PASS
  tests  FAIL

api-postgres:
  recent runs FAIL
  real PWA/API/PostgreSQL acceptance also failed on recent head

Print Bridge:
  formatting now passes
  clippy/tests/release steps are finally executing

browser-preview / production:
  must pass on final exact SHA
```

Start here.

Run:

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:ui
npm run docs:check
```

Then:

```bash
npm ci --prefix apps/api
npm run test:api
npm run test:browser:api
```

Then:

```bash
npm run test:browser
npm run test:browser:production
npm run test:native
npm run check:desktop
npm run test:desktop
npm run test:cloud:base
npm run test:cloud:v2
npm run protocol:check
```

Print Bridge:

```bash
cargo fmt --manifest-path apps/print-bridge/Cargo.toml -- --check
cargo fmt --manifest-path crates/servos-printer-transport/Cargo.toml -- --check

cargo clippy --locked --manifest-path apps/print-bridge/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path crates/servos-printer-transport/Cargo.toml --all-targets -- -D warnings

cargo test --locked --manifest-path apps/print-bridge/Cargo.toml --all-targets
cargo test --locked --manifest-path crates/servos-printer-transport/Cargo.toml --all-targets

cargo build --locked --release --manifest-path apps/print-bridge/Cargo.toml
cargo build --locked --release --manifest-path crates/servos-printer-transport/Cargo.toml
```

On Windows:

```bash
cargo clippy --locked --manifest-path apps/print-bridge/Cargo.toml --features windows-service --bin servos-print-bridge-service -- -D warnings
cargo build --locked --release --manifest-path apps/print-bridge/Cargo.toml --features windows-service --bin servos-print-bridge-service
```

Required hosted matrix on one exact commit:

```text
api-postgres           PASS
frontend               PASS
browser-preview        PASS
browser-production     PASS
native-domain          PASS
cloud-protocol-base    PASS
cloud-protocol-v2      PASS
desktop-shell          PASS
windows-printer-shell  PASS
print-bridge Ubuntu    PASS
print-bridge Windows   PASS
evidence-summary       PASS
```

No “green except”.

---

# 6. PHASE 1 — AUTH / STAFF / DEVICE / SESSION

Verify existing source, do not redesign.

Acceptance:

```text
initial Admin setup
concurrent initial setup
restart after setup
secret retirement

staff.create
forced password change
staff.update
role change
permission ceiling
routine Admin grant refusal
last-Admin concurrency
staff.deactivate

device enrollment
device-owner collision
repeat enrollment
device revoke

own-session list
other-own-session revoke
current-session sign-out

15-minute access expiry
refresh rotation
retry inside recovery window
reuse after recovery window
refresh-family revoke
cross-tab Web Locks
SSE refresh

password change revokes other sessions
device revoke revokes linked sessions/families
staff deactivate revokes devices/sessions/families
logout
```

Security assertions:

```text
no refresh credential in IndexedDB
no refresh credential in localStorage
no raw password in command outcome
no approval token in support/recovery evidence
revoked session refused
disabled staff refused
```

Exit:

```text
AUTH PASS
STAFF PASS
DEVICE PASS
SESSION PASS
REFRESH PASS
REPLAY PASS
CONCURRENCY PASS
```

---

# 7. PHASE 2 — BOOTSTRAP / BROWSER RECOVERY

Finish migration 062 acceptance.

Test:

```text
fresh browser
empty IndexedDB
deleted IndexedDB
partial staged snapshot
reload during transfer
resume
snapshot expiry
permission change
session change
device revoke
manifest tamper
page tamper
count mismatch
high-water mismatch
storage quota failure
IndexedDB abort
pending command blocks rebuild
OUTCOME_UNKNOWN blocks rebuild
atomic activation
failed activation preserves old projection
post-snapshot changes replay cleanly
large dataset
```

Exit:

```text
BOOTSTRAP PASS
RESUME PASS
HASH PASS
ATOMIC ACTIVATION PASS
CORRUPTION RECOVERY PASS
```

---

# 8. PHASE 3 — CATALOG

Close:

```text
product.save
stockItem.save
stockLocation.save
catalog.createWithOpeningStock

product.archive/reactivate
stockItem.archive/reactivate
stockLocation.archive/reactivate
```

Test dependency blockers:

```text
draft orders
nonzero stock
direct consumption
recipe use
modifier use
open PO
supplier returns
outlet defaults
duplicate code/barcode on restore
stale versions
concurrent archive/edit
response loss
bootstrap tombstones
reload
```

Also validate:

```text
selling options
portions
recipes
purchase packages
tax classes
outlet assignment
modifiers
barcode scanning
```

Exit:

```text
CATALOG PASS
ARCHIVE/RESTORE PASS
BARCODE PASS
RECIPE PASS
MODIFIER PASS
```

---

# 9. PHASE 4 — INVENTORY

Verify:

```text
opening stock
receive
full count
selected count
transfer
waste
adjust
batch production
movement reversal
POS consumption
modifier consumption
void return
GRN posting
supplier-return movement
```

Critical cases:

```text
package conversion
weighted average cost
sealed/open bottle receive
one-open-bottle rule
bottle conservation
stale revisions
receive race
count race
transfer race
waste race
batch race
later-activity reversal blocker
original-cost reversal
replay
response loss
```

Conservation must hold:

```text
opening
+ receive
+ transfer in
- transfer out
- sales/recipe/modifier consumption
- waste
+/- adjustment
+ production
- supplier return
=
closing
```

Exit:

```text
INVENTORY PASS
BOTTLE PASS
COSTING PASS
REVERSAL PASS
CONCURRENCY PASS
RECONCILIATION PASS
```

---

# 10. PHASE 5 — POS / FLOORPLAN / TABLE SERVICE

Current source includes:

```text
counter/takeaway/table orders
line operations
selling options
modifiers
notes
courses
partial fire
KOT/BOT
preparation states
rounds/repeat round
discount
comp
void
customer assignment
floorplan
table.ready
order.transfer
order.merge
room charge
```

## Standard POS

Prove:

```text
open till
create order
scan item
modifier
note
course
partial fire
KOT/BOT
prep state
repeat round
later round
discount
comp
void
customer
settlement
receipt
```

## Floorplan

Prove:

```text
save/edit layout
refuse active-table destructive edit
open table order
two-terminal same-table race
complete order
cleaning state
table.ready
available state
```

## Order transfer

Prove:

```text
same outlet
version checks
destination availability
source cleaning
destination occupied
settled refusal
active preparation refusal
cross-outlet refusal
response loss
destination race
```

## Order merge

Migration 068 must be fully finished and tested.

Prove:

```text
eligible source/target
locks
MERGED state
merged_into_order_id
source immutable after merge
target total
line preservation
customer policy
payment policy
prep policy
discount/comp policy
table states
no stock re-consumption
no duplicate fire
no duplicate tickets
close-day no double count
response loss
concurrent merge
```

## Multi-terminal matrix

Race:

```text
line add
qty
modifier
note
course
fire
prep
repeat round
discount
comp
void
transfer
merge
payment
room charge
customer credit
```

Exit:

```text
POS PASS
FLOORPLAN PASS
TRANSFER PASS
MERGE PASS
MULTI-TERMINAL PASS
PREPARATION PASS
ROUNDS PASS
```

---

# 11. PHASE 6 — REVENUE CHAIN

Treat as one domain:

```text
payments
refunds
reversals
tills
journals
close day
```

Tenders:

```text
cash
manual M-Pesa
manual card/external
split tender
partial/multiple payment
```

External-reference uniqueness must hold across:

```text
POS
Customer Credit
supplier payment
guest folio
expenses
```

Refunds/reversals:

```text
partial
multiple partial
full reversal
over-refund refusal
cash return
external return reference
response loss
```

Till equation:

```text
opening float
+ cash sales
+ cash credit collections
+ paid in
- cash refunds
- credit cash returns
- cash expenses
- paid out
=
expected drawer
```

Close day must reconcile:

```text
sales
merged-order exclusion
discounts/comps
zero sales
cash
M-Pesa
card
refunds
credit accrual
credit reversal
credit collections
room-charge settlement
VAT
levy
journals
drawer
variance
```

Exit:

```text
PAYMENTS PASS
REFUNDS PASS
TILLS PASS
JOURNALS PASS
CLOSE DAY PASS
MONEY RECONCILIATION PASS
```

---

# 12. PHASE 7 — PROCUREMENT

Happy path:

```text
supplier
-> PO draft
-> approve
-> issue
-> partial GRN
-> later GRN
-> inventory
-> payable
-> invoice
-> payment
```

Return/credit:

```text
supplier return
-> physical stock
-> credit note
-> credit application
-> payable settlement
```

Test:

```text
duplicate GRN
over-receive
manager over-receive
concurrent GRN
package conversion
weighted cost
duplicate invoice
external-reference race
partial supplier payment
multi-payment
payment after credit
credit after payment
return cancel
later stock activity
response loss
```

Exit:

```text
PROCUREMENT PASS
PAYABLE PASS
SUPPLIER PAYMENT PASS
RETURN PASS
SUPPLIER CREDIT PASS
RECONCILIATION PASS
```

---

# 13. PHASE 8 — CUSTOMER CREDIT

Verify:

```text
customer
account configuration
terms/limit
credit sale
limit refusal
manager override
journal
statement
partial settlement
second settlement
cash settlement
external settlement
duplicate reference
write-off
charge reversal
settlement reversal
write-off reversal
FIFO allocation
aging
statement pagination
stable high-water
reconcile match
reconcile mismatch
discrepancy resolution
close-day accrual
cash collection
response loss
concurrency
```

Reconcile:

```text
ledger
AR journal
order
till
close day
statement
aging
```

Exit:

```text
CUSTOMER CREDIT PASS
STATEMENTS PASS
AGING PASS
RECONCILIATION PASS
DOCUMENTS PASS
```

---

# 14. PHASE 9 — HOTEL / PMS

Apply and prove migrations 063, 064 and 066.

## Property

```text
room types
rooms
rates
edit constraints
capacity rules
```

## Reservation

```text
availability
reserve
modify
cancel
no-show
walk-in
maintenance exclusion
timezone/date handling
```

Hard race:

```text
two overlapping incompatible bookings
=> only one succeeds
```

## Stay

```text
check-in
walk-in check-in
extension
room move
state transitions
```

## Folio

```text
nightly/accommodation charge
room-service/POS charge
service charge
adjustment
cash payment
external payment
balance
immutable folio
```

## POS room charge

Prove:

```text
checked-in guest
open folio
fully fired order
remaining balance
pos.roomCharge
folio receivable
sales/tax journal
order settlement
receipt
print queue
```

Reversal:

```text
eligible unpaid room charge
exact versions
folio reversal
order reversal
journal/evidence consistency
no duplicate reversal
response loss
```

## Checkout

```text
zero-balance checkout
unpaid-balance policy
checkout evidence
room transition
housekeeping creation
folio immutability
```

## Housekeeping / Maintenance

```text
dirty
cleaning
inspected
ready
out of service

maintenance block
work order
resolution
return to service
```

Exit:

```text
PMS MASTERS PASS
AVAILABILITY PASS
BOOKING CONCURRENCY PASS
CHECK-IN PASS
STAY PASS
FOLIO PASS
ROOM CHARGE PASS
CHECKOUT PASS
HOUSEKEEPING PASS
MAINTENANCE PASS
```

---

# 15. PHASE 10 — FINANCE / EXPENSES

Apply migration 065.

Verify:

```text
expense category create/edit
stage expense
approve/post
reject
cash expense
external expense
external-ref uniqueness
till outflow
balanced journal
voucher
events
sales/expense period report
debtor aging
payable aging
supplier payment summary
timezone/date validation
```

Do not expand into a full general-ledger product.

Exit:

```text
EXPENSES PASS
VOUCHERS PASS
CASH LINK PASS
JOURNALS PASS
REPORTS PASS
```

---

# 16. PHASE 11 — ASSETS / MAINTENANCE

Verify:

```text
asset category
asset register
unique tag
location
room/area
custodian
staff revision
condition
history
maintenance request
work order
vendor/assignee
cost
status
resolution
```

Ensure PMS room-maintenance state and asset work orders do not create contradictory authorities.

Exit:

```text
ASSETS PASS
CUSTODY PASS
HISTORY PASS
MAINTENANCE PASS
ROOM LINK PASS
```

---

# 17. PHASE 12 — BOUNDED OFFLINE CASH POS

Keep scope to `order.offlineCashSale`.

Verify:

```text
connected authorization
one-command grant
<=30-minute grant
permissions
review product/stock/till/account/settings
disconnect
queue one cash sale
close browser
restart Windows
reopen
recover command
reconnect
same UUID
order once
stock once
cash payment once
receipt after server confirmation
quota once
rejected/conflict quota behavior
response loss
stale stock rejection
reconciliation message
```

Explicitly keep offline-disabled:

```text
M-Pesa
card
credit
refund
full reversal
manager approval issuance
supplier payment
room charge
kitchen/bar routed sale
staff/device/session admin
```

Exit:

```text
OFFLINE CASH PASS
RESTART PASS
RECONNECT PASS
IDEMPOTENCY PASS
STOCK PASS
MONEY PASS
```

---

# 18. PHASE 13 — PRINT BRIDGE

Finish all automated gates.

Security:

```text
TS signature -> Rust
API claim -> Rust
live claim check
tamper refusal
expiry
revocation
wrong business/device/job refusal
```

Pairing:

```text
pair
approve
reject unknown
revoke
revoked device refused
```

Crash matrix:

```text
before persist
after persist
before send
during send
after possible spool
before outcome
after outcome
before browser response
```

Rule:

```text
possible output => DELIVERY_UNCERTAIN
```

Never blind auto-reprint.

Windows service:

```text
install
SCM registration
LocalService
ProgramData ACL
TLS
trusted config
start
worker
restart
stop
uninstall
journal preservation
```

Physical printer, if accessible:

```text
sale receipt
refund
KOT
BOT
cancel
void
close day
PO
GRN
supplier return
supplier payment
credit invoice
credit payment acknowledgement
folio
logo
M-Pesa QR
long receipt
margins
cut
paper out
printer off
queue stall
USB/LAN interruption
power interruption
```

If hardware is unavailable, do not fake PASS. Produce an exact acceptance harness/checklist.

---

# 19. PHASE 14 — VPS / PRODUCTION READINESS

Finish production topology:

```text
Nginx
-> static PWA
-> API
-> private PostgreSQL
-> worker
-> backup
```

Verify:

```text
TLS
CORS
refresh cookies
private DB
secret loading
migration application
restart behavior
health
readiness
resource limits
disk monitoring
logging
release SHA
schema version
backup age
immutable activation
rollback
```

Readiness must check expected migration level and critical config, not merely migration-table existence.

---

# 20. PHASE 15 — BACKUP / RESTORE

Use synthetic/staging data only.

Prove:

```text
staging PostgreSQL
-> dump
-> encrypt
-> off-node configured target/simulation
-> clean PostgreSQL
-> decrypt
-> restore
-> start API
-> login
-> verify representative records
```

Verify:

```text
Auth
Catalog
Inventory
POS
Revenue
Procurement
Customer Credit
PMS
Finance
Assets
audit
commands
documents
```

Record duration, size, commands and result.

---

# 21. PHASE 16 — COMPLETE SYNTHETIC STAGING SCENARIO

Do not use Countryside live data.

Run:

```text
Admin setup
staff/device/session
manager approval
bootstrap rebuild

Catalog
Inventory

supplier -> PO -> GRN -> payable -> invoice -> payment

counter POS
table POS
floorplan
courses
rounds
KOT/BOT
transfer
merge
discount
comp
void

cash
M-Pesa/manual external
split
refund
reversal

customer credit

room/rate
reservation
check-in
room charge
folio
room move
checkout
housekeeping

expense
asset
maintenance

Print Bridge contract

backup
restore
rollback
```

Reconcile:

```text
stock
cash
external tender evidence
journals
AR
supplier payable
customer credit
folios
room states
till
close day
```

Zero unexplained variance.

---

# 22. PHASE 17 — AUTHORITY CLEANUP

Search for remaining legacy business writers:

```text
/rest/v1
rpc/servos_v2_
Supabase business mutations
Tauri business mutations
SQLite business writers
legacy POS/hotel/finance mutations
```

Required invariant:

```text
API authority active
=> ZERO silent legacy business-writer fallback
```

Legacy code may remain only for explicit migration/parity/history purposes.

---

# 23. PHASE 18 — FRESH CURRENT DOCUMENTATION

Create a new authoritative documentation set from current source:

```text
docs/current/00-SYSTEM-OVERVIEW.md
docs/current/01-ARCHITECTURE.md
docs/current/02-REPOSITORY-STRUCTURE.md
docs/current/03-DATABASE-AND-MIGRATIONS.md
docs/current/04-AUTH-STAFF-DEVICE-SESSIONS.md
docs/current/05-COMMAND-KERNEL-SYNC-RECOVERY.md
docs/current/06-CATALOG-INVENTORY.md
docs/current/07-POS-FLOORPLAN-TABLE-SERVICE.md
docs/current/08-PAYMENTS-TILLS-JOURNALS-CLOSE-DAY.md
docs/current/09-PROCUREMENT.md
docs/current/10-CUSTOMER-CREDIT.md
docs/current/11-HOTEL-PMS.md
docs/current/12-FINANCE-ASSETS.md
docs/current/13-OFFLINE-POS.md
docs/current/14-PRINT-BRIDGE.md
docs/current/15-DEPLOYMENT-VPS.md
docs/current/16-BACKUP-RESTORE.md
docs/current/17-TESTING-ACCEPTANCE.md
docs/current/18-SECURITY-MODEL.md
docs/current/19-OPERATIONS-RUNBOOK.md
docs/current/20-RELEASE-CUTOVER-READINESS.md

docs/current/CURRENT-IMPLEMENTATION-STATUS.md
docs/current/COMMAND-CATALOG.md
docs/current/PERMISSION-CATALOG.md
docs/current/DOCUMENT-CATALOG.md
docs/current/MIGRATION-CATALOG.md
```

Do not blindly copy old reset docs.

The new set must describe actual current code.

---

# 24. COUNTRYSIDE DATA MIGRATION EXCLUSION

Do NOT:

```text
extract current Countryside DB
inspect its live SQLite contents
normalize its records
map live IDs
create final stock/credit/payable balances
import current Countryside data
freeze the Countryside terminal
perform final data cutover
```

Allowed:

```text
retain forensic export script/instructions
keep destination schema ready
keep generic reconciliation utilities
document the later migration entry point
```

No permanent migration cathedral.

The later operation remains:

```text
terminal forensic export
-> inspect actual DB
-> normalize externally
-> dry run
-> reconcile
-> final frozen export
-> final import
```

---

# 25. FINAL RELEASE VERIFICATION

Run:

```bash
npm run verify:fast
npm run test:api
npm run test:browser:api
npm run test:browser
npm run test:browser:production
npm run test:cloud:base
npm run test:cloud:v2
npm run test:native
npm run test:desktop
npm run protocol:check
npm run audit:ui:gate
npm run docs:check
```

Run the Print Bridge matrix again.

Push one exact candidate SHA.

Require all hosted CI jobs green.

---

# 26. ONE-SWOOP EXECUTION ORDER

```text
1. repository hygiene / baseline

2. fix frontend node tests

3. fix API/PostgreSQL tests

4. fix real PWA/API/PostgreSQL acceptance

5. fix browser preview/production

6. finish Print Bridge CI

7. close Auth

8. close Bootstrap/Recovery

9. close Catalog

10. close Inventory

11. close POS

12. close Floorplan/Table Service

13. close Order Transfer

14. close Order Merge

15. close Revenue Chain

16. close Procurement

17. close Customer Credit

18. close Hotel/PMS + POS Room Charge

19. close Finance/Expenses

20. close Assets/Maintenance

21. close Offline Cash POS

22. finish Print Bridge security/recovery/Windows service

23. run physical printer acceptance if hardware is available,
    otherwise produce the exact terminal acceptance harness

24. finish VPS production readiness

25. prove backup restore

26. run complete synthetic staging acceptance

27. remove/fence legacy authority paths

28. create fresh current-codebase docs

29. run complete local release verification

30. obtain one exact fully-green hosted CI SHA

31. write final release-readiness report

STOP.

DO NOT PERFORM COUNTRYSIDE LIVE-DATA MIGRATION.
```

---

# 27. DEFINITION OF DONE

The development sweep is complete when:

```text
one exact commit passes every required CI job

all migrations through the final migration high-water execute on a fresh
PostgreSQL database

API/PostgreSQL integration passes

real PWA/API/PostgreSQL acceptance passes

preview and production browser suites pass

Auth/Staff/Device/Session passes

Bootstrap recovery passes

Catalog passes

Inventory passes

POS/Floorplan/Transfer/Merge passes

Payments/Refunds/Tills/Journals/Close Day pass

Procurement passes

Customer Credit passes

Hotel/PMS passes

Finance/Assets passes

bounded Offline Cash POS passes

Print Bridge fmt/clippy/tests/release builds pass on Linux and Windows

Windows service host builds and installation workflow is ready

physical printer acceptance is either executed or represented by a complete
operator harness without a fake PASS

production-like staging is deployable

encrypted backup restore is proven on synthetic/staging data

release activation and rollback are proven

API mode has no silent legacy business-writer fallback

fresh current-codebase documentation exists and passes docs checks

repository is ready to receive the Countryside data later
```

The only item allowed to be marked:

```text
EXCLUDED BY SCOPE
```

is:

```text
actual current Countryside data migration
```

---

# 28. FINAL REPORT FORMAT

At the end, produce:

```text
FINAL SHA
BRANCH
MIGRATION HIGH-WATER
CI MATRIX
LOCAL RELEASE MATRIX
DOMAIN GATES
STAGING RESULT
RESTORE RESULT
ROLLBACK RESULT
PRINT BRIDGE RESULT
PHYSICAL PRINTER RESULT or EXTERNAL GATE
LEGACY AUTHORITY STATUS
DOCUMENTATION INDEX
KNOWN LIMITATIONS
COUNTRYSIDE MIGRATION: EXCLUDED BY SCOPE / NOT PERFORMED
```

Use only:

```text
PASS
FAIL
EXTERNAL GATE
EXCLUDED BY SCOPE
```

Do not substitute completion percentages for evidence.

The target is not more code.

The target is a codebase that is demonstrably ready for the later Countryside data import and controlled production cutover.
