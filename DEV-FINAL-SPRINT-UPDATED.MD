I went beyond the status labels and inspected the **actual CI artifacts from ServOS CI #120** at current head **`9362a2b95ebe66dadb0fc8c30552b1da83ed7bc4`**.

The good news is that the remaining release problems are much more concentrated than the red CI badge suggests. Production browser testing already has **44 passing tests**, preview has **28 passing tests**, frontend is green, native-domain is green, and the base cloud protocol is green. The failures cluster around a handful of contracts.

I would treat the following as the **final stabilization and deployment closure plan**.

# ServOS Remaining Gap Remediation Plan

## 1. P0: Repair Cloud v2 immediately

This is currently the cleanest blocker.

The important finding from the actual CI log is that **migration `044_mpesa_till_qr.sql` itself passes**. All migrations from 001 through 044 complete successfully.

Cloud v2 fails later in:

```text
tests/supabase/pos.sql
```

with:

```text
ERROR: syntax error at or near "from"
```

The culprit is the new QR replacement fixture:

```sql
select servos_v2.put_record(
  'organization',
  'business',
  jsonb_set(
    data,
    '{receipt,mpesaTillQr}',
    jsonb_build_object(...)
  )
from servos_v2.records ...
```

There are effectively unmatched function parentheses around the `put_record()` call.

There are **three similar statements** that should be corrected together:

| Fixture | Current problem | Fix |
|---|---|---|
| Replace QR | malformed `put_record(... FROM ...)` | use `read_record()` or correctly close call |
| Remove QR | same structural problem | rewrite using `read_record()` |
| Disable QR | same structural problem | rewrite using `read_record()` |

I recommend eliminating the `FROM records` pattern entirely:

```sql
select servos_v2.put_record(
  'organization',
  'business',
  jsonb_set(
    servos_v2.read_record('organization', 'business'),
    '{receipt,mpesaTillQr}',
    jsonb_build_object(
      'enabled', true,
      'label', 'Replacement Till',
      'dataUrl', 'data:image/png;base64,BB==',
      'thermalRaster', jsonb_build_object(
        'width', 8,
        'height', 8,
        'base64', 'AwMDAwMDAwM='
      )
    )
  )
);
```

There is a **second QR fixture defect waiting behind the syntax error**.

For an 8 × 8 monochrome raster:

```text
rowBytes = ceil(8 / 8) = 1
bytes    = 1 × 8 = 8
base64   = 12 characters
```

The current fixture uses:

```text
AwMDAwMDAwMDA=
```

which is not the right encoded length.

Eight bytes of `0x03` encode correctly as:

```text
AwMDAwMDAwM=
```

Do **not** weaken migration 044's validation. Fix the fixture.

### Harden 044 while we're here

The QR guard currently validates `thermalRaster` if one exists, but an enabled QR should really require one for direct thermal printing.

For:

```json
{
  "enabled": true
}
```

require:

```text
dataUrl present
thermalRaster present
width == height
width <= 320
valid packed byte count
valid base64
```

Otherwise Web could display a QR while the XP-80T path silently has no printable raster.

Also add explicit fixture cases for:

```text
enabled + valid raster          -> accepted
enabled + missing raster        -> rejected
non-square raster               -> rejected
oversized raster                -> rejected
incorrect encoded byte length   -> rejected
disabled but retained QR        -> accepted, omitted from new receipt
removed QR                      -> omitted from new receipt
replacement QR                  -> only new receipts change
historic receipt                -> original QR preserved
```

**P0 exit condition:** `npm run test:cloud:v2` is green through expansion 044 and the complete POS fixture.

---

# 2. P0: Repair the Tauri desktop compile boundary

The actual desktop log now contains **one primary Rust compile error**, not a giant native failure.

Current code:

```rust
let pending=store::next_native_v2_pending(
    &state.db.lock().map_err(|e|e.to_string())?,
    &terminal
)?
.ok_or("Durable v2 command queue entry disappeared")?;
```

