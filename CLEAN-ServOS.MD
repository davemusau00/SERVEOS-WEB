# ServOS Code Forensics Report


The broad conclusion is that ServOS is considerably more mature than its rough edges suggest, but **the biggest remaining danger is no longer “missing features.” It is mismatched contracts hidden behind finished-looking UI.**

The system currently has cases where:

> **the button exists, the UI looks complete, the source test passes, but the operation underneath either does not exist, means something different on Terminal, or cannot ever complete.**

That is the class of issue I would attack before adding much more functionality.

---

# 1. Executive assessment

I would group what I found into four buckets:

| Severity | Meaning |
|---|---|
| 🔴 **STOP-SHIP** | Can lose data, misrepresent completion, or break core Web/Terminal convergence |
| 🟠 **HIGH** | Significant production reliability, role, workflow, or data-integrity problem |
| 🟡 **MEDIUM** | Will create operator pain, maintenance problems, misleading diagnostics, or future failures |
| ⚪ **CLEANUP** | Not currently dangerous but clearly out of place in a production tree |

The biggest findings are:

| Severity | Finding |
|---|---|
| 🔴 | Web offline drafts claim they will sync, but there is no draft → queue promotion path |
| 🔴 | Web `inventory.countLocation` does not exist in cloud v2 and does not match Native semantics |
| 🔴 | `business.settings.save` can replace an entire organization record with a partial object |
| 🔴 | Terminal/Web/cloud operation names and role models have materially drifted apart |
| 🔴 | Old terminal-authority Remote Manager sync and new PostgreSQL v2 authority coexist |
| 🔴 | CI's green `cloud-protocol` job does **not test expansion migrations 001–021** |
| 🟠 | Web `room.condition` UI calls an operation absent from cloud v2 |
| 🟠 | Controlled Import is largely a staged facade, not an implemented importer |
| 🟠 | Hosted backup rehearsal currently creates a request record, not a backup |
| 🟠 | Operation manifest contains false/stale parity claims |
| 🟠 | Web count “resume” behavior is weaker than the UI implies |
| 🟠 | Native and Cloud staff-role models are fundamentally different |
| 🟠 | Web workspace visibility makes POS/Administration appear for roles that do not meaningfully belong there |
| 🟠 | Every Web command carries versions for essentially the entire snapshot |
| 🟠 | Raw CSV data can be persisted inside immutable command history |
| 🟠 | Browser business cache survives sign-out |
| 🟡 | Global logout appears deliberately global across devices |
| 🟡 | Browser prompts/confirms are still scattered through real workflows |
| 🟡 | Native/Web timezone implementations are only partly unified |
| 🟡 | Admin approval workflow requires humans to shuffle UUIDs and tokens |
| 🟡 | CSV exports are susceptible to spreadsheet formula injection |
| 🟡 | Current UI audit can report green while all workflows remain “UNREVIEWED” |
| 🟡 | One UI audit rule for disabled buttons appears logically impossible to trigger |
| 🟡 | Full Tauri shell/synchronization code is not exercised by current CI |
| 🟡 | PWA manifest still has no icons |
| 🟡 | User-facing mojibake exists in Native POS |
| ⚪ | Old `.bak` source files are committed |
| ⚪ | Legacy demo application and production app live in the same tree |
| ⚪ | Several enormous monolithic source files make regressions harder to detect |
| ⚪ | Two multi-megabyte generated UI-audit JSON files are committed |
| ⚪ | Duplicate reconciliation SQL exists in two paths |
| ⚪ | SQL dispatcher migrations have become a deep wrapper chain |

There are also some good safeguards worth preserving. I cover those later.

---

# 2. 🔴 Web offline edits currently make a promise the code does not fulfill

This is one of the most important findings.

In:

`src/runtime/web/WebBusinessApp.tsx`

when the browser is offline, `submit()` does essentially:

```ts
await store.current.saveDraft(
  crypto.randomUUID(),
  operation,
  payload
);

setNotice(
  'Saved on this browser. It will be sent when you are back online.'
);
```

That statement is stronger than the implementation.

The corresponding storage engine:

`src/runtime/web/BusinessStore.ts`

has separate concepts for:

```text
drafts
queue
records
meta
```

and the synchronization engine:

`src/runtime/web/sync.ts`

sends:

```text
PENDING_SYNC queue commands
```

It does **not** consume the draft store.

`ActivitySyncCenter.tsx` actually describes the truth more accurately:

> this draft has not been finalized as a business transaction

I did not find a corresponding:

```text
promoteDraftToQueue()
sendDraft()
resumeDraft()
deleteDraftAfterSubmit()
```

flow.

### What this means

A manager can make an offline change and ServOS tells them:

> It will be sent when you are back online.

They reconnect.

The sync engine ignores that draft.

Nothing happens.

That is much worse than simply saying “offline editing unsupported”, because it creates false confidence.

### Required fix

Separate the concepts clearly:

```text
LOCAL DRAFT
≠
PENDING COMMAND
```

Offline UI should say:

> **Saved as a local draft. Review and submit when connection returns.**

Then implement:

```text
Draft
↓
Reconnect
↓
Revalidate against current records
↓
Detect version/policy changes
↓
Operator Review
↓
Promote to BusinessCommandV2
↓
Queue
↓
Synchronize
```

Do **not** automatically promote sensitive financial drafts merely because internet connectivity returned.

---

# 3. 🔴 Web location counting is not actually cloud-compatible

This one surprised me because the UI looks reasonably complete.

Web:

`src/runtime/web/WebCatalogInventory.tsx`

calls:

```text
inventory.countLocation
```

But I checked the Supabase expansion migrations through:

```text
021_room_stay_policy.sql
```

and there is no cloud handler for `inventory.countLocation`.

So the Web can produce an operation that PostgreSQL v2 cannot dispatch.

There is a second problem.

### Web semantics

Web's count payload was built around something approximately like:

```text
stockItemId
locationId
countedQty
reason
sessionRevision
unknownBarcodes
```

which is essentially:

> count this item.

### Native semantics

Native's `src-tauri/src/store.rs` implementation of:

```text
inventory.countLocation
```

means something much stronger.

It expects a reviewed **whole-location count session** with a `rows[]` collection.

Native validates that the submitted count contains the inventory expected for the location, tracks draft revision/baseline, and writes:

```text
stockCounts
COUNT_ADJUSTMENT movements
```

for the reviewed location count.

These are not the same command.

### This is protocol collision

Same operation name:

```text
inventory.countLocation
```

Different meaning.

That's a dangerous form of parity.

### Better design

Use two operations if both concepts are needed:

```text
inventory.countLocation
```

for a full reviewed count session.

And:

```text
inventory.spotCount
```

for correcting/counting one selected item.

Never let two clients attach different domain semantics to the same operation identifier.

---

# 4. 🔴 There is an accidental unknown-barcode bypass in Web Inventory

Inside the Web count code I found this:

```ts
disabled={
  disabled ||
  modal === 'COUNT' &&
  unknownBarcodes.length > 0 &&
  false
}
```

That final:

```ts
&& false
```

means unresolved unknown barcodes can never disable the action.

It looks exactly like a temporary debugging bypass that was never removed.

This is especially concerning because Native has the opposite rule: unresolved unknown scans prevent finalizing the count.

So:

```text
Native:
unknown scan → resolve first

Web:
unknown scan → condition explicitly bypassed
```

This should be removed and covered by a test.

---

# 5. 🟠 Web stock-count “resume” is not equivalent to Native resume

The Web stores session metadata in `localStorage`:

```text
locationId
startedAt
revision
```

and separately remembers unknown barcode information.

But the actual physical counts were not consistently persisted with the same durable semantics as Native's SQLite count drafts.

Native has a proper count-draft model with:

```text
baseline
counts
unknown scans
revision
reviewed state
```

stored durably.

So a Web screen can create the impression:

> “this count can be resumed”

without preserving the entire authoritative counting session the same way Terminal does.

This should be solved with IndexedDB count sessions, not ad hoc `localStorage`.

---

# 6. 🔴 `business.settings.save` has a record-clobbering hazard

This one deserves attention before Web Admin becomes broadly usable.

The Web sends a relatively small settings payload from Administration.

The cloud handler in:

`supabase/expansion/020_admin_operations.sql`

does:

```sql
payload := p->'data';

return servos_v2.put_record(
  'organization',
  key,
  payload || jsonb_build_object(
    'updatedBy', who,
    'updatedAt', now()
  )
);
```

`put_record()` in:

`004_domain_helpers.sql`

does not merge fields with the existing stored record.

It performs an upsert where:

```sql
data = excluded.data
```

So this is a **replacement**.

If the organization record contains:

```text
name
tradingName
legalName
email
phone
address
tax data
branding
business metadata
...
```

and a Web settings screen submits only:

```text
name
taxPolicyVersion
```

then all omitted fields are candidates to disappear.

### Correct pattern

For partial settings edits:

```text
current server record
+
whitelisted changed fields
+
updated metadata
```

should produce the replacement document.

Or commands should be specific:

```text
business.updateIdentity
business.updateTaxPolicy
business.updateContact
business.updateReceiptSettings
```

That is much safer than a generic partial “settings save”.

---

# 7. 🔴 Terminal, Web and Cloud are speaking different dialects

This may be the biggest architectural issue relative to your dual-runtime goal.

There are several examples.

## Order comp

Native operation:

```text
order.compItem
```

Native permission:

```text
order.comp
```

Web/cloud operation:

```text
order.comp
```

The operation manifest still describes:

```text
order.compItem
```

as though it were canonical.

## Customer credit

Native uses names like:

```text
customerCredit.configure
customerCredit.charge
customerCredit.settle
customerCredit.reconcile
customerCredit.writeOff
```

Web/cloud use:

```text
credit.account.save
credit.charge
credit.settle
credit.reconcile
credit.write_off
```

## Till cash movement

Native permission:

```text
till.cash_movement
```

Cloud canonical permission:

```text
till.cashMovement
```

Those are not equivalent strings.

### This matters because dual-runtime means protocol identity

The desired architecture is:

```text
Terminal ──┐
           ├── BusinessCommandV2
Web ───────┘
```

not:

```text
Terminal command vocabulary
        ↓ translation eventually maybe

Web command vocabulary
        ↓

Cloud command vocabulary
```

I would define canonical:

```text
operations.ts / operations.json
permissions.ts / permissions.json
```

and generate/constants-test:

```text
Rust
TypeScript
SQL
tests
documentation
```

from it.

One operation ID must mean one thing everywhere.

---

# 8. 🔴 The role models are not remotely at parity

Cloud v2 supports:

```text
Admin
Manager
Cashier
Server
Chef
Housekeeper
Accountant
Custom
```

Terminal's `staff.create` and `staff.changeRole` explicitly accept only:

```text
Admin
Manager
Server
```

That means a Web-created:

```text
Housekeeper
Chef
Accountant
Cashier
Custom
```

role has no equivalent Native identity model.

More importantly, Native permissions are:

```rust
match role {
    "Admin" => ...
    "Manager" => ...
    _ => ...
}
```

Every non-Admin, non-Manager role falls into one broad generic bucket.

That generic bucket includes things such as:

```text
pos.sell
payment.record
payment.split
till.open
till.close
credit.charge
credit.settle
procurement.receive
inventory.view
...
```

So you cannot claim Web/Terminal permission parity while these models differ.

### The fix

Create one role contract:

```text
Admin
Manager
Cashier
Server
Chef
Housekeeper
Accountant
Custom
```

with one canonical permission matrix.

Terminal should consume the same definition.

Do not let SQLite and PostgreSQL independently invent role policy.

---

# 9. 🟠 Workspace visibility is too broad

`workspaceRegistry.ts` uses:

```ts
workspace.permission.some(
  permission => allowed(session, permission)
)
```

That's fine in principle.

But two workspace definitions create odd behavior.

POS:

```ts
permission: ['pos.sell', 'records.view']
```

Administration:

```ts
permission: [
  'business.view',
  'business.configure',
  'data.import.view',
  ...
]
```

Cloud roles automatically receive common permissions including:

```text
business.view
records.view
```

Therefore a role that cannot sell may still see:

> POS

because it has `records.view`.

And practically everybody can see:

> Administration

because they have `business.view`.

This is not necessarily privilege escalation because backend permissions still protect commands.

But it is bad role UX.

A Housekeeper should not open Administration and meet a graveyard of disabled controls.

### Split permission concepts

Use:

```text
workspace visibility permission
```

or choose the permission representing the primary purpose:

```text
POS          → pos.sell
Administration → business.configure / data.import.view / backup.create
```

Do not use generic read permissions as navigation admission unless the workspace genuinely serves read-only users.

---

# 10. 🟠 The operation manifest is currently unreliable

`src/runtime/operationManifest.ts` should be one of the most important files in a dual-runtime system.

Right now it has drifted.

Examples I verified include:

- `inventory.countLocation` says backend implemented, but cloud does not implement it.
- `room.condition` is used by Web but missing from the manifest/cloud.
- `order.compItem` reflects Native naming rather than current Web/cloud naming.
- older entries describe operations as Web-missing that current Web source now calls.
- room-charge/service parity has also moved beyond some manifest descriptions.

That means an AI agent or developer can read the manifest and receive **false architectural information**.

### Make the manifest executable

CI should extract command IDs from:

```text
src/native
src/runtime/web
src-tauri/src/store.rs
supabase/expansion
```

and build a matrix:

| Operation | Terminal UI | Native | Web UI | Cloud | Tests |
|---|---:|---:|---:|---:|---:|
| `order.comp` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.countLocation` | ✓ | ✓ | ✓ | ✗ | ✗ |

A missing cell should fail parity CI where parity is required.

That would have found several issues in this report automatically.

---

# 11. 🟠 Web Housekeeping calls another unsupported cloud operation

Web Hospitality uses:

```text
room.condition
```

for Out-of-order / Return-to-service style room-condition changes.

Native implements:

```text
room.condition
```

and contains appropriate room/reservation safety rules.

I could not find `room.condition` in the Supabase v2 expansion dispatch chain through migration 021.

So once again:

```text
visible Web action
→ valid-looking command
→ no cloud handler
```

This should be a release gate.

---

# 12. 🔴 CI currently gives false confidence about cloud v2

The CI job is named:

```text
cloud-protocol
```

and currently reports green.

But `.github/workflows/ci.yml` runs:

```bash
npm run test:cloud
```

which is:

```bash
node scripts/test-supabase.mjs
```

Inside `scripts/test-supabase.mjs`, expansion migrations are only included when:

```text
--expansion
```

is present.

CI does not pass that flag.

Therefore the green cloud job does **not** exercise:

```text
supabase/expansion/001_protocol.sql
...
supabase/expansion/021_room_stay_policy.sql
```

which is where almost all Web v2 functionality lives.

That explains how a missing cloud operation such as:

```text
inventory.countLocation
```

can coexist with a green cloud job.

### Fix immediately

Have CI run:

```bash
node scripts/test-supabase.mjs --expansion
```

either as:

```text
cloud-base
cloud-v2-expansion
```

or make expansion the default.

---

# 13. 🟠 Expansion test coverage is itself incomplete

Even the expansion mode does not currently have dedicated tests covering all late additions.

The test runner includes suites for things such as:

```text
inventory
procurement
POS
staff/devices
financial controls
```

but I found no direct test references for:

```text
inventory.countLocation
room.condition
admin.import.apply
backup.request
```

in `scripts/test-supabase.mjs`.

So after turning expansion testing on, we still need a **Web operation coverage test**.

---

# 14. 🔴 Current CI is still failing

The latest checked CI is:

```text
ServOS CI #19
commit d9124e937f...
```

Result:

```text
FAILURE
```

Current breakdown:

| Job/stage | Result |
|---|---:|
| Vercel | ✅ |
| npm ci | ✅ |
| TypeScript | ✅ |
| Vite build | ✅ |
| npm test | ✅ |
| UI audit | ✅ |
| docs check | ✅ |
| cloud-protocol | ✅* |
| Playwright browser | ❌ |
| native-domain | ❌ |

The asterisk matters because, as above, cloud-protocol currently does not exercise the expansion stack.

The browser test now fails after reaching `npm run test:browser`.

Native still fails at:

```bash
cargo test --locked --manifest-path native-tests/Cargo.toml
```

So the repository is closer to green than before, but still not release-green.

---

# 15. 🟠 The UI audit step is not actually a release gate

`scripts/audit-ui.mjs` now generates useful findings, including:

```text
window.prompt/confirm
business datetime inputs
custom overlay review
forms without obvious busy state
```

That's good progress.

However, the script:

```text
writes JSON
prints counts
exits normally
```

It does not fail the build based on findings.

So:

```text
npm run audit:ui ✅
```

means:

> “the scanner completed”

not:

> “the UI passed the audit.”

The script itself correctly labels workflow interactions:

```text
UNREVIEWED
```

but CI still shows a green step.

I would rename:

```text
audit:ui
```

to:

```text
inventory:ui
```

until there is an acceptance gate.

Then add:

```text
audit:ui:gate
```

for accepted policies.

---

# 16. 🟠 One disabled-button audit rule can never fire

There is a logic flaw in the current `audit-ui.mjs`.

It effectively checks:

```js
line contains disabled
AND
line contains disabled:opacity-...
AND
line does NOT contain disabled:(cursor-not-allowed OR opacity)
```

But if the second condition is true because the line contains:

```text
disabled:opacity-40
```

then the third condition is necessarily false because it also detects:

```text
disabled:opacity
```

So the warning for opacity-only disabled actions is effectively self-cancelling.

This is particularly ironic given that invisible disabled CTAs are one of the UI problems we just found. 🫠

Change the rule to something more direct, for example:

```text
has disabled opacity
AND lacks explicit disabled background/text/border
AND no adjacent blocker component
```

and then human-review the results.

---

# 17. 🟠 Browser acceptance is missing the most important terminal viewport

Playwright currently tests:

```text
Desktop Chrome
390 × 844 mobile
```

but not:

```text
1024 × 600
1280 × 720
1366 × 768
```

The reservation issue you showed is exactly the kind of defect that appears on low-height terminals.

Add a project:

```text
pos-terminal
1024 × 600
```

and another:

```text
aio-terminal
1280 × 720
```

Then require:

```text
primary CTA visible
no action footer clipping
no modal body swallowing footer
no horizontal overflow
```

for major workflows.

---

# 18. 🟠 Full Tauri shell code is outside the normal CI test path

There is a useful `package.json` script:

```text
test:desktop
```

which runs tests using:

```text
src-tauri/Cargo.toml
```

But CI only runs:

```text
native-tests/Cargo.toml
```

The `native-tests` crate directly pulls in:

```text
store.rs
printer.rs
tests.rs
```

which is good domain coverage.

But significant real desktop integration lives in:

`src-tauri/src/lib.rs`

including:

- enrollment;
- cloud sync;
- old Remote Manager polling;
- reconciliation;
- runtime Tauri commands;
- wrapper behavior.

CI does not currently run `test:desktop`.

So the domain engine is tested more than the actual desktop integration layer.

Add:

```bash
npm run test:desktop
```

or at minimum:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

to CI.

---

# 19. 🔴 Two cloud-authority architectures are still alive at once

This is an architectural tripwire.

`src-tauri/src/lib.rs` still contains the old terminal-authority synchronization model.

After uploading the local outbox, Terminal calls:

```text
servos_poll_requests
```

and accepts constrained remote requests such as:

```text
record.save
record.archive
```

for certain collections.

It then creates an artificial actor:

```text
staff_id = remote:<authorId>
name = Remote manager
role = Manager
```

and executes the operation against SQLite.

Meanwhile the new Web v2 path is designed around:

```text
Web/Terminal
→ BusinessCommandV2
→ PostgreSQL shared authority
```

These are different architectures.

The old one says:

> Terminal is authority; Web submits requests.

The new one says:

> PostgreSQL coordinates shared truth; Terminal and Web are clients.

Both can exist during migration.

They must **not both remain active after cutover**.

This needs an explicit kill switch/fence:

```text
LEGACY_REMOTE_REQUESTS_DISABLED
```

before v2 shared writing becomes production-authoritative.

---

# 20. 🟠 Controlled Import currently looks more complete than it is

Web Administration can stage an import:

```text
admin.import.stage
```

Cloud then:

- checks size;
- counts newline rows;
- calculates MD5;
- writes an `importBatches` record;
- sets:

```text
validation = PENDING_SERVER_REVIEW
status = STAGED
```

But I found no import-processing Edge Function in:

```text
supabase/functions
```

other than the Auth lifecycle function.

More importantly:

```text
admin.import.apply
```

does not actually import anything.

It checks:

```text
status in READY / DRY_RUN_READY
```

then changes the batch to:

```text
APPLIED
```

No products are created.

No stock is created.

No customers are imported.

No supplier records are inserted.

And I found no current processor that transitions:

```text
PENDING_SERVER_REVIEW
→ DRY_RUN_READY
```

### Recommendation

Until implemented, call this:

> **Import staging**

not:

> Import Center / Apply Import

Actual flow needs:

```text
raw source
→ parse
→ normalize
→ schema map
→ validation
→ dry-run plan
→ row errors
→ operator review
→ atomic/batched application
→ reconciliation report
```

---

# 21. 🟠 Hosted backup rehearsal currently does not back anything up

The Web Admin action:

```text
backup.request
```

creates:

```text
backupRequests
status = REQUESTED
provider = HOSTED_BACKUP_REHEARSAL
```

I found no corresponding backup processor/worker in this repository.

So the command means:

> “record that a backup was requested”

not:

> “create a backup.”

That distinction must be visible in the UI.

The Native local backup/restore system is considerably more real than this Web-side provider path.

---

# 22. 🟠 Web commands contain far too many expected-version baselines

`WebBusinessApp.submit()` currently does:

```ts
const baselines =
  records.map(({collection,id,version}) => ({
    collection,
    id,
    version
  }));
