Yes. The current inventory model is technically capable, but too much of its internal accounting vocabulary leaks into the operator experience.

The operator should never need to understand **stock master**, **base unit**, **scan unit quantity**, **average unit cost**, or manually work out how a six-pack becomes six cans. Those are ServOS problems.

The operator should answer questions such as:

> “I bought 4 six-packs.”  
> “Each pack has 6 cans.”  
> “The whole pack costs KES 900.”  
> “I sell each can for KES 250.”

ServOS should respond:

> **24 cans added. Cost per can: KES 150.**

Likewise:

> “I buy Jameson in 750 ml bottles for KES 1,800.”  
> “We sell 30 ml shots, 60 ml doubles and whole bottles.”

ServOS should figure out all the arithmetic, stock consumption and costing.

This is exactly the kind of simplification we need now because the system already has substantial POS, inventory, procurement, credit, hospitality and administrative capability. :chatgpt-content-reference{index="0"}

# 1. Stop making users create “Products” and “Stock Items”

Internally those concepts should remain.

Externally, the primary action becomes simply:

## **+ Add Item**

Then ServOS asks:

| What are you adding? | Example |
|---|---|
| Packaged item | Beer, soda, bottled water |
| Drink sold in portions | Whisky, vodka, wine, keg beer |
| Food ingredient | Beef, chicken, rice, flour, potatoes |
| Menu dish | Beef stew, chicken & chips, ugali |
| Retail item | Cigarettes, snacks, toiletries |
| Service / non-stock item | Laundry, room service fee |

The system determines whether it needs a stock record, product record, recipe, serving definitions, or nothing at all.

The current Native `QuickProductDialog` has already started down this road with drink/food/retail/service types, packaging, container size, stock creation and servings. That work should become the **canonical shared Item Wizard** rather than adding more fields to it.

---

# 2. The central mental model should be three questions

Every stocked thing can be explained to an operator with:

### **How do you buy it?**

### **How do you keep/count it?**

### **How do you sell or use it?**

That should drive the entire inventory engine.

For example:

| Item | Buy | Keep/Count | Sell/Use |
|---|---|---|---|
| Tusker | crate of 24 | bottles | bottle |
| Coke | 6-pack | cans | can |
| Jameson | 750 ml bottle / case | sealed bottles + opened ml | shot / double / bottle |
| Wine | 750 ml bottle | sealed bottles + opened ml | glass / bottle |
| Keg beer | 50 L keg | ml | 500 ml glass |
| Beef | 5 kg pack | grams | recipe ingredient / 200 g portion |
| Rice | 25 kg sack | grams | recipe ingredient |
| Eggs | tray of 30 | pieces | recipe ingredient |
| Chips | 10 kg potatoes | grams | menu recipe |
| Cigarettes | carton / packet | packets or sticks | packet / stick |

Everything underneath can still use canonical units.

But operators never need to see the machinery unless they open **Advanced**.

---

# 3. A six-pack should take seconds to add

Current Web asks for things like:

> Base unit  
> Quantity represented by one scan  
> Average unit cost

That is backwards from how a person thinks.

The new interaction should be:

```text
ADD ITEM

Coca-Cola 330ml
────────────────────────────

How do you receive it?

[ Single ] [ Pack ] [ Crate / Case ]

Pack ✓

How many cans in one pack?
[ 6 ]

What does one full pack cost you?
KES [ 900 ]

Where do you keep it?
[ Bar Store ▼ ]

How do you sell it?
● Individual cans

Selling price per can
KES [ 250 ]

────────────────────────────
SERVOS CALCULATED

1 pack          = 6 cans
Cost per can    = KES 150
Selling price   = KES 250
Gross difference = KES 100 / can

[ Save item ]
```

No division.

No “average unit cost”.

No “scan-unit quantity”.

No stock linkage.

ServOS produces those.

---

# 4. The purchase-price field needs to be idiot-resistant

Not because operators are idiots. Because price-entry ambiguity is terrible UI.

If an operator says:

```text
Pack contains: 6
Cost: KES 900
```

there should be a clear selector:

```text
KES 900 is:

● The price of the whole pack
○ The price of one can
```

Default to **whole pack** because the operator said they buy it as a pack.

And immediately show:

> **ServOS will record each can at KES 150 cost.**

