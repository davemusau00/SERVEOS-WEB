# SERVEOS V2 — Bottle Inventory and Operator Corrections

**Investigation report and development guidance**  
**Prepared for:** Davies Musau / ServEOS  
**Date:** 4 October 2026, Africa/Nairobi  
**Reference repository:** davemusau00/SERVEOS-WEB, V2  
**Verified remote reference:** `0a1b10c0af5614fc8b1d1ce933c3909b9116da54`  
**Status:** Development specification; no implementation or deployment performed for this report.

## 1. Executive decision

Change how staff enter and see stock before changing the underlying inventory model. A wine or spirit that is sold only as an unopened bottle should be counted as bottles. Only products actually sold as shots or glasses should present open-liquid controls. ServEOS should calculate the millilitre equivalent automatically.

Keep existing millilitre-based stock records, IDs, movement history, cost basis and product links intact. Converting live stock masters from ml to bottles would affect sales deductions, recipes, purchase conversions, valuation and historical interpretation. It is unnecessary for solving the immediate problem.

Add a selected-item quick count alongside the existing full stocktake. Counting a small group of shot products must not require recounting all active stock masters, and omitted products must remain untouched.

For human errors, provide a visible **Correct mistake** action that selects the appropriate operation: discard an uncommitted draft, edit or archive a master, correct a stock balance, void an order, reverse a transaction, or record a refund. Posted stock and financial records must retain their original history and have linked corrective entries. A generic database delete would leave related balances inconsistent.

The delivery should be split into independently reviewable releases. The first release should remove manual bottle arithmetic and expose safe inventory correction. Selected counts and procurement reversals should follow with their own command contracts and tests. Do not couple this work to a fresh installation or another authority cutover.

## 2. Evidence, scope and limitations

This report is based on static inspection of the repository at the reference above, plus the user's description of the deployed terminal. The local checkout also contains a later print-queue cancellation commit, `c1228a4`; that work is separate from this inventory specification. The remote reference was checked during the preceding investigation in this conversation.

No deployed terminal database, installed application binary, live Supabase schema, or physical stock was inspected. Consequently:

- Source findings establish what the inspected implementation does, not which migrations or settings are active at the business.
- Proposed fields, commands and screens below are specifications, not claims that they already exist.
- Missing functionality means it was not found in the inspected paths. Before implementing a new command, check the full current dispatcher chain for equivalent functionality.
- No test suite was run for this report because no executable code was changed. Release validation described below remains work to perform.

### 2.1 Source evidence map

Paths refer to the verified repository revision unless otherwise stated. Stable source links are provided in Appendix A.

| Source | Observed implementation | Development implication |
| --- | --- | --- |
| `src/native/NativeInventoryView.tsx` | Manual count inputs use the stock's base unit; rows submit expected and counted quantity. Completion requires all active stock rows. | Add bottle inputs, explicit scope, stable count baselines and reviewed bottle-state payloads. |
| Same file, `ScannerCountSession` | Saved scanner drafts, scan conversions, unknown scans and draft discard are supported. | Extend the existing durable-draft mechanism rather than create a separate scanner ledger. |
| `src/runtime/web/WebCatalogInventory.tsx` | Web count and correction controls support sealed containers and open ml for configured stock. | Reuse presentation and validation concepts, but verify the terminal command contract separately. |
| `src/runtime/web/SmartItemDialog.tsx` | Spirit/wine setup links ml stock, container size and measured portions; whole-bottle pricing is available. | Introduce an explicit selling method; wine/spirit category alone must not imply shot sales. |
| `src/native/NativeCatalogView.tsx` | Product portion configuration is present. | Make bottle-only configuration, portion removal and whole-bottle behaviour clear and explicit. |
| `src-tauri/src/store.rs`, `inventory.countLocation` | Local handler requires every active stock item, compares expected quantities, and posts quantity differences through stock movement logic. | A UI filter cannot implement a partial count. Local count persistence also needs explicit bottle state. |
| Same file, `inventory.adjust` | Supports an audited corrected balance, including sealed/open correction payloads. | Surface this through a native correction workflow and confirm cloud parity. |
| Same file, sealed stock movement functions | Whole-container sales require sealed stock; measured consumption can open sealed containers. Open quantity is constrained below one container. | Preserve these protections; multiple open bottles require a broader model. |
| `supabase/expansion/034_sealed_location_counts.sql` | Shared count handler requires sealed/open values for tracked bottle stock and checks versions and totals. | Terminal must send the required breakdown, not just total ml. |
| `src/runtime/RuntimeProvider.tsx` | Terminal commands collect dependency versions and invoke the runtime; committed-but-refresh-failed handling is present. | Preserve command identity, dependency tracking and durable-outcome semantics. |
| `src/runtime/operationManifest.ts` | Shared business mutations require shared V2 handlers; local-only operations are distinguished. | New stock/correction commands must be registered and implemented on the active authority. |
| `src/native/NativeOperationsViews.tsx` | Native payments/refunds screen posts refunds and explains that stock is not automatically restored. | Keep monetary correction separate from physical stock disposition. |
| `src/native/NativeMasterDataView.tsx` and `record.archive` handler | Master archival exists; stock locations and masters have live dependency restrictions. | Expand discoverability without bypassing dependency guards. |

