# ServOS Product + Inventory
## Operator-Friendly Item, Packaging, Portion, Recipe and Stock Management Specification

**Status:** Finish-line implementation specification  
**Clients:** ServOS Terminal + ServOS Web  
**Core principle:** **ServOS stores technical units. People enter physical reality.**

---

# 1. OBJECTIVE

The inventory engine may remain technically sophisticated.

The operator experience must not be.

An operator should never need to understand internal concepts such as:

```text
stock master
canonical base unit
scanUnitQuantity
average cost per ml
average cost per gram
product → stock foreign-key relationship
```

to perform ordinary work.

They should describe what happened in language matching the physical business.

Example:

```text
I bought 4 six-packs.
Each pack contains 6 cans.
A pack costs KES 900.
We sell each can for KES 250.
```

ServOS responds:

```text
24 cans received
KES 150 cost per can
KES 250 selling price
```

Likewise:

```text
I buy Jameson in 750 ml bottles.
A bottle costs KES 1,800.
We sell 30 ml shots, 60 ml doubles and whole bottles.
```

ServOS handles the arithmetic.

---

# 2. OPERATOR MENTAL MODEL

Every item is described by three questions.

## How do you buy it?

Examples:

```text
crate
case
six-pack
bottle
tray
bag
5 kg pack
25 kg sack
50 L keg
```

## How do you keep/count it?

Examples:

```text
bottles
cans
pieces
grams
millilitres
sealed bottles + open liquid
```

## How do you sell or use it?

Examples:

```text
whole can
whole bottle
30 ml shot
150 ml glass
200 g ingredient portion
recipe
service
```

That is the operator-facing product model.

ServOS derives the accounting model.

---

# 3. ONE PRIMARY ENTRY POINT

Replace ordinary:

```text
New Product
New Stock Item
Link Product to Stock
```

with:

# + Add Item

The wizard asks:

```text
What are you adding?
```

Options:

- Beer / soda / bottled drink.
- Spirit / liquor.
- Wine.
- Keg / dispenser drink.
- Ingredient bought by weight.
- Ingredient bought by piece/count.
- Menu dish.
- Batch recipe.
- Retail / packaged product.
- Service / non-stock item.

The wizard determines which internal records are needed.

---

# 4. SMART ITEM WIZARD

Shared domain flow:

```text
ItemTypeStep
↓
IdentityStep
↓
PurchasePackagingStep
↓
SellingBehaviorStep
↓
RecipeStep when applicable
↓
OpeningStockStep
↓
CalculationPreview
↓
Review
↓
Atomic Save
```

Terminal and Web must share:

- conversion functions;
- validation;
- calculated previews;
- command payload construction;
- product-type presets.

Do not implement two different inventory semantics.

---

# 5. MEASUREMENT MODES

Introduce:

```text
COUNT
WEIGHT
VOLUME
```

Canonical units:

```text
COUNT  → piece
WEIGHT → gram
VOLUME → millilitre
```

The operator may enter:

```text
COUNT
pieces
bottles
cans
packets
trays

WEIGHT
g
kg

VOLUME
ml
L
```

ServOS canonicalizes.

Examples:

```text
2.5 kg
→ 2,500 g
```

```text
1.5 L
→ 1,500 ml
```

Canonical units are for calculations, persistence and synchronization.

Friendly units are for humans.

---

# 6. PURCHASE PACKAGES

Packaging is first-class business data.

Example:

```text
COCA-COLA 330ML

Base count:
1 can

Purchase packages:
Single can = 1
Six-pack   = 6
Crate      = 24
```

Example:

```text
JAMESON 750ML

Canonical:
ml

Physical container:
Bottle = 750 ml

Purchase package:
Case = 12 bottles
```

Example:

```text
BEEF

Canonical:
g

Purchase package:
5 kg pack = 5,000 g
```

Suggested internal structure:

