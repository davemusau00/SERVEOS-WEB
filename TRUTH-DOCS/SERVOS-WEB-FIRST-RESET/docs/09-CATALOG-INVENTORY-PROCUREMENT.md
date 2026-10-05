# 09 — Catalog, Inventory and Procurement Reset

## 1. Principle

> ServOS stores technical units. People enter physical reality.

Operators should not manually calculate canonical quantities, package conversions or average unit cost.

## 2. Universal Add Item

Primary action:

`+ Add Item`

Choose:

- Beer / Soda / Bottled Drink
- Spirit / Liquor
- Wine
- Ingredient by weight
- Ingredient by piece
- Menu Dish
- Batch/Prepared Food
- Retail Item
- Service

The wizard determines which internal entities are needed.

## 3. Simple menu dish

```text
ADD MENU ITEM

Name
Beef Stew

Selling price
KES 550

Send to
Kitchen

[ Save ]
```

Recipe is optional.

Advanced:

`Track ingredients → Add recipe`

## 4. Packaged item

```text
Coca-Cola 330ml

How do you buy it?
Crate

Bottles per crate
24

Crate cost
KES 2,400

Sell one bottle for
KES 150

Opening stock
4 crates + 6 loose bottles
```

ServOS calculates:

- canonical pieces;
- cost per bottle;
- opening value;
- stock linkage;
- purchase package.

## 5. Spirit/Wine

```text
Jameson
Bottle: 750 ml
Bottle cost: 1,800

Sell as:
30 ml shot      200
60 ml double    350
750 ml bottle   4,500
```

Track:

- sealed bottles;
- open ml.

A whole-bottle sale requires sealed inventory.
A shot can consume open liquid and automatically open a sealed bottle when needed.

## 6. Ingredients

```text
Beef
Buy as: 5 kg pack
Pack cost: 3,500
```

ServOS stores canonical grams and derives cost per gram.

## 7. Recipes

Support:

### Per serving

```text
Beef 200g
Tomato 80g
Oil 20ml
```

### Batch

```text
Rice 2kg
Oil 200ml
Salt 30g
Produces 20 portions
```

ServOS derives per-serving consumption.

## 8. Stock screen

Task-first:

```text
[ Receive Delivery ]
[ Count Stock ]
[ Transfer ]
[ Waste ]

Low stock
Recent activity
Problems
```

"Stock Masters" is an advanced/admin concept, not daily navigation.

## 9. Physical count

Examples:

```text
Coke
Full crates: 3
Loose bottles: 5
ServOS count: 77 bottles
```

```text
Jameson
Sealed bottles: 8
Open liquid: 420 ml
```

```text
Beef
Full 5kg packs: 2
Loose: 1.2kg
ServOS count: 11.2kg
```

A reviewed count creates immutable variance movements.

## 10. Stock correction

Admin UI may say "Correct quantity", but backend records:

`ADMIN_CORRECTION`

with:

- before;
- after;
- delta;
- reason;
- note;
- actor;
- command;
- timestamp.

Never overwrite movement history.

## 11. Purchase order simple flow

```text
PURCHASE ORDER

Supplier
[ Choose / Quick add ]

+ Add item
```

Line:

```text
Coca-Cola 330ml
Buy as: Crate of 24
Quantity: 5 crates
Price: KES 2,400 per crate

ServOS calculated:
120 bottles
KES 12,000
```

Summary then:

`Save Draft` / `Approve Order`

## 12. Supplier quick create

Minimum:

- Name
- Phone optional

Advanced:

- PIN
- email
- payment terms
- contact person
- address
- notes.

Do not block drafting just because full supplier master data is incomplete.

## 13. Advanced line types

Default PO line is Item.

Advanced menu:

- Expense
- Asset

Do not make ordinary storekeepers classify accounting concepts for every stock purchase.

## 14. Receiving

`Receive Delivery`

Pre-fill outstanding quantity.

```text
Coke
Ordered 5 crates
Outstanding 5 crates

What arrived?
5 crates
Rejected/damaged: 0

ServOS will add 120 bottles

[ Receive everything ]
```

"Something is different" reveals exception controls.

## 15. Exceptions

Support:

- partial delivery;
- second partial delivery;
- rejected goods + reason;
- over-receipt + manager approval;
- wrong package;
- price mismatch;
- duplicate GRN/reference;
- response loss;
- invoice mismatch.

Invalid lines must block explicitly; never silently omit them.

## 16. Procurement backend transaction

Receipt command atomically:

- checks PO version;
- records goods receipt;
- converts packages;
- updates stock;
- records movements;
- updates average cost;
- updates PO received totals/status;
- creates audit/change feed.

## 17. Barcode design

A stock item may have multiple barcode aliases:

- individual bottle;
- pack;
- crate.

Each alias knows its quantity conversion.

Unknown scan:

```text
This barcode is not in ServOS.
[ Add this item ]
```

or during count:

- assign to existing item;
- create item;
- remove scan.

Count cannot finalize with unresolved unknown scans.

## 18. Average cost

Average unit cost is a calculated accounting result, not a routine data-entry field.

Operator supplies:

- what arrived;
- packaging;
- what supplier charged.

Backend calculates weighted cost.

## 19. POS relationship

Selling options consume the correct underlying stock.

Example Jameson tile → Shot/Double/Bottle, all mapped to one stock basis.

Avoid unrelated pseudo-products that require manual stock synchronization.

## 20. Acceptance

Prove:

- packaged drink create + opening stock;
- spirit sealed/open lifecycle;
- weighted receiving cost;
- recipe sale consumption;
- batch production;
- durable whole-location count;
- barcode package scan;
- transfer/waste physical units;
- admin correction audit;
- simple PO and advanced PO;
- partial receive + AP match;
- Web/Terminal results converge through same API commands.

---

# Reset Addendum — Procurement Lifecycle, Requisitions and Corrections

The repository audit after the first VPS-reset draft adds several non-optional workflow requirements.

## 21. PO lifecycle must become explicit

Current production code implements `purchaseOrder.create` and immediately describes the Native result as created/approved. The new backend must support a configurable purchasing policy:

```text
SIMPLE
Create → Issue

CONTROLLED
Draft → Submit → Approve → Issue
```

Then:

```text
Issue → Partial receive / Receive → Invoice match → Partial pay / Pay → Close
```

Add typed commands/endpoints for:

- create draft;
- submit;
- approve/reject;
- issue;
- amend/revise before receipt;
- cancel remaining quantity;
- close;
- duplicate/repeat.

Do not let clients assign arbitrary status strings.

## 22. Purchase-order and GRN printing

PO and GRN printing are now ServOS 1.0 requirements.

The procurement module produces typed Business Documents and submits them to the generic Terminal print spooler described in `23-BUSINESS-DOCUMENT-PRINTING.md`.

After PO issue:

```text
[ Print 80mm ] [ Preview ]
```

After receiving:

```text
Goods received.
[ Print GRN ] [ View PO ]
```

The procurement UI must not build ESC/POS bytes itself.

## 23. Physical supplier returns

A supplier return is not a receipt reversal.

Add a dedicated workflow for goods physically leaving the business and eventual supplier credit-note matching.

The V2 `procurement.reverseUnusedReceipt` idea is retained only for exact duplicate/recording corrections where the physical delivery did not happen twice.

## 24. Internal stock requisitions

Keep direct `inventory.transfer` for small operations.

Add optional controlled flow for central-store businesses:

```text
Request → Approve → Pick → Dispatch → Receive
```

This becomes first-class for resorts, multi-bar hotels, restaurants with central stores and larger venues.

## 25. Selected/spot counts

Port the V2 `inventory.countSelected` concept as a distinct command from full `inventory.countLocation`.

Use it for cycle counting and targeted checks. A selected count must never satisfy a full-location count requirement.

## 26. Correction taxonomy

Keep these distinct:

- current physical balance correction;
- exact recording/movement reversal;
- unused duplicate receipt reversal;
- supplier return;
- supplier credit-note/accounting correction.

Each has different physical, inventory and ledger effects.

## 27. Archive/reactivation

Port the V2 guard that prevents archiving stock still referenced by outstanding PO quantities.

Expose blockers in business language and provide direct links to affected orders.

Typed reactivation restores an archived item without rewriting historical documents.