### 2.2 Important refinement to the earlier investigation

There are two distinct count-handler behaviours. The local Rust count path inspected accepts total quantities and adjusts the difference. The shared PostgreSQL count handler in expansion 034 explicitly requires `countedSealedContainers` and `countedOpenQuantity` for configured ml bottle stock.

The inspected terminal manual count form supplies only `stockItemId`, `expectedQuantity` and `countedQuantity`. This is a source-level contract mismatch to investigate through the complete runtime routing path. It is not proof of the exact error currently occurring on the deployed terminal. Confirm the installed build, active authority and any payload adaptation before assigning a production incident to this mismatch.

The first engineering task is therefore to establish the real execution path, not assume that changing the Rust handler alone fixes a shared V2 terminal.

## 3. Business model and terminology

Use terminology that matches what staff physically handle.

| Term | Meaning |
| --- | --- |
| Stock master | One inventory identity for a specific liquid and container size. |
| Product | The item offered for sale, linked to a stock master or recipe. |
| Sealed bottle | An unopened container available for a whole-bottle sale. |
| Open liquid | Liquid in opened containers, available for measured pours. |
| Portion | A configured shot, double, glass or other measured serving. |
| Purchase package | A bottle, case or carton with an explicit conversion to stock quantity. |
| Full stocktake | An explicitly complete count under the existing whole-location coverage rule. |
| Quick count | A deliberately selected set of stock items, with all other items unchanged. |
| Correction | A new, auditable action that fixes an earlier mistake. |

A 350 ml bottle and a 750 ml bottle of the same brand must remain distinguishable inventory variants. Sharing a product family is useful; sharing an ambiguous bottle size is not. A 1 L boxed wine can use the same container principle with a suitable label such as “sealed box.”

The selling method belongs to the product/stock configuration, not to a broad category such as WINE or SPIRITS. Category remains useful for filtering and reporting.

## 4. Target operator experience

### 4.1 Bottle-only products

For a 750 ml wine sold only unopened:

1. Staff see “Wine 750 ml — sealed bottles only.”
2. They enter `12` in **Sealed bottles counted**.
3. ServEOS calculates 9,000 ml and previews any variance in bottles.
4. POS offers the whole bottle only.
5. Receiving and transfers accept bottles or configured cases, with conversions shown.

Do not present an open-liquid field in routine counting for this product. If existing stock contains open liquid, display an exception requiring review. Hiding that liquid or rounding it away would change inventory without explanation.

### 4.2 Products sold by bottle and portion

For a 750 ml whisky:

- Sealed bottles counted: `8`.
- Open liquid remaining: `300 ml`.
- Display: **8 sealed · 300 ml open**.
- Secondary audit quantity: **6,300 ml**.
- POS: whole bottle, and only the configured measured servings.

Shot and glass sizes must be configured by the business. Do not assume every spirit uses 30 ml or every wine uses one universal glass size.

### 4.3 Open-liquid measurement

Offer exact ml entry as the primary precise method. Optional quarter/half/three-quarter shortcuts can speed visual estimates, but must show the resulting ml and record that the measurement was estimated. For a 750 ml bottle, half is 375 ml; it must not silently round to 400 ml.

Do not infer liquid volume from visual height with a generic slider and describe it as exact. Bottle shapes differ. Weighing support can be considered later, but requires calibrated empty-container weight and appropriate volume conversion.

### 4.4 Inventory overview

Display the physical representation first and the canonical quantity second. Examples:

| Item | Main display | Secondary detail |
| --- | --- | --- |
| Bottle-only wine | 12 sealed bottles | 750 ml each; 9,000 ml total |
| Whisky sold by shots | 8 sealed + 300 ml open | 6,300 ml total |
| Count-based beer | 24 bottles | Existing count-based unit remains unchanged |
| Boxed wine | 3 sealed boxes + 200 ml open, if pours enabled | 1 L per box |

Stock value must continue to use the canonical quantity and canonical unit cost. Displaying bottle equivalents must not multiply valuation twice.

### 4.5 Receiving, transfers, waste and reorder levels

Counting is only one source of manual arithmetic. Apply the same conversion controls consistently:

- Receive 2 cases × 12 bottles × 750 ml without asking staff to enter 18,000 ml.
- Allow purchase price per case or per bottle and explicitly derive the canonical unit cost using the existing precision policy.
- Transfer 3 sealed bottles as sealed stock. A transfer must not satisfy this request with equivalent open liquid.
- Record a broken sealed bottle separately from a 30 ml spillage so sealed/open state stays correct.
- Allow reorder targets in bottles while storing the converted threshold consistently.
- If a product is genuinely sold by container count already, preserve its existing base unit.

Receiving remains part of Procurement where the current design links the goods receipt, stock, payable and accounting. Do not introduce a competing receipt workflow that updates stock alone.

## 5. Data and compatibility design

### 5.1 Preserve canonical units

For existing ml stock, let:

`Q = S × C + O`

where Q is total canonical ml, S is the integer sealed-container count, C is the configured container size in ml, and O is open liquid in ml.

Existing stock IDs, product IDs, barcodes, movements and costs remain intact. A display-mode change alone must produce no stock movement and no financial entry.

### 5.2 Proposed additive configuration

The following names are illustrative and must be aligned with existing contracts before implementation:

| Proposed field | Purpose | Compatibility rule |
| --- | --- | --- |
| `sellingMode` | `BOTTLE_ONLY` or `BOTTLE_AND_PORTIONS` | Missing means preserve existing behaviour pending review, not silently disable pours. |
| `countPresentation` | Bottle controls or existing base-unit controls | Only enable when container configuration is valid. |
| Existing `sealedContainerSize` | Size of one sealed container | Do not infer authoritative values from product names alone. |
| Existing `scanUnitQuantity` | Canonical quantity per bottle scan | Verify against bottle size; do not assume a historical value of 1 means one bottle for ml stock. |
| Existing purchase packages | Case/carton conversions | Validate the package barcode and multiplier independently. |
| Count measurement metadata | Exact or estimated entry | Preserve alongside the count record. |

Stock mechanics belong on the stock master; sale choices belong on the product. When several products reference the same stock master, validate configuration across all references. Disabling direct shot portions does not automatically remove cocktail or recipe consumption. Any remaining recipe consumption must be explicitly reviewed before calling the stock “sealed-only.”

### 5.3 Existing data configuration

Build a read-only classification preview containing stock ID, product links, base unit, container size, portions, recipes, scan conversion, balances, open state and proposed mode.

Safe proposals may use reliable existing configuration. Ambiguous names, missing sizes, conflicting portion volumes and shared stock links must remain flagged for review. Never change 750 ml stock to 1 L because an imported description contains a different size.

Enable bottle presentation without changing Q. If the existing sealed/open split is inferred from total quantity, label it as inferred until a physical count confirms it. Total ml alone does not prove how many containers remain unopened.

Do not force whole-bottle mode while unresolved open liquid remains. Provide a transition path: sell/consume it, transfer it appropriately, record legitimate waste, or retain mixed selling until cleared.

### 5.4 Cost precision

Keep money and quantity precision explicit. Native code exposes decimal-unit cost fields while web V2 surfaces also use minor-unit fields. Audit the existing conversion boundary before adding bottle-price fields.

Do not round a small per-ml cost to whole currency minor units prematurely. Calculate using the established supported precision and round monetary postings at the appropriate final boundary. Tests must prove that receiving a case at its invoice cost produces the expected total stock valuation.

## 6. Sealed versus open inventory

### 6.1 Preserve whole-bottle integrity

A whole-bottle sale must consume an actual sealed container. An equivalent volume split across opened bottles is not sufficient.

Measured sales consume open liquid first and open sealed stock only as necessary. Keep the existing automatic-opening behaviour for the immediate release. If an explicit “Open bottle” action is later added, it must reduce sealed count and increase open liquid without changing total Q.

Stock count, adjustment, receiving, transfer, waste, order return and refund-related stock decisions must use consistent bottle-state rules.

### 6.2 Multiple opened bottles

The inspected implementation constrains O to less than C. That represents at most one partial-container remainder, not arbitrary physical opened containers.

Example: two opened 750 ml bottles containing 400 ml each equal 800 ml open liquid. Representing that as one sealed bottle plus 50 ml is physically wrong and could permit a sealed-bottle sale that cannot be fulfilled.

There are two rollout options:

| Option | Suitable when | Required work |
| --- | --- | --- |
| Retain one-open-container limitation temporarily | Business confirms that one active open container per stock variant/location is workable | Explain the limitation, reject unsupported counts clearly, and never silently normalise multiple open bottles into sealed stock. |
| Support multiple open containers | Business routinely opens the same variant in several bottles at one location | Extend state, count inputs and every movement handler before enabling. |