```ts
PurchasePackage {
  id: string
  name: string
  packageType: string
  measurementMode: 'COUNT' | 'WEIGHT' | 'VOLUME'
  canonicalQuantity: number
  containerCount?: number
  barcode?: string
  preferred?: boolean
}
```

---

# 7. MULTIPLE BARCODES PER ITEM

An item may have:

```text
individual barcode
pack barcode
crate/case barcode
supplier barcode
internal barcode
```

Each alias knows how much stock it represents.

Example:

```text
barcode A
→ 1 can

barcode B
→ 6 cans

barcode C
→ 24 cans
```

Scanning during receiving automatically chooses the correct quantity conversion.

Unknown barcode:

```text
NEW BARCODE

6161100766013

This barcode is not in ServOS.

[ Add this item ]
[ Link to existing item ]
```

The captured barcode pre-fills the wizard.

---

# 8. PACKAGE COST ENTRY

Never ask a normal operator for:

```text
average unit cost
```

Ask:

```text
What does the pack cost you?
```

Example:

```text
Pack contains:
6 cans

Whole pack cost:
KES 900
```

ServOS shows:

```text
ServOS calculated

Pack quantity       6 cans
Pack cost           KES 900
Cost per can        KES 150
```

For ambiguous forms:

```text
KES 900 is:

● Cost of the entire pack
○ Cost of one can
```

The selected interpretation must be visible before Save.

---

# 9. PACKAGE RECEIVING

Receiving mirrors the physical supplier delivery.

Example:

```text
COCA-COLA 330ML

What arrived?
4 six-packs

Pack size:
6 cans

Supplier charged:
KES 900 per pack
```

Preview:

```text
ServOS will receive:

4 packs
24 cans

Supplier value:
KES 3,600

Calculated cost:
KES 150 / can
```

Commit performs:

- receipt validation;
- package conversion;
- stock movement;
- receipt record;
- weighted-average cost;
- reference/invoice evidence;
- audit;
- synchronization event.

---

# 10. WEIGHT-BASED INGREDIENTS

Example:

```text
ADD INGREDIENT

Beef

How do you buy it?
5 kg pack

What does one pack cost?
KES 3,500
```

ServOS:

```text
5 kg = 5,000 g

Cost per gram:
KES 0.70
```

The user does not enter 5,000.

The user does not calculate 0.70.

---

# 11. COUNT-BASED INGREDIENTS

Example:

```text
Eggs

How do you buy them?
Tray

Eggs per tray:
30

Tray cost:
KES 450
```

ServOS:

```text
1 tray = 30 eggs
Cost per egg = KES 15
```

A recipe can then consume:

```text
2 eggs
```

without additional conversion.

---

# 12. PORTIONED DRINK MODEL

Portioned drinks include:

- whisky;
- gin;
- vodka;
- rum;
- tequila;
- wine by glass;
- draft/keg beverages;
- other liquids sold in measured servings.

Example:

```text
Jameson

Bottle:
750 ml

Purchase cost:
KES 1,800
```

Selling formats:

```text
Single Shot     30 ml    KES 200
Double          60 ml    KES 350
Whole Bottle   750 ml    KES 4,500
```

ServOS calculates:

```text
Single cost:
KES 72

Double cost:
KES 144

Bottle cost:
KES 1,800

Theoretical single-shot yield:
25
```

---

# 13. SEALED CONTAINERS VS OPEN LIQUID

A product that supports whole-container sales cannot use aggregate volume alone.

These states differ:

```text
2 sealed × 750 ml bottles
```

and:

```text
3 opened bottles with 500 ml each
```

Both total 1,500 ml.

Only the first state can satisfy two whole-bottle sales.

Therefore portioned container stock tracks:

```text
sealedContainers
openQuantity
```

per location.

Display:

```text
JAMESON 750ML

8 sealed bottles
420 ml open

Equivalent volume:
6,420 ml
```

---

# 14. AUTO-OPENING A CONTAINER

If an operator sells:

```text
30 ml shot
```

and:

```text
open quantity = 20 ml
sealed bottles = 8
```