That confirmation sentence is critical.

If they choose “price of one can”:

> **ServOS will record this 6-pack at KES 5,400 total cost.**

The operator will immediately catch the mistake.

---

# 5. Receiving stock becomes equally simple

A delivery screen should not ask the storekeeper for normalized quantities.

For Coke:

```text
COCA-COLA 330ML

What arrived?

[ 4 ] packs

6 cans per pack

Supplier charged:

● KES [ 900 ] per pack
○ KES [ 3,600 ] total for this line

────────────────────────────

ServOS will receive:

4 packs
24 cans
KES 3,600 stock value
KES 150 cost per can

[ Receive 24 cans ]
```

Whether they know multiplication is irrelevant.

ServOS does it.

---

# 6. Drinks need a special “opened container” model

This is important.

Tracking Jameson simply as `750 ml` is not sufficient if you sell both:

- shots
- whole bottles

Imagine the system says there are 1,500 ml available.

That could mean:

```text
2 sealed bottles
```

or:

```text
500 ml in bottle A
500 ml in bottle B
500 ml in bottle C
```

Those are **not commercially equivalent**.

You can sell two whole bottles in the first case.

You cannot sell two sealed bottles in the second case.

So portioned drinks need two stock states:

```text
SEALED CONTAINERS
+
OPEN QUANTITY
```

For each location.

Jameson could display:

> **Jameson 750 ml**  
> 8 sealed bottles  
> 420 ml open  
> ≈ 14 × 30 ml shots remaining in open stock

That is far more useful to a bar operator than:

> 6,420 ml

---

# 7. Selling a shot should automatically open bottles

Example configuration:

```text
Jameson
Bottle: 750 ml
Purchase cost: KES 1,800
```

Operator chooses:

### How do you sell it?

```text
☑ Shot       30 ml    KES 200
☑ Double     60 ml    KES 350
☑ Bottle    750 ml    KES 4,500
```

ServOS calculates:

| Selling option | Stock used | Cost |
|---|---:|---:|
| Shot | 30 ml | KES 72 |
| Double | 60 ml | KES 144 |
| Bottle | 1 sealed 750 ml bottle | KES 1,800 |

It can also say:

> **1 bottle contains 25 × 30 ml shots.**

If the bartender sells a shot and there is 20 ml left in the current bottle:

```text
20 ml open
+
automatically open 1 sealed bottle
↓
770 ml available
↓
serve 30 ml
↓
740 ml remains open
```

No bartender performs this arithmetic.

ServOS does.

---

# 8. The POS becomes much cleaner too

The cashier sees one Jameson tile.

Tap it:

```text
JAMESON

How are you selling it?

┌────────────┐
│ SHOT       │
│ 30 ml      │
│ KES 200    │
└────────────┘

┌────────────┐
│ DOUBLE     │
│ 60 ml      │
│ KES 350    │
└────────────┘

┌────────────┐
│ BOTTLE     │
│ 750 ml     │
│ KES 4,500  │
└────────────┘
```

All three consume the same underlying Jameson inventory correctly.

That is much better than creating “Jameson Shot”, “Jameson Double” and “Jameson Bottle” as unrelated products and then trying to keep stock synchronized.

---

# 9. Give bars sensible presets

When the operator selects:

## Spirit / Liquor

ServOS can immediately suggest:

```text
Bottle size:
[ 750 ml ▼ ]

Selling options:
☑ Single shot    [30] ml
☑ Double         [60] ml
☐ Whole bottle
```

The business can have defaults:

```text
Default spirit shot     30 ml
Default double           60 ml
Default wine glass      150 ml
Default beer glass      500 ml
```

Then adding another whisky becomes almost:

```text
Jameson
750ml
Cost 1800
Shot 200
Bottle 4500
SAVE
```

That is the speed target.

---

# 10. Beer and soda should not automatically use ml

A 500 ml Tusker bottle normally does not need liquid-level tracking if nobody sells half a Tusker.

So ServOS asks:

> **Do you ever open this container and sell only part of it?**

For beer:

**No**

ServOS tracks:

```text
1 bottle = 1 stock unit
```

The 500 ml is descriptive.

For whisky:

**Yes**

ServOS tracks:

```text
1 bottle = 750 ml usable stock
```

This one question can eliminate a remarkable amount of configuration complexity.

