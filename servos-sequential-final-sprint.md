# SERVOS FINAL SPRINT
## Sequential Completion Plan — Updated to Live Head `3b0fb3b`

**Repository:** `davemusau00/SERVEOS-WEB`  
**Branch:** `reset/vps-platform`  
**Current remote HEAD:** `3b0fb3b7cd7d200b907128938eeb6b6045e6441a`  
**Branch position:** 159 commits ahead of `main`, 0 behind  
**Checkpoint:** 2026-10-08  
**Execution principle:** sequential domain completion, not parallel feature expansion

---

# 0. CURRENT PRODUCT SHAPE

The current repository is no longer architecture-poor.

It is verification-poor.

Current major domain source maturity:

```text
Auth / Staff / Devices / Sessions     98%
Catalog                               93%
Inventory                             91%
POS                                   88%
Revenue / Payments / Tills            77%
Procurement                           84%
Customer Credit                       89%
Print Bridge source                   94%
Browser rebuild / bootstrap           75%
General Finance                       40%
Hotel / PMS                            5%
Migration / Cutover                   15-20%
```

Overall:

```text
SOURCE IMPLEMENTATION                 ~98%
BUSINESS WORKFLOW MIGRATION           ~93%
VERIFIED IMPLEMENTATION               ~72%
PRODUCTION READINESS                  ~66%
OVERALL WEB-FIRST RESET               ~95%
```

The project must now stop behaving like:

```text
93%
91%
88%
84%
89%
94%
5%
```

and deliberately become:

```text
100%
100%
100%
100%
100%
100%
100%
100%
100%
```

one domain at a time.

---

# 1. NEW GLOBAL RULE: ONE DOMAIN MUST CLOSE BEFORE THE NEXT MAJOR DOMAIN OPENS

A domain is not complete because:

```text
the migration exists
the API handler exists
the UI exists
the feature appears to work
```

A domain is complete only when:

```text
schema complete
migration runs
API complete
permissions complete
browser/operator flow complete
tests green
PostgreSQL integration green
browser acceptance green
concurrency proven
response-loss proven
audit/change-feed proven
documents proven where relevant
reconciliation proven where relevant
no known deployment blocker remains
truth docs updated
```

For printing:

```text
physical hardware acceptance is mandatory
```

For money:

```text
journal/till/close-day reconciliation is mandatory
```

For migration:

```text
source/target reconciliation is mandatory
```

---

# 2. PHASE 0 — RESTORE A GREEN BASELINE

This remains the immediate hard stop.

The newest head is still running CI.

Known recent failures remain:

```text
frontend
  npm run lint

print-bridge ubuntu
  cargo fmt --check

print-bridge windows
  cargo fmt --check
```

Recent preceding heads also failed:

```text
api-postgres
browser-preview
browser-production
```

The latest runs are still in progress, so these cannot yet be treated as fixed.

## Required same-commit green matrix

```text
frontend                       PASS
api-postgres                   PASS
real PWA/API/PostgreSQL        PASS
browser-preview                PASS
browser-production             PASS
cloud-protocol-base            PASS
cloud-protocol-v2              PASS
native-domain                  PASS
desktop-shell                  PASS
windows-printer-shell          PASS
print-bridge ubuntu            PASS
print-bridge windows           PASS
evidence-summary               PASS
```

## Immediate repair order

```text
1. fix frontend lint
2. fix exact Print Bridge rustfmt mismatch
3. fix API/PostgreSQL integration
4. fix browser preview
5. fix browser production
6. allow bridge CI to reach clippy/tests/release build
7. confirm one exact green HEAD
```

Do not open PMS before this.

---

# 3. PHASE 1 — AUTH / STAFF / DEVICES / SESSIONS: 98% -> 100%

Auth source has advanced substantially.

Current source now includes:

```text
API login
password change
staff.create
staff.update
staff.deactivate
role management
permission ceilings
last-Admin protection
device enrollment
device revocation
session listing
session revocation
manager approvals
15-minute access tokens
30-day refresh tokens
90-day refresh families
HttpOnly refresh cookies
SameSite cookie policy
refresh rotation
refresh replay detection
response-loss-safe refresh rotation
cross-tab refresh locking
SSE refresh recovery
password-change session invalidation
device-revoke session invalidation
staff-deactivate session/device invalidation
initial Admin setup-secret cleanup
```