For the extended model, retain S as true sealed stock and permit aggregate open volume above one container. Optionally store individual open-container quantities for physical counts. Reconcile their sum with the aggregate. A measured sale can consume aggregate open liquid; a whole-bottle sale still requires S ≥ 1. Never convert excess open volume into sealed stock.

The extended model is a separate compatibility change because older handlers assume O < C. Feature-gate it behind server and terminal capability checks. Do not activate it while an older writer can mutate the same business records.

## 7. Full stocktake and quick counts

### 7.1 Preserve existing full-count semantics

Keep the existing full-count operation strict until intentionally versioned. It currently requires every active stock master, including items at zero at the selected location. Redefining this coverage silently would make old and new clients disagree.

If a future release introduces explicit location assortments, define that separately. A filter or zero stock balance is not evidence that an item should be excluded from a full count.

### 7.2 Add a selected-count operation

Prefer a dedicated proposed command such as `inventory.countSelected` rather than weakening the existing full-count handler. The exact name is subject to the operation registry.

Before counting, staff choose the location and products. Selection can be assisted by “sold by portions,” category, search, recently moved stock or a saved list. Freeze the actual selected stock IDs into the session; a filter changing later must not silently change its scope.

Rules:

- At least one selected item is required.
- Every selected item must have an explicit count, including explicit zero.
- Unselected items remain untouched and are not marked counted.
- Duplicate IDs, archived items and invalid configurations are rejected.
- Show “Quick count — 8 selected items” throughout review and history.
- Store the selection, baseline versions, user, location, time and measurement method.
- Count results must identify partial coverage; a quick count must not masquerade as a complete close-day stocktake.

### 7.3 Blank is not zero

Keep blank entries as uncounted. Clearing an input must return it to the uncounted state. Do not prefill expected balances as physical observations. Optional expected-versus-blind counting is a business preference; neither mode may silently accept the expected quantity.

### 7.4 Drafts and scanning

Use one session model for manual and scanner counting with a frozen baseline and durable drafts. The inspected scanner workflow already has persistence; manual entry should receive equivalent protection.

A bottle barcode increments sealed bottle count by one when configured as a bottle barcode. A case barcode increments by its configured bottle multiplier. Keep open-liquid measurements unchanged when scanning another sealed bottle.

Resolve unknown and ambiguous barcodes before posting. Count sessions must survive close/reopen and restart. Retrying a saved pending command must retain the same command ID. A stale session must require review rather than replay against a changed stock balance.

### 7.5 Sales occurring during counting

Phase one should use a short counting window with affected sales/movements paused operationally and reject changed stock versions at commit. Do not silently rebase a physical observation onto a newer balance.

Capturing a fresh expected quantity only at submit time is unsafe: it can hide movements that occurred after the physical count. Freeze the baseline at session start or explicit item recount, including relevant configuration versions.

An advanced count-while-trading workflow requires a reliable observation time and movement reconciliation per item. Treat that as a later capability, not an automatic arithmetic adjustment.

## 8. Command design and backend guidance

### 8.1 Existing shared bottle-count row

The shared handler currently expects these fields for configured bottle stock:

```json
{
  "stockItemId": "example-stock-750",
  "expectedQuantity": 6750,
  "countedQuantity": 6300,
  "countedSealedContainers": 8,
  "countedOpenQuantity": 300
}
```

This is a row illustration, not a complete command envelope. Preserve the existing envelope, dependency versions, location identity and reason requirements. The server must independently calculate 8 × 750 + 300 and validate the submitted total.

The adjustment path uses different field names, including `sealedContainers`, `openQuantity` and `countedQty`. Do not assume that a count payload can be forwarded unchanged to the adjustment handler. Define shared typed builders for each contract.

### 8.2 Transaction boundary

A count or correction should atomically:

1. Check actor permissions and any required approval.
2. Resolve the command ID and reject changed-payload reuse.
3. Validate the selected scope, stock/location existence, versions and bottle configuration.
4. Recalculate quantities and validate finite non-negative values and precision bounds.
5. Update quantity and physical bottle state.
6. Append count/correction records and movement effects.
7. Apply required valuation/accounting treatment consistently with the established policy.
8. Return a durable result that can be retrieved after a network failure.

Any failure must leave the entire command unapplied. Lock dependent records in a deterministic order in the shared handler to reduce deadlock risk.

### 8.3 Physical-state changes without quantity changes

When the model supports physical-state changes that preserve total volume, they still require a recorded state transition. An explicit bottle-opening operation is one example. In a multi-open model, a corrected sealed/open split can also leave total Q unchanged.

