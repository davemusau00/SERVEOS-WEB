# ServOS DEV FINAL SPRINT UPDATED — REVISION 5

**Prepared:** 1 October 2026, Africa/Nairobi  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Live head reviewed:** `cc3094746f81bcfa174ec0589520b206300e0a85`  
**Primary objective:** ship the fresh Native production terminal as soon as the remaining release gates are genuinely green.

This revision supersedes the status/sequence at the top of Revision 4. Keep the older material below for implementation detail.

---

## R5.1 Current live repository state

Latest observed ServOS CI run: **#127**.

| Gate | Current state |
|---|---|
| Frontend | ✅ PASS |
| Native domain | ✅ PASS |
| Cloud protocol base | ✅ PASS |
| Cloud protocol v2 | ✅ PASS |
| Desktop shell | ⏳ running at review time; known source compile defect still present |
| Browser preview | ⏳ running at review time |
| Browser production | ⏳ running at review time |
| Vercel | ✅ PASS |

### What changed since Revision 4

The M-Pesa Till QR / Cloud-v2 blocker is now **cleared**.

Recent commits repaired the QR database guard and acceptance fixtures, including replacement/removal/disabled snapshot behavior and close-day test arithmetic. The newest head's `cloud-protocol-v2` job passes.

Therefore:

- Cloud-v2 fixture repair is **closed** unless it regresses.
- Migration `044_mpesa_till_qr.sql` validation remains strict.
- QR source/database acceptance is now green.
- Real XP-80T paper/scan acceptance is still required.

---

# R5.2 P0 — Desktop shell is the primary code blocker

The old Rust call is still present in `src-tauri/src/lib.rs`:

```rust
let pending=store::next_native_v2_pending(
    &state.db.lock().map_err(|e|e.to_string())?,
    &terminal
)?
.ok_or("Durable v2 command queue entry disappeared")?;
```

Replace it with a short explicit lock scope:

```rust
let pending = {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::next_native_v2_pending(&*db, &terminal)?
}
.ok_or("Durable v2 command queue entry disappeared")?;
```

Audit adjacent v2 SQLite access with one rule:

> Never hold the SQLite mutex across an awaited network operation.

Required same-SHA verification:

```text
npm run check:desktop
npm run test:desktop
npm run test:native
```

**Exit:** `desktop-shell` and `native-domain` green on the exact terminal candidate SHA.

---

# R5.3 P0 — Canonical Supabase migration automation has NOT landed

Current repository structure remains:

```text
supabase/migrations/
  202609240001_terminal_replica.sql
  202609240002_remote_requests.sql
  202609240003_request_validation.sql
  202609270001_reconciliation_manifest.sql

supabase/expansion/
  001_protocol.sql
  ...
  044_mpesa_till_qr.sql
```

Still absent:

```text
supabase/config.toml
.github/workflows/*supabase-deploy*
```

Only `.github/workflows/ci.yml` exists.

The disposable test runner knows how to append `supabase/expansion`, but normal Supabase CLI deployment does not. Production and CI therefore still do not share one canonical migration path.

## Required fix

1. Add `supabase/config.toml`.
2. Convert the reviewed expansion chain into timestamped files under `supabase/migrations/`, preserving exact order.
3. Update `scripts/test-supabase.mjs` to execute the canonical migration set exactly once.
4. Remove production dependency on the custom `supabase/expansion/` directory.
5. Prove a clean database can reset from zero from canonical migrations only.
6. Add protected staging and production migration workflows.
7. Record project ref, Git SHA, migration list and highest migration in release evidence.

### Production CLI path

```text
supabase link --project-ref <PROJECT_ID>
supabase migration list
supabase db push --dry-run
supabase db push
supabase migration list
```

### Deployment secrets only

```text
SUPABASE_ACCESS_TOKEN
PRODUCTION_PROJECT_ID
PRODUCTION_DB_PASSWORD
STAGING_PROJECT_ID
STAGING_DB_PASSWORD
```

### Client-visible values only

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never place database passwords, access tokens or service-role credentials in the Tauri/Web client.

---

# R5.4 P0 — Add a Terminal Release Candidate gate

The full release candidate should continue protecting the complete dual-runtime product.

Add a separate `terminal-release-candidate` gate requiring:

- frontend green
- native-domain green
- desktop-shell green
- cloud-base green
- cloud-v2 green
- canonical migration verification green
- exact source SHA recorded
- migration-set hash recorded
- Windows installer/package built from the same SHA

Browser-only presentation/navigation defects do not automatically block the first Native terminal.

A browser failure **does** block the terminal if it exposes a shared:

- domain
- migration
- Auth
- permission
- financial
- stock
- receipt

defect.

---

# R5.5 Immediate terminal deployment sequence

Once Desktop + canonical migrations are green:

1. Freeze candidate SHA.
2. Create a clean production Supabase project.
3. Deploy canonical migrations from that exact SHA.
4. Verify production migration history.
5. Confirm `servos_v2.control.enabled = false`.
6. Provision real Admin Auth identity.
7. Build Windows installer from the frozen SHA.
8. Fresh-install target terminal.
9. Complete Intake with real production data.
10. Pair terminal once as Admin.
11. Configure XP-80T.
12. Upload official receipt logo.
13. Upload official M-Pesa Till QR.
14. Configure barcode scanner.
15. Create real local staff records.
16. Invite individual Auth users.
17. Bind each Auth UUID to the exact stable Staff ID.
18. Import reviewed master data.
19. Enter/reconcile opening stock and till state.
20. Run printer/QR/scanner physical acceptance.
21. Run complete shift rehearsal.
22. Create and restore backup.
23. Reconcile.
24. Sign Go Live.

---

# R5.6 Administrator commissioning

The initial Administrator must be an individual production identity, not a shared daily-login account.

Required:

- real Supabase Auth account
- own password
- initial stable Staff ID using existing `auth:<Auth UUID>` convention
- active business membership
- correct Admin permissions
- one-time DESKTOP device pairing
- business/payment/printer/branding configuration

The Admin must never share their password with operators.

Do not identify staff using:

- email as the permanent Staff ID
- display name as the Staff ID
- terminal/device ID as the Staff ID

---

# R5.7 Operator commissioning

Every operator gets:

```text
one stable local Staff ID
one individual Supabase Auth identity
one explicit role
one explicit outlet/service-area scope
one exact Auth UUID → Staff ID binding
```

Local PIN and online Auth remain separate security boundaries.

### Setup flow

1. Create/confirm local staff record.
2. Assign canonical role.
3. Assign outlet/service scope.
4. Send individual Auth invitation.
5. Operator accepts invitation and chooses their own password.
6. Bind Auth UUID to existing stable Staff ID.
7. Sign in on the already-paired terminal.
8. Verify permissions.

Do not:

- share cashier accounts
- collect operator passwords
- grant `devices.register` to cashiers
- create a new terminal pairing per operator
- generate a new Staff ID when an existing one already represents that person

### Pre-Go-Live permission proof

Prove:

- Admin-only action succeeds for Admin
- normal sale succeeds for operator
- Admin-only action fails for operator
- operator switch clears prior session
- terminal device ID remains unchanged
- inactive/unbound identity is rejected

---

# R5.8 Fresh data commissioning

Trial data is not production truth.

Import only reviewed master data such as:

```text
products/menu
stock definitions
stock locations
room types
rates
rooms
guests/customers
suppliers
asset categories
assets
staff profiles where appropriate
```

Opening state is separate:

```text
stock by location
sealed/open bottle state
opening till float
supported opening receivables/payables
```

Do not fabricate historical transactions to create opening balances.

Generate an Opening Balance Reconciliation report before Go Live.

---

# R5.9 M-Pesa Till QR state

Current source/database state is substantially stronger:

- enabled flag validated
- enabled QR requires printable thermal raster
- square/bounded raster checked
- receipt snapshot immutable
- replacement affects only new receipts
- removal affects only new receipts
- disabled QR omitted from new receipt snapshot
- Cloud v2 acceptance now green

Still required on physical XP-80T:

- customer copy only
- correct placement before fixed footer
- logo after footer
- no crop
- quiet zone preserved
- repeated scan success
- long receipt test
- restart + reprint
- historic reprint

---

# R5.10 Physical scanner acceptance

Validate the actual HID scanner:

```text
rapid scan
Enter suffix
unit barcode
package barcode
dish/menu barcode
duplicate scan
unknown barcode
stock count
goods receipt
disconnect/reconnect
```