Migrations:

```text
057 staff management
058 device events
059 session events
060 refresh tokens
061 refresh rotation recovery
```

## Remaining Auth work is verification

Run sequentially:

```text
1. migrations 057-061 on clean PostgreSQL
2. initial Admin setup
3. first login
4. forced password change
5. staff create
6. role update
7. permission ceiling refusal
8. last Admin protection
9. device enrollment
10. repeat device enrollment
11. device revoke
12. session list
13. session revoke
14. access token expiry
15. refresh
16. refresh retry within recovery window
17. refresh replay after recovery window
18. family revoke
19. password change revokes other sessions
20. device revoke kills linked session/family
21. staff deactivate kills sessions/devices/families
22. logout
23. SSE reconnect after token expiry
24. cross-tab refresh race
25. HTTPS/CORS/cookie deployment
26. bootstrap secret restart behavior
```

## Security acceptance

Verify:

```text
refresh token never in IndexedDB
refresh token never in localStorage
raw password never in command outcome
approval token never in durable UI evidence
revoked access token refused
revoked refresh family refused
wrong-session refresh cookie refused
wrong-device session refused
disabled staff refused
```

## Auth exit gate

```text
AUTH SOURCE                    100%
STAFF LIFECYCLE               PASS
DEVICE LIFECYCLE              PASS
SESSION LIFECYCLE             PASS
REFRESH ROTATION              PASS
REPLAY DETECTION              PASS
PASSWORD LIFECYCLE            PASS
MANAGER APPROVAL SECURITY     PASS
POSTGRES                      PASS
BROWSER                       PASS
HTTPS/COOKIE                  PASS
```

Freeze Auth after this except defects.

---

# 4. PHASE 2 — BROWSER REBUILD / BOOTSTRAP: 75% -> 100%

This phase has moved forward materially and should now be completed early rather than left near cutover.

New source includes migration:

```text
062_api_bootstrap_snapshots.sql
```

Current bootstrap v2 now has:

```text
server-side snapshot records
10-minute snapshot lifetime
business binding
staff binding
device binding
session binding
authorization hash
schema version
high-water cursor
record count
collection counts
page size
page count
per-page SHA-256
manifest SHA-256
resume manifest route
page route
repeatable-read source snapshot
IndexedDB bootstrap staging store
resumable page staging
page re-hash after interruption
collection-count verification
unresolved-command protection
cursor monotonicity
atomic projection activation
```

This is a major reduction in the old browser-recovery gap.

## Required bootstrap acceptance

Test:

```text
fresh browser
empty IndexedDB
deleted IndexedDB
partially staged snapshot
browser closes during page 1
browser closes during later page
response lost after page fetch
response lost after manifest fetch
snapshot expires
permissions change during transfer
session changes during transfer
device revoked during transfer
large snapshot
empty snapshot
cursor zero
new server change after snapshot high-water
staged page corruption
manifest hash mismatch
page hash mismatch
collection count mismatch
record count mismatch
storage quota failure
IndexedDB transaction abort
pending command blocks rebuild
OUTCOME_UNKNOWN blocks rebuild
successful atomic activation
failed activation retains previous projection
```

## Bootstrap exit gate

```text
MANIFEST INTEGRITY            PASS
PAGE HASHES                   PASS
RESUME                        PASS
EXPIRY                        PASS
AUTHORIZATION BINDING         PASS
HIGH-WATER CURSOR             PASS
ATOMIC ACTIVATION             PASS
STORAGE FAILURE               PASS
FRESH BROWSER                 PASS
CORRUPTED BROWSER RECOVERY    PASS
```

Once this passes, browser rebuild is no longer a late cutover risk.

---

# 5. PHASE 3 — CATALOG: 93% -> 100%

Current Catalog includes:

```text
products
stock items
locations
package units
recipes
selling options
portions
modifiers
modifier ingredient effects
favorites
tax classes
barcodes
Smart Item opening stock
```

Do not add more catalog architecture.

## Finish acceptance only