Do not assume `quantityDelta === 0` means nothing changed. Record the before/after state without inventing stock consumption or revenue. Under the present one-remainder model, the split is mathematically determined by total quantity, which is itself a reason that the model cannot represent all real bottle states.

### 8.4 Authority, routing and parity

Before implementation, record whether the target installation is legacy-local or shared V2. Do not switch this mode as part of the feature rollout.

Shared mutations require shared V2 handlers. Update the operation manifest, permissions, dependency resolution, command adaptation, tests and generated parity artefacts. A native UI that calls an unimplemented shared operation is not complete.

Use additive migrations following the repository's paired expansion/migration convention. Do not edit previously applied migration files to change live behaviour. Keep old command semantics compatible unless a deliberate protocol/capability gate prevents incompatible clients from writing.

## 9. Human error: correction policy

The question “Can this record be deleted?” should be answered by its effects and state, not by which screen displays it.

| Record or mistake | Recommended action | Current evidence / gap |
| --- | --- | --- |
| Uncommitted count draft | Discard draft | Existing native workflow supports discard. |
| Unapplied import batch | Cancel batch through supported import lifecycle | Manifest describes cancellation for unapplied batches; verify installed availability. |
| Incorrect master name or description | Versioned edit | Master editing exists; historical transaction snapshots must remain stable. |
| Duplicate unused master | Archive with dependency checks; optional later purge only under strict policy | Archival handlers exist; product/stock terminal discoverability needs work. |
| Committed count entered incorrectly | Linked corrective count/adjustment | Local adjustment backend exists; direct native inventory correction UI is missing in the inspected screen. |
| Wrong transfer | Linked compensating transfer after availability checks | Dedicated reversal UX not established by this inspection. |
| Wrong waste entry | Linked waste correction with physical verification | Do not add stock back merely because an entry is disputed. |
| Wrong order | Void with correct stock disposition | Native void workflow exists. |
| Wrong payment / refund | Appropriate reversal or refund; external cash movement handled separately | Native refund UI and backend reversal capability exist; exposure differs between clients. |
| Incorrect goods receipt | Linked receipt correction/reversal affecting all dependent ledgers | Dedicated native workflow not found in inspected paths. |
| Incorrect supplier payment | Payment reversal/credit treatment according to actual money movement | Posting exists; dedicated correction flow requires further investigation. |
| Historical posted records | Retain original and link corrective records | Generic archive/delete must not be offered as transaction undo. |

### 9.1 Proposed correction workflow

Open **Correct mistake** from the relevant history row. Show the source record, its effects and available correction types. The operator supplies corrected facts and a reason; the system previews changes to stock, cash, debt, cost and accounting before confirmation.

Store source record ID/version, correction ID, original command ID where available, actor, approver, timestamp, reason code, explanation, before/after values and related effects. Do not overwrite the original reason or creator.

Use specific reasons such as duplicate entry, wrong quantity, wrong item, wrong location, wrong price/cost and wrong tender. Require a free-text explanation where the code alone is insufficient.

### 9.2 Stock correction after later activity

Suppose a mistaken count set stock to 20 bottles and 3 were then sold. A correction must not blindly restore an earlier balance of 10: that could erase or duplicate the effect of those sales.

Offer two distinct concepts:

- **Correct current physical balance:** perform a recount now, compare with the current version, and post the difference.
- **Reverse a specific erroneous movement:** post a linked compensating effect only after validating dependencies and ensuring it will not produce impossible balances.

The default safe stock-count correction is a current recount with a link to the erroneous count. Do not label a new count “delete original count.”

### 9.3 Order, payment and stock are separate effects

A refund changes money and accounting. It does not prove that goods came back. A returned sealed bottle may qualify for a stock return; a consumed shot does not. Require explicit physical disposition for stock restoration.

Distinguish a wrongly recorded tender from actual money refunded externally. A software reversal must not claim that it initiated an M-PESA or card payout. Avoid demanding a fictitious refund reference when the original entry was false and no external money ever moved; instead design a separately governed erroneous-entry correction with evidence and clear reporting.

Closed-day or closed-period corrections should follow the established accounting policy. Default to a new dated correction with a link to the original; do not rewrite old close-day snapshots silently.

### 9.4 Master archive and restore

Keep zero-stock and dependency checks for stock-master archival. Check active products, recipes, modifiers, open procurement and other live references before archive. Prevent archive from becoming a way to hide outstanding quantities or debts.

An archived master disappears from routine selection but remains resolvable in historical records. A restore flow should validate uniqueness and dependencies before reactivation. Hard purge of an unused master is optional and lower priority; it is unnecessary for resolving the pressing operational issue.

## 10. Procurement corrections require a dedicated design

A goods receipt can affect physical stock, weighted average cost, purchase-order fulfilment, supplier payable and journal entries. Reversing only its stock movement would leave the business inconsistent.

