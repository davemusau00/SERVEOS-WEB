# ServOS DEV FINAL SPRINT
## Dual-Runtime Finish-Line Execution Plan

**Repository:** `davemusau00/SERVEOS-WEB`  

**Current direction:** Permanent ServOS Terminal + ServOS Web redundancy  
**Companion product specification:** `PRODUCT-INVENTORY.MD`

---

# 1. SOURCE OF TRUTH

The finish line is a deliberately redundant ServOS system where:

- Tauri/SQLite Terminal remains a permanent first-class client.
- Web/PWA remains a permanent first-class client.
- PostgreSQL/Supabase v2 coordinates shared business truth.
- SQLite remains the terminal's local survival authority during permitted offline operation.
- IndexedDB provides durable Web cache, drafts, synchronization state and later controlled offline capability.
- Both clients use the same business command contracts, permissions, invariants, audit model and reconciliation rules.

This document is the execution guide for reaching production.

After every major completed workstream:

1. update this document;
2. update the cross-client operation/parity manifest;
3. update affected acceptance tests;
4. update relevant user guidance;
5. record remaining blockers.

Do not allow documentation, UI capability and backend capability to drift into three different versions of ServOS.

---

# 2. CURRENT REPOSITORY CHECKPOINT

Current main includes:

- Web workspace registry.
- Activity / synchronization center.
- contextual help drawer;
- web manifest and service-worker update flow;
- room-stay configuration and required setup validation;
- PostgreSQL/Supabase v2 domain migrations through room-stay policy;
- Native Tauri/SQLite business engine;
- Web/PWA runtime foundations;
- substantial POS parity;
- catalog/inventory;
- procurement;
- financial controls;
- rooms/front desk/folios/housekeeping;
- assets foundations;
- staff/devices;
- controlled import foundations;
- guidance infrastructure;
- `DEV-FINAL-SPRINT.MD`;
- `PRODUCT-INVENTORY.MD`.

The latest checked GitHub Actions state remains red:

| Gate | Current |
|---|---|
| Vercel deployment | PASS |
| TypeScript | PASS |
| Vite production build | PASS |
| Cloud protocol | PASS |
| `npm test` | PASS (107 source tests after P0 repair) |
| Native-domain tests | BLOCKED locally: Windows GNU toolchain lacks `dlltool.exe`; CI Ubuntu runner is the authoritative gate |
| UI audit | PASS (3,431 controls/handlers/routes) |
| Docs check | PASS (40 guides, 15 core docs) |
| Browser Playwright | PARTIAL: transactional POS + web-storage suites green after repairs; final full 22-test matrix awaiting one clean run |
| Web v2 production activation | OFF |
| Terminal v2 shared-authority adapter | INCOMPLETE |
| Dual-runtime cutover | NOT READY |

### P0 status after this repair

`tests/web-hospitality-source.test.mjs` now asserts the workspace registry,
`visibleWorkspaces`, `workspaceGroups`, permission-aware routing and hash-route
authorization instead of the retired hardcoded tab array. The native room-stay
missing-rate test deliberately clears the persisted policy selectors on a
normally configured live database so production validation is not weakened.
Browser contract assertions were moved to the current Web v2 labels (Service
workspace, Purchasing, Master Data, Business master records, Bar / Kitchen
Pass) and `Synchronize` clicks now use the unique header control. The offline
service-worker test waits for `controllerchange` (and reloads when first-load
control is unavailable).

Remaining blockers before a green CI claim:

1. **Browser:** run the full 22-test desktop/mobile matrix once from a clean
   terminal and record the result (targeted transactional POS and storage
   suites already pass).
2. **Native domain:** the local Windows GNU toolchain cannot build `getrandom`
   because `dlltool.exe` is missing; install binutils/mingw or run the
   native-domain job on the CI Ubuntu runner. No Rust assertion has failed.
3. The default `npm run test:cloud` path (bootstrap/migrations/protocol)
   passes; `--expansion` suites were not re-run this session and remain
   part of the required green pipeline evidence.
4. Rooms now require a configured room-stay policy before reservations and
   before Go Live; operator guidance is captured in
   `docs/ONBOARDING_AND_SETUP.md` and the Rooms engine user guide.

---

# 3. IMMEDIATE P0: GET MAIN GREEN

Do this before accepting a release candidate.