```text
whole-item sale
portion sale
package sale
sealed bottle
open bottle
recipe
modifier price
modifier ingredient adjustment
multiple modifiers
archived modifier refusal
stale product version
stale stock version
duplicate barcode
barcode under category filter
barcode under favorites filter
outlet availability
invalid stock link
concurrent product update
response-loss recovery
```

## Catalog operator test

A manager must be able to:

```text
create stock item
create product
link product to stock
configure package
configure recipe
configure selling option
configure modifiers
scan barcode
edit product
archive safely
```

without understanding internal projection machinery.

## Catalog exit gate

```text
CATALOG API                    PASS
CATALOG POSTGRES               PASS
CATALOG BROWSER                PASS
BARCODE                        PASS
RECIPES                        PASS
MODIFIERS                      PASS
SELLING OPTIONS                PASS
CONCURRENCY                    PASS
RESPONSE LOSS                  PASS
```

---

# 6. PHASE 4 — INVENTORY: 91% -> 100%

Current Inventory:

```text
opening stock
stock locations
full count
selected count
count history
transfer
waste
adjustment
batch preparation
receive
movement reversal
inventory policy
balance revisions
sealed/open bottles
POS consumption
modifier consumption
void return
GRN inventory posting
supplier return foundations
```

## Sequential Inventory verification

### 4.1 Receive

```text
base unit
package unit
cost
weighted average cost
sealed bottle
open bottle
concurrent receive
duplicate replay
response loss
```

### 4.2 Counts

```text
full count
selected count
stale revision
multi-terminal count race
variance
history
bottle state
measurement method
```

### 4.3 Movement

```text
transfer
waste
adjustment
batch preparation
movement reversal
later-activity blocker
original-cost reversal
```

### 4.4 POS linkage

```text
direct stock product
recipe product
portion product
modifier ingredient
round/repeat-round
void return
```

### 4.5 Procurement linkage

```text
GRN
partial GRN
supplier return
credit note does not mutate stock
physical return does not silently mutate payable
```

## Inventory conservation

For every scenario:

```text
opening
+ receive
+ transfer in
- transfer out
- POS consumption
- waste
+/- adjustment
+ production
- ingredient consumption
- supplier return
=
closing
```

## Inventory exit gate

```text
INVENTORY API                  PASS
POSTGRES                       PASS
BROWSER                        PASS
CONCURRENCY                    PASS
BOTTLE CONSERVATION            PASS
WEIGHTED COST                  PASS
MOVEMENT REVERSAL              PASS
COUNT RECONCILIATION           PASS
POS STOCK CONSUMPTION          PASS
PROCUREMENT STOCK LINK         PASS
```

---

# 7. PHASE 5 — POS: 88% -> 100%

Current POS source:

```text
order.create
order.addItem
order.updateItem
order.removeItem
selling options
modifiers
prep notes
courses
partial fire
KOT/BOT
preparation states
rounds
repeat round
discount
item comp
order comp
void
customer assignment
credit charge
zero-value completion
manager approval
```

## Full POS acceptance flow

```text
open till
-> create order
-> scan product
-> select selling option
-> modifiers
-> note
-> course
-> partial fire
-> KOT/BOT
-> preparation advance
-> repeat round
-> later round
-> discount
-> comp
-> void
-> customer
-> settle
-> receipt
-> journal
-> close day
```

## Multi-terminal matrix

Two browsers must contend safely over:

```text
add line
quantity
modifier
note
customer
fire
repeat round
discount
comp
void
payment
credit charge
```

## Response-loss matrix

For each POS mutation:

```text
commit
-> response disappears
-> same UUID recovered
-> no duplicate line
-> no duplicate fire
-> no duplicate stock
-> no duplicate ticket
```

## POS exit gate

```text
POS API                        PASS
POS POSTGRES                   PASS
POS BROWSER                    PASS
MULTI-TERMINAL                 PASS
ROUND MODEL                    PASS
COURSES                        PASS
PREPARATION                    PASS
KOT/BOT                        PASS
DISCOUNT/COMP                  PASS
VOID                           PASS
MANAGER APPROVAL               PASS
RESPONSE LOSS                  PASS
```

---

# 8. PHASE 6 — REVENUE CHAIN: 77% -> 100%

Treat:

```text
payments
refunds
tills
financial journals
close day
```