### 10.1 Cases to support

| Case | Required treatment |
| --- | --- |
| Duplicate receipt, stock unused, no downstream settlement | Linked full reversal of receipt effects, subject to dependency checks. |
| Wrong quantity, some stock already sold | Guided correction with cost and inventory consequences; do not blindly reverse unavailable stock. |
| Correct quantity, wrong price | Cost/payable correction, including treatment of sold versus remaining stock under the valuation policy. |
| Wrong supplier or invoice reference | Metadata correction where harmless; reassignment of financial obligations requires an explicit workflow. |
| Supplier already paid | Reverse or reallocate debt/payment relationships correctly; do not erase actual payment. |
| Physical goods returned to supplier | Supplier-return workflow with quantity, cost, credit and settlement effects. |

### 10.2 Valuation example

Illustrative quantities: 10 units valued at KES 100 each, then 10 received at KES 200 each, produce 20 units at KES 150 weighted average. If some are subsequently sold, reversing the receipt by subtracting 10 units at the current average does not necessarily undo the original receipt's economic effect.

Define the correction policy before coding: use original receipt cost snapshots, determine remaining versus consumed quantities where supported, and post any required inventory/COGS/price-variance adjustment through the accounting design. Do not invent a valuation algorithm in the UI.

### 10.3 Atomic correction result

A procurement correction should return linked records for the source GRN/receipt, compensating stock movements, PO status changes, payable changes and journal effects. Repeating the same command must not duplicate any of them. Previously corrected quantities/amounts must limit subsequent reversals.

Start with tightly defined cases that can be validated reliably. Unsupported cases should explain the dependent transaction that prevents automatic reversal and direct the operator to the applicable correction path.

## 11. Permissions and audit

Map operations to the existing permission system and regenerate derived contracts where necessary. Suggested responsibility boundaries are:

| Action | Recommended access |
| --- | --- |
| Enter and save a count draft | Inventory-count permission |
| Commit routine count | Existing count permission, with business-configured review policy if needed |
| Correct a posted balance | Inventory-adjust permission |
| Change selling mode/container configuration | Catalog management plus relevant stock authority |
| Reverse posted receipt or supplier payment | Explicit procurement/financial correction authority; define if absent |
| Refund or reverse payment | Existing refund/reversal permission and approval rules |
| Archive a master | Existing collection-specific permission and dependency checks |

These are proposed mappings, not a claim that all permissions already exist. Enforce authorisation at the handler, not just by hiding buttons. Approval tokens should be bound to the action, target and reviewed values and must follow existing expiry/replay rules. Record the approving person separately from the initiating operator.

## 12. Engineering work packages

| ID | Priority | Deliverable | Main implementation areas | Completion evidence |
| --- | --- | --- | --- | --- |
| INV-01 | P0 | Establish installed build, authority, capabilities and configuration inventory | Runtime status, records, migration evidence | Read-only baseline report and representative restored test data |
| INV-02 | P0 | Typed bottle conversion and count payload builders | Shared frontend utilities/types | Unit tests for count, package, precision and invalid inputs |
| INV-03 | P0 | Native bottle inputs and bottle-first overview | NativeInventoryView and scanner workflow | Staff enter bottles without arithmetic; draft survives restart |
| INV-04 | P0 | Count contract parity and explicit bottle-state persistence | Rust count path, V2 count handler, runtime adapter/dependencies | Native/local and shared paths accept equivalent valid input and reject invalid input |
| INV-05 | P0 | Explicit selling method and configuration review | NativeCatalogView, SmartItemDialog, product/stock validators | Bottle-only POS has no accidental pour route; existing configurations preserved |
| INV-06 | P0 | Direct native current-balance correction | Native inventory/history, adjustment command | Audited before/after review and version conflict test |
| INV-07 | P1 | Selected-item quick counts | New handler, registry, dependency resolver, count session UI | Unselected stock unchanged; partial coverage visible in history |
| INV-08 | P1 | Bottle/case input for transfers, waste and procurement | Movement forms and sealed-state handlers | Physical state and valuation reconcile across operations |
| ERR-01 | P1 | Correction action discovery and master archive/restore UX | History views, master/catalog views | Users can find valid corrections; unsafe actions explain blockers |
| ERR-02 | P1 | Linked stock movement corrections | Stock commands and audit records | No double reversal; later movements preserved |
| ERR-03 | P1 | Receipt and supplier-payment correction specification | Procurement and accounting domain | Agreed state matrix, valuation policy and handler contract |
| ERR-04 | P1 | Implement first supported procurement reversals | Native, shared handler and accounting tests | All dependent effects commit or roll back together |
| INV-09 | Conditional | Multiple-open-container support | Model and every bottle movement path | Older incompatible writers blocked; multi-open scenarios pass |
| REL-01 | P0 | Upgrade validation and operator guide | Build, installer, backup/restore and guidance | Signed-off restored-data rehearsal and pilot evidence |

