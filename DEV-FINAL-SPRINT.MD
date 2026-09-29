The finish line is a deliberately redundant ServOS system where **Tauri/SQLite and Web/PWA remain permanent, first-class clients**.

YOU WILL ALWAYS UPDATE THIS DOCUMENT AFTER EVERY MAJOR IMPROVEMENT 
YOU WILL BUILD CONTINIOUSLY ONLY CHECKING FOR BUGS WHEN NECESSARY DEFER FULL SUITE TEST TILL LATER 
THIS DOCUMENT IS YOUR ONE YOUR GUIDE 

The latest deployment picture is:

| Gate | Current state |
|---|---|
| Vercel build/deployment | ✅ Success |
| TypeScript | ✅ Pass |
| Production Vite build | ✅ Pass |
| Cloud protocol tests | ✅ Pass |
| `npm test` | ❌ Fail |
| Native-domain test suite | ❌ Fail |
| UI audit | ⏭ blocked by Node test failure |
| Docs check | ⏭ blocked |
| Playwright | ⏭ blocked |
| Web v2 production activation | ❌ Still intentionally disabled |
| Full terminal ↔ web shared-authority cutover | ❌ Not yet |

So this is **not a broken application**, but it is currently a **red release branch**.

### Two immediate CI problems

The frontend failure has at least one concrete stale test. `tests/web-hospitality-source.test.mjs` still expects the old hard-coded:

```text
tabs=(['Home','POS', ...])
```

architecture.

But `WebBusinessApp` now correctly uses:

```text
workspaceRegistry
→ visibleWorkspaces(session)
→ workspaceGroups(session)
```

The test should be modernized, not the app reverted.

There is also a native-test fixture contradiction introduced by the new required Room Stay setup. The shared `setup()` test helper now always configures `roomStayRatePlanId`, but a later test expects a reservation to fail because no room-stay rate has been configured. That post-Go-Live state is no longer normally reachable. The test needs to model either a legacy/corrupt state explicitly or stop expecting the old missing-rate condition.

Those are **P0 before further feature development**.

---

# Revised target architecture

The earlier parity work already showed why keeping both products makes sense: the terminal owns SQLite, printer/scanner integration and full offline operation, while web uses the cloud/IndexedDB path and provides remote reach. :chatgpt-content-reference{index="0"}

The mistake would be letting those become **two independent truth systems**. The earlier audit correctly flagged concurrent legacy and v2 writers as dangerous. :chatgpt-content-reference{index="1"}

The permanent architecture should therefore be:

```text
                         SERVOS CLOUD
                  PostgreSQL / Supabase v2
             commands • versions • audit • change feed
                 global coordination authority
                         /             \
                        /               \
                       /                 \
              SERVOS TERMINAL          SERVOS WEB
              Tauri + React            React PWA
              Rust + SQLite            IndexedDB
                    │                       │
           full local durability        local cache
           physical printer             local drafts
           scanner/device I/O           remote access
           offline operations           multi-device access
           local backup                 browser portability
                    │                       │
                    └──── same commands ────┘
                         same permissions
                         same invariants
                         same receipts
                         same audit model
```

When everything is online, PostgreSQL arbitrates shared business resources.

When connectivity disappears, the terminal remains operational using its local SQLite state plus previously issued offline authority/grants.

The web can initially fall back to durable drafts/queues. Later, selected web offline operations can use the same grant model where safe.

That gives you real redundancy:

**Internet dies → terminal works.**

**Terminal hardware dies → web works.**

**Browser crashes → terminal keeps trading.**

**Office loses the local PC → cloud data/web remain available.**

**Cloud temporarily disappears → terminal does not become a brick.**

That is a much stronger product than choosing either extreme.

---

# One major documentation correction

`SERVOS_WEB_REBUILD_MASTER_PLAN.md` currently says:

> fully web-based

and:

> Tauri becomes optional rather than architectural.

It also says the installed-terminal architecture should eventually be retired.

That is now the **wrong end state**.

Interestingly, `docs/SYSTEM_ARCHITECTURE.md` already contains a better target: Tauri/SQLite and Vercel/IndexedDB both submit versioned commands to shared PostgreSQL authority and can only finalize disconnected shared-resource work within reserved resources.

That should become the canonical architecture.

I would rename/rewrite the master plan around:

**ServOS Dual-Runtime Production Architecture**

not:

**ServOS Web Rebuild replacing Terminal**

---

# Finish-line plan