---

# 11. Gram-based food should use exactly the same philosophy

Take beef.

The operator knows:

> “Supplier gives me a 5 kg pack and charges KES 3,500.”

That is enough.

```text
ADD INGREDIENT

Beef

How do you buy it?

[ 5 ] [ kg ]

What does that pack cost?
KES [ 3,500 ]

ServOS calculated:
5 kg = 5,000 g
Cost = KES 0.70 / g

[ Save ]
```

Internally:

```text
baseUnit = g
quantity = 5000
unitCost = 0.70
```

But there is absolutely no reason to make the operator type those numbers.

---

# 12. Menu dishes then consume grams

Take:

## Beef Stew

The operator creates the menu item:

```text
Beef Stew
Selling price: KES 550
```

Then:

### What goes into one serving?

```text
Beef             200 g
Tomatoes          80 g
Onions             40 g
Cooking oil        20 ml
Spice mix           8 g
```

ServOS automatically calculates the plate cost.

For example:

```text
Beef              KES 140
Tomatoes            12
Onions                8
Oil                  10
Spices                6
────────────────────────
Ingredient cost    KES 176

Selling price      KES 550
```

The POS operator only sells:

> Beef Stew × 1

ServOS deducts the ingredients.

---

# 13. But batch cooking needs an even easier mode

Kitchen staff often do **not** think:

> “Every plate contains 83 grams of dry rice.”

They think:

> “We cooked 2 kg rice and got about 20 portions.”

So recipes need two modes.

### Per-serving recipe

```text
1 plate:
Beef 200g
Potatoes 250g
```

### Batch recipe

```text
This batch uses:

Rice      2 kg
Oil       200 ml
Salt      30 g

This batch makes:
[ 20 ] portions
```

ServOS calculates:

```text
Rice per serving = 100g
Oil per serving  = 10ml
Salt per serving = 1.5g
```

Again, no division required.

This is particularly useful for:

- rice;
- stew;
- soups;
- sauces;
- pilau;
- beans;
- mashed potatoes;
- dough;
- cocktails made in batches;
- juice;
- sauces.

---

# 14. “How many portions can I sell?” becomes useful information

For 12 kg beef and a 200 g recipe portion:

ServOS should show:

> **≈ 60 beef portions available**

For 8,400 ml whisky and a 30 ml shot:

> **≈ 280 shots equivalent**

For potatoes:

> **24.5 kg on hand**  
> ≈ 98 × 250 g portions

These numbers are much more useful operationally than raw stock quantities alone.

You can still display the raw value underneath.

---

# 15. Stock counting should use the same packaging language

Do not ask:

> Counted quantity: `18450 ml`

Ask:

```text
JAMESON 750ML

Sealed bottles
[ 8 ]

Opened bottle remaining
[ 420 ] ml

ServOS count:
6,420 ml total
8 sealed bottles + 420 ml open
```

For Coke:

```text
Full 6-packs:
[ 3 ]

Loose cans:
[ 4 ]

ServOS count:
22 cans
```

For beef:

```text
Full 5kg packs:
[ 2 ]

Loose / open:
[ 1.2 ] kg

ServOS count:
11.2 kg
```

That will make physical stocktaking dramatically faster.

---

# 16. Transfer and waste need the same treatment

Instead of:

> Quantity: 450

Use:

```text
Waste Jameson

What was lost?

○ ml
● Shots
○ Bottle

Shots:
[ 2 ]

Shot size: 30 ml

ServOS will record:
60 ml waste

Reason:
[ Spillage ▼ ]
```

Similarly:

```text
Transfer Coke

[ 2 ] six-packs
[ 3 ] loose cans

Bar Store
→ Main Bar

Total:
15 cans
```

Operators should stay in the **physical vocabulary of the store**.

---

# 17. Average cost should almost disappear from the UI

The current software exposes **Average unit cost**.

I would hide it from normal item creation.

Average cost is a result.

Not ordinary user input.

The operator inputs:

```text
What arrived?
How much did you pay?
```

ServOS calculates weighted average cost from receiving events.

Only during initial setup/opening inventory do we need a cost.

Even then:

> “What did one case/bag/bottle cost?”

not:

> “Average cost per base unit?”

Advanced accounting screens can expose the normalized number.

---

# 18. SKU/code generation should disappear too