## 3.1 Frontend source-test repair

`tests/web-hospitality-source.test.mjs` still expects the retired hardcoded Web tab array.

Replace assertions against:

```text
tabs=(['Home','POS', ...])
```

with assertions against:

```text
workspaceRegistry
visibleWorkspaces()
workspaceGroups()
permission-aware workspace routing
```

Acceptance:

- Front Desk is registered.
- Guest Accounts is registered.
- Housekeeping is registered.
- Rooms is registered.
- Finance Controls is registered.
- Administration is registered.
- inaccessible workspaces are removed by permission logic.
- hash routing cannot force an unauthorized workspace.

Do not restore the old tab array to satisfy a stale test.

## 3.2 Native room-stay fixture repair

The shared native test fixture now configures room-stay settings before Go Live.

A later test expecting a normally configured live business to have no rate is therefore contradictory.

Refactor the test so it deliberately constructs:

- a pre-policy database;
- a legacy/corrupt state; or
- an explicitly unconfigured pre-Go-Live state.

Do not weaken production validation to satisfy the test.

## 3.3 Required green pipeline

Release work cannot close until:

```text
npm ci
npm run lint
npm run build
npm test
npm run audit:ui
npm run docs:check
npm run test:browser
npm run test:native
npm run test:cloud
```

all pass from the same commit.

---

# 4. CRITICAL PRODUCT WORKSTREAM: PRODUCT + INVENTORY SIMPLIFICATION

`PRODUCT-INVENTORY.MD` is now a primary implementation specification.

This is not merely a cosmetic UX task.

It affects:

- Catalog.
- Inventory.
- Procurement.
- POS.
- Recipes.
- Kitchen operations.
- Bar operations.
- stock count.
- receiving.
- transfers.
- waste.
- costing.
- barcode behavior.
- imports.
- Help & Training.
- Terminal/Web parity.

The product rule is:

> **ServOS stores technical units. People enter physical reality.**

The normal operator should not be required to calculate:

- unit cost from pack cost;
- cans from six-packs;
- bottles from crates;
- millilitres from litres;
- grams from kilograms;
- shot yield from bottle volume;
- portion ingredient usage from batch production.

ServOS performs the arithmetic and shows the result for confirmation.

---

# 5. SMART ITEM WIZARD

Replace the ordinary operator experience of:

```text
New Product
New Stock Item
Link Stock Item
Configure Base Unit
Configure Scan Quantity
Configure Cost
Configure Recipe
```

with:

```text
+ ADD ITEM
```

The wizard chooses the internal records based on what the operator is describing.

## 5.1 Operator-facing item types

Initial presets:

```text
PACKAGED_DRINK
PORTIONED_DRINK
WEIGHT_INGREDIENT
COUNT_INGREDIENT
MENU_DISH
BATCH_RECIPE
RETAIL_ITEM
SERVICE
```

Friendly UI names:

- Beer / Soda / Bottled Drink.
- Spirit / Liquor.
- Wine.
- Keg / Dispenser Drink.
- Ingredient bought by weight.
- Ingredient bought by piece.
- Menu Dish.
- Batch Recipe.
- Retail / Packaged Item.
- Service / Non-stock Item.

These are wizard templates, not rigid database entity types.

## 5.2 Wizard architecture

Create shared model/components:

```text
SmartItemWizard
├── ItemTypeStep
├── IdentityStep
├── PurchasePackagingStep
├── SellingBehaviorStep
├── RecipeStep
├── OpeningStockStep
├── CalculationPreview
├── SuspiciousInputWarning
├── ReviewStep
└── Save
```

The same domain model must drive Terminal and Web.

Presentation may differ responsively, but calculations and payload generation must not.

---

# 6. MEASUREMENT MODEL

Introduce:

```text
measurementMode:
COUNT
WEIGHT
VOLUME
```

Canonical storage:

```text
COUNT  → piece
WEIGHT → g
VOLUME → ml
```

Friendly accepted entry units:

```text
COUNT
piece
bottle
can
packet
tray
box

WEIGHT
g
kg

VOLUME
ml
L
```

ServOS converts automatically.

Examples:

```text
5 kg
→ 5,000 g
```

```text
1.5 L
→ 1,500 ml
```

Do not expose canonical conversion mechanics in the normal wizard.

---

# 7. PURCHASE PACKAGING

