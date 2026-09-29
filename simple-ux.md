# ServOS Simple Operations UX
## Phased Implementation Patch

**Repository:** `davemusau00/servos-`  
**Target:** current `main`  
**Current reviewed HEAD:** `4035337e5d63ba8785e87ba344565cc69c69e68d`
**Baseline note:** This is the original planning snapshot. Current implementation and acceptance status are tracked in [the UX and Guidance Delivery Plan](docs/UX_GUIDANCE_DELIVERY_PLAN.md) and the release ledger.

> Planning baseline only: this hash identifies the original review snapshot, not the current checkout. The current coordination and delivery order is documented in [docs/UX_GUIDANCE_DELIVERY_PLAN.md](docs/UX_GUIDANCE_DELIVERY_PLAN.md). This document remains authoritative for task-first workflow requirements and safeguards.

---

# 0. Purpose

ServOS already contains a substantial operational engine:

- POS / KDS
- inventory
- procurement
- catalog
- customers and suppliers
- rooms
- front desk
- housekeeping
- folios
- assets
- maintenance
- imports
- staff/RBAC
- approvals
- offline SQLite authority
- synchronization
- receipts
- Help Center

The problem addressed by this patch is not missing functionality.

The problem is that too much of the internal business/domain model is currently visible to ordinary users.

Users encounter concepts such as:

- Catalog
- Master Data
- Stock Locations
- Stock Masters
- Room Types
- Rate Plans
- Asset Categories
- Import Center
- Portions
- Recipes
- Service Areas

These concepts remain useful internally and for advanced administration, but they should not be prerequisites for completing ordinary work.

The new design principle is:

> **The employee tells ServOS what they are trying to do. ServOS determines which records and domain operations are required.**

The patch therefore converts ServOS from a **module-first ERP interface** into a **task-first operating system** without weakening its accounting, inventory, audit, permission or offline guarantees.

---

# 1. Non-negotiable invariants

This patch MUST NOT:

1. Reset Intake or enrollment.
2. Replace the existing business.
3. delete existing SQLite data.
4. rewrite transaction history.
5. circumvent native domain commands.
6. directly manipulate inventory balances.
7. bypass optimistic locking.
8. weaken audit logging.
9. bypass manager approvals.
10. make Supabase authoritative over existing local LIVE data.
11. break existing POS products.
12. break existing stock items.
13. break existing room records.
14. break existing asset records.
15. require internet connectivity for normal operation.

The UX may become drastically simpler.

The domain engine must remain strict.

---

# 2. New UX philosophy

ServOS should primarily expose verbs.

The employee understands:

```text
ADD IT
SCAN IT
SELL IT
COUNT IT
MOVE IT
RECEIVE IT
FIX IT
FIND IT
```

The employee should not need to understand:

```text
record.save
stockItems
priceRules
assetCategories
roomTypes
ratePlans
external IDs
movement ledgers
```

Those remain implementation details.

---

# 3. New operational hierarchy

Replace the current wall of top-level modules for ordinary users.

Current conceptual navigation resembles:

```text
Bar POS
Bar Pass
Inventory
Assets
Procurement
Catalog
Master Data
Import Center
Front Desk
Folios
Housekeeping
Rooms Setup
M-Pesa
Refunds
Floorplan
Close Day
Reports
Business Admin
Help
```

Move toward:

```text
HOME

OPERATIONS
├── Sell
├── Stock
├── Rooms
└── Property

MANAGEMENT
├── Purchasing
├── Money
├── Reports
└── Staff

SYSTEM
├── Setup
└── Help
```

Permission filtering remains authoritative.

---

# 4. Staff-facing modes

Do not create separate applications.

Use the existing permission system to progressively reveal complexity.

## Operator

Primarily:

```text
Sell
Stock actions
Rooms / Front Desk
Housekeeping
Report problem
Help
```

## Manager

Adds:

```text
Purchasing
Stock analysis
Pricing
Close Day
Reports
Assets
Staff actions
```

## Administrator

Adds:

```text
Business Setup
Master configuration
Imports
Tax
Backups
Service areas
Room configuration
Advanced catalog
```

Do not depend solely on role names.

Continue using backend-issued permissions.

---

# PHASE S01
# Unified Home + Task Navigation

## Goal

Give nontechnical staff an obvious starting point.

## Add

```text
src/native/NativeHomeView.tsx
src/native/quickActions.ts
src/native/OperationalNav.tsx
```

## Modify

```text
src/native/NativeBarShell.tsx
```

## Home examples

### Server