Current add-item flows ask for code/SKU.

For most businesses:

ServOS should generate it.

Example:

```text
Jameson 750ml
→ JAM-750-001
```

or simply a UUID-backed internal ID with a friendly short reference.

Show:

```text
Item code
JAM-750-001

[ Change ]
```

under **More options**.

Same for:

- route;
- tax class;
- internal category codes;
- stock linkage;
- canonical unit.

Only expose them when someone genuinely needs them.

---

# 19. Barcodes should become an accelerator

When an unknown barcode is scanned during receiving:

Instead of:

> Unknown barcode.

Do this:

```text
NEW BARCODE

6161100766013

This barcode is not in ServOS.

[ Add this item ]
```

The Add Item flow starts with the barcode already filled.

Likewise:

```text
Scan crate
→ known purchase pack

Scan bottle
→ known individual unit
```

A stock item can eventually have multiple recognized codes:

```text
case barcode
pack barcode
individual bottle barcode
```

with each barcode knowing its conversion.

That makes receiving nearly frictionless.

---

# 20. Product creation and inventory creation should become one atomic action

Native already has the beginning of this with its atomic stock creation path.

Web still exposes:

```text
New Product
New Stock Item
New Stock Location
```

as distinct concepts.

For ordinary operators, **New Product + New Stock Item should disappear**.

They should see:

> **Add Item**

Behind the scenes:

```text
item wizard
      ↓
product
+
stock item
+
purchase packaging
+
selling options
+
barcode aliases
+
opening stock
+
cost
+
recipe/consumption configuration
      ↓
ONE transaction
```

If anything fails, none of it is created.

---

# 21. Keep “Stock Items” only as an advanced manager view

I would reorganize the whole area into:

```text
ITEMS & MENU

[ All ] [ Drinks ] [ Food ] [ Ingredients ] [ Retail ]

+ Add item


STOCK

On hand
Low stock
Count stock
Receive delivery
Transfer
Waste


RECIPES

Menu dishes
Drink portions
Batch recipes


ADVANCED

Stock masters
Packaging definitions
Barcodes
Cost history
Archived items
```

Normal staff may never need Advanced.

---

# 22. The item detail page should tell a story

Instead of database-looking fields:

```text
JAMESON 750ML

ON HAND
8 sealed bottles
420 ml open

SELLING
30 ml Shot       KES 200
60 ml Double     KES 350
750 ml Bottle    KES 4,500

BUYING
1 bottle         750 ml
Latest cost      KES 1,800

YIELD
25 shots / bottle

COST
30 ml shot       KES 72
60 ml double     KES 144
Bottle           KES 1,800

LOCATION
Main Bar

[ Receive ] [ Count ] [ Transfer ] [ Edit ]
```

That is useful.

A “stock master” page is not.

---

# 23. Build calculations into every form

Forms should have a permanent **ServOS calculated** box.

For six-pack:

> **6 cans × KES 150 = KES 900**

For 5 kg meat:

> **5 kg = 5,000 g**  
> Cost per 200 g portion = **KES 140**

For whisky:

> **750 ml ÷ 30 ml = 25 shots**

The operator does not perform the calculation.

But showing the calculation lets them verify that ServOS understood them.

That distinction is important.

---

# 24. Add intelligent mistake detection

ServOS can catch common errors before saving.

Examples:

| Input | ServOS response |
|---|---|
| Six-pack cost KES 6,000, sale per can KES 200 | “This would make each can cost KES 1,000. Is KES 6,000 the pack price?” |
| 750ml bottle, shot = 900ml | “A serving cannot be larger than the bottle.” |
| 30ml shot cost > selling price | “You would sell below ingredient cost.” |
| 5kg beef entered as 5g | “Did you mean 5 kg?” |
| Case of 24 entered with quantity 1 | “Are you receiving 1 case or 1 bottle?” |
| 20 cases × KES 900 entered as total KES 900 | “That means each case costs KES 45. Confirm?” |

Don't block everything.

Use confident warnings for suspicious numbers.

---

# 25. The Help section needs a complete presentation rethink

You are right about this.

Current Web Help has a proper search/sidebar shell, but when you open an article the body is essentially rendered using:

```text
whitespace-pre-wrap
```

So a document written like documentation still **looks like documentation**.