ServOS may perform:

```text
open bottle
+750 ml open

open quantity:
770 ml

serve:
-30 ml

remaining open:
740 ml

sealed bottles:
7
```

The entire stock effect must be atomic.

The operator never performs this arithmetic.

---

# 15. WHOLE BOTTLE SALES

Whole-bottle sale consumes:

```text
1 sealed container
```

not merely:

```text
750 ml from total volume
```

If:

```text
sealed = 0
open = 1,500 ml
```

a whole bottle sale must not succeed.

ServOS may still have enough liquid for shots, but not a sealed bottle.

---

# 16. BEER AND SODA

Do not track liquid volume when the product is always sold whole.

Ask:

```text
Do you ever sell only part of an opened container?
```

For ordinary bottled beer:

```text
No
```

Therefore:

```text
measurementMode = COUNT
```

`500 ml` remains descriptive variant information.

For whisky:

```text
Yes
```

Therefore:

```text
measurementMode = VOLUME
```

---

# 17. MENU DISHES

Example:

```text
Beef Stew
Selling price: KES 550
```

Recipe:

```text
Beef          200 g
Tomatoes       80 g
Onion          40 g
Oil            20 ml
Spice Mix       8 g
```

ServOS calculates:

- ingredient cost;
- total food cost;
- theoretical gross difference;
- stock availability;
- theoretical portions.

POS sale:

```text
Beef Stew × 1
```

atomically consumes the recipe ingredients.

---

# 18. BATCH RECIPES

Support:

## Per-serving

```text
1 serving:

Beef       200 g
Potato     250 g
```

and:

## Batch

```text
Rice       2 kg
Oil        200 ml
Salt        30 g

Batch yield:
20 portions
```

ServOS derives:

```text
Rice per serving      100 g
Oil per serving        10 ml
Salt per serving      1.5 g
```

Kitchen staff do not perform division.

---

# 19. PORTIONS AVAILABLE

Stock detail should provide operational estimates.

Example:

```text
Beef
12 kg available

At 200 g per serving:
≈ 60 servings
```

```text
Jameson
8,400 ml equivalent

At 30 ml per shot:
≈ 280 shot equivalents
```

These are derived estimates.

Always retain canonical stock quantity underneath for authoritative calculations.

---

# 20. STOCK COUNT

Stock count uses package vocabulary.

## Packaged item

```text
Coke

Full six-packs:
3

Loose cans:
4

ServOS count:
22 cans
```

## Weight

```text
Beef

Full 5 kg packs:
2

Loose/open:
1.2 kg

ServOS count:
11.2 kg
```

## Portion-controlled drink

```text
Jameson

Sealed bottles:
8

Open liquid:
420 ml
```

The committed count converts to canonical quantities and records adjustment movement(s).

---

# 21. TRANSFER

Transfer accepts operator-friendly units.

Example:

```text
Transfer Coke

From:
Main Store

To:
Main Bar

2 six-packs
3 loose cans

ServOS will move:
15 cans
```

Record:

```text
TRANSFER_OUT
TRANSFER_IN
```

atomically.

---

# 22. WASTE

Example:

```text
Waste Jameson

What was lost?

○ ml
● Shots
○ Bottle

Shots:
2

Shot size:
30 ml
```

ServOS:

```text
Waste:
60 ml
```

Require reason:

```text
Spillage
Breakage
Spoilage
Expired
Kitchen loss
Other
```

---

# 23. ADMIN STOCK CORRECTION

## Purpose

The application must support intentional correction of stock quantities when the recorded quantity is wrong because of a data-entry or migration mistake.

Typical examples:

- operator entered 40 instead of 4;
- six-pack was interpreted as one can;
- crate quantity was entered twice;
- opening inventory had the wrong figure;
- migration/import conversion was incorrect;
- receiving was entered against the wrong location;
- an old external system supplied incorrect opening data.

This is different from:

- physical stock count;
- waste;
- receiving;
- transfer.