Rust is receiving:

```text
&MutexGuard<Connection>
```

where the function expects:

```text
&Connection
```

More importantly, holding an anonymous lock temporary through a complex expression is ugly around an async synchronization boundary.

Replace it with an explicit short lock scope:

```rust
let pending = {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::next_native_v2_pending(&*db, &terminal)?
}
.ok_or("Durable v2 command queue entry disappeared")?;
```

I would make the same pattern mandatory throughout the v2 adapter:

```rust
{
    let db = state.db.lock()?;
    read(...)
}

{
    let mut db = state.db.lock()?;
    mutate(...)
}
```

Do not hold the SQLite mutex while awaiting network RPC calls.

That gives you three benefits:

```text
compile correctness
less lock contention
lower deadlock/reentrancy risk
```

After fixing it, run the complete desktop sequence, not just `cargo check`:

```bash
npm run check:desktop
npm run test:desktop
npm run test:native
```

Then build the actual Tauri package from the exact accepted commit.

**P0 exit condition:** Desktop shell and Native Domain both pass on the same SHA.

---

# 3. P0: Fix the OUTCOME_UNKNOWN modal recovery UX

This is one of the most useful discoveries in the browser artifact.

The failing test creates a Room Type while deliberately simulating **response loss**.

ServOS correctly does this:

```text
command sent
↓
response lost
↓
OUTCOME_UNKNOWN
↓
do NOT clear form
↓
do NOT allow accidental second submission
```

Excellent.

But the modal remains open, while the test tries to press the global:

```text
Synchronize
```

button behind it.

Playwright reports:

```text
modal overlay intercepts pointer events
```

That is not merely a bad test. It exposes a genuine operator-flow problem.

The system tells the operator:

> saved for outcome checking

but then places the recovery control behind a modal that intentionally traps focus.

### Correct UX

When a modal enters:

```text
PENDING
OUTCOME_UNKNOWN
```

transform the modal footer into a recovery state:

```text
────────────────────────────────
We don't yet know whether this
change reached the server.

[ Check status ] [ Open Activity ]

Do not submit this operation again.
────────────────────────────────
```

`Check status` should:

```text
reuse exact command ID
     ↓
synchronize
     ↓
inspect command state
     ↓
CONFIRMED -> close dialog + refresh
REJECTED  -> keep dialog + restore editing
CONFLICT  -> keep dialog + show changed fields
UNKNOWN   -> keep recovery state
```

Do not make the background Synchronize button clickable through the modal. That would undermine focus trapping and modal semantics.

This recovery component should be reusable for:

```text
room creation
asset creation
payments
refunds
stock counts
purchase receipt
maintenance
reservations
staff changes
settings changes
```

Call it something like:

```tsx
<CommandRecoveryState />
```

and feed it:

```ts
commandId
outcome
onCheckStatus
onOpenActivity
onEditReplacement
```

This should become part of the shared dialog contract.

**P0 exit condition:** response-loss tests pass without force-clicks or bypassing the modal.

---

# 4. P0: Repair receipt-settings navigation

The receipt browser tests currently fail waiting for:

```text
Business settings
```

after entering:

```text
Settings
```

The current source puts the receipt branding controls inside the **Administration view's SETTINGS subsection**.

That mismatch should not merely be patched in the test. The product navigation itself can be simplified.

The owner/operator mental model is:

```text
Settings
    Business
    Branding & receipts
    Payments
    Printer
    Rooms
    Tax
```

not:

```text
Administration
    Business settings
        Receipt settings
```

For the Web client, create a canonical:

## Settings → Branding & receipts

containing:

```text
App emblem
Receipt logo
M-Pesa Till QR
QR enabled
Till label
Till number
Receipt preview
Save branding
```

Then:

```text
Settings → Payments
```

contains:

```text
Cash
M-Pesa
Card
Primary M-Pesa account
```

and:

```text
Settings → Printer
```

contains:

```text
80mm width
columns
logo width
feed lines
auto cut
LAN printer settings
```

Administration can contain a link:

> Open business settings

but should not own another independent implementation.

Create one reusable Web component:

```tsx
<BusinessBrandingSettings />
```

with a single persistence contract.

Browser tests should navigate by stable semantic heading:

```text
Branding & receipts
```

rather than by a brittle nested button name.

**P0 exit condition:** branding/QR workflow passes every Web viewport.

---

# 5. P0: Fix the “Add another size” product-family workflow

Preview testing fails because it looks for:

```text
Product family name
```

after pressing:

```text
Add another size
```

But this is conceptually backwards.

Once an operator is already inside:

```text
Jameson 350ml
```

and presses:

```text
Add another size
```

they should **not have to name or choose Jameson again**.

The variant wizard should automatically inherit:

```text
productFamilyId
productFamilyName
brand/category defaults
route defaults
tax class defaults where valid
```

The screen should say:

```text
ADDING ANOTHER SIZE

Product family
Jameson

Choose size
[ 750 ml ] [ 1 L ] [ Custom ]
```

Make the family field read-only for this workflow.

If the operator deliberately wants a different family, that should be:

```text
Create another product
```

not hidden inside “Add another size”.

Then update preview acceptance to assert:

```text
variant 1 family ID == variant 2 family ID
variant 2 did not create a second family
variant 2 uses separate stock master
size-specific barcode remains unique
size-specific purchase packaging remains unique
```

This eliminates an unnecessary cognitive trap and makes the test follow the intended workflow rather than forcing the UI back toward an inferior one.

---

# 6. P1: Close the operation-contract splits

This is now more important than adding new features.

The parity ledger exposes several places where Terminal, Web and PostgreSQL technically support the same business idea through **different operation identities**.

### Customer credit

Current split:

| Runtime | Operation |
|---|---|
| Native | `customerCredit.charge` |
| PostgreSQL | `credit.charge` |
| Web | `credit.charge` |

Pick one canonical operation:

```text
credit.charge
```

Then make Native use it.

For one compatibility cycle, the native dispatcher may accept:

```text
customerCredit.charge
```

as an alias and normalize it to:

```text
credit.charge
```

before audit/storage.

Do not permanently support both.

### Comps

Current split:

```text
order.comp
order.compItem
```

Define them precisely:

```text
order.comp
whole-order comp

order.compItem
specific item/quantity comp
```

Both should exist in:

```text
Native
PostgreSQL
Web
operation manifest
permission matrix
audit
acceptance
```

Both should require:

```text
reason
actor
manager approval when policy requires
before/after amount
affected item IDs
stock disposition
```

A comp must never quietly behave like a void.

### Lifecycle operations

The ledger says:

```text
setup.completeStep -> Web missing
setup.goLive       -> Web missing
```

but Web already exposes lifecycle through RPC actions.

That is a contract ambiguity.

Choose one architecture:

```text
Web RPC
   ↓
canonical setup command
   ↓
same lifecycle handler
```

or remove the command-family claim from the manifest.

Do not count the same concept once as an RPC and again as a missing command.

### Room types

`roomType.save` is reported Web-missing even though Web provides room-type setup through generic record flows.

Change Web to send:

```text
roomType.save
```

instead of generic:

```text
record.save
```

for Room Types.

That gives server-side domain validation an exact operation identity.

---

# 7. P1: Finish POS exception workflows

Basic selling/payment is already mature. The remaining POS work is the dangerous edge layer.

| Workflow | Current | Required closure |
|---|---|---|
| Repeat round | Web partial | restore original portions/modifiers, stock availability check |
| Discount | Web partial | manager approval UX |
| Whole order comp | cross-runtime mismatch | canonical operation |
| Item comp | backend/Web missing | implement exact stock/financial semantics |
| Void | Web partial | disposition + approval + audit |
| Refund | strong | regression acceptance |
| Split payment | strong | regression acceptance |
| Room charge | strong | regression acceptance |