Packaging becomes first-class.

Suggested contract:

```ts
PurchasePackage {
  id
  label
  measurementMode
  quantity
  canonicalQuantity
  barcode?
  preferred?
}
```

Examples:

```text
Coca-Cola

Base:
piece

Purchase packages:
single can   = 1 piece
six-pack     = 6 pieces
crate        = 24 pieces
```

```text
Jameson

Base:
ml

container:
750 ml bottle

case:
12 × 750 ml
```

```text
Beef

Base:
g

purchase package:
5 kg pack = 5,000 g
```

Multiple package barcodes must be supported.

A scan can therefore mean:

```text
bottle barcode → 1 bottle
pack barcode   → 6 bottles
crate barcode  → 24 bottles
```

without operator arithmetic.

---

# 8. PURCHASE PRICE UX

Replace ambiguous cost fields with explicit language.

Example:

```text
How many cans are in one pack?
6

How much does the WHOLE PACK cost?
KES 900
```

Display:

```text
ServOS calculated

1 pack = 6 cans
Cost per can = KES 150
```

When necessary offer:

```text
KES 900 is:

● Price of the whole pack
○ Price of one can
```

Every ambiguous monetary entry must immediately show the interpreted result before Save.

---

# 9. SUSPICIOUS INPUT DETECTION

The wizard should catch likely misentry without pretending to know better than the operator.

Examples:

```text
6-pack
pack cost: KES 6,000
selling price: KES 200/can
```

Warn:

```text
This means each can costs KES 1,000,
which is above the KES 200 selling price.

Confirm the KES 6,000 pack cost?
```

Other warnings:

- 5 g entered where the configured package is normally kg.
- portion larger than source container.
- selling price below calculated ingredient cost.
- impossible or zero package quantity.
- total delivery price implying an unusually tiny unit cost.
- duplicate barcode.
- duplicate package definition.
- recipe quantity greater than rational stock package size.

Warnings should be explainable and usually overridable by an authorized user.

---

# 10. PORTIONED DRINKS

Spirits, wine and keg products require a dedicated model.

Example:

```text
Jameson
Bottle: 750 ml
Purchase cost: KES 1,800

Sell as:
30 ml Shot       KES 200
60 ml Double     KES 350
750 ml Bottle    KES 4,500
```

ServOS calculates:

```text
Shot cost        KES 72
Double cost      KES 144
Whole bottle     KES 1,800
25 shots/bottle
```

## 10.1 Sealed and open stock

A portioned product cannot be represented only by aggregate ml if whole sealed containers are also sellable.

Track by stock location:

```text
sealedContainers
openQuantity
```

Example:

```text
Jameson 750 ml

8 sealed bottles
420 ml open

Total canonical volume:
6,420 ml
```

Whole-bottle sale requires a sealed bottle.

Shot sale may consume open quantity first.

When the remaining open quantity cannot fulfil the serving, ServOS may automatically open one sealed bottle and transfer that bottle's volume into open quantity.

Every transition must be recorded.

---

# 11. PACKAGED BEER / SODA

Do not force volume stock tracking merely because the label says 500 ml.

Ask:

```text
Do you sell part of an opened container?
```

If No:

```text
1 Tusker bottle = 1 piece
```

`500 ml` remains descriptive product size.

If Yes:

use VOLUME measurement mode.

---

# 12. GRAM-BASED FOOD INVENTORY

Ingredient creation should look like:

```text
Beef

How do you buy it?
5 kg pack

What does one pack cost?
KES 3,500
```

ServOS derives:

```text
5 kg = 5,000 g
cost per gram = KES 0.70
```

Do not ask the operator for cost per gram.

Normal recipe configuration:

```text
Beef Stew

Beef          200 g
Tomato         80 g
Onion          40 g
Oil            20 ml
Spices           8 g
```

ServOS calculates:

- ingredient cost;
- total dish cost;
- gross difference;
- theoretical portions available.

---

# 13. BATCH RECIPES

Support two recipe modes.

## Per-serving

```text
1 serving:
Beef      200 g
Potato    250 g
```

## Batch

```text
This batch uses:

Rice      2 kg
Oil       200 ml
Salt      30 g

This batch makes:
20 portions
```

ServOS derives per-serving consumption.

Do not require kitchen staff to divide batch quantities manually.