A scanner capture must not leak into:

```text
cash amount
M-Pesa reference
guest name
room number
reason fields
```

---

# R5.11 Full shift acceptance

Before Go Live:

```text
Admin sign-in
operator sign-in
open till
cash sale
M-Pesa sale
split sale
receipt/reprint
void/refund where permitted
stock movement
room/folio action where used
cash-up
till close
backup
restart
reconcile
```

No unexplained balance or stock differences remain.

---

# R5.12 Backup/restore gate

Before Go Live:

1. create backup
2. hash/copy backup
3. restore into isolated/replacement state
4. launch ServOS
5. verify business settings, staff, products, stock, receipts, branding, QR and printer profile
6. document recovery steps

A backup file that has never been restored is not accepted recovery proof.

---

# R5.13 What can remain after first terminal launch

Provided shared Web/PostgreSQL v2 transactional authority remains disabled:

- Web OUTCOME_UNKNOWN modal recovery
- Web Branding & receipts navigation cleanup
- Add Another Size family-inheritance polish
- remaining stay Web parity
- remaining procurement Web parity
- repeat-round/discount/comp/void Web exception UX
- credit operation canonicalization
- item-comp parity
- PWA update/install acceptance
- broad lower-risk Web operator UX review
- final shared-v2 writer cutover

Reclassify anything that exposes a shared data/money/stock/Auth/receipt defect.

---

# R5.14 Current critical path

```text
Desktop green
→ canonical Supabase migrations
→ migration CI/CD
→ terminal-release-candidate
→ clean production Supabase
→ Admin/operator provisioning
→ exact-SHA Windows installer
→ fresh terminal
→ XP-80T + QR + scanner
→ full shift
→ restore rehearsal
→ GO LIVE
```

Cloud v2 is no longer on the blocker list unless it regresses.

---

# R5.15 Go / No-Go

- [ ] exact release SHA recorded
- [ ] frontend green
- [ ] native-domain green
- [ ] desktop-shell green
- [ ] cloud-base green
- [ ] cloud-v2 green
- [ ] canonical migrations in `supabase/migrations`
- [ ] migration CI/CD exists
- [ ] production dry-run reviewed
- [ ] production migration push completed
- [ ] production migration list matches Git
- [ ] shared-v2 writer deliberately OFF
- [ ] real Admin identity configured
- [ ] terminal paired once
- [ ] individual operator identities bound
- [ ] operator permission denial tested
- [ ] real business settings configured
- [ ] official Till QR uploaded
- [ ] XP-80T receipt pair accepted
- [ ] paper QR scans reliably
- [ ] physical scanner accepted
- [ ] opening state reconciled
- [ ] full shift accepted
- [ ] backup restore demonstrated
- [ ] trial data absent from live books
- [ ] Go Live signed off

---

# APPENDIX — REVISION 4 AND EARLIER DETAIL

# ServOS DEV FINAL SPRINT UPDATED — REVISION 4

**Prepared:** 1 October 2026, Africa/Nairobi  
**Repository:** `davemusau00/SERVEOS-WEB`  
**Live head reviewed:** `d71f8e7d0459a86e2af685780c68ee766c52efd4`  
**Primary objective:** DEPLOY A FRESH PRODUCTION TERMINAL AS SOON AS SAFELY POSSIBLE  
**Release strategy:** Native terminal first. Keep shared Web/PostgreSQL v2 business writes disabled until their separate cutover gate is accepted.

---

## 1. Release objective

ServOS is now in final stabilization, not broad feature construction.

The immediate target is a dependable first production terminal with:

- Tauri/SQLite operational authority
- XP-80T 80mm printing
- physical barcode scanner support
- real business identity/settings
- M-Pesa manual reconciliation
- uploaded M-Pesa Till QR on customer receipts
- individual Admin/operator identities
- controlled fresh data commissioning
- automated, repeatable Supabase migrations
- proven backup/restore
- a completed shift rehearsal

The full Web/shared-v2 product remains a parallel release stream. Web-only polish must not delay the first terminal unless the defect affects shared business data, permissions, receipts, stock, money, migrations, or Native behavior.

---

# 2. Current live repository state

