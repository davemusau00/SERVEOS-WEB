# ServOS FINAL SPRINT FIXES
## V2 Authority Cutover + XP-80T Receipt Printing Closure

**Repository:** `davemusau00/SERVEOS-WEB`  
**Reviewed HEAD:** `1ee01b433e1cd47d2569c7a7aae2a57d001e4116`  
**Review date:** 2026-10-02  
**Target:** Move the CountrySide installation completely onto ServOS v2 as the shared business authority, retire the legacy write path, and make XP-80T receipt printing release-grade.

---

# 1. FINAL ARCHITECTURAL DECISION

The sprint must no longer optimize for repairing the legacy uploader.

The desired production architecture is:

```text
                 SERVOS V2 / SUPABASE
        commands + records + audit + change feed
                       │
          ┌────────────┴────────────┐
          │                         │
   SERVOS TERMINAL              SERVOS WEB
   Tauri + SQLite               React / PWA
   local v2 replica             cloud v2 client
   native printer/scanner       remote access
          │                         │
          └──── SAME V2 AUTHORITY ──┘
```

The old architecture:

```text
SQLite
  ↓
legacy outbox
  ↓
servos_upload
  ↓
public.business_records
```

is a migration artifact only. It must not remain a production write authority after this sprint.

## Non-negotiable invariant

At no point may the same business have both of these live:

```text
legacy local writer = ON
v2 shared writer    = ON
```

There must be one explicit authority mode, enforced by both the server and the native runtime.

---

# 2. CURRENT CONFIRMED STATE

## 2.1 V2 foundations are already present

The current source has working foundations for:

- Supabase Auth operator identity;
- DESKTOP device pairing;
- `servos_v2_session()`;
- `servos_v2_terminal_identity(uuid)`;
- `servos_v2_register_device(uuid,text,text)`;
- `servos_v2_snapshot(...)`;
- `servos_v2_execute(jsonb)`;
- `servos_v2_pull(bigint,integer)`;
- native v2 device state;
- durable native v2 outbox;
- native v2 shadow records;
- snapshot installation;
- change-feed application;
- command acknowledgement;
- server-side permissions and staff profiles;
- canonical migrations in `supabase/migrations/`;
- canonical migration inventory in `scripts/canonical-migrations.mjs`;
- CI `cloud-protocol-v2` coverage.

The v2 protocol itself is therefore not the main blocker anymore.

## 2.2 Live project evidence

Observed during the current commissioning session:

```text
DESKTOP v2 device: paired and active
v2 RPC functions: present
legacy owner: present
v2 Admin identity: provisioned
servos_v2.control.enabled: false
servos_v2.records: essentially empty except provisioned employee identity
legacy cloud terminal last_sequence: 0
legacy cloud terminal last_seen: NULL
```

The practical source of truth is still the terminal SQLite database.

That changes the migration strategy.

We should move:

```text
LOCAL SQLITE AUTHORITY
        ↓
SERVOS V2 BOOTSTRAP
        ↓
NATIVE V2 REPLICA
        ↓
SHARED V2 AUTHORITY
```

We should **not** require the local data to first travel through the legacy uploader simply so it can later be migrated again.

---

# 3. P0 BLOCKER: THERE IS NO PRODUCTION SQLITE -> V2 BOOTSTRAP

This is the largest blocker to complete v2 activation.

The repository contains:

- legacy reconciliation;
- v2 snapshots from server to terminal;
- v2 command/feed synchronization;

but it does not contain a reviewed production-grade mechanism that takes the authoritative current SQLite business state and seeds `servos_v2` safely.

A direct blind insert into `servos_v2.records` is not enough because v2 also contains domain and coordination state such as:

```text
servos_v2.records
servos_v2.resources
servos_v2.devices
servos_v2.staff_profiles
servos_v2.members
servos_v2.commands
servos_v2.changes
servos_v2.audit
servos_v2.allocations
```

Several domains depend on invariants outside the generic records table.

## Required implementation

Create a dedicated cutover/bootstrap protocol.

Suggested new server migration:

```text
20261001045_v2_cutover_bootstrap.sql
```

Suggested native SQLite migration:

```text
015_v2_cutover_state.sql
```

## 3.1 Native cutover manifest

Add a Tauri command such as:

```text
runtime_v2_cutover_manifest
```

It must produce an immutable, deterministic representation of the current local business state including:

```text
terminalId
SQLite schema version
generatedAt
collection counts
record IDs
record versions
archive state
canonical record hashes
stock quantities by item/location
stock-movement control totals
payment totals by tender
open/closed till totals
customer-credit totals
supplier/payable totals
room/reservation/stay/folio totals
receipt count
command/outbox sequence bounds
```