The user intent is:

> **The recorded system quantity is wrong and an authorized Admin needs to correct it.**

---

# 24. ADMIN CORRECTION UX

From item detail:

```text
Coca-Cola 330 ml

MAIN BAR
45 cans on hand

[ Receive ]
[ Count ]
[ Transfer ]
[ Waste ]

ADMIN
[ Correct recorded quantity ]
```

Dialog:

```text
CORRECT RECORDED QUANTITY

Coca-Cola 330 ml
Main Bar

ServOS currently has:
45 cans

Correct quantity:
[ 39 ] cans

────────────────────────

ServOS will record:

Before        45
After         39
Difference    -6 cans

Reason
[ Data entry mistake ▼ ]

Details
[ Delivery was entered as 5 packs rather than 4 ]

Reference
[ Optional invoice / receipt / note ]

────────────────────────

The previous records will not be deleted.
This correction will appear in stock history and audit.

[ Cancel ]
[ Correct to 39 cans ]
```

---

# 25. CORRECTION PERMISSION

Introduce:

```text
inventory.correct_quantity
```

Default role policy:

| Role | Correct quantity |
|---|---|
| Admin | Yes |
| Manager | No |
| Server / Operator | No |

This must be distinct from:

```text
inventory.count
inventory.adjust
inventory.receive
inventory.transfer
inventory.waste
```

because the ability to perform an ordinary stock count must not automatically allow historical data correction.

The capability may later be delegated explicitly, but default policy remains Admin-only.

---

# 26. CORRECTION COMMAND

Canonical operation:

```text
inventory.correctQuantity
```

Example payload:

```ts
{
  stockItemId: "coke-330",
  locationId: "main-bar",
  targetQuantity: 39,
  expectedVersion: 18,
  reasonCode: "DATA_ENTRY_ERROR",
  reason: "Delivery entered as five six-packs instead of four",
  reference: "INV-3821"
}
```

Backend calculates:

```text
current = authoritative quantity
delta = target - current
```

The client does not determine authoritative delta.

---

# 27. CORRECTION MOVEMENT

Never:

```text
UPDATE stockItems
SET currentStock = ...
```

as an unaudited mutation.

Instead produce:

```text
ADMIN_CORRECTION
```

with:

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

Example:

```text
beforeQuantity = 45
afterQuantity  = 39
quantityDelta  = -6
movementType   = ADMIN_CORRECTION
```

The resulting current quantity changes through the inventory transaction boundary.

---

# 28. CORRECTION REASON CODES

Initial set:

```text
DATA_ENTRY_ERROR
OPENING_BALANCE_ERROR
RECEIVING_ENTRY_ERROR
PACKAGE_CONVERSION_ERROR
WRONG_LOCATION
IMPORT_ERROR
MIGRATION_RECONCILIATION
OTHER
```

A human-readable explanation remains mandatory.

`OTHER` requires detailed notes.

---

# 29. ADMIN RE-AUTHENTICATION

Because this action changes authoritative inventory without a physical count workflow, require confirmation of Admin identity.

Terminal:

```text
Admin PIN
```

Web:

- current authenticated Admin session;
- sensitive-action re-authentication where supported;
- otherwise explicit confirmation with short-lived approval token.

Do not rely only on a button being hidden.

Backend permission remains authoritative.

---

# 30. CORRECTION CONCURRENCY

Correction must use optimistic concurrency.

Scenario:

```text
Admin opens item.

Current:
45 cans
version 18

Cashier sells 2 cans.

Current:
43 cans
version 19

Admin submits:
target 39
expected version 18
```

Result:

```text
CONFLICT
```

UI:

```text
Stock changed while this correction was open.

Previous:
45

Current:
43

Review the quantity again before correcting.
```

Do not apply:

```text
45 → 39
```

against stale information.

---

# 31. CORRECTION IDEMPOTENCY

Each correction has stable command ID.

Retrying after a network timeout must return the existing result.

It must never apply the delta twice.