At the reviewed head, ServOS CI run **#123** was still executing.

Observed during this revision:

| Job | State |
|---|---|
| Frontend | PASS |
| Native domain | PASS |
| Cloud protocol base | PASS |
| Cloud protocol v2 | FAIL |
| Desktop shell | RUNNING at review time |
| Browser preview | RUNNING at review time |
| Browser production | RUNNING at review time |
| Vercel | PASS |

### Current Cloud v2 failure

All checked-in base migrations and expansion migrations through:

`044_mpesa_till_qr.sql`

successfully apply in the disposable PostgreSQL test environment.

The present Cloud v2 failure occurs later in:

`tests/supabase/pos.sql`

The newly added `failing_put(...)` QR-guard test data contains malformed JSON. The JSON input ends before the outer business object is closed.

This is now a **fixture defect**, not a migration application failure.

### Immediate fix

Correct all new `failing_put` JSON literals for:

- non-square QR raster
- oversized QR raster
- wrong packed/base64 length
- enabled QR missing `dataUrl`
- QR configuration missing explicit `enabled`

Keep migration 044 strict.

An enabled receipt QR must have both:

- a valid normalized PNG `dataUrl`
- a valid printable square `thermalRaster`

Do not weaken the QR database guard merely to make CI green.

---

# 3. TERMINAL-ASAP RELEASE PROFILE

The first production release should use this authority model:

```text
SERVOS TERMINAL PRODUCTION
--------------------------
Native Tauri app
SQLite local operational writer
XP-80T receipt printer
USB/HID barcode scanner
Supabase production project migrated from Git
Supabase Auth for named staff identities
shared servos_v2 business writes: OFF initially
transactional Web v2: OFF initially
```

This gives us the fastest safe deployment path.

The hosted database and Auth system are prepared correctly now, but the terminal does not depend on unfinished Web/shared-writer acceptance to begin operating.

`servos_v2.control.enabled` must remain false until the separate shared-v2 cutover is accepted.

---

# 4. P0 — TERMINAL RELEASE BLOCKERS

## T0-01 — Cloud v2 fixture repair

Fix the malformed QR JSON fixtures.

Add both positive and negative QR guard cases:

```text
valid enabled QR                    PASS
enabled QR without raster           REJECT
non-square raster                   REJECT
raster > 320 dots                   REJECT
wrong packed/base64 length          REJECT
missing dataUrl                     REJECT
missing enabled flag                REJECT
disabled configured QR              PASS, omitted from new receipt
removed QR                          PASS, omitted from new receipt
replaced QR                         affects new receipts only
historic receipt                    keeps original QR snapshot
```

**Exit gate:**

`npm run test:cloud:v2`

must pass completely.

---

## T0-02 — Desktop shell must be green

Native-domain passing is not enough. The actual Tauri application boundary must compile and test.

The previously identified `next_native_v2_pending` call should use a short explicit SQLite lock scope and pass the underlying `Connection`, not the `MutexGuard`.

Do not hold the SQLite mutex across awaited network work.

Required same-SHA verification:

```text
npm run check:desktop
npm run test:desktop
npm run test:native
```

**Exit gate:** Desktop shell and Native domain are both green on the exact candidate SHA.

---

## T0-03 — Create a dedicated Terminal Release Candidate gate

The current general `release-candidate` gate protects the complete dual-runtime product, which is correct for the full release.

Add a separate:

`terminal-release-candidate`

artifact/job.

It must require:

- frontend PASS
- native-domain PASS
- desktop-shell PASS
- cloud-protocol-base PASS
- cloud-protocol-v2 PASS if the production project receives the full current migration chain
- contracts/docs checks PASS
- exact Git SHA recorded
- migration-set hash recorded
- package artifact built from the same SHA

Browser failures that are purely Web navigation/presentation issues do not block the terminal candidate.

A browser failure that exposes a shared domain, permission, migration, financial, inventory or receipt defect **does** block the terminal.

---

# 5. P0 — AUTOMATED SUPABASE MIGRATIONS

## 5.1 Current structural blocker

The repository currently separates database SQL into:

```text
supabase/migrations/
supabase/expansion/
```

The ServOS disposable test runner manually reads both directories.

The normal Supabase CLI deployment path does not know that `supabase/expansion/` is a second migration directory.