---

# 14. RECEIVE DELIVERY UX

Receiving must operate in supplier packaging language.

Example:

```text
Coca-Cola 330ml

What arrived?
4 packs

Pack size:
6 cans

Supplier charged:
KES 900 per pack

ServOS will add:
24 cans

Total received value:
KES 3,600

Calculated cost:
KES 150/can
```

Required backend effects:

- stock movement;
- inventory receipt;
- supplier/reference evidence;
- weighted-average costing;
- audit;
- synchronization event.

Do not mutate quantity directly.

---

# 15. STOCK COUNT UX

Counts use physical vocabulary.

Examples:

```text
Coke

Full six-packs: 3
Loose cans:     4

ServOS count:
22 cans
```

```text
Beef

Full 5 kg packs: 2
Loose/open:      1.2 kg

ServOS count:
11.2 kg
```

```text
Jameson

Sealed bottles: 8
Open liquid:     420 ml
```

Web count sessions must become as durable as Terminal count sessions.

Persist:

- actor;
- location;
- count session ID;
- baseline versions;
- scanned counts;
- manual counts;
- unknown barcodes;
- timestamps;
- pending reviewed command.

Use IndexedDB rather than only ephemeral React state.

---

# 16. ADMIN STOCK QUANTITY CORRECTION

This is a required feature.

There are legitimate cases where recorded stock is wrong because of:

- opening quantity misentry;
- receiving typo;
- incorrect package conversion;
- accidental extra zero;
- migration/import error;
- staff entry against the wrong location;
- historical data conversion issue.

An Admin must be able to correct the quantity quickly.

However:

> **“Edit quantity” is a UI convenience. It must never be a direct record overwrite.**

## 16.1 UI

From item detail:

```text
Stock
Main Bar: 45 cans

[ Count ]
[ Transfer ]
[ Waste ]

ADMIN
[ Correct quantity ]
```

Correction dialog:

```text
CORRECT STOCK QUANTITY

Coca-Cola 330 ml
Location: Main Bar

Currently recorded:
45 cans

What should it be?
[ 39 ] cans

ServOS will record:
-6 cans

Why are you correcting it?
[ Data entry mistake ▼ ]

Note
[ Delivery was entered as 5 packs instead of 4 ]

────────────────────────────

This does not delete the previous record.
ServOS will add a correction to the stock history.

[ Cancel ]
[ Correct to 39 cans ]
```

## 16.2 Permission

Introduce:

```text
inventory.correct_quantity
```

Default:

```text
Admin  → YES
Manager → NO
Server/operator → NO
```

This is intentionally separate from:

```text
inventory.count
inventory.adjust
inventory.receive
inventory.transfer
inventory.waste
```

so ordinary inventory management capability does not automatically grant authority to correct historical data.

Future businesses may explicitly delegate the capability, but the default role policy remains Admin-only.

## 16.3 Command

Introduce canonical command:

```text
inventory.correctQuantity
```

Payload:

```ts
{
  stockItemId,
  locationId,
  targetQuantity,
  expectedVersion,
  reasonCode,
  reason,
  reference?,
  correctionContext?
}
```

The server/native backend calculates:

```text
delta = targetQuantity - currentQuantity
```

Never trust a client-calculated delta as authority.

## 16.4 Movement

Create immutable:

```text
movementType = ADMIN_CORRECTION
```

Movement records:

```text
stockItemId
locationId
beforeQuantity
afterQuantity
quantityDelta
baseUnit
reasonCode
reason
reference
actorId
actorName
deviceId
sourceCommandId
occurredAt
```

The resulting stock balance is derived through the same stock mutation boundary as ordinary inventory movements.

Do not directly edit historical receipt/count/movement rows.

## 16.5 Validation

Require:

- Admin permission.
- non-negative target quantity.
- active stock item.
- active stock location.
- expected version.
- mandatory reason.
- idempotent command ID.
- full audit record.
- Go Live state when correcting live stock.
- conflict if stock changed since dialog opened.

If current stock changes between opening and confirming:

```text
Stock changed from 45 to 43 while this correction was open.

Review the latest quantity before correcting.
```

Do not silently apply the stale correction.

## 16.6 Re-authentication

For sensitive correction, require Admin re-authentication or PIN confirmation where available.

This protects an unlocked Admin terminal.