---

# 32. CORRECTION FOR PACKAGED STOCK

The correction form should accept package quantities.

Example:

```text
Recorded:
3 six-packs + 5 loose cans

ServOS:
23 cans

Correct:
2 six-packs + 5 loose cans

ServOS:
17 cans

Adjustment:
-6 cans
```

Persist canonical result:

```text
17 pieces
```

with correction metadata.

---

# 33. CORRECTION FOR WEIGHT

Example:

```text
Beef

Recorded:
12.5 kg

Correct:
11.8 kg

ServOS adjustment:
-700 g
```

Persist:

```text
target = 11,800 g
delta  = -700 g
```

The Admin can work in kg.

---

# 34. CORRECTION FOR PORTIONED DRINKS

Because sealed containers and open quantity have different commercial meanings, the correction screen must preserve them.

Example:

```text
Jameson 750 ml

Recorded:

5 sealed bottles
420 ml open

Correct:

4 sealed bottles
390 ml open
```

Preview:

```text
Sealed:
5 → 4

Open:
420 ml → 390 ml

Equivalent canonical change:
-780 ml
```

Record:

- sealed before/after;
- open before/after;
- canonical delta;
- reason;
- actor.

Do not reduce this to an unexplained `-780 ml` movement in the UI.

---

# 35. CORRECTION HISTORY

Item detail:

```text
RECENT STOCK ACTIVITY

Today 14:32
ADMIN CORRECTION
45 → 39 cans
-6

Admin:
Jane Mwangi

Reason:
Delivery entry error

Reference:
INV-3821
```

Admin corrections appear in:

- item history;
- stock movement ledger;
- audit;
- daily activity;
- Admin reports;
- synchronization activity;
- variance review.

---

# 36. EXISTING `inventory.adjust`

Current Native code contains an `inventory.adjust` path that sets a counted target and emits a count adjustment.

It currently checks `inventory.count`.

That contract must not remain ambiguous.

Migration approach:

```text
existing inventory.adjust
↓
compatibility wrapper / deprecated operation
↓
inventory.correctQuantity
```

The dedicated new operation owns Admin correction semantics.

Do not reuse ordinary physical count permissions.

Cloud v2 must gain matching semantics before Web exposes the action.

---

# 37. OPENING INVENTORY

Opening stock remains setup-only.

Operator experience:

```text
How much stock do you have right now?
```

using package-friendly quantities.

Example:

```text
Coke

12 full six-packs
5 loose cans
```

ServOS derives:

```text
77 cans
```

Opening movement:

```text
OPENING_BALANCE
```

Opening stock must not be used as an after-Go-Live correction mechanism.

After Go Live use:

- Receive.
- Count.
- Waste.
- Transfer.
- Admin Correction.

---

# 38. COST MANAGEMENT

Normal item creation should not expose normalized average cost.

Cost changes after stock exists come from:

- procurement receiving;
- supplier receipts;
- controlled corrections where specifically supported;
- migration reconciliation.

Average cost is calculated state.

Advanced manager detail may display it.

---

# 39. SKU / INTERNAL CODE

Generate automatically where possible.

Example:

```text
Jameson 750 ml
→ JAM-750-001
```

Display under:

```text
More options
```

Allow authorized override.

Normal operator need not invent internal identifiers.

---

# 40. ITEM DETAIL

Example:

```text
JAMESON 750ML

ON HAND
8 sealed bottles
420 ml open

SELLING
Single Shot       30 ml       KES 200
Double            60 ml       KES 350
Bottle           750 ml       KES 4,500

BUYING
750 ml bottle
Latest cost                    KES 1,800

YIELD
25 single shots / bottle

COST
Single                         KES 72
Double                         KES 144
Bottle                         KES 1,800

LOCATION
Main Bar

[ Receive ]
[ Count ]
[ Transfer ]
[ Waste ]

ADMIN
[ Correct recorded quantity ]
```

Do not make the primary detail page look like a database row.

---