Therefore:

`supabase db push`

cannot currently be trusted to deploy the complete ServOS schema automatically.

This must be fixed before production database commissioning.

---

## 5.2 Canonical migration structure

Create/restore:

`supabase/config.toml`

Then consolidate the reviewed expansion chain into the official migration history.

Target structure:

```text
supabase/
  config.toml
  migrations/
    202609240001_terminal_replica.sql
    202609240002_remote_requests.sql
    202609240003_request_validation.sql
    202609270001_reconciliation_manifest.sql

    202610010001_protocol.sql
    202610010002_allocations.sql
    ...
    202610010043_receipt_branding_snapshots.sql
    202610010044_mpesa_till_qr.sql
```

The exact timestamps may differ.

Rules:

1. Preserve expansion execution order exactly.
2. Keep each migration independently tracked.
3. Do not merge the complete chain into an opaque giant migration merely for convenience.
4. Once production uses a migration timestamp, do not rewrite that applied migration.
5. Future fixes are forward migrations.

---

## 5.3 Update the disposable test runner

After consolidation:

`scripts/test-supabase.mjs`

must stop manually loading `supabase/expansion`.

The v2 test should create the disposable database from the same canonical migration directory used by production.

That eliminates the dangerous situation where:

- CI tests one migration path
- production `db push` deploys another

The migration path must be identical.

---

# 6. SUPABASE CI/CD PIPELINE

## 6.1 Required GitHub secrets

Create protected repository/environment secrets:

```text
SUPABASE_ACCESS_TOKEN

STAGING_PROJECT_ID
STAGING_DB_PASSWORD

PRODUCTION_PROJECT_ID
PRODUCTION_DB_PASSWORD
```

Never expose these in:

- `.env.local`
- Vite client variables
- the Tauri frontend
- source control
- receipts
- logs/artifacts

The terminal/client only needs:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Never embed a service-role key.

---

## 6.2 Pull-request migration verification

When `supabase/migrations/**` changes:

1. checkout repository
2. install Supabase CLI
3. initialize/start local Supabase
4. reset database from zero
5. apply every canonical migration
6. run Cloud base tests
7. run Cloud v2 tests
8. run database/domain fixtures
9. verify no generated migration drift
10. fail the PR if any step fails

The migration test must prove a clean database can reach the current schema without Dashboard intervention.

---

## 6.3 Staging deployment

On the accepted integration/main branch:

```text
supabase link --project-ref <STAGING_PROJECT_ID>
supabase db push --dry-run
supabase db push
supabase migration list
```

Then run staging-safe smoke checks.

Staging must prove:

- migration history matches Git
- Auth/session RPCs exist
- read permissions work
- v2 control is in the intended state
- receipt branding/QR schema exists
- staff/device binding RPCs exist

---

## 6.4 Production deployment

Use a protected GitHub `production` environment or manual deployment workflow.

Production deployment sequence:

```text
1. checkout exact accepted terminal SHA
2. install Supabase CLI
3. link PRODUCTION_PROJECT_ID
4. supabase migration list
5. supabase db push --dry-run
6. review pending versions
7. supabase db push
8. supabase migration list
9. run production-safe schema/RPC smoke checks
10. write deployment evidence
```

Store in release evidence:

- Git SHA
- project reference
- highest migration
- migration list/hash
- actor
- deployment time
- `servos_v2.control.enabled` state
- smoke result

---

# 7. FASTEST SAFE HOSTED PATH — NEW PRODUCTION PROJECT

Because this is a fresh live terminal and previous records are trial data, the recommended fast path is a **new clean production Supabase project**.

Do not import trial transactions into the production books.

For a new project:

- no `db pull` is required
- apply the committed migrations from zero
- create real production Auth users
- import reviewed master data separately
- enter explicit opening balances/state

If an existing trial Supabase project must be retained, do not push blindly.

First reconcile:

```text
supabase migration list
supabase db pull
local reset/rehearsal
migration repair only when justified
```

The existing hosted migration history must be understood before deployment.

---

# 8. ADMIN SETUP — FRESH PRODUCTION TERMINAL

The first Admin is the commissioning identity.

It is not a shared cashier account.

## 8.1 Create the real Admin Auth user