as one domain.

Do not split them into separate half-finished phases.

Current support:

```text
cash
manual M-Pesa
manual external/card
split tender
refund
payment reversal
till lifecycle
variance review
financial journals
close day
```

## Required payment scenarios

```text
cash
M-Pesa
card
cash + M-Pesa
cash + card
M-Pesa + card
partial payment
multi-payment
response loss
duplicate external reference
```

## Refund/reversal scenarios

```text
partial refund
second partial refund
remaining full refund
over-refund refusal
cash refund
external refund evidence
full reversal
response loss
```

## Journal invariants

```text
debits == credits
```

And:

```text
original order value
=
settled amount
+ credit outstanding
- valid refunds/reversals
```

## Till equation

```text
opening float
+ cash POS
+ cash credit collections
+ paid in
- cash refunds
- credit cash returns
- paid out
=
expected drawer
```

## Close-day equation

Close day must reconcile:

```text
sales
discounts
comps
zero-value sales
cash
M-Pesa
card
refunds
credit accrual
credit reversals
credit collections
tax
journals
drawer
variance
```

## Revenue exit gate

```text
PAYMENTS                       PASS
SPLIT TENDER                   PASS
REFUNDS                        PASS
REVERSALS                      PASS
TILL                           PASS
JOURNALS                       PASS
TAX                            PASS
CLOSE DAY                      PASS
RESPONSE LOSS                  PASS
MONEY RECONCILIATION           PASS
```

---

# 9. PHASE 7 — PROCUREMENT: 84% -> 100%

Current Procurement source:

```text
suppliers
PO draft
PO approval
PO issue
GRN
partial receive
cumulative receive
inventory posting
supplier payable
supplier invoice
supplier payment
supplier return
return cancellation
supplier credit note
supplier credit application
credit settlement
procurement documents
manager approval for sensitive receiving
```

## Happy path first

```text
supplier
-> PO draft
-> approve
-> issue
-> partial GRN
-> second GRN
-> stock
-> payable
-> invoice
-> payment
```

## Correction path second

```text
supplier return
-> stock dispatch
-> supplier credit
-> credit note
-> credit application
-> payable settlement
```

## Edge cases

```text
duplicate GRN
concurrent GRN
over-receive refusal
manager-approved over-receive
package conversion
weighted cost
duplicate supplier invoice
partial supplier payment
multiple supplier payments
credit after payment
payment after credit
return cancel
later stock activity
response loss
```

## Procurement exit gate

```text
SUPPLIER                       PASS
PO                             PASS
GRN                            PASS
INVENTORY LINK                 PASS
PAYABLE                        PASS
INVOICE                        PASS
PAYMENT                        PASS
RETURN                         PASS
SUPPLIER CREDIT                PASS
CREDIT APPLICATION             PASS
DOCUMENTS                      PASS
RECONCILIATION                 PASS
```

---

# 10. PHASE 8 — CUSTOMER CREDIT: 89% -> 100%

Current source:

```text
customers
terms
limits
account lifecycle
aging
POS assignment
credit charge
manager limit override
settlement
write-off
reversal
FIFO allocation
journals
till integration
external settlement
credit invoice
payment acknowledgement
write-off notice
reversal notice
close-day accrual
statement reconciliation
discrepancy evidence
discrepancy resolution
stable statement pagination
high-water cursor
running balances
```

## Main scenario

```text
customer
-> configure account
-> credit sale
-> journal
-> statement
-> partial settlement
-> second settlement
-> balance
-> aging
-> close day
```

## Exception scenarios

```text
limit refusal
manager limit override
write-off
charge reversal
settlement reversal
write-off reversal
duplicate external reference
statement page continuation
stable high-water after new posting
reconcile match
reconcile mismatch
discrepancy resolution
response loss
concurrency
```

## Credit exit gate

```text
CUSTOMERS                      PASS
CREDIT ACCOUNT                 PASS
CHARGE                         PASS
LIMIT CONTROL                  PASS
SETTLEMENT                     PASS
WRITE-OFF                      PASS
REVERSAL                       PASS
JOURNALS                       PASS
TILL LINK                      PASS
AGING                          PASS
STATEMENT PAGING               PASS
RECONCILIATION                 PASS
DOCUMENTS                      PASS
```