We should keep the documentation as the source of truth, but stop presenting the source format directly.

The Help Center should feel like another operational workspace.

Something closer to:

```text
┌─────────────────────────────────────────────────────────────┐
│ HELP & TRAINING                                             │
│                                                             │
│ 🔎 What are you trying to do?                              │
│ [ Sell a shot, receive stock, refund, count bottles... ]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ COMMON TASKS                                                │
│                                                             │
│ [ Make a sale ] [ Receive stock ] [ Count stock ]          │
│ [ Sell shots  ] [ Add food item ] [ M-Pesa ]               │
│ [ Refund       ] [ Check in guest] [ Close day ]            │
│                                                             │
│ LEARN BY DOING                                              │
│                                                             │
│  ▶ Sell a bottle by shots                  3 min            │
│  ▶ Add a six-pack correctly                2 min            │
│  ▶ Set up a gram-based menu recipe         4 min            │
│                                                             │
│ YOUR ROLE                                                   │
│ Cashier · 6 guides available · 4 completed                 │
└─────────────────────────────────────────────────────────────┘
```

Now it feels like software.

Not GitHub.

---

# 26. Help articles should become task cards

An article on selling shots should render roughly:

## Sell liquor by the shot

**Use this when:**  
You buy a whole bottle but customers can purchase smaller servings.

### Example

> Jameson bottle: **750 ml**  
> Shot: **30 ml**  
> ServOS knows one bottle contains **25 shots**.

### Do this

**1. Open Items & Menu**  
Press **Add Item**.

**2. Choose Drink sold in portions**

**3. Enter the bottle**  
750 ml, KES 1,800.

**4. Add selling options**  
30 ml Shot, 60 ml Double, Whole Bottle.

**5. Save**

### ServOS handles

✓ ml conversion  
✓ cost per shot  
✓ inventory deduction  
✓ opening the next bottle  
✓ whole-bottle stock  
✓ margin calculation

**[ Start guided setup ]**

That is fundamentally different from dumping Markdown into a scroll area.

---

# 27. Help content should be structured

Instead of:

```ts
{
  body: "very long markdown-like string"
}
```

move toward:

```ts
{
  title,
  summary,
  whenToUse,

  example: {...},

  steps: [
    {
      title,
      instruction,
      target,
      action
    }
  ],

  systemHandles: [...],
  commonMistakes: [...],
  relatedTasks: [...],

  guideId,
  estimatedMinutes
}
```

The underlying documentation can still be generated from Markdown if we want.

The UI should render **components**, not a giant text blob.

---

# 28. Context help becomes much more important

Every complex input can have a small `?`.

For example:

### What does one pack cost?

`[ ? ]`

Tap it:

> **Enter what you actually pay your supplier for the entire pack.**
>
> Example: a six-pack costs KES 900. Enter **900**, not 150. ServOS calculates the KES 150 per-can cost.

Or:

### Portion size

> How much stock one sale uses.  
> Example: one whisky shot may use 30 ml.

This should be a small popover.

Not “go read chapter 17”.

---

# 29. Add “show me” directly inside workflows

Help should sometimes launch a live guide.

If the operator is adding Jameson:

```text
Need help with portions?

[ Show me how shots work ]
```

The guide points at the actual fields:

```text
Bottle size
↓
Purchase cost
↓
Shot size
↓
Selling price
```

and ServOS displays the result live.

The best help system is partly documentation and partly **driving instructor**.

---

# 30. We should create several operator-focused templates

This is the one place I would intentionally use presets.

The initial set:

1. **Beer / soda sold whole**  
   Packs/crates → individual bottles/cans.

2. **Spirits**  
   Bottle/case → shot/double/bottle.

3. **Wine**  
   Bottle/case → glass/bottle.

4. **Keg / dispenser**  
   Litre container → ml servings.

5. **Food ingredient by weight**  
   kg pack → grams → recipes.

6. **Food ingredient by count**  
   tray/box → pieces → recipes.

7. **Menu dish**  
   recipe ingredients → one selling unit.

8. **Batch recipe**  
   total ingredients → N portions.

9. **Retail packaged item**  
   carton/pack → pieces.

10. **Service**  
   no stock tracking.

These are not database classes.

They are **operator shortcuts**.

---

# 31. The resulting 30-second flows

### Adding a beer