P0 means required for the initial targeted release. P1 means subsequent scope, not optional correctness within a released feature. If multiple opened bottles are routine at this business, INV-09 becomes a prerequisite for claiming that the physical inventory model supports actual operations.

Do not estimate completion percentages from this task list. Estimate effort after INV-01 confirms the deployed state and contract gaps.

## 13. Acceptance and regression tests

Tests should execute domain behaviour, not merely search source files for button labels. Run focused tests during development, then the repository's required release gate once the change is ready.

| Test | Scenario | Expected result |
| --- | --- | --- |
| T01 | Count 12 × 750 ml bottle-only wine | 12 sealed; 9,000 ml; no manual multiplication |
| T02 | Count 8 sealed × 750 ml + 300 ml open | 6,300 ml and correct physical split |
| T03 | Sell one sealed bottle | Sealed count decreases by one; open liquid unchanged |
| T04 | Sell a configured 30 ml shot with sufficient open liquid | Open liquid decreases by 30 ml |
| T05 | Sell a shot when open liquid is insufficient | Opens enough sealed stock and reconciles total quantity |
| T06 | Whole-bottle request with no sealed stock | Rejected even if enough aggregate open volume exists |
| T07 | 350 ml and 750 ml versions of same brand | Correct independent stock item and conversion |
| T08 | Scan a configured bottle; scan a 12-bottle case | Correct sealed increments; open amount unchanged |
| T09 | Wrong/missing barcode conversion | Clear validation; no stock mutation |
| T10 | Blank count, explicit zero, negative, fraction of sealed bottle | Blank incomplete; zero accepted; invalid values rejected |
| T11 | Selected quick count | Only selected records change; scope retained |
| T12 | Incomplete full count | Rejected under existing coverage semantics |
| T13 | Sale/transfer occurs after count baseline | Conflict; reviewed count not silently rebased |
| T14 | Container size/mode changes during draft | Conflict or explicit recount required |
| T15 | Restart with saved manual/scanner draft | Exact entered counts, scope and pending command restored |
| T16 | Timeout after server commits, then retry | One count/correction; original command outcome recovered |
| T17 | One invalid row among many | Entire command rolls back |
| T18 | Count correction after later sales | Current physical correction preserves later activity |
| T19 | Refund for consumed shot | Money corrected; stock not automatically returned |
| T20 | Return unopened bottle | Explicit authorised stock return with correct sealed state |
| T21 | Archive stock with balance or live product reference | Blocked with actionable explanation |
| T22 | Reverse duplicate unused receipt | Stock, cost, payable, PO and journal reconcile |
| T23 | Reverse receipt after consumption or supplier settlement | Correct supported treatment or explicit dependency blocker |
| T24 | Correct same transaction twice | Remaining correctable amount enforced; no duplicate reversal |
| T25 | Cost per case converted to per ml | Total valuation matches invoice under precision policy |
| T26 | Two opened 750 ml bottles, 400 ml each | Extended model preserves 800 ml open; never creates a sealed bottle; legacy mode rejects clearly |
| T27 | Configuration-only presentation upgrade | Stock total, value, balances and history unchanged |
| T28 | Old and new client compatibility | Unsupported commands/model versions rejected before mutation |
| T29 | Committed operation followed by failed refresh | Clear saved/pending-refresh state; no invitation to duplicate |
| T30 | Low-permission user bypasses UI | Backend rejects unauthorised correction |

Run meaningful TypeScript/unit tests, Rust domain tests, shared PostgreSQL integration tests and native/browser operator-flow tests as applicable. `npm run verify:release` is the inspected repository's aggregate release script; inspect its current definition and prerequisites before running it. Source checks and a frontend build alone cannot certify Rust handlers, applied cloud migrations, or the Windows installer.

Record test build hash, migration/capability versions, authority mode, fixture source, results and unresolved defects. Use a restored copy of representative business data for the upgrade rehearsal, with sensitive customer data handled appropriately.

## 14. Deployment plan without resetting the terminal

### 14.1 Before rollout

1. Record the installed application version/build, authority mode, migrations/capabilities and sync state.
2. Capture a supported backup of the authoritative data and terminal-specific state; verify restoration in a separate environment.
3. Record control totals: quantities and sealed/open balances by location, stock valuation, open orders, till balances, supplier balances and pending commands.
4. Review representative items: bottle-only wine, shot-selling spirit, different bottle sizes, boxed wine, ordinary counted goods and recipe-linked stock.
5. Resolve or explicitly carry forward pending commands and drafts. Do not clear them solely to make the deployment appear clean.