---

# 11. PHASE 9 — PRINT BRIDGE: 94% SOURCE -> 100% PRODUCTION

Current Print source is broad enough.

Current source includes:

```text
printer transport crate
Windows RAW
TCP 9100
profiles
strict renderers
PWA signing
device trust
pair/revoke
API claims
live claim checks
permission fences
durable print journal
attempt fencing
DELIVERY_UNCERTAIN
dispatcher
PWA submit
PWA recovery
server outcome report
localhost HTTPS
private Rust worker
Windows service wrapper
installer
logo
QR
financial docs
close-day docs
procurement docs
credit docs
```

Do not add another printer abstraction.

## 9.1 CI

Current dedicated bridge jobs still fail at:

```text
cargo fmt --check
```

Even after a formatting-oriented commit.

Identify exact CI/local mismatch and fix it.

Then require:

```text
cargo fmt
clippy
cargo test
release build
Windows service lint
Windows service build
printer transport tests
```

## 9.2 Security

```text
TS signature -> Rust verify
API claim -> Rust verify
live response -> Rust verify
tampered job refusal
tampered business refusal
tampered device refusal
expired claim refusal
revoked device refusal
wrong route refusal
```

## 9.3 Crash matrix

```text
before request persistence
after request persistence
before attempt
after attempt
before send
during send
after possible output
before outcome commit
after outcome commit
before browser response
```

Possible output becomes:

```text
DELIVERY_UNCERTAIN
```

Never blind retry.

## 9.4 Windows service

```text
installer
SCM registration
LocalService
ProgramData ACL
TLS
trusted config
startup
worker
shutdown
restart
uninstall
journal retention
```

## 9.5 Real 80mm hardware

Physically test:

```text
sale receipt
refund receipt
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
logo
M-Pesa QR
long receipt
cutter
paper out
printer off
queue stall
LAN loss
power loss
```

## Print exit gate

```text
BRIDGE CI                      PASS
RUST TESTS                     PASS
WINDOWS SERVICE                PASS
CRYPTO                         PASS
RECOVERY                       PASS
REAL PRINTER                   PASS
LOGO                           PASS
QR                             PASS
CUT/MARGINS                    PASS
UNCERTAINTY                    PASS
REVIEWED RETRY                 PASS
```

---

# 12. PHASE 10 — OFFLINE POS

Only start after all prior operational domains are green:

```text
Auth
Bootstrap
Catalog
Inventory
POS
Revenue
Procurement
Customer Credit
Print
```

Keep offline scope narrow.

Initial candidate commands:

```text
order.create
order.addItem
order.updateItem
order.removeItem
order.fire
ordinary stock consumption
cash payment
explicitly allowed manual external payment
receipt/KOT generation
```

Keep online-only:

```text
manager approval issue
refund
full reversal
credit write-off
supplier payment
staff management
device administration
session administration
major stock correction
imports
configuration
destructive recovery
```

## Offline acceptance

```text
disconnect
sell
fire
pay
print/local document
close browser
restart Windows
reopen offline
recover local state
reconnect
same UUID sync once
no duplicate order
no duplicate stock
no duplicate payment
no duplicate ticket
```

---

# 13. PHASE 11 — HOTEL / PMS: 5% -> 100%

Only now open the largest remaining domain.

Do not leave PMS at 70–80%.

Finish it sequentially from core to checkout.

## 11.1 Property master

```text
room types
rooms
rates
room condition
room availability
guest profile
```

## 11.2 Reservations

```text
availability search
reservation create
modify
cancel
no-show
walk-in
confirmation
```

## 11.3 Concurrency

Hard invariant:

```text
two browsers
same room
overlapping dates
=> only one incompatible booking confirms
```

Use server-side lock/version/lease semantics.

## 11.4 Check-in and stay

```text
reservation check-in
walk-in check-in
stay
extension
room move
```

## 11.5 Folio

```text
nightly charge
restaurant/bar charge-to-room
service charge
adjustment
payment
balance
folio print
```

Room charge requires active stay + folio.

## 11.6 Checkout

```text
review folio
settle
checkout
room state
housekeeping transition
immutable checkout evidence
```

## 11.7 Housekeeping

