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