Do not include:

```text
PIN hashes
cloud publishable key
device secret
Auth refresh tokens
OS credential-vault data
```

Compute a manifest hash and preserve it as cutover evidence.

## 3.2 Server cutover tables

Create private cutover state, for example:

```text
servos_v2.cutovers
servos_v2.cutover_pages
servos_v2.cutover_evidence
```

A cutover should record:

```text
cutover_id
business_id
source_terminal_id
source_manifest_hash
source_schema_version
started_by
started_at
record_count
status
completed_at
verification_hash
```

Statuses should be explicit:

```text
PREPARING
IMPORTING
VERIFYING
READY
COMMITTED
ABORTED
```

## 3.3 Server bootstrap RPCs

Add authenticated Admin/system configuration RPCs, for example:

```text
servos_v2_begin_cutover(...)
servos_v2_import_cutover_page(...)
servos_v2_verify_cutover(...)
servos_v2_commit_cutover(...)
servos_v2_abort_cutover(...)
```

Requirements:

- idempotent page replay;
- immutable page hash;
- maximum page size;
- explicit collection allowlist;
- no client-controlled actor elevation;
- no client-controlled server cursor;
- preserve or deliberately normalize record versions;
- reject duplicate/conflicting IDs;
- rebuild derived resource state;
- verify financial and stock control totals before commit.

## 3.4 Rebuild v2 resource state

Bootstrap must rebuild every v2 resource required by the imported active business state.

At minimum review:

```text
STOCK
ROOM
ORDER
TABLE
FOLIO
CREDIT
POINTS
TICKET
ASSET
```

Do not import records and leave `servos_v2.resources` inconsistent.

If a domain does not need a resource until a future command, document and test that explicitly.

## 3.5 Preserve history correctly

Immutable business history such as:

```text
payments
receiptDocuments
journalEntries
stockMovements
folioEntries
stayEvents
assetEvents
```

must never be recreated as if newly transacted by the cutover actor.

Import them through the cutover boundary with provenance such as:

```text
source = LEGACY_SQLITE_CUTOVER
sourceCutoverId
sourceVersion
```

The cutover event itself belongs in dedicated audit/cutover evidence, not as fake sales or payments.

---

# 4. P0 BLOCKER: V2 AUTHORITY IS CURRENTLY SESSION-DEPENDENT IN NATIVE

The current native guard is not global.

`reject_legacy_business_write_when_v2_active()` currently decides that v2 is active only when the in-memory `operator_auth` exists and its identity says `enabled=true`.

That means this unsafe sequence is possible:

```text
server v2 enabled
↓
operator signs out
↓
local PIN login
↓
operator_auth = None
↓
runtime_command falls back to store::execute()
↓
legacy SQLite business mutation occurs
↓
legacy outbox cannot upload because server v2 fenced legacy
↓
local state diverges from v2
```

This is a STOP-SHIP cutover bug.

The same problem exists in the read/sync paths:

```text
runtime_snapshot
  no operator_auth
  → legacy store::snapshot()

runtime_sync
  no v2 operator_auth
  → sync_inner()
  → legacy servos_upload
```

## Required fix

Introduce an explicit persistent native authority mode independent of the current login session.

Suggested values:

```text
LEGACY_LOCAL
CUTOVER_PREP
SHARED_V2
```

Persist it in SQLite metadata and include it in runtime status.

### In `SHARED_V2`

`runtime_command()` must:

```text
require online Auth-bound v2 operator
require complete v2 baseline
queue BusinessCommandV2
call servos_v2_execute
never call store::execute as fallback
```

`runtime_sync()` must:

```text
never call legacy sync_inner
only flush native_v2_outbox + pull v2 feed
```

`runtime_snapshot()` must:

```text
return the native v2 replica
or fail closed if no usable v2 baseline exists
never expose stale legacy operational state as current truth
```

`runtime_login_offline()` must not create a normal write-capable legacy business session in `SHARED_V2`.

Until signed v2 offline grants exist, offline access may be:

```text
read-only cached v2 view
or
explicit "online sign-in required" lock state
```

but it may not silently become a second writer.

## Replace this architectural pattern

```text
v2 active = current operator_auth says enabled
```

with:

```text
v2 authority = persisted business authority mode
```

---

# 5. P0 BLOCKER: THE CURRENT BOOLEAN ENABLE SWITCH HAS A CUTOVER ORDERING HOLE

`servos_v2_snapshot()` currently requires `servos_v2.control.enabled=true`.

That means the native terminal cannot install its final v2 baseline while the server gate is disabled.