```text
DIRTY
CLEANING
INSPECTED
READY
OUT_OF_SERVICE
```

## 11.8 Maintenance blocks

```text
fault
block room
work order
resolution
return to service
```

## PMS exit gate

```text
ROOM TYPES                     PASS
ROOMS                          PASS
RATES                          PASS
RESERVATIONS                   PASS
CONCURRENCY                    PASS
CHECK-IN                       PASS
STAYS                          PASS
ROOM MOVE                      PASS
FOLIO                          PASS
ROOM CHARGE                    PASS
PAYMENTS                       PASS
CHECKOUT                       PASS
HOUSEKEEPING                   PASS
MAINTENANCE                    PASS
DOCUMENTS                      PASS
```

---

# 14. PHASE 12 — GENERAL FINANCE + ASSETS

Keep this bounded.

## Finance

```text
expenses
expense categories
cash expense
external expense
approval
expense document
debtor aging
payable aging
supplier payment reports
period income/expense summary
```

Do not turn the final sprint into a general-ledger rewrite.

## Assets

```text
asset register
category
location
condition
custodian
maintenance request
work order
cost
status
history
room/area linkage
```

---

# 15. PHASE 13 — COUNTRYSIDE DATA MIGRATION

Do this after destination schemas are stable.

Use the simplified forensic-export strategy.

Do not build a permanent migration cathedral.

## First analysis export

On the current terminal:

```text
close ServOS
copy servos.sqlite
copy servos.sqlite-wal if present
copy servos.sqlite-shm if present
calculate hashes
zip
review offline
```

This gives us the real terminal source data.

## Normalize externally

From the actual DB, create only the required new-system datasets.

Likely:

```text
business
outlets
stock locations
stock items
purchase packages
products
recipes
modifiers
opening/cutover inventory balances
suppliers
supplier balances
customers
customer credit
rooms
reservations
stays
folios
assets
historical financial evidence where required
legacy ID map
reconciliation manifest
```

Do not blindly migrate:

```text
legacy session tokens
obsolete auth state
old PIN/password hashes as current credentials
stale sync state
temporary printer queue data
unresolved legacy commands without review
```

## Migration sequence

```text
TERMINAL FORENSIC EXPORT
↓
RAW DB REVIEW
↓
NORMALIZATION
↓
IMPORT PACK
↓
DRY RUN
↓
COUNT/VALUE RECONCILIATION
↓
CUTOVER REHEARSAL
↓
FINAL LEGACY WRITE FREEZE
↓
FINAL TERMINAL EXPORT
↓
FINAL IMPORT
↓
RECONCILE AGAIN
↓
ACTIVATE NEW AUTHORITY
```

## Migration exit gate

```text
RAW DATABASE                   PASS
HASHES                         PASS
SCHEMA INVENTORY               PASS
NORMALIZATION                  PASS
ID MAP                         PASS
DRY RUN                        PASS
STOCK COUNTS                   PASS
STOCK VALUE                    PASS
CUSTOMER BALANCES              PASS
SUPPLIER BALANCES              PASS
ROOM/STAY COUNTS               PASS
FINAL FROZEN EXPORT            PASS
FINAL IMPORT                   PASS
FINAL RECONCILIATION           PASS
```

---

# 16. PHASE 14 — VPS STAGING

Deploy the completed system into production-like infrastructure.

```text
Internet
 |
Nginx
 |--- PWA
 |
 +--- API -> localhost
              |
          API container
              |
         private network
          /          \
   PostgreSQL       worker
          \
           backup
```

Verify:

```text
TLS
CORS
cookie behavior
private DB
secret loading
migrations
readiness
restart
resource limits
disk monitoring
logging
immutable release activation
rollback
backup age
```

---

# 17. PHASE 15 — BACKUP RESTORE

A backup does not count until restore works.

```text
live-like DB
-> encrypted backup
-> off-VPS storage
-> clean PostgreSQL
-> restore
-> API start
-> login
-> verify Auth
-> verify Catalog
-> verify Inventory
-> verify POS
-> verify Revenue
-> verify Procurement
-> verify Credit
-> verify PMS
-> verify audit/command history
```

Record exact recovery procedure and duration.

---