## 16.7 Human-unit support

Corrections must use packaging-aware UI.

Example:

```text
Recorded:
3 six-packs + 5 loose cans
= 23 cans

Correct quantity:
2 six-packs + 5 loose cans
= 17 cans

Adjustment:
-6 cans
```

The operator never calculates the delta.

## 16.8 Portion-controlled stock

For sealed/open drink inventory:

```text
Recorded:
5 sealed bottles
420 ml open

Correct to:
4 sealed bottles
390 ml open
```

ServOS records both correction dimensions and corresponding canonical delta.

Do not collapse sealed-container state into aggregate volume if the item can be sold as a whole sealed container.

## 16.9 Reporting

Admin corrections must appear in:

- stock movement history;
- audit log;
- item detail;
- daily activity;
- inventory variance reports;
- synchronization history.

Large or frequent corrections should be visible to the business owner.

---

# 17. EXISTING `inventory.adjust` CLEANUP

Current Native code already contains an `inventory.adjust` path that sets a target quantity and writes a count-style adjustment.

It currently checks `inventory.count`.

That contract must be corrected during this sprint.

Do not use the existing operation as an unrestricted direct-edit escape hatch.

Migration strategy:

```text
inventory.adjust
    ↓
legacy compatibility wrapper
    ↓
inventory.correctQuantity
```

or explicitly retire it once both clients use the canonical command.

Cloud v2 must implement the same operation.

Parity manifest must contain it.

---

# 18. ITEM DETAIL PAGE

Normal item details should answer operational questions.

Example:

```text
JAMESON 750ML

ON HAND
8 sealed bottles
420 ml open

SELLING
Shot · 30 ml         KES 200
Double · 60 ml       KES 350
Bottle · 750 ml      KES 4,500

BUYING
750 ml bottle
Latest cost           KES 1,800

YIELD
25 shots / bottle

COST
Shot                  KES 72
Double                KES 144
Bottle                KES 1,800

LOCATION
Main Bar

[ Receive ]
[ Count ]
[ Transfer ]
[ Waste ]

Admin:
[ Correct quantity ]
```

Advanced technical details go behind:

```text
More
→ Advanced
```

---

# 19. WEB CATALOG REFACTOR

Current Web exposes:

```text
New product
New stock item
New stock location
```

Replace the normal route with:

```text
+ Add Item
```

Keep separate advanced management only for authorized managers/admins.

Normal UI categories:

```text
ITEMS & MENU
STOCK
RECIPES
ADVANCED
```

---

# 20. ATOMIC CREATE CONTRACT

Implement matching Terminal + Web backend command for Smart Item creation.

Candidate:

```text
catalog.createItem
```

or evolve:

```text
catalog.createWithOpeningStock
```

Payload includes:

```text
product/menu identity
measurement mode
canonical unit
package definitions
barcode aliases
selling formats
recipe
stock location
opening quantity
opening cost
```

All effects must commit atomically.

Either everything exists or nothing exists.

---

# 21. HELP & TRAINING REDESIGN

The current Help Center must stop feeling like rendered README content.

Keep Markdown/docs as maintainable source material if desired.

Do not expose the raw presentation format.

Home:

```text
HELP & TRAINING

What are you trying to do?
[ Search ]

COMMON TASKS
[ Make a sale ]
[ Add an item ]
[ Receive stock ]
[ Count stock ]
[ Sell shots ]
[ Add food recipe ]
[ Correct a stock mistake ]
[ Refund ]
[ M-Pesa ]
[ Close day ]

LEARN BY DOING
▶ Add a six-pack
▶ Sell a bottle by shots
▶ Build a gram-based recipe
▶ Correct a stock quantity
```

Help article structure:

```ts
{
  title,
  summary,
  whenToUse,
  example,
  steps,
  systemHandles,
  commonMistakes,
  relatedTasks,
  guideId,
  estimatedMinutes
}
```

Render with:

- task cards;
- numbered steps;
- examples;
- screenshots/illustrations when available;
- calculation cards;
- warnings;
- success state;
- "Show me" action;
- related tasks.

Do not display a giant preformatted text block.

---

# 22. CONTEXTUAL HELP

Complex inputs get embedded assistance.

Examples:

```text
What does the whole pack cost? [?]
```

Popover:

```text
Enter what the supplier charges for the complete pack.

Example:
6 cans cost KES 900 total.

Enter 900.
ServOS calculates KES 150 per can.
```

For shot size:

```text
How much liquid one sale uses.

Example:
Single whisky shot = 30 ml.
```

This should answer the question without sending the operator away from their current workflow.

---

# 23. GUIDED PRODUCT TRAINING

Add guidance definitions:

```text
inventory.add-packaged-item
inventory.receive-pack
inventory.stock-count
inventory.admin-correction

bar.sell-shots
bar.sell-whole-bottle

kitchen.add-weight-ingredient
kitchen.create-recipe
kitchen.create-batch-recipe
```

Guides must advance on committed business operations, not merely clicks.

---

# 24. PRODUCT/INVENTORY ACCEPTANCE SUITE

Required automated/domain scenarios:

### Packaging

```text
6-pack × 4
→ 24 units
```

### Purchase costing

```text
6-pack costs KES 900
→ unit cost KES 150
```

### Weight

```text
5 kg
→ 5,000 g
```

### Volume

```text
1.5 L
→ 1,500 ml
```

### Spirit yield

```text
750 ml / 30 ml
→ 25 shots
```

### Whole bottle

Selling whole bottle:

```text
sealed count -1
open quantity unchanged
```

### Shot sale

Selling 30 ml:

```text
open quantity -30 ml
```

with automatic bottle opening where required.

### Recipe

Selling one Beef Stew:

```text
beef -200g
tomato -80g
onion -40g
oil -20ml
```

atomically.

### Receiving

```text
4 × 6-pack
→ +24 units
```

### Admin correction

```text
current = 45
target = 39
→ movement = -6
→ final = 39
→ movement type ADMIN_CORRECTION
```

### Correction concurrency

```text
Admin opens correction at v8
sale changes stock to v9
Admin confirms stale v8
→ CONFLICT
```

### Correction idempotency

Replay command:

```text
same command ID
→ one correction only
```

---

# 25. OTHER WEB PARITY WORK

After the Product/Inventory vertical slice:

## Assets / Maintenance

Complete:

```text
asset.assign
asset.return
asset.transfer
asset.inspect
asset.lose
asset.retire
asset.dispose
asset.commission

maintenance.report
maintenance.assign
maintenance.start
maintenance.complete
maintenance.cancel
```

Include barcode/asset tag lookup.

## Hospitality

Complete remaining edge workflows:

```text
stay.extend
folio.refundDeposit
folio.reverse
reservation modification
full room-charge reversal
folio reopen rules
```

## Controlled Import

Finish:

```text
upload/paste
→ map
→ validate
→ dry-run
→ error rows
→ correct
→ review
→ admin.import.apply
→ result
→ audit
```

## Floorplan

Implement Web manager editor.

---

# 26. DESIGN SYSTEM COMPLETION

Build/reuse:

```text
Button
Dialog
Drawer
FormField
Select
Combobox
MoneyInput
QuantityInput
UnitInput
PackageQuantityInput
CalculationCard
WarningCard
DataTable
ActionMenu
ConfirmDialog
AdminReauthDialog
ManagerApprovalDialog
PermissionGate
LoadingState
EmptyState
ErrorState
SyncState
```

`SmartItemWizard`, stock correction and Help should use these primitives.

---

# 27. CROSS-CLIENT PARITY LEDGER

The existing `operationManifest.ts` is stale.

Generate or validate the ledger against:

```text
Rust/native operations
PostgreSQL v2 operations
Web command callers
Terminal UI callers
```

Add fields:

```text
operation
domain
permission
nativeBackend
cloudBackend
terminalUI
webUI
offlineEligibility
requiresApproval
requiresVersion
auditEffect
stockEffect
financialEffect
acceptanceTest
```

New Product/Inventory operations must be represented.

At minimum:

```text
catalog.createItem
inventory.receive
inventory.count
inventory.transfer
inventory.waste
inventory.correctQuantity
recipe.save
package.save
barcodeAlias.save
```

---

# 28. WEB PWA FINISH

Complete:

```text
192 icon
512 icon
maskable icon
favicon
apple-touch icon
install tests
standalone tests
offline shell tests
update-while-busy protection
recovery tests
```

Do not activate a new service worker in the middle of a financial transaction.

---

# 29. TERMINAL V2 ADAPTER