```text
Good morning, Mary

WHAT DO YOU NEED?

[ Start Sale ]
[ Find Tab ]
[ Scan Item ]
[ Help ]

3 open tabs
```

### Stock employee

```text
STOCK

[ Receive Stock ]
[ Count Stock ]
[ Move Stock ]
[ Scan / Find Item ]

6 items running low
```

### Front desk

```text
FRONT DESK

[ New Booking ]
[ Check In ]
[ Check Out ]
[ Find Guest ]

6 arrivals
3 departures
12 occupied
```

## Requirements

- Home actions generated from permissions.
- Existing direct routes continue working.
- Existing module routes remain available under management/advanced areas.
- Mobile navigation must not expose 15+ tabs horizontally.
- Current route-aware Help remains functional.

## Acceptance

A normal server can perform common work without seeing:

```text
Master Data
Import Center
Rooms Setup
Asset Categories
```

---

# PHASE S02
# Universal Quick Add

## Goal

Create a single answer to:

> “Where do I add something?”

## Add

```text
src/native/quick-add/
  QuickAddLauncher.tsx
  QuickAddDialog.tsx
  quickAddRegistry.ts
```

Expose a persistent:

```text
+ Add
```

## Initial options

```text
THINGS

[ Product / Menu Item ]
[ Stock Item ]
[ Room ]
[ Asset ]

PEOPLE

[ Customer ]
[ Supplier ]
[ Staff Member ]

PLACES

[ Storage Place ]
[ Service Area ]

DATA

[ Bring in an Existing List ]
```

Filter options using permissions.

## Important

The Quick Add UI must orchestrate existing domain functionality.

It must not become an unrestricted generic `record.save` façade.

---

# PHASE S03
# Unified Product & Menu Creation

## Goal

Collapse packaged items, drinks, kitchen items and services into one creation system.

Rename ordinary-facing:

```text
Catalog
```

to:

```text
Products & Menu
```

Advanced catalog configuration may remain accessible separately.

---

## Entry

```text
ADD ITEM

What are you adding?

[ Drink ]
[ Food / Kitchen Item ]
[ Retail / Packaged Item ]
[ Service ]
```

These choices control defaults.

They must not become rigid incompatible backend classes.

---

# 5. Simple kitchen item creation

Kitchen item creation belongs inside the same Add Item workflow.

Example:

```text
ADD MENU ITEM

Name
[ Chicken & Chips ]

Selling price
[ KES 650 ]

Send order to
[ Kitchen ]

Category
[ Main Meals ]

[ Add Item ]
```

That is enough to create a sellable KDS-routed item.

After creation:

```text
✓ Chicken & Chips is ready to sell.

Do you want to track ingredients?

[ Add Ingredients ]
[ Do This Later ]
```

---

# 6. Recipe creation

Recipe configuration is progressive disclosure.

Example:

```text
WHAT GOES INTO ONE CHICKEN & CHIPS?

Chicken portion
[ 1 ] portion

Potatoes
[ 300 ] grams

Cooking oil
[ 30 ] ml

[ + Ingredient ]

[ Save Recipe ]
```

If an ingredient does not exist:

```text
No stock item called "Avocado"

[ + Add Avocado ]
```

Inline mini-flow:

```text
Name
[ Avocado ]

How do you count it?
[ Pieces ]

[ Add ]
```

Do not send the user to Master Data.

---

# 7. Modifiers

Support:

```text
Chicken & Chips

Extras
□ Avocado      +100
□ Kachumbari    +50
□ Extra chips  +150

Preparation
○ Normal
○ Extra crispy
○ Well done
```

Reuse existing modifiers/recipe capabilities where possible.

---

# PHASE S04
# Product Families, Container Variants and Sale Formats

This is required for correct bar inventory.

## Problem

A drink name is not a stock item.

For example:

```text
Jameson
```

may exist as:

```text
200ml
350ml
700ml
750ml
1L
```

These MUST be separate physical stock variants.

---

# 8. Product hierarchy

Introduce the conceptual hierarchy:

```text
PRODUCT FAMILY
        │
        └── PHYSICAL VARIANT
                  │
                  └── SALE FORMAT
```

Example:

```text
Jameson
│
├── 350ml bottle
│   ├── whole bottle
│   ├── 30ml
│   └── 60ml
│
├── 750ml bottle
│   ├── whole bottle
│   ├── 30ml
│   └── 60ml
│
└── 1L bottle
    ├── whole bottle
    ├── 30ml
    └── 60ml
```

---

# 9. Compatibility strategy

Do NOT rewrite all existing products.

Prefer an additive schema.

Potential additions:

```text
productFamilyId?
packageType?
containerQuantity?
containerUnit?
containerVolumeMl?
variantLabel?
```

Existing products without these values remain valid legacy/simple products.

Existing `portions` can continue to represent sellable measures initially.

Example mapping:

```text
Jameson 750ml
stockItemId → Jameson 750ml stock

portion:
Bottle → 750ml
Single → 30ml
Double → 60ml
```

A future normalized `saleFormats` collection may replace embedded portions, but this is not required for the first UX patch if existing portions support the necessary invariants.

---

# 10. Container size

Never assume one bottle size.

Creation:

```text
Name
[ Jameson ]

Container
[ Bottle ]

Size
[ 750 ] [ ml ]

Barcode
[ scan ]
```

Provide shortcuts:

```text
[ 200ml ]
[ 250ml ]
[ 330ml ]
[ 350ml ]
[ 500ml ]
[ 700ml ]
[ 750ml ]
[ 1L ]
[ Other ]
```

These are shortcuts only.

Allow any valid quantity.

Normalize internally where useful:

```text
1L → 1000ml
1.5L → 1500ml
```

---

# 11. Package types

Do not make the domain alcohol-specific.

Support examples:

```text
Bottle
Can
PET Bottle
Carton
Packet
Keg
Box
Bag
Piece
Other
```

This architecture can then represent:

```text
Coca-Cola
├── 300ml glass bottle
├── 500ml PET
└── 2L PET
```

and:

```text
Water
├── 500ml
├── 1L
└── 1.5L
```

---

# 12. Sale format creation

Ask:

```text
HOW DO YOU SELL THIS SIZE?

☑ Whole container
☑ By measure
```

If by measure:

```text
Single
[ 30 ml ]   KES [ 250 ]

Double
[ 60 ml ]   KES [ 450 ]

[ + Add Serving ]
```

Wine could use:

```text
Bottle      750ml
Glass       150ml
```

Juice:

```text
Glass       300ml
Large       500ml
Jug        1000ml
```

No assumption that a measured drink is only sold as a shot.

---

# 13. Variant duplication helper

After creating:

```text
Jameson 750ml
```

offer:

```text
Does Jameson come in another size?

[ + Add Another Size ]
[ Done ]
```

Carry forward:

- family
- category
- tax behavior
- routing
- supplier if appropriate

Ask only:

- package size
- barcode
- cost
- bottle/container selling price
- serving prices if different

---

# PHASE S05
# Smart Stock Creation

## Goal

Eliminate the requirement that a user separately understands Product and Stock Item.

During Add Item ask:

```text
Do you want ServOS to track how many you have?

(●) Yes
( ) No
```

If yes:

```text
How do you count it?
[ Bottle ]

How many do you have now?
[ 24 ]

Where is it kept?
[ Main Store ]
```

ServOS orchestrates:

```text
Product
StockItem
Product ↔ StockItem
Barcode
Opening Balance
Location Quantity
```

as one guided action.

---

# 14. Automatic identifiers

Ordinary staff should not be forced to invent:

```text
SKU
internal ID
location code
asset tag
room type code
```

Generate safe codes automatically.

Advanced editing remains available.

Examples:

```text
COKE-500-X7F
AST-00428
STORE-MAIN
```

---

# PHASE S06
# Storage Places

Rename staff-facing:

```text
Stock Locations
```

to:

```text
Storage Places
```

Creation:

```text
ADD STORAGE PLACE

What do staff call this place?
[ Main Store ]

Where is it?
[ Ground Floor ] optional

[ Create ]
```

Internal stock-location records remain unchanged.

Support examples:

- Main Store
- Main Bar
- Kitchen
- Freezer
- Cellar
- Room 101 Minibar

---

# 15. Inline dependency creation

Never require leaving the current flow to create a dependency.

Examples:

```text
Storage Place
[ Main Store ]

[ + Add New Storage Place ]
```

or:

```text
Ingredient
[ Avocado ]

No match.

[ + Add Avocado ]
```

or:

```text
Supplier
[ EABL ]

[ + New Supplier ]
```

Quick inline forms should create the dependency and return immediately to the parent flow.

---

# PHASE S07
# Inventory Operations Redesign

## Goal

Make Inventory task-first.

Default:

```text
STOCK

[ Scan or search anything ]

WHAT ARE YOU DOING?

[ Count Stock ]
[ Receive Stock ]
[ Move Stock ]
[ Damaged / Used ]

NEEDS ATTENTION

Tusker       4 left
Coke         6 left
Gordon's     Out
```

Managers may switch to:

```text
[ Overview / Analysis ]
```

to access the existing richer inventory table.

Do not destroy the current analytical view.

Move it behind the task-oriented front door.

---

# PHASE S08
# Location-first Stock Count

This should be one of the highest priority operational patches.

## Current conceptual problem

Counting is currently item-centric.

Real employees frequently think:

> “I'm counting the Main Store.”

## New flow

### Step 1

```text
COUNT STOCK

Where are you counting?

[ Main Store ]
[ Main Bar ]
[ Kitchen ]
[ Freezer ]
```

### Step 2

Enter dedicated count mode:

```text
MAIN STORE

17 / 83 counted

[ Scan barcode or search ]

Tusker 500ml
Expected   12
Counted    [ 14 ]
Difference +2

Coke 300ml
Expected   24
Counted    [ 24 ]
Difference 0
```

---

# 16. Continuous scanner mode

Physical barcode scanner should increment the draft immediately.

Example:

```text
SCAN

Coke 300ml
+1

Current count: 18
```

Do not repeatedly reopen dialogs.

Support:

```text
scan
scan
scan
scan
```

as a continuous workflow.

---

# 17. Count session

Introduce a draft count-session UI.

It does not alter inventory until confirmation.

State:

```text
location
startedBy
startedAt
draft quantities
counted item IDs
variance
```

Persistence may initially be frontend/local-session if safe, but a durable native draft model is preferable if counts may span long periods or terminal restarts.

If durable, add a migration rather than abusing final inventory records.

---

# 18. Count review

Before commit:

```text
COUNT REVIEW

83 products

76 matching
5 short
2 over

7 differences

[ Review Differences ]

[ Confirm Stock Count ]
```

Confirmation:

```text
ServOS will update 7 stock balances.

Tusker 500ml
12 → 9

Coke 300ml
24 → 28

Recorded by:
Mary Wanjiku

Location:
Main Store

[ Back ]
[ Confirm Count ]
```

Each final adjustment must still use the audited inventory command path.

---

# PHASE S09
# Simplified Stock Movement

## Move Stock

```text
MOVE STOCK

FROM
[ Main Store ]

TO
[ Bar ]

[ Continue ]
```

Then:

```text
SCAN ITEMS

Tusker     12
Coke       24
Jameson     2

[ + Add Item ]

[ Review ]
```

Then:

```text
MOVE TO BAR

3 items
38 total units

[ Confirm Move ]
```

Use existing `inventory.transfer`.

---

# 19. Waste / loss terminology

Replace generic technical reason entry with:

```text
WHAT HAPPENED?

[ Broken ]
[ Spoiled ]
[ Spillage ]
[ Missing ]
[ Expired ]
[ Used Internally ]
[ Other ]
```

Example:

```text
Coke 300ml

Quantity
[ 3 bottles ]

Reason
Broken during unloading

[ Record ]
```

Map friendly reasons to stable internal reason codes.

Continue using existing audited movement logic.

---

# PHASE S10
# Simplified Receiving

A user should be able to think:

> “A supplier delivered stock.”

Not:

> “I need to create a PO/GRN/AP chain.”

## Receive flow

```text
RECEIVE STOCK

Supplier
[ EABL ]

Invoice / Delivery Ref
[ INV-4821 ]

[ Start Scanning ]
```

Then:

```text
Tusker 500ml
24 bottles
KES 165 each

Coke 300ml
48 bottles
KES 60 each
```

Review:

```text
TOTAL
KES 6,840

[ Save Delivery ]
```

The domain layer can still create or update:

```text
goods receipt
inventory movements
weighted average cost
supplier payable
journal entries
audit
```

through existing procurement semantics.

---

# PHASE S11
# Barcode-first ServOS

The scanner should become a universal object locator.

From major operational screens, scanning should attempt resolution across allowed object types.

---

# 20. Product scan result

```text
COCA-COLA 300ML

KES 120

Main Store   24
Bar           8

[ Sell ]
[ Count ]
[ Move ]
[ Receive ]
[ Edit ]
```

---

# 21. Asset scan result

```text
TV-101

Samsung Smart TV

Room 101
In service

[ Report Problem ]
[ Move ]
[ Assign ]
[ History ]
```

---

# 22. Unknown barcode

```text
UNKNOWN BARCODE

6161100766013

What is this?

[ New Product ]
[ New Stock Item ]
[ New Asset ]
[ Cancel ]
```

Carry the scanned barcode into the selected creation flow automatically.

---

# 23. Ambiguous barcode

If a barcode conflicts:

```text
This barcode is already assigned to:

Coca-Cola 300ml

[ Open Existing Item ]
[ Use Different Barcode ]
```

Never display raw uniqueness/index errors to staff.

---

# PHASE S12
# Rooms Simplification

## Goal

Separate operational Front Desk work from room configuration.

Ordinary reception staff should primarily use:

```text
Front Desk
```

not:

```text
Rooms Setup
```

---

# 24. Simple room creation

Admin/manager:

```text
+ ADD ROOM

Room number
[ 104 ]

What kind of room?
[ Standard ]

[ Create ]
```

Inherit:

- capacity
- standard rate
- turnaround
- default housekeeping state
- maintenance availability

from room type/business defaults.

---

# 25. New room type inline

If needed:

```text
+ New Room Type
```

Then:

```text
Name
[ Executive ]

Sleeps
[ 2 ]

Normal nightly price
[ KES 12,000 ]

[ Create Type & Room ]
```

Internally ServOS can create:

```text
RoomType
Default RatePlan
Room
```

without forcing the user to understand those separate records.

---

# 26. Multi-room creation

Add:

```text
ADD MULTIPLE ROOMS
```

Allow:

```text
101,102,103,104,105
```

or:

```text
101 - 110
```

Then:

```text
Type
[ Standard ]

Floor
[ 1 ]

[ Create 10 Rooms ]
```

Validate duplicate/conflicting room numbers before commit.

---

# 27. Front Desk operational home

Example:

```text
TODAY

6 Arriving
3 Departing
12 Staying

ROOMS

101   AVAILABLE
102   John Kamau
103   CLEANING
104   OUT OF ORDER
```

Click room:

```text
ROOM 102

John Kamau
Leaving tomorrow

[ Guest Details ]
[ Add Charge ]
[ Extend Stay ]
[ Move Room ]
[ Check Out ]
```

Configuration remains elsewhere.

---

# PHASE S13
# Assets → Property

## Goal

Make asset tracking usable without accounting terminology.

Staff-facing section:

```text
Property
```

can contain:

```text
Assets
Repairs
Maintenance
```

Managers may still see “Asset Register” internally.

---

# 28. Simple asset creation

```text
ADD ASSET

Scan asset sticker
[ Scan ]

or

What is it?
[ Samsung 43" TV ]

Where is it?
[ Room 101 ]

[ Add Asset ]
```

Optional:

```text
[ Add Purchase Details ]
```

reveals:

- serial number
- cost
- supplier
- acquisition date
- warranty

Do not require these to register the physical object.

---

# 29. Asset category defaults

Provide automatic/common classifications:

```text
TV              → Electronics
Laptop          → IT Equipment
Bed             → Furniture
Fridge          → Appliance
Air Conditioner → HVAC
Vehicle         → Vehicle
```

Unknown:

```text
General
```

Managers can refine later.

Do not require:

```text
Create Asset Category
→ then Create Asset
```

for normal asset capture.

---

# PHASE S14
# Maintenance → Report a Problem

Anywhere a room or asset exists, expose:

```text
Report Problem
```

Example:

```text
ROOM 104

What's wrong?

[ Electrical ]
[ Plumbing ]
[ Furniture ]
[ Appliance ]
[ Cleaning ]
[ Other ]

Description
[ Bathroom tap is leaking ]

[ Report ]
```

Generate the maintenance order internally.

---

# 30. Maintenance worker queue

```text
3 JOBS

ROOM 104
Leaking bathroom tap
Reported 18 min ago
[ Start ]

MAIN BAR FRIDGE
Not cooling
Reported 2h ago
[ Start ]
```

On Start:

```text
[ Fixed ]
[ Needs Parts ]
[ Cannot Fix ]
```

Map these into the existing maintenance state machine rather than inventing a second maintenance model.

---

# PHASE S15
# Bring In Existing Data

## Goal

Keep the current safe Import Center engine while completely changing the ordinary UX.

Current backend pipeline remains:

```text
stage
→ validate
→ dry run
→ review
→ apply
```

Staff-facing entry becomes:

```text
BRING IN EXISTING DATA

What do you already have?

[ Products / Price List ]
[ Stock List ]
[ Rooms ]
[ Assets ]
[ Customers ]
[ Suppliers ]
[ Staff ]
```

---

# 31. Friendly upload

```text
Upload your spreadsheet

[ Choose Excel / CSV ]

or

[ Paste from Excel ]
```

CSV remains supported.

Add XLSX later if not currently available.

---

# 32. Column mapper

Instead of requiring canonical headers, show:

```text
WE FOUND 146 ITEMS

Your column          ServOS understands it as

Item Name       →    Product Name
Sell Price      →    Selling Price
Barcode No      →    Barcode
Qty             →    Starting Quantity
Store           →    Storage Place
```

Allow dropdown remapping.

---

# 33. Paste from Excel

Add:

```text
PASTE YOUR LIST
```

Example paste:

```text
Coke 300ml     120     24
Fanta 300ml    120     18
Sprite 300ml   120     12
```

ServOS infers:

```text
Column 1 → Product
Column 2 → Price
Column 3 → Quantity
```

Then asks:

```text
[ Looks Right ]
```

Users should not be forced to learn `external_id`.

---

# 34. Dependency resolution

If spreadsheet contains:

```text
Store = Main Store
```

and `Main Store` does not exist:

```text
We found a new storage place:

Main Store

☑ Create automatically
```

Likewise:

- product categories
- room types
- asset categories
- suppliers

provided creation is safe and unambiguous.

All generated dependency operations must appear in dry-run review.

---

# PHASE S16
# Smart Empty States

Empty screens become setup assistants.

## Rooms

```text
No rooms yet.

Let's add your first room.

You'll need:
• Room number
• Room type
• Price

[ Add First Room ]

Have many?
[ Import Room List ]
```

## Stock

```text
Nothing in stock yet.

[ Add First Item ]
[ Import Existing Stock ]
```

## Assets

```text
No assets recorded.

[ Scan First Asset ]
[ Import Asset List ]
```

---

# PHASE S17
# Human Error Language

Create a centralized error translator.

Add:

```text
src/native/errors/
  domainErrorMessages.ts
```

Do not expose errors such as:

```text
VALIDATION_FAILED
FOREIGN_KEY
VERSION_CONFLICT
UNIQUE_CONSTRAINT
```

when a useful human interpretation exists.

Example:

```text
This barcode already belongs to:

Coca-Cola 300ml

[ Open Existing Item ]
[ Use Another Barcode ]
```

Another:

```text
We couldn't create Coke because
"Main Store" doesn't exist yet.

[ Create Main Store ]
[ Choose Another Place ]
```

Developer details can remain in logs.

---

# PHASE S18
# Smart Defaults + Progressive Disclosure

Global rule:

> Ask only for data required to safely perform the action now.

Everything else should be:

1. inferred,
2. generated,
3. inherited,
4. defaulted,
5. or deferred.

---

# 35. Product

Initially ask:

```text
Name
Price
```

Then depending on item type:

```text
barcode
container
stock tracking
route
```

Hide advanced:

```text
tax class
internal SKU
recipe internals
outlet IDs
```

unless necessary.

---

# 36. Room

Initially:

```text
Room number
Room type
```

Inherit:

```text
capacity
rate
turnaround
housekeeping defaults
```

---

# 37. Asset

Initially:

```text
Name
Location
```

Generate:

```text
tag
status
basic category
```

---

# PHASE S19
# Business Presets

During initial setup ask:

```text
What kind of business is this?

[ Bar / Pub ]
[ Restaurant ]
[ Hotel / Lodge ]
[ Bar + Restaurant ]
[ Hotel + Restaurant ]
[ General Retail ]
```

Presets configure defaults, not rigid product limitations.

Example Bar:

```text
Main Bar
Main Store
BAR routing
bottle/ml units
common drink categories
```

Restaurant:

```text
Kitchen
Main Store
KITCHEN routing
food categories
recipe support
```

Hotel:

```text
Front Desk
Housekeeping
default turnaround
room workflows
```

Everything remains editable.

---

# PHASE S20
# Operational “Today” Screen

Build toward a small operational brain.

Example:

```text
TODAY

ACTION NEEDED

⚠ 4 low-stock products
⚠ Room 104 maintenance issue
● 3 guests arriving
● 1 delivery waiting
● Till needs closing

QUICK ACTIONS

[ Make Sale ]
[ Receive Delivery ]
[ Count Stock ]
[ New Booking ]
```

Generate cards from existing business state.

No new “task database” is necessary for the first version unless a real workflow requires persistence.

---

# PHASE S21
# Guided Help Integration

The simple workflows should teach themselves.

Use the ServOS Guidance System architecture already planned.

Initial guide definitions:

```text
servos.core
item.create
stock.count
stock.receive
stock.transfer
rooms.add
frontdesk.booking
assets.add
maintenance.report
imports.first-list
```

Example first stock count:

```text
COUNTING STOCK

1. Pick the place you're counting.
2. Scan items or type quantities.
3. Nothing changes until you press Finish Count.

[ Got It ]
[ Guide Me ]
```