For every exception workflow, capture:

```text
who
when
reason
manager approval
original amount
new amount
stock effect
journal effect
command ID
```

Most importantly:

```text
VOID != COMP != REFUND
```

The UI must make those different verbs visibly different.

---

# 8. P1: Finish procurement rather than widening procurement

`purchaseOrder.create` and `purchaseOrder.receive` remain partial across all three runtime layers.

Finish the existing process before adding more finance features.

Canonical workflow:

```text
Supplier
   ↓
Purchase Order
   ↓
Approved quantity
   ↓
Goods Receipt
   ↓
Accepted / rejected quantity
   ↓
Inventory conversion
   ↓
Supplier invoice match
   ↓
Payable
   ↓
Payment
```

The package conversion must stay explicit:

```text
1 case
× 24 bottles
× 750 ml
= 18,000 ml canonical inventory
```

Acceptance must include:

```text
partial delivery
second partial delivery
rejected goods
missing rejection reason
over-receipt
manager-approved over-receipt
wrong package
price mismatch
duplicate GRN replay
response loss
invoice mismatch
already-paid invoice
```

Do not let received quantity silently default to ordered quantity without showing the operator what will post.

---

# 9. P1: Close hospitality workflow parity

The ledger still marks these Web flows partial:

```text
stay.extend
stay.checkIn
stay.move
stay.checkOut
```

The domain should become a single explicit stay state machine:

```text
RESERVED
   ↓
READY
   ↓
CHECKED_IN
   ↓
CHECKED_OUT

plus:

BLOCKED
CANCELLED
NO_SHOW
```

Every transition should have a blocker contract.

For check-in:

```text
arrival time reached
room ready
room not blocked
room capacity valid
reservation still active
required deposit state known
```

For room move:

```text
destination room available
same interval valid
capacity valid
condition valid
no active block
source stay version current
```

For checkout:

```text
accommodation posted
folio balanced/settlement policy satisfied
deposit accounted for
room released
housekeeping state created
```

The operator should see these before pressing the action, not discover them as raw server exceptions.

---

# 10. P1: Finish controlled import for fresh installation

Because this deployment is now explicitly a **fresh terminal installation**, don't build migration logic around the old trial installation.

Use a controlled onboarding import.

Separate:

```text
MASTER DATA
Products
Stock masters
Locations
Rooms
Room types
Rates
Guests
Suppliers
Assets
Staff profiles

OPENING STATE
Stock balances
Outstanding guest balances if any
Outstanding supplier balances if any
Opening cash float
```

Never import opening balances as ordinary historical transactions.

The current import architecture is promising but still partial.

Complete these guarantees:

```text
UTF-8 CSV
quoted values
commas inside fields
leading-zero barcodes preserved
scientific notation rejected
stable external ID optional/required by template
duplicate barcode rejection
duplicate room number rejection
duplicate staff Auth binding rejection
dry-run
row-level reason
batch hash
source hash
idempotent apply
replay safety
cancel/purge raw CSV
immutable import summary
```

Then generate an **Opening Balance Reconciliation Report** immediately after commissioning.

---

# 11. P1: Make receipt QR genuinely release-grade

The new source implementation is solid, but hardware acceptance is still king.

The final customer receipt should remain:

```text
BUSINESS HEADER

transaction details

totals

payment details

thank-you


[ M-PESA TILL QR ]


Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440

[ BUSINESS LOGO ]


blank feed
cut
```

The QR must remain:

```text
customer copy only
optional
centered
approximately 30-36 mm
4+ module internal quiet zone
no interpolation
no dithering
no cropping
```

Add approximately:

```text
3 mm visual outer clearance
```

around it in browser printing.

Direct ESC/POS should use blank raster/line separation.

Then test the actual XP-80T repeatedly:

```text
QR only
QR + footer
QR + footer + logo
long receipt
very long item names
cash receipt
M-Pesa receipt
split receipt
reprint
printer restart
five consecutive QR scans
```