| Phase | Work | Exit condition |
|---|---|---|
| **0. Stabilize main** | Fix stale Node tests, repair Room Stay native fixture, run full CI | Every GitHub job green |
| **1. Establish one truth contract** | Rebuild operation manifest from actual native/backend/web implementations; eliminate stale parity data | CI fails automatically when a command exists on one side but is untracked |
| **2. Freeze dual-runtime architecture** | Rewrite master plan, system architecture, handoff and release docs around permanent Terminal + Web | No document says Tauri will be retired |
| **3. Close web feature gaps** | Assets/Maintenance, inventory scanner session, atomic opening stock, folio edge cases, Import Apply, floorplan, lifecycle | Operational feature matrix effectively complete |
| **4. Normalize UX** | Design system, dialogs, tables, forms, comboboxes, approvals, error states | Major workspaces use common components |
| **5. Finish Web PWA** | icons, installability, SW update safety, IndexedDB recovery, activity/conflict UI | PWA survives refresh/restart/offline shell tests |
| **6. Build Terminal v2 adapter** | Replace legacy snapshot uploader with BusinessCommandV2/change-feed synchronization | Terminal speaks same protocol as web |
| **7. Implement offline authority** | signed device grants, stock/till/room allocations, numbering ranges, expiry/reconciliation | terminal can safely transact offline alongside web |
| **8. Dual-client staging** | real Tauri + two browsers against isolated PostgreSQL | concurrency/replay/conflict tests pass |
| **9. Data migration rehearsal** | map existing SQLite/Supabase records into v2 and reconcile control totals | zero unexplained differences |
| **10. Production cutover** | fence legacy writer, enable v2 server, web flag, terminal adapter | only one business protocol writes shared truth |
| **11. Physical + remote acceptance** | printer, scanner, offline shift, cloud outage, terminal outage, web failover, recovery | signed production acceptance |
| **12. Release** | backups, monitoring, support docs, rollback procedures | ServOS dual-runtime production ready |

## Phase 0 should happen immediately

Before another large feature patch:

```text
Fix npm test
↓
Fix native-domain tests
↓
npm run verify
↓
test:cloud
↓
Playwright desktop + mobile
↓
green GitHub Actions
```

The latest code already passes lint/build/cloud, so this is not a huge detour.

---

# Phase 1: make parity measurable

The current `operationManifest.ts` contains **37 tracked operations**, but it is already materially stale.

It currently labels these as web missing:

```text
order.transfer
order.merge
order.discount
order.compItem
mpesa.reconcile
folio.postService
pos.roomCharge
asset.maintenance
```

Yet current source already contains several of those:

```text
WebPosView:
order.transfer
order.merge
order.discount
order.comp
folio.room_charge
credit.charge

WebFinancialControlsView:
mpesa.reconcile

WebHospitalityViews:
folio.postService
```

So the manifest cannot currently be trusted as the parity gate.

I would make parity generation automatic:

```text
Native dispatcher operations
        +
PostgreSQL v2 dispatcher operations
        +
Web operation usage
        ↓
generated parity matrix
```

Every command should resolve to:

```text
operation
domain
permission
native backend
cloud backend
terminal UI
web UI
offline eligibility
approval requirement
version requirements
audit effects
financial effects
stock effects
acceptance test
```

Then CI rejects untracked divergence.

This will save an enormous amount of future forensic work.

---

# Phase 2: protect the two-client model from code drift

Right now the bigger architectural risk is actually **repository drift**.

`servos-` and `SERVEOS-WEB` are already changing separately.

And `SERVEOS-WEB` itself still contains:

```text
src/native
src-tauri
native-tests
```

while there is also a separate terminal repository.

You do not want two manually maintained copies of your Rust business engine.

The long-term structure should ideally become:

```text
packages/
  servos-contracts
  servos-domain
  servos-permissions
  servos-receipts
  servos-test-fixtures

apps/
  terminal
  web

cloud/
  postgres-v2
```

They can still be **two independently deployable applications**.

Redundancy does not require duplicated source code.

In fact, shared contracts make the redundancy safer.

If keeping two repositories is operationally easier, create a versioned shared contracts package and require both repositories to declare:

```text
SERVOS_PROTOCOL_VERSION
SERVOS_SCHEMA_VERSION
SERVOS_PERMISSION_VERSION
```

The terminal must refuse an incompatible cloud protocol instead of silently corrupting data.

---

# Phase 3: remaining web parity

Most giant domains are already present. The finish work should concentrate on the edges.

### Assets / maintenance

This is still the clearest web-domain gap.

Web needs the native lifecycle:

```text
asset assign
return
transfer
inspect
lost
retire
dispose
commission

maintenance report
assign
start
complete
cancel
```

plus asset barcode lookup and acquisition history.

### Inventory

Bring the terminal's very good scanner model to IndexedDB:

```text
select Storage Place
→ begin count
→ scan continuously
→ persist after every scan
→ unknown barcode queue
→ close browser
→ reopen
→ exact count resumes
→ review
→ one inventory.countLocation command
```

### Atomic new-item setup

Web needs the equivalent of terminal:

```text
catalog.createWithOpeningStock
```

One operation should create:

```text
product
stock master
barcode
stock link
storage location association
opening quantity
opening movement
```

No six-form pilgrimage.

### Hospitality edge completion

Finish:

```text
stay.extend
folio.refundDeposit
folio.reverse
reservation modification
full charge reversal
folio reopening rules
```

The core workflow is already strong.

### Import Center

Current browser UI stages imports but does not complete the entire review/apply journey.

Finish:

```text
file
→ map
→ validate
→ dry run
→ error rows
→ correction
→ manager review
→ admin.import.apply
→ result summary
→ audit
```

### Floorplan

The web can operate tables but still needs proper manager-side floorplan configuration.

---

# Phase 4: complete the design system before UI sprawl returns

The new:

```text
design-system/components.tsx
design-system/tokens.ts
workspaceRegistry.ts
```

are the correct start.

But most feature screens still have local copies of:

```text
button
primary
field
panel
modal
table
```

Complete shared primitives for:

```text
Dialog
Drawer
FormField
Select
Combobox
MoneyInput
QuantityInput
DateTime
DataTable
Search
FilterBar
ActionMenu
ConfirmDialog
ManagerApprovalDialog
PermissionGate
LoadingState
EmptyState
ErrorState
SyncState
```

Then migrate modules domain by domain.

This is not merely visual polish. It removes inconsistent destructive-action and financial-confirmation UX.

---

# Phase 5: make Web a proper installable second workstation

The PWA foundation is now good.

But `manifest.webmanifest` still has:

```text
"icons": []
```

Finish:

```text
192px icon
512px icon
maskable
favicon
apple-touch icon
install tests
standalone tests
offline shell tests
safe-update tests
```

Keep the current safe SW approach where updates wait instead of hijacking a live transaction.

That's exactly right.

---

# Phase 6: the critical architectural milestone, Terminal v2 adapter

This is the real bridge to redundancy.

Currently the terminal primarily understands:

```text
SQLite transaction
→ legacy ordered uploader
→ cloud replica
```

Web v2 understands:

```text
BusinessCommandV2
→ PostgreSQL
→ change feed
```

Those need to converge.

Terminal should gain:

```text
SQLite local command
↓
BusinessCommandV2 envelope
↓
durable outbox
↓
PostgreSQL execute
↓
acknowledgement
↓
ordered change feed
↓
SQLite reconciliation
```

Do **not** make the terminal upload arbitrary snapshots once v2 becomes live.

The server must understand exactly which command caused each state transition.

---

# Phase 7: maximum redundancy requires controlled offline authority

This is the part that makes your redundancy goal real rather than cosmetic.

Before going offline, terminal receives signed allocations such as:

```text
stock allocation
till authority
allowed service area
room ownership/reservation lease
receipt/order number range
maximum discount/refund authority
expiry
policy version
device ID
signature
```

The terminal can then finalize transactions locally within that envelope.

When connectivity returns:

```text
offline commands
→ upload in sequence
→ server verifies grant
→ server consumes allocation
→ change feed reconciles
```

If two systems attempt to consume the same shared resource, ServOS must conflict rather than invent inventory.

The web can later receive the same capability for carefully selected operations.

---

# Phase 8: test redundancy itself

Your acceptance suite should deliberately break things.

A proper ServOS release should prove these scenarios:

| Failure | Expected behavior |
|---|---|
| Internet disappears | Terminal continues |
| Supabase unavailable | Terminal continues within grants |
| Terminal PC dies | Web remains operational |
| Browser closes mid-draft | IndexedDB restores draft |
| Browser loses internet | finalized financial actions block unless granted |
| Printer fails | sale survives, receipt remains reprintable |
| Scanner unplugged | manual entry remains available |
| Terminal reconnects | outbox reconciles exactly once |
| Two clients edit same record | stale writer conflicts |
| Same command is replayed | result is idempotent |
| Terminal returns after long outage | grant expiry/resource reconciliation works |
| Vercel update arrives mid-sale | active workflow is not replaced |
| Cloud data lost/corrupted | verified backup recovery exists |
| Local SQLite damaged | restore + cloud reconciliation path exists |

That is the meaning of “maximum redundancy”.

---

# Production cutover should be conservative

The final cutover sequence remains:

```text
Terminal v2 adapter tested
Web v2 tested
↓
Full business backup
↓
Drain legacy outbox
↓
Verify SQLite/cloud control totals
↓
Fence legacy snapshot writer
↓
Migrate v2 state
↓
Enable PostgreSQL command authority
↓
Enable Terminal v2 client
↓
Enable Web v2 client
↓
Smoke tests
↓
Reconcile sales / stock / cash / credit / rooms
↓
Open business
```

Never enable both the old uploader and the new transactional protocol simultaneously.

---

# What I would call “finished”

ServOS is finished when **both clients can independently carry the business through a day while producing the same business truth**.

That means a sale made from Terminal appears on Web; a supplier delivery entered on Web appears locally on Terminal; a room checked in on Web cannot be double-booked at Terminal; a customer-credit payment entered at Terminal updates the same A/R ledger seen remotely; and every stock movement, journal, receipt, approval and audit record converges.

The terminal should remain the **resilience machine**.

The web should remain the **reach and multi-device machine**.

PostgreSQL should become the **coordination machine**.

SQLite should remain the **local survival machine**.

That four-part architecture is the finish line I would now build toward, rather than any plan that eventually deletes the terminal.