Terminal must eventually use the same shared protocol:

```text
SQLite command
↓
BusinessCommandV2
↓
durable outbox
↓
PostgreSQL execution
↓
acknowledgement
↓
change feed
↓
SQLite reconciliation
```

Legacy arbitrary snapshot authority must be fenced before the new shared writer becomes production authority.

---

# 30. OFFLINE AUTHORITY

Terminal retains offline trading through signed/reserved authority.

Potential grants:

```text
stock allocation
till session
outlet authority
receipt-number range
room lease
discount ceiling
refund ceiling
```

Product/Inventory offline rules must understand packaging and canonical units.

A grant for 24 cans must not accidentally become 24 six-packs.

Canonical quantities remain authority beneath friendly packaging.

---

# 31. DUAL-CLIENT STAGING

Test at least:

```text
Terminal A
Web Browser B
Web Browser C
```

against isolated v2 staging.

Scenarios:

- same product edited concurrently;
- sale while Admin correction dialog is open;
- inventory transfer while remote count is open;
- room booking concurrency;
- duplicate command replay;
- terminal offline then reconnect;
- browser refresh with draft;
- device revocation;
- service-worker update;
- stale permissions;
- stock allocation exhaustion.

---

# 32. DATA MIGRATION

Before production cutover reconcile:

```text
products
stock items
stock locations
current quantities
stock movements
purchase receipts
orders
payments
M-Pesa
credit
rooms
folios
assets
staff
```

For inventory specifically verify:

```text
local quantity
cloud quantity
movement-derived quantity
```

Any unexplained difference blocks cutover.

Misentries discovered during migration should use a dedicated migration reconciliation record or Admin correction, not silent row editing.

---

# 33. PRODUCTION CUTOVER

Required order:

```text
CI green
↓
Product/Inventory acceptance green
↓
Terminal v2 adapter green
↓
Web v2 green
↓
Full local backup
↓
Drain legacy outbox
↓
Control-total reconciliation
↓
Fence legacy writer
↓
Migrate v2 state
↓
Enable cloud authority
↓
Enable Terminal v2
↓
Enable Web v2
↓
Smoke sale
↓
Smoke receive
↓
Smoke stock correction
↓
Smoke room booking
↓
Reconcile
↓
Open business
```

Never run legacy snapshot authority and v2 transactional authority concurrently for the same business.

---

# 34. FINAL SPRINT EXECUTION ORDER

Execute in this order:

```text
P0  Repair CI
P1  Product/Inventory domain contracts
P2  SmartItemWizard
P3  Packaging + measurement conversion
P4  Atomic item creation
P5  Receiving UX
P6  Stock count UX
P7  Admin Stock Correction
P8  Spirit sealed/open inventory
P9  Gram-based ingredients + recipes
P10 Batch recipes
P11 POS serving integration
P12 Structured Help + product training
P13 Cross-client parity tests
P14 Remaining Web parity gaps
P15 Design-system consolidation
P16 PWA completion
P17 Terminal v2 adapter
P18 Offline authority
P19 Dual-client staging
P20 Data migration rehearsal
P21 Physical hardware acceptance
P22 Production cutover
```

Do not jump from Smart Item UI directly to production without proving its accounting effects.

---

# 35. DEFINITION OF DONE

ServOS is finished when:

- a cashier can sell without understanding stock internals;
- a bartender can sell a shot, double or bottle from one product;
- a kitchen operator can build gram-based recipes without manual conversion;
- a storekeeper can receive crates/packs/bags using real supplier packaging;
- a storekeeper can count stock using packs plus loose units;
- an Admin can correct a data-entry stock mistake without corrupting history;
- every stock change leaves an immutable movement;
- Terminal and Web converge on identical quantities;
- duplicate commands are harmless;
- stale updates conflict safely;
- scanner and printer have physical acceptance evidence;
- Terminal survives network loss;
- Web survives terminal loss;
- PostgreSQL coordinates shared truth;
- SQLite provides local terminal resilience;
- Help teaches tasks inside the application rather than displaying README-style documentation;
- complete CI is green;
- migration control totals reconcile exactly.

The terminal is the resilience machine.

The Web app is the reach and multi-device machine.

PostgreSQL is the coordination machine.

SQLite is the local survival machine.

The operator should see the business.

ServOS should see the mathematics.