The **cutter buffer comes after logo/footer**, not around the QR itself.

---

# 12. P1: Complete barcode-scanner acceptance

The scanner path needs physical HID acceptance, not only typed barcode simulation.

Validate:

```text
rapid key wedge
Enter suffix
scanner while POS search has focus
scanner while another field has focus
duplicate scans
unknown barcode
package barcode
unit barcode
dish shortcut barcode
stock-count scanning
receiving scanning
scanner disconnect/reconnect
```

The scanner should never accidentally type a barcode into:

```text
cash amount
guest name
room number
reason field
M-Pesa reference
```

while a scan session is active.

Create an explicit scanner-session state.

---

# 13. P1: Resolve durable approval-token storage

One security/architecture item remains important.

The current recovery design correctly retains queued commands for replay, but **durably storing one-time authorization material in IndexedDB is undesirable**.

Better model:

```text
manager approves
      ↓
server creates approval record
      ↓
command references approvalId
      ↓
approval is bounded to:
 actor
 operation
 target
 amount
 expiration
      ↓
replay safely references same approval
```

Do not persist reusable manager PINs or raw temporary approval secrets in workflow drafts.

Redaction should cover:

```text
payload
draft fields
technical detail
Activity
logs
export
error messages
```

---

# 14. P1: Fix parity-ledger semantics

Some “blocked” items are not true parity failures.

For example:

```text
runtime.print_receipt
runtime.backup
```

are inherently terminal/runtime capabilities.

The backend should not “implement printing”.

Instead extend parity status beyond:

```text
implemented
partial
missing
blocked
```

to include:

```text
local-only
server-only
not-applicable
```

Then:

```text
runtime.print_receipt:
Native      IMPLEMENTED
Web         IMPLEMENTED through client print contract
Backend     NOT_APPLICABLE

runtime.backup:
Native      IMPLEMENTED
Web         NOT_APPLICABLE or REQUEST_ONLY
Backend     NOT_APPLICABLE
```

This stops intentional architecture from polluting the product-completion percentage.

---

# 15. P2: Operator UX acceptance

The parity ledger currently has a huge amount of:

```text
operator UX = UNREVIEWED
```

This is probably the largest remaining maturity gap by count.

Do not manually test all 90 operations with the same weight.

Use three risk classes:

| Tier | Operations | Required proof |
|---|---|---|
| A | money, stock, stays, tills | full failure/recovery acceptance |
| B | master-data mutations | happy, validation, permission, conflict |
| C | read/local utilities | basic usability and accessibility |

For every Tier A command, test:

```text
happy path
validation failure
permission denial
double-click
network loss before send
network loss after server commit
retry
stale version conflict
refresh
logout/login
second device
audit evidence
```

This will convert the operation manifest from a documentation artifact into a genuine release ledger.

---

# 16. P2: Fresh-terminal commissioning wizard

The fresh install should not boot into a giant ERP and say “good luck”.

Create a commissioning flow:

```text
1  Business identity
2  Property/outlet
3  Tax & currency
4  Payment accounts
5  M-Pesa + Till QR
6  Printer
7  Receipt branding
8  Scanner
9  Staff
10 Rooms/rates
11 Import catalogue
12 Opening stock
13 Backup destination
14 Test transaction
15 Readiness review
16 Go Live
```

Every step has:

```text
Not started
Needs review
Passed
```

Go Live remains disabled until mandatory steps pass.

This is particularly important for Country Side Resort because a fresh installation means trial data should never sneak into the live ledger.

---

# 17. P2: Backup and disaster recovery must become proof, not a button

Test:

```text
backup
hash
copy
restore
launch
login
inventory totals
orders
receipts
staff
settings
branding
QR
printer profile
```

Then test a simulated dead terminal:

```text
new machine
fresh ServOS install
restore backup
re-pair hardware
resume operation
```

A backup that has never been restored is a hopeful zip file, not a recovery system.

---