Guidance must remain:

- offline
- permission-aware
- per staff member
- non-blocking
- restart durable where progress persistence is enabled

Avoid tutorial-slide overload.

Teach the real action.

---

# 38. Guidance anchors

New simplified screens should expose semantic anchors from the beginning:

```text
quick-add.open
quick-add.product
product.name
product.price
product.container-size
product.sale-formats

stock.count
stock.count.location
stock.count.scanner
stock.count.review

rooms.add
rooms.bulk-add

assets.add
maintenance.report
```

This avoids retrofitting brittle selectors later.

---

# PHASE S22
# Backend Orchestration Commands

Do not make the frontend responsible for coordinating five records atomically where consistency matters.

Introduce purpose-built commands where necessary.

Candidate examples:

```text
product.quickCreate
product.createVariant
product.addSaleFormat

room.quickCreate
room.bulkCreate

asset.quickCreate

inventory.commitCountSession
```

These names are illustrative.

Use names consistent with the existing command architecture.

---

# 39. Quick product command

A quick product creation command may orchestrate:

```text
product
stock item
barcode
opening balance
product-stock relation
default sale format
```

inside safe transaction boundaries.

If stock setup fails, don't leave a half-created product unless the domain explicitly permits it.

---

# 40. Room quick create command

Can orchestrate:

```text
create RoomType if explicitly requested
create default RatePlan
create Room
```

as a controlled transaction.

Do not silently create duplicate RoomTypes based purely on approximate names.

---

# 41. Bulk room command

Validate the full batch first:

```text
101–110
```

Then commit all or return a clear conflict report.

---

# PHASE S23
# Data Migration / Compatibility

Avoid unnecessary data rewrite.

## Existing products

Remain valid.

If a product does not have family/variant metadata:

```text
treat it as a standalone product variant
```

No migration requiring manual classification.

## Existing portions

Continue functioning.

They may become the first implementation of Sale Formats.

## Existing stock locations

Remain records.

Only display terminology changes to Storage Places.

## Existing assets

Remain unchanged.

Additional classification fields should be optional.

## Existing rooms

Remain unchanged.

Quick creation affects new records and editing UX.

---

# PHASE S24
# Tests

Add source and native tests per feature.

Suggested:

```text
tests/simple-navigation-source.test.mjs
tests/quick-add-source.test.mjs
tests/simple-product-source.test.mjs
tests/product-variant-source.test.mjs
tests/stock-count-source.test.mjs
tests/rooms-quick-create-source.test.mjs
tests/assets-quick-create-source.test.mjs
tests/friendly-errors-source.test.mjs
```

Native tests should cover new orchestration commands.

---

# 42. Required product tests

Test:

```text
750ml and 1L same brand remain separate stock
different barcodes remain independent
whole bottle deduction correct
30ml deduction correct
60ml deduction correct
whole + measured formats coexist
custom volume works
legacy product still works
kitchen item without recipe works
kitchen recipe consumes correct ingredients
```

---

# 43. Inventory count tests

Test:

```text
count draft does not alter stock
commit changes only final variances
wrong location cannot alter another location
duplicate command replay is safe
approval requirements remain enforced
restart behavior defined
audit trail identifies staff
```

---

# 44. Room tests

Test:

```text
single room quick create
bulk room range
duplicate number blocked
room type reuse
new room type + default rate
existing reservation rules unaffected
```

---

# 45. Asset tests

Test:

```text
generated tag unique
scanned tag unique
room assignment
storage-place assignment
existing asset lifecycle unchanged
maintenance report from asset
maintenance report from room
```

---

# PHASE S25
# UX Acceptance Testing

The real success criterion is not merely that tests compile.

Take a user unfamiliar with ServOS and ask them to perform:

```text
1. Add Coke 300ml.
2. Add Jameson 750ml sold as bottle, single and double.
3. Add Jameson 1L.
4. Add Chicken & Chips.
5. Add potatoes as a recipe ingredient.
6. Put stock in Main Store.
7. Count Main Store.
8. Move 12 Coke bottles to the bar.
9. Receive a supplier delivery.
10. Add rooms 101–110.
11. Add a TV to Room 104.
12. Report the Room 104 TV as broken.
13. Import an existing product spreadsheet.
```

Success means they can complete these without being taught concepts such as:

```text
stock master
external ID
rate plan
asset category
record collection
price rule
```

---

# Implementation order

Do NOT implement every visual redesign simultaneously.

Use this release sequence:

## Release A — Simplification Foundation