```

In other words, a small business action can contain the versions of the entire snapshot visible to that user.

Then it adds relevant target records.

That's backwards.

Expected versions should normally be:

```text
only records whose invariants the operation depends upon
```

For example a room move might need:

```text
reservation
stay
folio
source room
destination room
```

not:

```text
every customer
every product
every supplier
every stock item
every rate
...
```

### Consequences

As data grows:

- command JSON grows;
- IndexedDB queue grows;
- network requests grow;
- command audit rows grow;
- PostgreSQL JSON parsing grows;
- debugging becomes noisy.

Build per-operation baseline builders.

---

# 23. 🟠 Raw CSV data can be duplicated into immutable command history

Admin import sends something equivalent to:

```text
csvText: <entire file>
```

with a maximum of about 10 MB.

The cloud command system records request envelopes.

So even though the import batch itself only retains metadata/hash, the raw CSV may remain in command history.

That can mean a 10 MB file containing:

```text
customer names
phones
emails
supplier records
business records
```

becomes part of long-lived command storage.

A better architecture:

```text
upload encrypted/private object
↓
sha256
↓
command references:
objectKey
hash
size
template
```

rather than placing the entire file in the domain command.

---

# 24. 🟡 Web export CSV needs spreadsheet-injection protection

Web Administration's CSV export correctly quotes values, but quoting alone does not stop spreadsheet formula interpretation.

A value beginning with:

```text
=
+
-
@
```

may be interpreted by Excel/Sheets.

For example a malicious imported customer name could become a formula when exported and opened.

Use a safe cell serializer that neutralizes formula-leading strings, such as prefixing an apostrophe where appropriate.

This is a security hardening issue, not merely formatting.

---

# 25. 🟠 Browser business data remains after logout

The v2 Web client stores:

```text
records
queue
drafts
meta
```

in IndexedDB.

`RemoteManagerApp.clearSession()` clears:

```text
auth
cloudSession
rows
requests
selected
...
```

but does not clear the business IndexedDB database.

So on a shared computer:

> Sign out

does not mean:

> business data has left this device.

It remains unavailable through the normal signed-out UI, but it remains resident locally.

You need an explicit device-data policy:

```text
Trusted private device
→ retain encrypted/local cache

Shared device
→ purge on sign-out