```text
Add item
→ Packaged drink
→ Tusker 500ml
→ Crate
→ 20 bottles
→ Crate costs 3,000
→ Bottle sells 250
→ Save
```

Done.

### Adding whisky

```text
Add item
→ Spirit / portioned drink
→ Jameson
→ 750ml bottle
→ Cost 1,800
→ Shot 30ml / 200
→ Double 60ml / 350
→ Bottle 4,500
→ Save
```

Done.

### Adding beef

```text
Add item
→ Ingredient by weight
→ Beef
→ 5 kg pack
→ Pack costs 3,500
→ Save
```

Done.

### Adding Beef Stew

```text
Add item
→ Menu dish
→ Beef Stew
→ Price 550
→ Beef 200g
→ Tomato 80g
→ Onion 40g
→ Oil 20ml
→ Save
```

Done.

That is roughly the cognitive complexity I want.

---

# 32. What I would change in the current source

The good news is we do **not** need to rip the inventory engine apart.

The existing code already contains several of the right primitives:

```text
baseUnit
scanUnitQuantity
containerQuantity
containerUnit
openingContainers
servings
portionVolume
recipeIngredients
average cost
atomic product + stock creation
```

The problem is mainly that these primitives are being shown to humans too directly.

I would build one shared domain component:

## `SmartItemWizard`

with:

```text
ItemTypeStep
PurchasePackagingStep
SellingBehaviorStep
RecipeStep
OpeningStockStep
CalculationPreview
ReviewAndSave
```

and reuse its model in both:

```text
Terminal
Web
```

The backend receives the technical representation.

The human never has to construct it.

---

# 33. Add one abstraction that unlocks most of this

I would introduce:

## `measurementMode`

Internally:

```text
COUNT
WEIGHT
VOLUME
```

That maps automatically to:

```text
COUNT  → piece
WEIGHT → g
VOLUME → ml
```

Then operators can enter units they understand:

```text
kg
g

L
ml

pack
case
crate
bottle
can
piece
tray
bag
```

ServOS canonicalizes.

So:

```text
2.5 kg
```

becomes:

```text
2500 g
```

And:

```text
1.5 L
```

becomes:

```text
1500 ml
```

without exposing that transformation.

---

# 34. Packaging should become first-class

Introduce a reusable package definition:

```text
Stock:
Coca-Cola

Base:
piece

Purchase packages:
6-pack      = 6 pieces
crate       = 24 pieces

Scan aliases:
individual barcode → 1 piece
pack barcode       → 6 pieces
crate barcode      → 24 pieces
```

For Jameson:

```text
Base:
ml

Physical container:
750 ml bottle

Case:
12 × 750 ml
```

For beef:

```text
Base:
g

Purchase pack:
5 kg = 5,000 g
```

Once this exists, receiving, counting, transfer, scanning and procurement all become easier.

---

# 35. One more important improvement: role-specific simplicity

A cashier does not need:

```text
average cost
purchase packaging
recipe configuration
reorder rules
```

A storekeeper does not need:

```text
tax configuration
menu layout
```

A manager might.

So ServOS should progressively disclose functionality by permission.

### Cashier

POS, basic help.

### Storekeeper

Receive, count, transfer, waste.

### Kitchen/Bar manager

Items, recipes, portions.

### Admin/Owner

Costs, configuration, imports, reports.

This makes the same application feel simpler without removing capability.

---

# The design principle I would lock in

> **ServOS stores technical units. People enter physical reality.**

The database can know:

```text
baseUnit = ml
scanUnitQuantity = 750
averageUnitCostMinorPerBaseUnit = ...
```

The bartender should know:

> “I bought 12 bottles for KES 21,600.”

The kitchen manager should know:

> “This bag is 5 kg and costs KES 3,500.”

The storekeeper should know:

> “I counted 3 crates and 7 loose bottles.”

The cashier should know:

> “Customer wants a double.”

**ServOS should be the one doing the multiplication and division.**

That should become a product-wide rule, not merely an inventory improvement.

The strongest next implementation slice is therefore **Smart Item + Packaging + Serving/Recipe UX**, because it simultaneously improves Catalog, Inventory, Procurement, POS, stock counts, food costing, drink costing, imports and Help. After that, the current README-like Help renderer should be replaced by structured task cards and interactive “Show me” guides.