# 41. INVENTORY NAVIGATION

Recommended structure:

```text
ITEMS & MENU

All
Drinks
Food
Ingredients
Retail

+ Add Item


STOCK

On Hand
Low Stock
Count Stock
Receive Delivery
Transfer
Waste


RECIPES

Menu Dishes
Drink Portions
Batch Recipes


ADVANCED

Stock Masters
Package Definitions
Barcode Aliases
Cost History
Archived Items
Admin Corrections
```

Normal staff may never need Advanced.

---

# 42. ROLE-SPECIFIC SIMPLICITY

## Cashier

Needs:

- POS;
- serving choices;
- basic item availability;
- contextual Help.

Does not need:

- package cost;
- average cost;
- recipe configuration;
- stock correction.

## Storekeeper

Needs:

- receive;
- count;
- transfer;
- waste;
- scanner.

Does not need:

- accounting internals;
- menu layout;
- Admin correction.

## Kitchen / Bar Manager

Needs:

- Items & Menu;
- recipes;
- portions;
- package definitions;
- costs where permitted.

## Admin

Needs:

- all configuration;
- advanced inventory;
- controlled correction;
- imports;
- audit;
- reporting.

---

# 43. HELP CENTER

Help must not look like README/Markdown output.

Keep documentation files as a source if useful.

Render structured application components.

Home:

```text
HELP & TRAINING

What are you trying to do?
[ Search ]

COMMON TASKS

[ Add an item ]
[ Receive delivery ]
[ Count stock ]
[ Correct stock mistake ]
[ Sell a shot ]
[ Sell whole bottle ]
[ Add food ingredient ]
[ Build a recipe ]
```

---

# 44. STRUCTURED HELP CONTENT

Help entries move toward:

```ts
{
  id,
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

UI components:

- task title;
- "when to use";
- example card;
- numbered action cards;
- calculated result;
- common mistake warning;
- success definition;
- Show Me;
- related tasks.

Avoid:

```text
whitespace-pre-wrap
```

as the primary article presentation.

---

# 45. EXAMPLE HELP: SELL LIQUOR BY SHOT

```text
SELL LIQUOR BY THE SHOT

Use this when:
You buy a full bottle but sell smaller measured servings.

Example:

Jameson bottle    750 ml
Single shot        30 ml

ServOS calculates:
25 single shots / bottle

DO THIS

1. Add Item
2. Choose Spirit / Liquor
3. Enter 750 ml bottle
4. Enter purchase cost
5. Add 30 ml Single
6. Add 60 ml Double
7. Add Whole Bottle if offered
8. Review ServOS calculation
9. Save

SERVOS HANDLES

✓ ml conversion
✓ cost per shot
✓ stock deduction
✓ opening a new bottle
✓ sealed bottle availability
✓ whole bottle sales
✓ margin calculations

[ Show me ]
```

---

# 46. CONTEXT HELP

Example:

```text
Whole pack cost [?]
```

Popover:

```text
Enter what your supplier charges for the complete pack.

Example:

6 cans cost KES 900.

Enter:
900

ServOS calculates:
KES 150 per can.
```

Example:

```text
Serving size [?]
```

Popover:

```text
This is how much inventory one sale consumes.

Example:

Single whisky shot:
30 ml
```

Help answers the immediate question without leaving the workflow.

---

# 47. “SHOW ME” TRAINING

Product/inventory guides:

```text
inventory.add-item
inventory.add-packaged-drink
inventory.receive-delivery
inventory.count-location
inventory.transfer-stock
inventory.record-waste
inventory.admin-correction

bar.configure-spirit
bar.sell-shot
bar.sell-whole-bottle