Revoke device
→ purge cache on next contact
```

At minimum provide:

> **Sign out and clear local business data**

---

# 26. 🟡 Logout is explicitly global

Current Auth logout calls:

```text
logout?scope=global
```

That means the application is deliberately asking Supabase for a global logout rather than a current-session-only logout.

For a multi-device Web product, clicking Sign Out on one device should probably not log the same user out of their office laptop, tablet, and phone.

I'd change ordinary:

```text
Sign out
```

to local/session scope.

Reserve:

```text
Sign out everywhere
```

as a separate security action.

---

# 27. 🟡 Rejected/conflicting Web commands have weak recovery UX

The generic Web editor closes immediately after queuing:

```text
setEditor(null)
```

If the command later becomes:

```text
CONFLICT
REJECTED
```

Activity Center can show it.

But it does not currently provide a robust:

```text
Reopen
Review latest values
Apply again
Resolve conflict
Discard
```

workflow.

This means the operator may need to manually reconstruct what they were doing.

Queued operations should retain enough editor context to reopen the originating workflow.

---

# 28. 🟡 Manager approvals currently make humans act as a message bus

`WebStaffAdminView.tsx` asks an Admin/Manager to enter:

```text
initiator Auth user ID
permission
target ID
```

It then generates a UUID approval token and tells them:

> Share it directly with the named operator.

It even copies the token to clipboard.

Backend approval security is fairly strong:

- one-time;
- initiator-bound;
- permission-bound;
- target-bound;
- 5-minute expiry;
- approver must remain active Manager/Admin.

But the **interaction model is upside down**.

The operator should click:

```text
Request manager approval
```

ServOS should create:

```text
Request from Mary
Discount Order 154
KES 900 → KES 750
```

Manager sees:

```text
[ Deny ] [ Approve ]
```

and the resulting approval should flow back automatically.

Humans should never need to copy UUID authorization tokens around.

---

# 29. 🟡 Staff creation asks the Admin for an Auth UUID

Web Staff Admin currently contains:

```text
Existing Auth user ID
Staff ID
Name
Role
```

An ordinary business administrator should not have to know a Supabase Auth UUID.

The application already has invitation/reset infrastructure.

The correct flow is closer to:

```text
Invite staff

Email
Name
Role