1. Invite/create the real owner or designated system Administrator in production Supabase Auth.
2. Admin accepts the invitation.
3. Admin creates their own password.
4. Record the Auth UUID.
5. During fresh initial owner enrollment, use the existing ServOS convention:

```text
Staff ID = auth:<Auth UUID>
```

for the initial owner/Admin identity.

6. Verify active business membership.
7. Verify Administrator permissions.

Never use:

- email as Staff ID
- display name as Staff ID
- terminal ID as Staff ID

---

## 8.2 Fresh Intake

Use only real production details:

```text
Trading name
Legal name
Registration details
Address
Phone/email
Property/outlet
Currency: KES
Timezone: Africa/Nairobi
Tax configuration
Receipt thank-you
Payment methods
M-Pesa account/Till
Official M-Pesa Till QR
Receipt logo
Room policy where applicable
```

Do not copy trial state simply because it already exists somewhere.

---

## 8.3 Pair the terminal once

1. Complete local owner enrollment.
2. Confirm the terminal has a stable terminal/device ID.
3. Sign in online as the authorized Admin.
4. Register/commission the `DESKTOP` device.
5. Confirm hosted device ID equals the enrolled terminal ID.
6. Sign out after commissioning.
7. Subsequent operators reuse the same paired terminal.

Do not register a new device for every operator.

Do not grant `devices.register` to ordinary cashiers just to make setup easier.

---

## 8.4 Admin hardware configuration

Configure:

```text
XP-80T printer mode
Windows queue OR LAN host/port
receipt columns
thermal logo max width
feed lines before cut
auto cut
receipt logo
M-Pesa Till QR
barcode scanner
```

Print a non-sale test slip before live transaction tests.

---

# 9. OPERATOR SETUP — ONE PERSON, ONE IDENTITY

Every staff member gets their own identity.

## 9.1 Create/confirm local staff record

Each operator needs:

```text
stable Staff ID
display name
role
outlet/service-area scope
local PIN if legacy/offline operation requires it
```

The local PIN is not the online server identity.

---

## 9.2 Invite the operator

In:

`ServOS Administration → Auth`

use:

`Invite staff member`

Send the invitation to that person's own account.

The operator:

- accepts invitation
- creates their own password
- keeps it private
- uses normal Auth recovery if forgotten

Admins must not collect staff passwords.

---

## 9.3 Bind the Auth UUID

Bind:

```text
Auth UUID
   ↓
existing stable local Staff ID
```

The mapping must be one-to-one.

Use `Generate ID for new staff` only when genuinely creating a new staff record.

If the operator already exists locally, use the exact existing Staff ID.

---

## 9.4 Permission acceptance

Before handover prove:

```text
Admin can perform an Admin-only configuration action
Cashier/Server can sell and settle an allowed transaction
Cashier/Server is denied an Admin-only action
Storekeeper sees only intended stock workflows
Reception sees intended hospitality workflows
inactive/unbound Auth user is denied
operator switch removes the old active session
terminal device ID remains unchanged across operators
```

---

# 10. ONLINE VS OFFLINE OPERATOR IDENTITY

This distinction must be explained to staff.

## Online Auth

```text
staff record selected
+
operator's own email/password
+
server-resolved permissions
```

No local PIN is required to establish the hosted identity.

## Legacy/offline terminal access

While shared-v2 authority remains disabled:

```text
local Staff ID
+
local PIN
+
SQLite authority
```

This does not create shared PostgreSQL authority.

Do not teach staff that "PIN and cloud password are the same thing." They are separate security boundaries.

---

# 11. FRESH BUSINESS DATA COMMISSIONING

## 11.1 Import master data only

Controlled import may be used for:

```text
products/menu
stock item definitions
stock locations
room types
nightly rates
rooms
guests/customers
suppliers
asset categories
assets
staff profiles where appropriate
```

CSV requirements:

```text
UTF-8
proper quoted-field handling
leading-zero barcodes preserved as text
scientific notation rejected where unsafe
duplicate barcode rejection
duplicate room rejection
dry-run
row-level rejection reason
batch/source hash
idempotent apply
cancel/purge source
immutable import summary
```

---

## 11.2 Opening state is separate

Do not manufacture fake historical transactions.

Commission explicit opening state for:

```text
stock by location
sealed bottles/open liquid
opening till float
supported opening receivables/payables if required
```

Create an Opening Balance Reconciliation report before Go Live.

---

# 12. XP-80T RECEIPT + M-PESA QR ACCEPTANCE

On the actual printer test:

```text
cash receipt
M-Pesa receipt
split tender
customer copy
business record copy
long receipt
long item names
receipt logo
M-Pesa Till QR
footer
feed margin
cutter
reprint after printer restart
historic reprint
```

Final customer receipt sequence remains:

```text
business header
transaction content
totals
payment details
thank-you
optional M-Pesa Till QR
fixed KINGSFORGE footer
optional customer receipt logo
blank feed
cut
```

QR rules:

```text
customer copy only
optional
centered
approximately 30–36 mm
at least 4 QR modules of quiet zone
no dithering
no interpolation
no cropping
```

Scan the printed QR successfully several consecutive times on an ordinary phone.

Record:

- printer queue/profile
- feed lines
- accepted QR size
- sample receipt IDs
- paper photos

---

# 13. PHYSICAL BARCODE SCANNER ACCEPTANCE

Validate the actual scanner:

```text
rapid HID scan
Enter suffix
unit barcode
package barcode
dish/menu quick-scan barcode
duplicate scans
unknown barcode
stock count
goods receipt
disconnect/reconnect
```

A scan must never accidentally populate:

```text
cash amount
M-Pesa reference
guest name
room number
reason field
```

---

# 14. FULL SHIFT REHEARSAL

Before live trading:

```text
Admin sign-in/configuration
operator sign-in
open till
cash sale
M-Pesa sale
split sale
reprint
void/refund where role allows
stock movement
room/folio workflow if used
cash-up
till close
backup
restart
reconcile
```

No unexplained cash, stock or receipt differences may remain.

---

# 15. BACKUP / RESTORE RELEASE GATE

Before Go Live:

1. create a real terminal backup
2. hash/copy it
3. restore it into an isolated test/replacement state
4. launch ServOS
5. verify:

```text
business settings
staff
products
stock
receipts
branding
Till QR
printer profile
```

6. document the restore procedure

A backup file that has never been restored is not accepted recovery evidence.

---

# 16. REMAINING GAPS THAT SHOULD NOT DELAY THE FIRST TERMINAL

Provided shared-v2/Web transactional authority remains disabled, these may continue after terminal launch:

```text
Web OUTCOME_UNKNOWN modal recovery
Web Settings → Branding & receipts navigation cleanup
Web Add Another Size family inheritance polish
stay.extend Web parity
stay.checkIn Web parity
stay.move Web parity
stay.checkOut Web parity
remaining Web procurement parity
repeat-round Web parity
manager approval UX for discount/comp/void
credit.charge / customerCredit.charge canonicalization
order.comp / order.compItem parity
PWA installation/update acceptance
lower-risk Web operator UX review
shared-v2 writer cutover
signed offline shared-v2 grants
remote manager enhancements
```

Reclassify any item as a terminal blocker if it exposes a shared:

- migration
- financial
- stock
- permission
- receipt
- Auth
- Native domain

defect.

---

# 17. POST-TERMINAL HIGH-PRIORITY GAP CLOSURE

## 17.1 OUTCOME_UNKNOWN recovery

A modal containing an uncertain command must expose recovery inside the modal:

```text
Check status
Open Activity
Do not submit again
```

Do not require the operator to click a synchronization control hidden behind the modal.

---

## 17.2 Canonical operation identities

Resolve runtime splits such as:

```text
customerCredit.charge
credit.charge
```

to one canonical operation.

Define separately:

```text
order.comp       whole-order comp
order.compItem   item/quantity comp
order.void       void/cancel semantics
payment.refund   refund after settlement
```

Each must have explicit financial, stock, approval and audit effects.

---

## 17.3 Procurement completion

Finish:

```text
supplier
purchase order
approval
partial receipt
rejection
over-receipt approval
inventory conversion
invoice match
payable
payment
```

with replay/conflict acceptance.

---

## 17.4 Hospitality parity

Close remaining Web acceptance for:

```text
stay.extend
stay.checkIn
stay.move
stay.checkOut
```

with explicit pre-action blockers.