# 18. P2: Web/Terminal writer cutover

This remains the biggest architectural production gate for full dual-runtime ServOS.

At cutover there must be exactly one write authority.

Never allow:

```text
legacy terminal writes
+
shared PostgreSQL v2 writes
```

simultaneously for the same live business.

Use explicit business mode:

```text
LEGACY_LOCAL
STAGING_V2
SHARED_V2
```

Switching to `SHARED_V2` should require:

```text
schema accepted
reconciliation accepted
operator identities bound
terminal paired
all pending commands resolved
snapshot version current
backup created
cutover token recorded
```

Once switched:

```text
legacy write entry points fail closed
```

Reads may remain cached locally.

---

# 19. P2: Target-hardware performance gate

The final build needs to be tested on the actual POS hardware, not only developer machines and GitHub runners.

For the target Celeron/J3455-class terminal, record:

| Measurement | Target behavior |
|---|---|
| Boot to login | predictable, no blank state |
| Login | no UI lockup |
| Barcode to matched item | effectively immediate |
| Add item | immediate UI feedback |
| Pay | one clear progress state |
| Receipt | starts without frozen interface |
| Inventory count | usable with large catalogue |
| Startup memory | stable |
| Full-shift memory | no continuous climb |
| SQLite DB growth | predictable |
| Repeated reprint | no queue corruption |

The exact numeric thresholds can be established from the physical machine, then turned into regression targets.

---

# 20. Release documentation itself needs correction

`docs/CURRENT_RELEASE_STATE.md` is already stale relative to CI #120.

It still contains source-era language such as:

```text
no verification command has run
```

while the current GitHub run has already executed large portions of the stack.

That document should stop being manually maintained as the authoritative status.

Generate the top portion from same-SHA CI evidence:

```text
SHA
timestamp
frontend result
native result
desktop result
cloud base
cloud v2
preview
production browser
migration max
artifact IDs
candidate status
```

Then retain human-written notes below it.

This avoids the repo telling three different stories at once.

---

# Recommended execution order

1. **Fix `tests/supabase/pos.sql` syntax and valid QR raster fixture.**
2. **Fix Tauri `MutexGuard<Connection>` compile defect.**
3. **Implement modal-level OUTCOME_UNKNOWN recovery.**
4. **Make Web Settings → Branding & receipts the canonical QR/logo route.**
5. **Fix Add Another Size to inherit the product family automatically.**
6. **Run Cloud v2 + Desktop + focused browser tests.**
7. **Run full CI. Do not proceed until every required job is green on one SHA.**
8. **Unify credit and comp operation contracts.**
9. **Close POS, hospitality, procurement, stock-count and import parity gaps.**
10. **Complete operator UX acceptance for Tier A operations.**
11. **Build the frozen installer.**
12. **Perform fresh terminal commissioning.**
13. **Run XP-80T + QR + scanner acceptance.**
14. **Run a full business shift simulation.**
15. **Run outage/restart/response-loss scenarios.**
16. **Backup, wipe, reinstall and restore.**
17. **Reconcile stock, cash, receipts, M-Pesa and rooms.**
18. **Freeze and release the accepted SHA.**

## Where that would leave ServOS

The remaining source work is no longer “build another 20% of the ERP.”

My current decomposition looks closer to:

```text
~91% feature/source implementation
       │
       ├── ~3% contract and integration closure
       ├── ~2% UX/recovery closure
       ├── ~1% remaining parity/domain work
       └── ~3% physical + operational acceptance
```

The biggest lesson from CI #120 is that the red badge looks scarier than the actual defect surface. **Cloud v2 is currently dying on a malformed new test statement. Desktop has one clear Rust type/locking error. Browser failures collapse into roughly three flow problems.**

Once those four P0 areas are cleared, I would expect the repo to cross from **“90% built” into genuine release-candidate territory**, at which point the work should shift almost entirely from coding to proving ServOS on the actual terminal, printer, scanner, network and business workflow.