[ Send invitation ]
```

Then after acceptance ServOS links the resulting `auth.users.id` automatically.

The current form exposes an implementation seam to the operator.

---

# 30. 🟡 Browser prompts and confirms remain in real workflows

I found active use of browser-native interaction APIs in several current areas.

Examples include:

```text
WebPosView
WebFinancialControlsView
WebHospitalityViews
NativeRoomsView
NativeHousekeepingView
NativeInventoryView
```

including:

```text
window.prompt()
window.confirm()
window.alert()
```

These cause:

- inconsistent appearance;
- poor validation;
- weak accessibility;
- no contextual help;
- awkward touchscreen operation;
- difficult automated testing.

Your new standard Dialog plan is the right cure.

---

# 31. 🟡 Timezone handling has improved, but Terminal and Web still differ

There is good new code in:

`src/utils/businessTime.ts`

with explicit IANA timezone handling and:

```text
businessDateTimeInput()
businessDateTimeToUtc()
```

The generic Web editor now converts `datetime-local` values through that helper before submission.

That's a solid improvement.

However Native still has places with explicit arithmetic resembling:

```text
+3 * 60 * 60 * 1000
```

and the PostgreSQL reservation policy currently evaluates in:

```text
Africa/Nairobi
```

directly.

So there are effectively three mechanisms:

```text
Web IANA helper
Native manual +3
Cloud hardcoded Africa/Nairobi
```

For Kenya-only v1 this works much of the time.

For a real property-timezone architecture, unify it.

---

# 32. 🟡 The Web rate editor still exposes “basis points”

Current rate creation asks:

> Tax basis points (1600 = 16%)

That is the system asking the operator to translate a percentage into an internal representation.

Operator should enter:

```text
16 %
```

ServOS stores:

```text
1600 bp
```

Same principle as grams/ml/package conversion.

---

# 33. 🟡 Quick Product silently hardcodes a tax class

The generic Web Quick Product path currently creates:

```text
taxClassId: 'A_STANDARD'
```

without asking or deriving from a clearly configured business default.

That can become dangerous once the catalog contains:

- exempt;
- zero-rated;
- different tax treatment;
- non-food/service categories.

Use:

```text
configured default tax class
```

and show it in the review summary.

Do not hide a fiscal assumption inside `quickProduct()`.

---

# 34. 🟡 POS source contains visible encoding corruption

This is confirmed in current:

`src/native/NativePOSView.tsx`

There are strings such as:

```text
Â·
Waiting for scanâ€¦
```

instead of:

```text
·
Waiting for scan…
```

I found multiple `Â` occurrences.

This is minor technically but looks sloppy on the production terminal.

Scan source files for UTF-8 mojibake and normalize them.

---

# 35. 🟡 PWA is still missing install icons

Current:

`public/manifest.webmanifest`

contains:

```json
"icons": []
```

So although the app has a manifest and service worker architecture, the PWA packaging is incomplete.

Add at least:

```text
192×192
512×512
maskable icon
apple-touch icon
favicon
```

before presenting it as an installable finished Web app.

---

# 36. ⚪ Old `.bak` files are committed inside production source

Current repo includes:

```text
src-tauri/src/store.rs.before-result-fix.bak
src/hooks/useBarcodeScanner.ts.20260926-221800.bak
src/native/NativeCatalogView.tsx.20260926-221800.bak
src/native/NativePOSView.tsx.20260926-221800.bak
```

One of them is **134 KB**.

Git is already the backup system.

These should not live beside authoritative source.

Add:

```text
*.bak
*.bak.*
*.timestamp.bak
```

to `.gitignore`.

Then delete the committed copies.

---

# 37. ⚪ There are effectively two ServOS applications inside `src/`

The real current paths are:

### Native production

```text
NativeRoot
→ NativeBarShell
→ Native*View
```

### Web production

```text
RemoteManagerApp
→ WebBusinessApp
→ runtime/web/*
```

But `App.tsx` also statically contains the old:

```text
MainApp
```

with legacy components such as:

```text
POSView
HotelPMSView
StaffCashView
InventoryView
EventsNightlifeView
CRM360View
...
```

These components include sample/demo assumptions and simulated behavior.

They are only reachable through the explicit Preview path when:

```text
DEV
or
VITE_ENABLE_DEMO=true
```

which is good.

But keeping all of them mixed into the production tree makes it much easier for someone or an agent to patch the wrong implementation.

### Better structure

```text
src/
  app/
    web/
    terminal/

  domain/
  design-system/

demo/
  legacy-preview/
```

At minimum label legacy preview code unmistakably.

---

# 38. ⚪ Some source files have reached “small operating system” size

Current notable sizes:

```text
src-tauri/src/store.rs            ~378 KB
src-context/ServOSContext.tsx     ~128 KB
src-tauri/src/tests.rs            ~126 KB
StaffCashView.tsx                 ~110 KB
POSView.tsx                        ~79 KB
InventoryView.tsx                  ~59 KB
```

`store.rs` especially contains:

- auth;
- permissions;
- installation state;
- POS;
- inventory;
- rooms;
- folios;
- assets;
- maintenance;
- staff;
- approvals;
- credit;
- accounting;
- procurement;
- etc.

It works, but that file now has the blast radius of a minor moon.

Split it by domain:

```text
store/
  mod.rs
  auth.rs
  permissions.rs
  pos.rs
  inventory.rs
  procurement.rs
  rooms.rs
  folios.rs
  credit.rs
  assets.rs
  maintenance.rs
  staff.rs
  accounting.rs
```

This will also make parity mapping much easier.

---

# 39. ⚪ The generated UI audit is consuming megabytes of repository space

Two generated files are currently roughly:

```text
UI_INTERACTION_INVENTORY.json    ~2.9 MB
OPERATOR_UX_AUDIT.json           ~3.0 MB
```

That's almost six megabytes of mostly derived interaction metadata.

The audit generator repeats significant source/context into each record.

Store only compact metadata:

```text
file
line
interaction type
rule
status
test reference
```

Do not copy large source fragments into thousands of generated entries.

Also consider generating these as CI artifacts rather than committing every regeneration.

---

# 40. ⚪ The audit generator introduces nondeterminism

`OPERATOR_UX_AUDIT.json` includes:

```js
generatedAt: new Date().toISOString()
```

If the file is committed, every audit run can produce a diff even if the application has not changed.

For tracked generated files use:

```text
source commit SHA
```

instead of current clock time, or don't track the generated file.

---

# 41. ⚪ Duplicate reconciliation migration exists

The files:

```text
202609270001_reconciliation_manifest.sql
```

and:

```text
supabase/migrations/202609270001_reconciliation_manifest.sql
```

are byte-identical and currently have the exact same Git blob SHA.

So this is confirmed duplication, not two different versions.

Keep the canonical migration under:

```text
supabase/migrations/
```

and replace the root copy with documentation if it is needed for discoverability.

---

# 42. 🟡 SQL dispatch has become a chain of wrappers

The v2 expansion migration pattern repeatedly does:

```sql
alter function servos_v2.dispatch(jsonb)
rename to dispatch_before_x;

create function servos_v2.dispatch(...)
...
return servos_v2.dispatch_before_x(command);
```

The same pattern is used for some read-permission functions.

This is clever for incremental patches.

By migration 021, however, you have a Russian nesting doll of dispatchers. 🪆

It makes:

- debugging harder;
- profiling harder;
- rollback reasoning harder;
- schema inspection harder;
- future developers less certain which implementation wins.

Historical migrations can remain immutable.

But before production I would produce a **canonical squashed v2 schema/bootstrap** representing the intended final database.

Keep old migrations for upgrade history.

Use the squashed schema for:

```text
fresh installs
CI
integration tests
documentation
```

---

# 43. 🟡 `verify` does not verify everything its name suggests

`package.json` has:

```text
verify
```

but it currently does not include:

```text
test:cloud
test:desktop
```

It runs:

```text
lint
build
node tests
browser
native container
UI audit
docs
```

For a dual-runtime architecture, a “verify” command should mean:

```text
frontend
browser
native domain
desktop shell
cloud v2
docs
UI audit
```

Otherwise developers may reasonably believe:

> `npm run verify` passed, therefore ServOS passed.

when cloud or Tauri integration was never tested.

---

# 44. 🟡 Browser test setup itself can hide deployment-specific failures

Playwright builds with:

```text
VITE_ENABLE_DEMO=true
VITE_ENABLE_WEB_V2=true
```

That's useful for exercising both preview and v2.

But we also need an acceptance project built with the exact **production environment flags**.

For example:

```text
production-web
VITE_ENABLE_DEMO=false
VITE_ENABLE_WEB_V2=true
```

and another deployment-gate test with v2 disabled if legacy fallback is still supported.

A test environment that enables extra routes can accidentally avoid production-only boot problems.

---

# 45. 🟡 Generic Web forms still discard operator context after queueing

Even when a command has not been accepted yet:

```text
editor closes
↓
command syncs
↓
command may reject
```

That is technically queue-oriented, but operator-hostile.

A better interaction:

```text
Submit
↓
Sending…
↓
Confirmed
→ close

or

Rejected
→ keep/reopen values
→ show fix
```

For offline:

```text
Save draft
→ explicit draft state
```

rather than pretending it is already a pending transaction.

---

# 46. 🟡 Service/Administration surfaces still mix “request” and “completed action”

Several verbs should be audited.

Examples:

```text
Request backup
Stage import
Issue approval
Synchronize
```

The UI needs to distinguish:

```text
requested
queued
received by server
validated
applied
completed
verified
```

This is especially important in a redundant system.

“Saved” is not the same as:

> synchronized.

“Synchronized” is not necessarily the same as:

> business effect committed.

“Backup requested” is certainly not:

> backup verified.

Use precise lifecycle words.

---

# 47. An especially important hidden issue: Web and Terminal staff IDs are different concepts

Native creates local staff with:

```text
random local staff ID
PIN
role
```

Web Cloud staff binds:

```text
Supabase auth user UUID
staff ID
email authentication
cloud role
```

Without a common identity mapping during the Terminal v2 transition, audit events can describe the same human as:

```text
local SQLite staff UUID A
Supabase auth UUID B
cloud staff ID C
legacy remote:<authorId>
```

This can make audit trails hard to correlate.

Define:

```text
Person / Staff identity
Auth identity
Device identity
Local replica identity
```

explicitly.

The audit trail should carry stable shared staff identity even when auth mechanisms differ.

---

# 48. What is actually good and should be preserved

I don't want this report to imply the entire foundation is shaky. Several parts are strong.

The cloud domain layer has useful safeguards:

- immutable ledger/history triggers;
- optimistic version checks;
- server-side permissions;
- idempotent command IDs;
- device sequence handling;
- constrained device registration;
- target-bound manager approvals;
- single-use approval records;
- active approver validation;
- room availability checks;
- closed-state protections;
- stock movement rather than direct historical mutation.

Native also has solid patterns:

- durable SQLite;
- meaningful inventory-count semantics;
- audited stock movements;
- local printer queue;
- recovery-oriented backup logic;
- sessions invalidated after role/PIN changes;
- last-Admin protections;
- command idempotency.

The PWA service-worker update strategy is also one of the cleaner parts: it avoids blindly activating an update while operations are busy/syncing.

So the task is not “rewrite ServOS.”

It is:

> **remove the seams between already-good pieces.**

---

# 49. What I would do next

This is the order I would actually attack the findings:

1. **Turn CI into truth first.** Run cloud expansion tests in CI, add desktop/Tauri checking, add operation parity extraction, add 1024×600 browser tests, and make UI audit findings gate selected P0 rules.

2. **Freeze a canonical protocol.** One operation registry, one permission registry, one role matrix, aliases only for migration. Resolve `order.compItem/order.comp`, credit naming, till permission naming, stock count semantics, `room.condition`, staff roles.

3. **Fix data-integrity hazards.** Repair `business.settings.save`, offline draft lifecycle, count semantics, unknown-barcode bypass, raw CSV retention, and stale command recovery.

4. **Fence the old authority model.** Make legacy `servos_poll_requests`/snapshot Remote Manager explicitly migration-only and impossible to run alongside production v2 shared authority.

5. **Remove fake-complete workflows.** Either implement Import Apply and hosted backup processors or clearly label those surfaces as staging/request-only.

6. **Finish operator UX foundations.** Standard dialogs, blockers, approval flow, searchable selectors, no prompts, property-time abstraction, role-appropriate workspaces.

7. **Clean the repository.** Remove `.bak` files, duplicate SQL, isolate legacy preview, shrink generated audits, split `store.rs`, and normalize encoding.

8. **Then close feature parity.** Assets, maintenance, Product/Inventory, hospitality edge cases, PWA installation, and final dual-client concurrency testing.

---

# Bottom line

The codebase is no longer suffering mainly from “missing CRUD.”

The deeper problem is now **contract entropy**.

You have:

```text
a strong Native engine
+
a rapidly growing Web client
+
a substantial PostgreSQL domain
+
legacy terminal-authority synchronization
+
new shared-authority synchronization
+
old preview components
+
new production components
```

and all of those have evolved at slightly different speeds.

That creates the dangerous middle state where ServOS can **look more complete than it is**.

The highest-value work now is to make the code prove:

```text
THIS BUTTON
↓
calls THIS canonical operation
↓
with THIS canonical payload
↓
requiring THIS canonical permission
↓
implemented identically here:
  Terminal ✓
  Cloud ✓
↓
covered by:
  domain test ✓
  Web test ✓
  Terminal test ✓
  concurrency test ✓
↓
and produces THIS auditable business effect
```

Once that matrix becomes machine-enforced, a surprisingly large class of hidden defects simply stops being possible.