But enabling the server gate also fences the legacy writer and permits v2 authority.

That creates an awkward transition window:

```text
enable v2
↓
legacy writer fenced
↓
terminal baseline not installed yet
↓
terminal must now race to install snapshot before normal operation
```

The native command queue does fail if no baseline exists, which is useful, but a production cutover should not depend on a temporary half-switched state.

## Required fix

Replace the single boolean authority concept with an explicit server mode.

Recommended:

```text
LEGACY_LOCAL
CUTOVER_PREP
SHARED_V2
```

### Server behavior matrix

| Capability | LEGACY_LOCAL | CUTOVER_PREP | SHARED_V2 |
|---|---:|---:|---:|
| Legacy `servos_upload` | allowed | blocked/frozen | blocked |
| V2 bootstrap import | blocked | allowed | blocked |
| V2 snapshot | optional/read prep | allowed | allowed |
| V2 pull | read prep | allowed | allowed |
| V2 execute | blocked | blocked | allowed |
| Web transactional v2 | blocked | blocked | allowed |

`CUTOVER_PREP` gives us the maintenance window we currently lack.

### Safe cutover sequence

```text
LEGACY_LOCAL
↓
freeze local business mutation
↓
CUTOVER_PREP
↓
bootstrap SQLite → v2
↓
verify control totals
↓
install native v2 baseline
↓
verify local shadow equals server snapshot
↓
SHARED_V2
↓
unfreeze operations
```

This is materially safer than toggling a boolean and hoping all clients transition in the same second.

---

# 6. P0 BLOCKER: LEGACY OUTBOX IS TREATED AS A REQUIRED PRECONDITION TO V2

Current native v2 code blocks snapshot installation and v2 command dispatch while legacy outbox rows remain unacknowledged.

That is correct for an ordinary legacy-cloud migration.

It is wrong for this specific installation if we deliberately choose **SQLite-direct-to-v2 cutover** and the legacy cloud was never authoritative.

Do not delete the legacy outbox blindly.

## Required fix

Add a formal resolution state.

Extend the local outbox or add cutover evidence so legacy operations can be resolved as:

```text
CLOUD_ACKNOWLEDGED
SUPERSEDED_BY_V2_CUTOVER
```

For every superseded operation preserve:

```text
sequence
command_id
envelope hash
cutover_id
resolved_at
resolution
```

Only permit `SUPERSEDED_BY_V2_CUTOVER` after:

- v2 bootstrap verification succeeds;
- record/control totals match;
- the server cutover is READY;
- a local backup exists.

Then the v2 baseline installer can treat the legacy queue as resolved without pretending it was uploaded.

---

# 7. P0 BLOCKER: V2 OPERATION CONTRACT PARITY IS NOT COMPLETE

The generated parity ledger still shows contract splits that will become runtime failures once Native is forced through v2.

Priority mismatches include:

```text
customerCredit.charge  vs credit.charge
order.comp             vs order.compItem
purchaseOrder.create   partial
purchaseOrder.receive  partial
some setup/lifecycle operations differ by client
some hospitality workflows remain partial on Web
```

The key issue is not visual parity.

The key issue is this:

> Every mutation emitted by the Native production UI after cutover must have a canonical v2 server handler with the same meaning.

## Required parity gate

Generate a mandatory cross-runtime matrix from actual source:

```text
Native UI operation
Native domain handler
Cloud v2 dispatcher
Web UI operation
permission
expected-version rules
audit effects
stock effects
financial effects
acceptance test
```

For production Native cutover, fail CI if any Native business mutation is:

```text
missing in Cloud v2
partial in Cloud v2
mapped to a different operation meaning
missing required acceptance
```

## Specific canonicalization

### Customer credit

Choose:

```text
credit.charge
```

as the canonical command and normalize/remove:

```text
customerCredit.charge
```

### Comps

Define both explicitly if both behaviors are required:

```text
order.comp      = whole order comp
order.compItem  = selected line/quantity comp
```

Do not overload one into the other.

### Procurement

`purchaseOrder.create` and `purchaseOrder.receive` must reach full Native -> Cloud parity before the terminal is considered completely v2.

---

# 8. P0 RELEASE REGRESSION: LATEST COMMIT BREAKS THE NATIVE-DOMAIN TEST CRATE

Current CI run for HEAD `1ee01b4` is red.

Observed job state:

```text
frontend             PASS
cloud-protocol-base  PASS
cloud-protocol-v2    PASS
desktop-shell        PASS
native-domain        FAIL
browser-preview      FAIL
browser-production   FAIL
release-candidate    SKIPPED
```

The latest commit added:

```rust
use super::{bounded_detail, MAX_SERVER_ERROR_DETAIL};
```

to `src-tauri/src/tests.rs`.

But `native-tests/src/lib.rs` imports only:

```text
store.rs
printer.rs
tests.rs
```

It does not import the Tauri `lib.rs` where `bounded_detail` and `MAX_SERVER_ERROR_DETAIL` are defined.

This makes the new test structurally incompatible with the native-domain harness.

## Required fix

Move the RPC error-detail helper into a small shared module, for example:

```text
src-tauri/src/rpc_error.rs
```

Then include that module from:

```text
src-tauri/src/lib.rs
native-tests/src/lib.rs
```

Or keep the helper private to Tauri and move its test out of the shared domain test file.

Do not duplicate the implementation in the two crates.

### Exit gate

```text
npm run test:native
npm run check:desktop
npm run test:desktop
```

all pass on the same SHA.

---

# 9. RECEIPT PRINTER INVESTIGATION

The printing pipeline is more complete than before, but there are real source-level defects and acceptance gaps.

Current pipeline:

```text
payment commit
↓
immutable receiptDocuments record
↓
NativeReceiptDialog
↓
runtime_print_receipt
↓
receipt_print_jobs durable queue
↓
printer::encode_receipt
↓
XP80T USB RAW or LAN ESC/POS
```

Strong pieces already present:

- payment does not depend on printer success;
- receipt documents are immutable;
- exact print payload is persisted;
- `QUEUED`, `SENDING`, `SENT`, `DELIVERY_UNCERTAIN` states exist;
- retry semantics warn about duplicate risk;
- customer/business copies exist;
- QR and logo are snapshotted;
- customer QR is omitted from business copy;
- cutter feed is configurable;
- direct USB uses Windows RAW spooler;
- direct LAN uses TCP/9100.

The remaining problems are below.

---

# 10. RECEIPT P0: QR CENTERING CODE USES THE WRONG ESC/POS COMMAND

Current `src-tauri/src/printer.rs` contains this inside `append_qr()`:

```rust
bytes.extend_from_slice(&[
    0x1b, b'a', 1,
    0x1d, b'!', (pad/8) as u8
]);
```

The comment says this moves to an absolute horizontal position.

It does not.

`GS ! n` is the ESC/POS **character-size** command.

It changes text magnification. It is not a horizontal-position command.

The code then resets it with:

```rust
[0x1d, b'!', 0]
```

This is a real command-contract bug in the thermal byte stream.

## Required fix

For the XP-80T raster path, use printer justification correctly:

```rust
ESC a 1   // center
GS v 0    // raster
ESC a 0   // restore left
```

Do not send `GS !` for positioning.

If explicit positioning is ever required, use the printer-supported print-position command intentionally and test it on the XP-80T. For the current raster path, `ESC a 1` is enough and avoids device-specific offset math.

Remove:

```text
text_dots = columns * 8
pad = ...
GS ! pad/8
```

from QR positioning.

## Acceptance test

Add a byte-level test asserting:

```text
ESC a 1 immediately precedes QR graphics context
no non-zero GS ! occurs in QR placement
GS v 0 raster dimensions match payload
ESC a 0 restores alignment afterward
```

Then print and scan the QR repeatedly on the real printer.

---

# 11. RECEIPT P0: DIRECT THERMAL ALIGNMENT MIXES SPACE-PADDING WITH FONT SWITCHES

`receipts::lines()` centers headers and footer text by adding spaces to a fixed character width.

Later, `printer::append_copy()` changes the footer to printer Font B:

```text
ESC M 1
```

Font B has a different character width from the normal receipt font.

Therefore the line was centered using one character geometry and printed using another.

This can make the fixed footer visibly drift, compress, or look amateurish even though the string has the correct number of spaces.

The same architecture also means physical alignment depends too heavily on the configured `receiptPaperColumns` matching the exact active font.

## Required fix

Stop using pre-padding as the primary thermal alignment mechanism.

Introduce semantic thermal layout metadata, for example:

```rust
enum Align { Left, Center, Right }
enum Font { A, B }

struct ThermalLine {
    text: String,
    align: Align,
    font: Font,
    bold: bool,
    double_width: bool,
    double_height: bool,
}
```

Then generate ESC/POS commands from semantics:

```text
business name       center + bold
business contacts   center
copy label          center + bold
receipt metadata    left
item lines          left/right structured
TOTAL               bold, optionally double-height
thank-you            center
QR                   center raster
KINGSFORGE footer    center, smaller font if desired
receipt logo         center raster
```

If this refactor is too large for the sprint, minimum safe fix:

- keep one font for pre-padded centered text; or
- strip pre-padding and use `ESC a 1` for footer/header sections.

Do not combine space-centering with a different font width.

---

# 12. RECEIPT P0: OS PRINT CSS USES AN INVALID/UNRELIABLE PAGE SIZE DECLARATION

Current receipt CSS contains:

```css
@page {
  size: 80mm auto;
  margin: 3mm;
}
```

For CSS paged media, `size` is either:

```text
auto
```

or one/two explicit lengths.

`80mm auto` mixes a length with `auto` and is not a valid two-length page size declaration.

A browser/driver can therefore ignore it and fall back to the default print page, often A4/Letter or a driver-defined page size.

Symptoms can include:

- tiny/scaled receipt;
- excessive whitespace;
- strange page breaks;
- clipping;
- receipt not looking like a real 80mm slip.

## Required fix

The production XP-80T path should use direct RAW ESC/POS, not depend on browser print layout.

For `OS_PRINT` fallback:

- remove the invalid mixed `size` declaration;
- use a valid `@page` rule;
- rely on the selected Windows printer queue's 80mm paper definition;
- keep receipt root width constrained to the printable area;
- acceptance-test Chromium/Tauri print dialog against the actual driver.

Suggested fallback CSS baseline:

```css
@page { margin: 0; }

@media print {
  #servos-receipt-print {
    width: 72mm;
    margin: 0 auto;
  }

  .native-receipt-copy {
    width: 72mm;
    padding: 2mm 0 6mm;
  }
}
```

If the driver requires a fixed custom page size, configure that in the printer queue rather than inventing an invalid variable-height CSS size.

---

# 13. RECEIPT P0: WINDOWS RAW PRINTER CODE IS NOT EXERCISED BY CURRENT CI

The `desktop-shell` GitHub job runs on Ubuntu.

Therefore this code is not compiled/exercised there:

```rust
#[cfg(windows)]
fn send_windows_raw(...)
```

Linux CI compiles the non-Windows stub instead.

That means the exact production USB transport can regress while `desktop-shell` remains green.

## Required fix

Add a Windows CI job:

```yaml
windows-printer-shell:
  runs-on: windows-latest
```

Run at minimum:

```text
npm ci
npm run check:desktop
npm run test:desktop
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

The real printer cannot be connected to CI, but the Windows FFI path must compile on every release candidate.

Add unit coverage for:

- queue-name validation;
- RAW payload construction;
- exact receipt byte generation;
- no accidental cash-drawer command;
- cut command count;
- customer/business copy order.

---

# 14. RECEIPT HIGH: TEST SLIP DOES NOT TEST THE REAL RECEIPT PIPELINE

`runtime_printer_test()` currently sends a tiny text-only test slip.

That proves only:

```text
queue/socket reachable
basic RAW text accepted
```

It does not prove:

```text
business header
item formatting
amount alignment
long product names
TOTAL emphasis
customer + business copies
M-Pesa Till QR
fixed footer
receipt logo
feed margin
cut between copies
reprint behavior
```

## Required fix

Add a separate production-format printer acceptance action:

```text
Print full acceptance receipt
```

Use synthetic non-sale data clearly marked:

```text
SERVOS PRINTER ACCEPTANCE - NOT A SALE
```

It must include:

- long business name;
- contact lines;
- short and long items;
- quantity x unit price;
- discount;
- VAT/levy line if enabled;
- bold TOTAL;
- Cash and M-Pesa examples;
- customer QR;
- footer;
- business logo;
- customer copy;
- business copy;
- cut/feed behavior.

Acceptance should record:

```text
printer mode
queue or LAN endpoint
columns
feed lines
auto-cut state
QR size
logo width
actor
accepted timestamp
```

Do not mark printer acceptance complete from a text-only connection slip.

---

# 15. RECEIPT HIGH: DIRECT RAW AND HTML PREVIEW DO NOT FORMAT MONEY IDENTICALLY

HTML preview uses locale-aware formatting such as:

```text
KES 12,345.00
```

Native `receipts::amount()` currently produces:

```text
KES 12345.00
```

The result is valid but visually inconsistent and less conventional for real business receipts.

## Required fix

Create one receipt-money formatter contract used by:

```text
Rust thermal output
TypeScript HTML preview
plain-text copy/download
```

Required format:

```text
KES 0.00
KES 1,250.00
KES 125,000.00
```

No floating point should be authoritative for stored monetary values.

---

# 16. RECEIPT HIGH: PRINT LAYOUT NEEDS A CONVENTIONAL THERMAL HIERARCHY

The persisted receipt data is strong. The direct thermal presentation is still mostly a flattened string stream.

The final 80mm layout should be intentionally designed.

Recommended direct thermal structure:

```text
            BUSINESS NAME
       address / phone / email
              OUTLET

            CUSTOMER COPY