kitchen.add-weight-ingredient
kitchen.create-dish
kitchen.create-batch
```

Interactive guides advance after successful operations.

A button click is not enough.

---

# 48. ATOMIC ITEM CREATION

The final creation command should atomically create all applicable pieces:

```text
product
stock item
measurement configuration
package definitions
barcode aliases
selling formats
recipe links
opening inventory
cost data
```

One failure:

```text
ROLLBACK EVERYTHING
```

No orphaned product.

No orphaned stock master.

No product linked to a failed stock setup.

---

# 49. WEB + TERMINAL PARITY

Every Product/Inventory workflow needs parity status:

```text
Terminal UI
Native backend
Cloud backend
Web UI
Offline eligibility
Acceptance test
```

Particularly:

```text
Add Item
Receive
Count
Transfer
Waste
Admin Correction
Portioned drinks
Recipes
Batch recipes
Barcode packages
```

---

# 50. ACCEPTANCE TESTS

## Six-pack calculation

Input:

```text
pack = 6
packs received = 4
pack cost = 900
```

Expected:

```text
quantity = 24
unit cost = 150
total = 3,600
```

## Kilogram conversion

```text
5 kg
→ 5,000 g
```

## Litre conversion

```text
1.5 L
→ 1,500 ml
```

## Whisky yield

```text
750 ml / 30 ml
→ 25
```

## Whole bottle

```text
sealed = 8
sell bottle
→ sealed = 7
```

## Shot

```text
open = 420 ml
sell 30 ml
→ open = 390 ml
```

## Automatic bottle open

```text
sealed = 8
open = 20 ml
sell = 30 ml

→ sealed = 7
→ open = 740 ml
```

## Recipe sale

```text
Beef Stew sale
→ Beef -200 g
→ Tomato -80 g
→ Onion -40 g
→ Oil -20 ml
```

## Admin correction

```text
current = 45
target = 39

→ ADMIN_CORRECTION
→ delta -6
→ final 39
```

## Stale correction

```text
dialog version 18
current server version 19

→ CONFLICT
```

## Duplicate correction retry

```text
same command ID twice

→ one movement only
```

## Permission

```text
Admin
→ allowed

Manager default
→ forbidden

Server
→ forbidden
```

---

# 51. IMPLEMENTATION ORDER

```text
1. MeasurementMode domain types
2. Conversion functions
3. PurchasePackage contract
4. Barcode alias contract
5. SmartItemWizard state model
6. CalculationPreview
7. Packaged-drink flow
8. Weight ingredient flow
9. Atomic create command
10. Receiving package UX
11. Package-aware counts
12. Package-aware transfer/waste
13. inventory.correct_quantity permission
14. inventory.correctQuantity backend
15. Terminal Admin correction UI
16. Web Admin correction UI
17. Admin correction tests
18. Sealed/open drink domain model
19. Spirit serving integration
20. Whole-bottle inventory rules
21. Food recipes
22. Batch recipes
23. POS consumption integration
24. Structured Help rendering
25. Product/Inventory guides
26. Full Terminal/Web parity suite
```

---

# 52. NON-NEGOTIABLE INVENTORY RULES

1. Every stock-changing business action leaves an immutable movement.

2. Never silently overwrite stock history.

3. Admin correction changes the current balance through an audited correction movement.

4. Package conversions are calculated by ServOS.

5. Costs are calculated from real purchase events wherever possible.

6. Canonical units remain authoritative beneath operator-friendly units.

7. Whole sealed containers and opened liquid remain distinguishable when commercially necessary.

8. Product creation involving stock must be atomic.

9. Duplicate commands must be idempotent.

10. Stale quantity changes must conflict.

11. Terminal and Web must produce identical inventory results for identical commands.

12. Help should teach the operator inside the workflow.

---

# FINAL PRODUCT PRINCIPLE

The bartender says:

> I sold a double.

The kitchen manager says:

> One plate uses 200 g of beef.

The storekeeper says:

> I received four six-packs.

The Admin says:

> This was keyed as 45 cans, but it should have been 39.

ServOS translates those statements into:

- canonical quantities;
- inventory movements;
- costs;
- audit events;
- synchronization commands;
- reports;
- historical evidence.

**The person operates the business. ServOS handles the arithmetic and record integrity.**