# 18. PHASE 16 — COMPLETE STAGING ACCEPTANCE

Run one contiguous scenario:

```text
Admin setup
staff
device
session
manager approval
bootstrap rebuild
catalog
inventory
POS
payment
refund
till
close day
supplier
PO
GRN
payable
supplier payment
supplier return
supplier credit
customer
credit charge
credit settlement
statement
Print Bridge
offline restart
reservation
check-in
room charge
folio
checkout
backup
restore
rollback
```

No skipped revenue path.

---

# 19. PHASE 17 — REAL BUSINESS PILOT

Run one controlled operating day.

Capture:

```text
staff
devices
sessions
manager approvals
opening stock
opening tills
orders
rounds
payments
M-Pesa
refunds
credit
supplier transactions
prints
uncertain prints
rooms
folios
closing tills
closing stock
```

Reconcile:

```text
sales
payments
refunds
cash
M-Pesa
credit
AR
VAT/levy
journals
stock
payables
supplier credits
rooms/folios
```

Any unexplained variance means return to development.

---

# 20. PHASE 18 — FINAL CUTOVER

```text
green release
-> staging accepted
-> restore proven
-> cutover rehearsed
-> production backup
-> freeze legacy writers
-> final terminal forensic export
-> final normalize/import
-> reconcile
-> activate API/PWA
-> activate Print Bridge
-> smoke test
-> operate
-> monitor
```

Never run legacy and new writers together.

---

# 21. PHASE 19 — LEGACY RETIREMENT

After stable production:

```text
disable Supabase browser business mutation
disable Tauri/SQLite business authority
remove duplicate sync writers
remove obsolete printer routes
remove dead deployment/cutover code
retain historical migrations
retain parity fixtures
retain migration evidence
retain useful printer transport
```

---

# 22. MASTER SEQUENTIAL ORDER — UPDATED

From current HEAD `3b0fb3b`:

```text
0. GREEN CI

1. AUTH / STAFF / DEVICE / SESSION
   98% -> 100%

2. BROWSER BOOTSTRAP / RECOVERY
   75% -> 100%

3. CATALOG
   93% -> 100%

4. INVENTORY
   91% -> 100%

5. POS
   88% -> 100%

6. REVENUE CHAIN
   payments + refunds + tills + journals + close day
   77% -> 100%

7. PROCUREMENT
   84% -> 100%

8. CUSTOMER CREDIT
   89% -> 100%

9. PRINT BRIDGE
   94% source -> 100% physically proven

10. OFFLINE POS
    narrow bounded acceptance

11. HOTEL / PMS
    5% -> 100%

12. GENERAL FINANCE + ASSETS

13. COUNTRYSIDE DATA MIGRATION
    forensic export -> normalized import -> reconciliation

14. VPS STAGING

15. BACKUP RESTORE

16. FULL STAGING ACCEPTANCE

17. REAL BUSINESS PILOT

18. FINAL CUTOVER

19. LEGACY RETIREMENT
```

---

# 23. PHASE TRANSITION RULE

Do not move to the next phase because source implementation reaches 100%.

Move only when the current phase has:

```text
source complete
migrations executed
tests green
PostgreSQL green
browser green
concurrency proven
response loss proven
security proven where relevant
documents proven
stock/money reconciliation proven where relevant
truth docs updated
zero known release blocker
```

If a later phase exposes an earlier invariant defect:

```text
STOP
return to earlier domain
fix invariant
add regression test
re-run its exit gate
continue
```

---

# 24. CURRENT TARGET

Current shape:

```text
Auth / Admin       98%
Bootstrap          75%
Catalog            93%
Inventory          91%
POS                88%
Revenue            77%
Procurement        84%
Customer Credit    89%
Print source       94%
Hotel/PMS           5%
```

Target shape:

```text
Auth              100%
Bootstrap         100%
Catalog           100%
Inventory         100%
POS               100%
Revenue           100%
Procurement       100%
Customer Credit   100%
Print             100%
Offline           accepted
Hotel/PMS         100%
Migration         accepted
Restore           accepted
Pilot             accepted
Cutover           accepted
```

The final sprint is no longer a race to add code.

It is a conveyor belt: one domain enters, gets proven, exits at 100%, then the next domain moves forward.