Receipt: R-000123
Order:   ORD-000456
Date:    02/10/2026 03:30
Cashier: Jane
--------------------------------
ITEM
  2 x KES 250.00       KES 500.00
  + Modifier
ITEM WITH A LONG NAME THAT WRAPS
  1 x KES 1,200.00   KES 1,200.00
--------------------------------
Subtotal               KES 1,700.00
Discount                -KES 100.00
TOTAL                   KES 1,600.00
--------------------------------
M-PESA                  KES 1,600.00
M-Pesa ref: ABC123XYZ
Paid                    KES 1,600.00
Balance                     KES 0.00

       Thank you for your business.

          [ M-PESA TILL QR ]

          Built By KINGSFORGE
        info@kingsforge.co.ke
        info@davemusau.co.ke
              0746157440

             [ LOGO ]

<feed>
<cut>
```

Business copy follows as a separate copy and omits customer-facing QR/logo where specified.

---

# 17. RECEIPT HIGH: PHYSICAL XP-80T ACCEPTANCE REMAINS A RELEASE GATE

Source tests cannot prove paper behavior.

Run on the exact production XP-80T:

```text
1. printer self-test
2. ServOS text connection slip
3. full acceptance receipt
4. cash receipt
5. M-Pesa receipt
6. split-tender receipt
7. very long item name
8. long 20+ item receipt
9. customer copy cut
10. business copy cut
11. QR + footer + logo
12. five consecutive QR scans
13. printer restart
14. queued job retry
15. delivery-uncertain recovery
16. historic receipt reprint
```

Record photos and accepted settings.

---

# 18. FINAL SPRINT IMPLEMENTATION ORDER

Do the sprint in this order.

## Phase 0 - Stabilize HEAD

1. Fix the `bounded_detail` test/module regression in `native-tests`.
2. Get `native-domain` green.
3. Identify and close current browser preview/production failures.
4. Require one exact SHA for all subsequent cutover work.

**Exit:** CI release candidate no longer skipped for unrelated red jobs.

## Phase 1 - Introduce explicit authority modes

1. Add server mode: `LEGACY_LOCAL | CUTOVER_PREP | SHARED_V2`.
2. Add persistent local authority mode.
3. Update v2 session/identity responses to include mode.
4. Fence all legacy writes based on persisted/global mode, not active login.
5. Prevent legacy snapshot/sync fallback in `SHARED_V2`.
6. Add transition guards and audit.

**Exit:** impossible to create a legacy business mutation after the terminal enters `SHARED_V2`.

## Phase 2 - Build SQLite -> V2 cutover bootstrap

1. Generate local cutover manifest.
2. Create checkpoint SQLite backup.
3. Freeze local mutations.
4. Enter `CUTOVER_PREP`.
5. Import paged local records to v2.
6. Rebuild resources/derived state.
7. Verify collection counts/hashes/control totals.
8. Resolve legacy outbox as `SUPERSEDED_BY_V2_CUTOVER` with evidence.

**Exit:** server v2 contains the complete authoritative business state with zero unexplained differences.

## Phase 3 - Install final native v2 baseline

1. Install snapshot while in `CUTOVER_PREP`.
2. Verify `native_v2_state.snapshot_complete=1`.
3. Verify business ID/device ID/policy version.
4. Pull feed to current cursor.
5. Compare local v2 shadow against server snapshot.

**Exit:** terminal has a verified complete v2 baseline before shared writes are enabled.

## Phase 4 - Close Native -> Cloud command parity

1. Canonicalize credit commands.
2. Canonicalize comp commands.
3. Complete purchase-order commands.
4. Run generated parity gate.
5. Add acceptance for every Native Tier-A operation.

**Exit:** every production Native mutation has an accepted v2 handler.

## Phase 5 - Activate shared v2

1. Transition server `CUTOVER_PREP -> SHARED_V2`.
2. Persist native `SHARED_V2` mode.
3. Online Admin smoke transaction.
4. Pull/verify change feed.
5. Enable `VITE_ENABLE_WEB_V2=true`.
6. Redeploy Web.
7. Web smoke transaction.
8. Verify change appears on terminal.
9. Terminal transaction.
10. Verify change appears on Web.

**Exit:** both clients mutate one PostgreSQL v2 authority and converge through the feed.

## Phase 6 - Retire legacy runtime surfaces

1. Disable legacy remote change creation.
2. Remove/hide legacy Remote Manager write UI.
3. Keep `servos_upload` fenced.
4. Keep old cloud tables read-only for migration evidence only.
5. Remove legacy sync timer/path from `SHARED_V2` runtime.
6. Update help/docs so operators never use the old flow.

**Exit:** no normal production workflow depends on `public.business_records` or `servos_upload`.

## Phase 7 - Fix receipt printer source defects

1. Remove incorrect `GS !` QR positioning.
2. Correct thermal semantic alignment.
3. Fix OS print CSS fallback.
4. Add Windows CI compilation.
5. Unify money formatting.
6. Add full-format printer acceptance slip.
7. Add byte-level printer regression tests.

**Exit:** source-level receipt pipeline is deterministic and platform-tested.

## Phase 8 - Physical acceptance

1. XP-80T full receipt acceptance.
2. QR scan acceptance.
3. cutter/feed acceptance.
4. barcode scanner acceptance.
5. complete shift rehearsal.
6. restart/recovery rehearsal.
7. backup/restore rehearsal.
8. Web/Terminal cross-client reconciliation.

**Exit:** signed production acceptance.

---

# 19. REQUIRED TESTS

## 19.1 Authority tests

```text
SHARED_V2 + local PIN -> cannot legacy-write
SHARED_V2 + no Auth -> cannot send business mutation
SHARED_V2 + Auth -> v2 command accepted
SHARED_V2 -> runtime_sync never calls servos_upload
SHARED_V2 -> runtime_snapshot never exposes legacy records as current authority
CUTOVER_PREP -> legacy writes blocked
CUTOVER_PREP -> v2 execute blocked
CUTOVER_PREP -> snapshot allowed
LEGACY_LOCAL -> existing migration behavior preserved before cutover
```

## 19.2 Cutover tests

```text
bootstrap replay is idempotent
page hash mismatch rejected
unknown collection rejected
record count mismatch rejected
stock control totals mismatch rejected
financial totals mismatch rejected
resource rebuild mismatch rejected
cutover cannot commit without backup evidence
cutover cannot commit with unresolved import errors
legacy outbox cannot be superseded before verification
server mode transition is audited
```

## 19.3 V2 command tests

```text
same command replay -> same result
changed payload same command ID -> REPLAY_MISMATCH
stale expected version -> VERSION_CONFLICT
revoked device -> denied
inactive staff -> denied
permission removed -> denied
feed cursor contiguous
terminal and web see same result
```

## 19.4 Printer tests

```text
no non-zero GS ! used for QR positioning
customer QR only
business copy has no customer QR
header/footer center commands deterministic
TOTAL emphasis resets correctly
logo after footer
feed before cut
exactly two cuts when auto-cut enabled
zero cuts when disabled
long item wraps without corrupting amount line
money formatting includes thousands separators
Windows printer path compiles on windows-latest
OS_PRINT CSS contains valid @page syntax
```

---

# 20. REQUIRED FILES / AREAS TO CHANGE

## Native / Rust

```text
src-tauri/src/lib.rs
src-tauri/src/store.rs
src-tauri/src/printer.rs
src-tauri/src/receipts.rs
src-tauri/src/tests.rs
src-tauri/migrations/015_v2_cutover_state.sql        # proposed
native-tests/src/lib.rs
```

## Native React

```text
src/runtime/RuntimeProvider.tsx
src/native/NativeDataReconciliationPanel.tsx
src/native/NativeSettingsPanel.tsx
src/native/NativeReceiptDialog.tsx
src/components/pos/ReceiptDocumentView.tsx
src/receipts/format.ts
```

## Cloud

```text
supabase/migrations/20261001045_v2_cutover_bootstrap.sql    # proposed
supabase/migrations/20261001046_authority_modes.sql         # proposed, may be combined with 045
supabase/migrations/... forward fixes for parity
```

## Tests / CI

```text
tests/supabase/* cutover tests
tests/* parity tests
tests/* receipt printer source tests
.github/workflows/ci.yml
scripts/protocol-check.mjs
scripts/build-operation-ledger.ts
```

## Documentation

```text
docs/SYSTEM_ARCHITECTURE.md
docs/TERMINAL_OPERATOR_AUTH_SETUP.md
docs/WEB_V2_STAGING_RUNBOOK.md
docs/RECEIPT_SPEC.md
docs/user-guide/31-xprinter-xp-80t.md
```

Current staging documents that still describe Native v2 as unavailable must be corrected. The source has moved beyond them.

---

# 21. CUTOVER RUNBOOK FOR COUNTRYSIDE

This is the desired maintenance-window procedure after the implementation above lands.

```text
1. Freeze accepted Git SHA.
2. Verify all CI required jobs green.
3. Verify hosted migrations through current HEAD.
4. Verify Admin Auth identity and paired DESKTOP device.
5. Close any open till.
6. Stop operator activity.
7. Create SQLite backup.
8. Run SQLite quick_check.
9. Generate cutover manifest + hash.
10. Server mode -> CUTOVER_PREP.
11. Bootstrap local records into v2.
12. Rebuild v2 resources.
13. Compare control totals.
14. Verify zero unexplained differences.
15. Resolve legacy outbox as SUPERSEDED_BY_V2_CUTOVER.
16. Install native v2 shadow snapshot.
17. Pull v2 feed to current cursor.
18. Verify terminal shadow == server snapshot.
19. Server mode -> SHARED_V2.
20. Persist local authority mode -> SHARED_V2.
21. Sign in online as Admin.
22. Run one non-destructive v2 configuration smoke action.
23. Run one sale/payment test if commissioning policy allows.
24. Verify receipt persistence.
25. Verify terminal feed refresh.
26. Enable Web v2 flag.
27. Deploy Web.
28. Execute Web -> Terminal visibility test.
29. Execute Terminal -> Web visibility test.
30. Run XP-80T full acceptance receipt.
31. Run scanner acceptance.
32. Open business.
```

Rollback before step 19 can restore the SQLite checkpoint and abort the cutover.

After accepted `SHARED_V2` business writes exist, rollback must not simply re-enable legacy writers. Use forward repair or a rehearsed v2 recovery procedure.

---

# 22. DEFINITION OF DONE

The final sprint is complete only when all statements below are true.

## V2

- [ ] CountrySide authoritative state exists in `servos_v2`.
- [ ] Control totals match the pre-cutover SQLite source.
- [ ] Native terminal has a complete v2 baseline.
- [ ] Native commands use `servos_v2_execute` only.
- [ ] Native sync uses v2 outbox/feed only.
- [ ] Native snapshot reads v2 shadow only in shared mode.
- [ ] Local PIN cannot create legacy business mutations in shared mode.
- [ ] Legacy outbox is formally resolved with cutover evidence.
- [ ] `servos_upload` is fenced in shared mode.
- [ ] Web and Terminal both use the same v2 authority.
- [ ] Native -> Cloud operation parity gate is green.
- [ ] Cloud v2 acceptance is green.
- [ ] Browser production acceptance is green.
- [ ] Native-domain acceptance is green.
- [ ] Desktop-shell acceptance is green.

## Receipt printer

- [ ] QR positioning uses valid ESC/POS commands.
- [ ] Customer/business copy formatting is physically aligned.
- [ ] TOTAL and header hierarchy look like a conventional 80mm receipt.
- [ ] Money formatting is identical across preview/text/thermal output.
- [ ] XP-80T USB RAW path compiles on Windows CI.
- [ ] Full-format test slip exists.
- [ ] Customer QR scans reliably from paper.
- [ ] QR has clear margin before footer.
- [ ] Footer is centered.
- [ ] Logo is centered and follows footer.
- [ ] feed/cutter spacing accepted.
- [ ] receipt reprint after printer restart accepted.
- [ ] queued and delivery-uncertain recovery accepted.

## Operational release

- [ ] Full shift rehearsal passes.
- [ ] Cross-client convergence passes.
- [ ] Backup restore passes.
- [ ] Restart recovery passes.
- [ ] No legacy writer is active.
- [ ] No unresolved printer job remains.
- [ ] No unexplained stock, cash, credit, room or payment difference remains.

---

# 23. FINAL PRIORITY SUMMARY

```text
P0.1  Fix native-domain CI regression
P0.2  Add persistent/global authority mode
P0.3  Add CUTOVER_PREP server state
P0.4  Build SQLite -> v2 bootstrap
P0.5  Formalize legacy outbox supersession
P0.6  Install and verify final v2 native baseline
P0.7  Close Native -> Cloud command parity
P0.8  Activate SHARED_V2 and retire legacy writes

P0.9  Fix incorrect ESC/POS QR command
P0.10 Fix thermal alignment model
P0.11 Fix OS print fallback CSS
P0.12 Add Windows printer CI

P1.1  Full-format printer acceptance slip
P1.2  Receipt hierarchy / money formatting polish
P1.3  Physical XP-80T acceptance
P1.4  Scanner + shift + recovery acceptance
```

The finish line is not "legacy sync works again."

The finish line is:

```text
one v2 business truth
+ terminal resilience
+ web reach
+ deterministic receipt printing
+ no hidden fallback to legacy authority
```