### 14.2 Rollout sequence

Deploy compatible additive shared handlers/capabilities first where shared V2 is active. Install the compatible rebuilt terminal next. Keep new behaviour disabled until the terminal confirms required capabilities. Then apply reviewed product configuration and perform a limited physical-count pilot.

For legacy-local installations, validate the local path and upgrade its supported runtime without forcing authority migration. The terminal UI must display actual command outcomes appropriately in either mode.

Use the existing application data directory. Do not uninstall-and-delete the database, rerun initial opening balances, reimport all products, or overwrite stock from a spreadsheet as part of this upgrade.

The print-queue cancellation work is separate. It may be packaged in the same release only after both changes have independent validation; its status must not be mistaken for evidence that inventory changes passed.

### 14.3 Pilot acceptance

Pilot with a small representative group. Staff should complete bottle counts without a calculator, identify the correct correction action without developer help, and understand quick-count coverage. Reconcile pilot results against physical stock and the authoritative records.

Verify printing, till operation, receipt generation and ordinary sales still work on the actual Windows terminal. These are regression checks around the installed build, not reasons to redesign those working modules.

### 14.4 Rollback

A rollback must consider data written after activation. Turning off a feature flag may be safe for presentation-only behaviour; an older binary may be unsafe after multi-open state or new command semantics have been written.

Do not restore an old database over newer sales or shared data. Preserve intervening transactions and reconcile command outcomes first. Prefer disabling the new workflow and shipping a forward fix where data compatibility prevents a simple binary rollback. Rehearse this decision in the upgrade test environment.

## 15. Operator guidance to ship with the release

Provide a short in-app guide using the actual labels:

- **Count bottles:** select a location, enter sealed bottle counts, add open liquid only where enabled, review and confirm.
- **Quick count:** select the products being counted; other stock is unchanged.
- **Fix a count:** open the earlier record, choose Correct mistake, recount the affected stock and explain the error.
- **Wrong delivery:** open the goods receipt and use the supported correction workflow; do not compensate by entering an unrelated sale or waste record.
- **Wrong payment:** distinguish a recording mistake from money actually returned; select the correct workflow and stock disposition separately.
- **Pending result:** check the original action's status before repeating it.

Help text must explain missing configuration in business language, such as “Set the size of one bottle before counting bottles.” Keep field names and protocol details out of normal staff screens.

## 16. Definition of done

The initial release is complete when staff can count configured sealed bottles without conversion arithmetic; selected mixed-sale products expose clear open-liquid fields; both the active runtime and shared handler contracts agree; existing balances and valuation survive upgrade; current-balance corrections are accessible and auditable; durable drafts and retry behaviour work; and a restored-data rehearsal plus terminal pilot passes.

Quick counts are complete only when the backend enforces selected scope and leaves omitted items unchanged. Procurement corrections are complete only when all related stock and financial effects reconcile. Multiple-open support is complete only when every movement path preserves physical sealed stock and incompatible clients cannot write the extended state.

The report's recommendation is to begin with INV-01 through INV-06, retain existing canonical units, and release the changes through the established upgrade process. The operational goal is measurable: staff enter the physical facts they can see, and ServEOS handles the conversions and linked corrections reliably.

## Appendix A. Stable source references

Repository reference: [V2 baseline commit](https://github.com/davemusau00/SERVEOS-WEB/commit/0a1b10c0af5614fc8b1d1ce933c3909b9116da54).

- [Native inventory and count interface](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/native/NativeInventoryView.tsx)
- [Native catalog interface](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/native/NativeCatalogView.tsx)
- [Native operations and refunds](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/native/NativeOperationsViews.tsx)
- [Native procurement](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/native/NativeProcurementView.tsx)
- [Native master data](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/native/NativeMasterDataView.tsx)
- [Local domain handlers and stock movement logic](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src-tauri/src/store.rs)
- [Native tests](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src-tauri/src/tests.rs)
- [Shared sealed/open count handler](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/supabase/expansion/034_sealed_location_counts.sql)
- [Web inventory and correction controls](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/runtime/web/WebCatalogInventory.tsx)
- [Smart item setup](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/runtime/web/SmartItemDialog.tsx)
- [Runtime command and durable-outcome handling](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/runtime/RuntimeProvider.tsx)
- [Operation manifest and parity requirements](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/runtime/operationManifest.ts)
- [Dependency/version resolution](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/src/runtime/web/dependencies.ts)
- [Build and release scripts](https://github.com/davemusau00/SERVEOS-WEB/blob/0a1b10c0af5614fc8b1d1ce933c3909b9116da54/package.json)