---

## 17.5 Durable manager approvals

Do not persist reusable PINs/tokens in drafts.

Prefer a server-created approval record/reference bounded to:

```text
actor
operation
target
amount
expiry
```

and reference that approval from replay-safe commands.

---

# 18. WEB/TERMINAL SHARED-V2 CUTOVER — LATER RELEASE

Do not allow legacy/local and shared-v2 writers to mutate the same live business simultaneously.

Use an explicit operating mode:

```text
LEGACY_LOCAL
STAGING_V2
SHARED_V2
```

Switching to `SHARED_V2` requires:

```text
schema accepted
all migration versions reconciled
operator identities bound
terminal paired
all pending commands resolved
snapshot current
backup created
cutover evidence recorded
full required operation parity accepted
```

Once shared-v2 is enabled, incompatible legacy write paths must fail closed.

---

# 19. TERMINAL-ASAP EXECUTION ORDER

1. Correct malformed QR `failing_put` JSON.
2. Re-run Cloud v2 to green.
3. Get Desktop shell to green.
4. Consolidate `supabase/expansion` into canonical `supabase/migrations`.
5. Add `supabase/config.toml`.
6. Update database tests to execute the canonical migrations exactly once.
7. Add GitHub Supabase PR/staging/production workflows.
8. Create clean production Supabase project.
9. Push migrations from exact accepted SHA.
10. Verify production migration list.
11. Provision real Admin Auth identity.
12. Build Windows installer from exact terminal candidate SHA.
13. Fresh-install on target terminal.
14. Complete production Intake.
15. Pair terminal once as Admin.
16. Configure printer/logo/Till QR/scanner.
17. Create real staff records.
18. Invite and bind individual operator Auth identities.
19. Import reviewed master data.
20. Reconcile opening stock/till state.
21. Perform physical printer/QR/scanner acceptance.
22. Run full shift rehearsal.
23. Run backup/restore rehearsal.
24. Sign off Go Live.
25. Keep shared-v2 writes disabled.
26. Continue Web/shared-v2 closure as the next release stream.

---

# 20. GO / NO-GO CHECKLIST

The first terminal may go live only when:

- [ ] release SHA is recorded
- [ ] frontend is green
- [ ] native-domain is green
- [ ] desktop-shell is green
- [ ] cloud-base is green
- [ ] full migration chain is green in disposable acceptance
- [ ] canonical migrations live in `supabase/migrations`
- [ ] production `db push --dry-run` is reviewed
- [ ] production migration push succeeds
- [ ] production migration list matches repository
- [ ] shared-v2 writer is deliberately OFF unless separately approved
- [ ] real Admin Auth user is configured
- [ ] terminal paired exactly once
- [ ] every operator has an individual identity
- [ ] stable Staff ID bindings are correct
- [ ] ordinary operator permission denial is tested
- [ ] real business settings are configured
- [ ] official M-Pesa Till QR is uploaded
- [ ] XP-80T customer/business receipts are accepted
- [ ] printed QR scans reliably
- [ ] physical barcode scanner is accepted
- [ ] opening state is reconciled
- [ ] full shift rehearsal is accepted
- [ ] backup restore is demonstrated
- [ ] trial data is absent from production books
- [ ] Go Live is signed off

---

# 21. MIGRATION SOURCE-OF-TRUTH RULE

Official deployment reference:

https://supabase.com/docs/guides/deployment/database-migrations

Environment / CI reference:

https://supabase.com/docs/guides/deployment/managing-environments

From this revision onward:

> If a production schema change is not represented in the committed canonical Supabase migration history, it is not an approved ServOS production schema change.

Do not use the remote Dashboard SQL editor to bypass the migration pipeline for release work.

---

# 22. CURRENT DELIVERY JUDGMENT

ServOS remains approximately:

```text
~91% source/feature complete
~80% production-proven
```

The remaining terminal launch work is now a narrow deployment/stabilization path rather than another feature-development cycle.

The fastest responsible route is:

```text
Cloud fixture green
→ Desktop green
→ canonical Supabase migrations
→ clean production Supabase
→ Admin/operator commissioning
→ fresh terminal install
→ XP-80T + QR + scanner
→ shift rehearsal
→ restore rehearsal
→ Go Live
```