```text
S01 Unified Home
S02 Quick Add
S16 Empty States
S17 Human Errors
S18 Smart Defaults
```

Establish the interaction language.

---

## Release B — Products & Menu

```text
S03 Unified Item Creation
S04 Product Families / Variants / Sale Formats
S05 Smart Stock Creation
S06 Storage Places
```

This is the most important structural release.

---

## Release C — Inventory Floor Operations

```text
S07 Stock Home
S08 Location-first Count
S09 Move/Waste
S10 Receiving
S11 Barcode-first lookup
```

This is likely the highest immediate usability gain for deployed businesses.

---

## Release D — Hospitality Simplification

```text
S12 Rooms
Front Desk adjustments
Bulk room creation
Simple room types/rates
```

---

## Release E — Property

```text
S13 Assets
S14 Maintenance
```

---

## Release F — Existing Data

```text
S15 Friendly imports
Paste from Excel
Column mapping
Dependency creation
```

---

## Release G — Operational Intelligence

```text
S19 Business presets
S20 Today
```

---

## Release H — Embedded Training

```text
S21 Guidance integration
```

Guidance infrastructure can begin earlier, but the final guide definitions should target the simplified workflows rather than today's more complex interfaces.

---

## Release I — Domain Consolidation

```text
S22 orchestration commands
S23 compatibility cleanup
S24 automated tests
S25 usability acceptance
```

Some orchestration commands will naturally land alongside earlier releases rather than waiting until Release I.

---

# First concrete development sprint

The first sprint should produce one complete vertical slice:

```text
HOME
  ↓
+ ADD
  ↓
PRODUCT / MENU ITEM
  ↓
DRINK
  ↓
Jameson
  ↓
750ml Bottle
  ↓
Barcode
  ↓
Whole Bottle + 30ml + 60ml
  ↓
Track Stock
  ↓
Main Store
  ↓
Opening Quantity
  ↓
SAVE
  ↓
POS READY
  ↓
INVENTORY READY
```

And a second:

```text
+ ADD
  ↓
FOOD / KITCHEN ITEM
  ↓
Chicken & Chips
  ↓
KES 650
  ↓
Kitchen
  ↓
SAVE
  ↓
POS + KDS READY
  ↓
OPTIONAL INGREDIENT SETUP
```

If those two flows are excellent, they establish most of the architecture required for the rest of the patch.

---

# Recommended first files to touch

```text
src/native/NativeBarShell.tsx

src/native/NativeCatalogView.tsx
src/native/NativeInventoryView.tsx
src/native/NativeMasterDataView.tsx

src/native/NativeRoomsView.tsx
src/native/NativeFrontDeskView.tsx

src/native/NativeAssetsView.tsx
src/native/NativeImportCenterView.tsx

src/native/SetupWizard.tsx
src/native/importTemplates.ts
```

Add:

```text
src/native/NativeHomeView.tsx

src/native/quick-add/*
src/native/products/*
src/native/stock/*
src/native/errors/*

src/guidance/*
```

Native backend additions should only be made after identifying where existing commands already cover the required orchestration.

Reuse before adding new domain semantics.

---

# Key UX rules for every contributor

1. **One obvious primary action per screen.**
2. **Use real-world language.**
3. **Never require internal IDs.**
4. **Generate codes unless the user specifically needs control.**
5. **Scanning should work wherever it logically can.**
6. **Create dependencies inline.**
7. **Do not send users bouncing between modules.**
8. **Hide advanced fields until requested.**
9. **Preserve all audit and domain safeguards.**
10. **Explain consequences before destructive commits.**
11. **Do not expose backend errors when a human explanation is possible.**
12. **Empty screens should help users create their first record.**
13. **Permissions decide capability.**
14. **Roles may influence presentation, not domain authority.**
15. **Offline operation remains first class.**
16. **A task should usually be completable without Help.**
17. **Help should be contextual when needed.**
18. **Configuration belongs behind operations, not in front of them.**

---

# Final product philosophy

ServOS should be sophisticated underneath and almost boringly obvious above it.

The domain can understand:

```text
Products
StockItems
PriceRules
Portions
Recipes
InventoryMovements
ProcurementReceipts
RoomTypes
RatePlans
Folios
AssetEvents
MaintenanceOrders
ImportBatches
AuditEvents
```

The employee should understand:

```text
Add Coke
Add Chicken & Chips
Count Main Store
Move Drinks to Bar
Receive Delivery
Add Room 104
Check In Guest
Add TV
Report Broken Tap
```

That distinction is the heart of this patch.

**ServOS should absorb complexity instead of distributing it to the staff.**
\
