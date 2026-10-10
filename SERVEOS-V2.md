# SERVEOS V2.1
# FINAL DEVELOPMENT SPRINT: CORE PRODUCT COMPLETION & CRITICAL DEFECT RESOLUTION

**Repository:** `davemusau00/SERVEOS-WEB`  
**Development branch:** `reset/vps-platform`  
**Inspected baseline:** `9ed56dd251abc2bb77e0480c12a1ede88309112b`  
**Date:** 10 October 2026  
**Directive type:** Mandatory engineering execution specification  
**Deployment status:** STRICTLY DEFERRED

---

## 1. EXECUTIVE MANDATE

This development sprint must prioritize completion, stability, simplicity, financial correctness and the operational usefulness of the existing SERVEOS platform.

We are not commencing a new architectural rewrite.

We are not expanding into additional speculative features.

We are not deploying to production.

We are finishing the existing system to a standard at which a newly onboarded hospitality business can operate its daily activities without developer assistance.

### Primary engineering objectives

The development team shall complete these nine workstreams, in the order and with the dependencies established below.

| Workstream | Previous estimated maturity | Required final outcome |
|---|---:|---|
| Core API, database and commands | 85–90% | Regression-proven authoritative transaction engine |
| Administrator and onboarding | 85% | Complete role-specific first-use experience |
| POS and cash operations | 80% | Fast checkout, correct settlement and dependable recovery |
| CSV imports and catalogue | 75% | Easy first inventory load and safe bulk repricing |
| Stock and sealed/open bottles | 65–70% | Accurate physical opening counts and stock conservation |
| Hotel/resort operations | 65% | Fully working booking-to-checkout lifecycle |
| Direct PWA printing | 70% software | Real printer acceptance without a SERVEOS Print Bridge |
| Professional reports | 40–45% | Complete, accurate, attractive operational and financial reporting |
| Multi-terminal and recovery | 55–60% | Concurrent operation without duplicated, lost or corrupted transactions |

These maturity figures are prior engineering estimates, not measured test coverage. Developers must not mechanically increase percentages after adding files or passing unit tests.

**A workstream is complete only when its functional, financial, browser, operator and relevant physical acceptance gates have passed.**

### Operational success criterion

A business owner must be able to:

1. Register a new business and create its first administrator.
2. Configure the correct business type, outlets, stock locations and payment accounts.
3. Import products and opening stock.
4. Assign employees and appropriate roles.
5. Open a cashier shift.
6. Process products, portions, recipes, rooms and payments.
7. Print legitimate, professionally formatted business documents.
8. Track stock consumption, receiving, movement and discrepancies.
9. Close the operating day and reconcile cash, payments and stock.
10. Review accurate reports for a selected period.
11. Recover safely from interrupted operations.
12. Resume normal business activity on the next day.

No hidden SQL interventions, manual command replays, unapproved administrative workarounds or developer-only configuration steps may be necessary.

---

# PHASE 0: FIX THE THREE RELEASE-BLOCKING FAILURES

This phase takes precedence over every other workstream.

The inspected HEAD has four successful GitHub Actions jobs and one failed API/PostgreSQL job.

The API suite itself passed 37 tests, but the real-API browser suite reported four failures across desktop and mobile.

**No workstream may be considered release-ready while these failures remain.**

## DEFECT-001: SALES RECEIPT SETTLEMENT-STATUS INCONSISTENCY

**Severity:** P0  
**Affected capability:** POS, payments, immutable receipts and financial reporting

### Observed failure

The browser acceptance creates and fully pays a KES 100 sale.

PostgreSQL confirms the recorded sale and payment.

The issued receipt displays:

"Settlement balance not recorded in this document; tender recorded KES 100.00."

The browser test expects the document to truthfully identify the sale as settled.

### Relevant implementation

- `apps/api/src/payment-commands.mjs`
- `apps/api/src/pos-commands.mjs`
- `src/runtime/web/BusinessDocumentRenderer.tsx`
- `tests/browser/api-postgres-setup.spec.ts`

The payment command constructs a completed-sale receipt containing:

- `totalMinor`
- `paidMinor`
- `creditedMinor`
- `roomChargedMinor`
- Payment settlement lines

However, the receipt snapshot currently does not explicitly include `balanceMinor`.

The renderer's `paymentStatus()` function only displays "Settled when issued" if `snapshot.balanceMinor === 0`.

This is a specific source-level mismatch.

### Required implementation

**DEV-FIX-001A: Reconcile receipt settlement at issuance**

Use the authoritative completed order and settled payment state already available inside the transaction that issues the sales receipt.

The settlement invariant is:

`outstanding = total - recorded payments - approved account credit - valid room charges`

For a completed order, outstanding must equal zero.

Validate that all components are safe integer minor-unit amounts, and ensure existing settlement-line reconciliation remains intact.

**DEV-FIX-001B: Persist the required settlement fact**

Include the authoritative outstanding balance in the immutable receipt snapshot.

Where a completed order is being receipted, the verified snapshot should contain `balanceMinor: 0`.

Do not manufacture a balance in the renderer merely because some money was recorded.

Do not use a mutable current-order projection to recalculate an old issued receipt.

Preserve the snapshot's existing hash and versioning rules. Because the snapshot content changes, newly issued documents must be hashed using the final complete snapshot. Already-issued documents must remain immutable.

**DEV-FIX-001C: Render precise settlement states**

The document renderer must distinguish:

- Fully settled.
- Partially paid.
- Customer account allocation.
- Room charge allocation.
- Unpaid or unknown settlement state.
- Zero-value order that requires no payment.

A recorded cash payment must not automatically be described as full settlement unless the order's entire consideration is accounted for.

**DEV-FIX-001D: Add regression coverage**

Test:

- KES 100 fully paid in cash.
- Fully paid via manually confirmed M-Pesa.
- Split cash/M-Pesa settlement.
- Partial payment.
- Customer credit.
- Room folio charge.
- Zero-value sale.
- Receipt reprint after price changes.
- Refund after receipt issuance.
- Missing or tampered snapshot evidence.

### Acceptance criteria

- The original KES 100 test passes without weakening the assertion.
- A genuine completed order displays "Settled when issued".
- Partial payments do not appear fully settled.
- Immutable receipt values match the authoritative transaction records.
- Reprinting does not change historical payment status.
- Both desktop and mobile browser acceptance pass.

**Never fix this defect by hardcoding the word "Settled" into every receipt.**

---

## DEFECT-002: HOTEL CHECKOUT ACCEPTANCE FAILURE

**Severity:** P0  
**Affected capability:** Guest Accounts, accommodation posting, folio settlement, check-out and room lifecycle

### Observed failure

The real-API browser test creates:

- A hotel.
- Room type and room.
- Nightly rate.
- Guest.
- Walk-in reservation.
- Checked-in stay.
- Accommodation charge.
- Cash settlement.

The final checkout confirmation is not found.

The test attempts to locate the message:

"Guest account action confirmed and synchronized."

### Relevant implementation

- `src/runtime/web/WebHospitalityViews.tsx`
- `apps/api/src/hospitality-commands.mjs`
- `apps/api/src/room-commands.mjs`
- `tests/browser/api-postgres-setup.spec.ts`

### Important diagnostic detail

In the current Guest Accounts UI, confirmed outcomes are rendered using `role="status"`.

Rejected, blocked, conflicted or unknown outcomes are rendered using `role="alert"`.

Therefore, the absence of the expected status element may mean that the command returned a blocking outcome.

It is not sufficient to conclude that the message simply disappeared.

### Required implementation

**DEV-FIX-002A: Inspect the actual command result**

Instrument the test with safe diagnostics that capture:

- Operation name.
- Response status.
- Server error code.
- Sanitized error message.
- Command identifier.
- Reviewed entity versions.
- Relevant reservation, stay and folio states.

Record the result in CI artifacts.

Do not log passwords, payment credentials, session tokens or guest-sensitive personal data.

**DEV-FIX-002B: Verify checkout preconditions**

Before submitting `stay.checkOut`, confirm the authoritative database has:

- A checked-in reservation.
- A checked-in stay.
- All required booked accommodation periods posted.
- Zero outstanding folio balance.
- Zero unapplied deposit.
- No unresolved incompatible folio actions.
- The correct expected versions.

If a precondition is unmet, identify whether the prior UI action failed, the projection is stale, or the domain policy is incorrect.

**DEV-FIX-002C: Verify the final PostgreSQL transition**

After a confirmed checkout, assert:

- Reservation status is `CHECKED_OUT`.
- Stay status is `CHECKED_OUT`.
- Folio status is `CLOSED`.
- Outstanding balance is zero.
- There are no unaccounted deposits.
- Payment entries reconcile to charges.
- Checkout timestamps and actor are persisted.
- Expected room/housekeeping transitions are recorded.

**DEV-FIX-002D: Resolve refresh and state timing**

When the command is confirmed but the UI still holds an old projection, synchronize the original command result and refresh the relevant records.

Do not submit a second checkout command simply to make the screen update.

Ensure the operator receives a stable, accessible confirmation.

**DEV-FIX-002E: Improve failure presentation**

For a legitimate checkout blocker, display the precise business reason.

Examples:

- "KES 500 remains unpaid."
- "A deposit must be applied or refunded before checkout."
- "Accommodation for one booked night has not been posted."
- "This guest was already checked out. Refresh the stay."

Avoid generic "Something went wrong" messages.

### Acceptance criteria

- Checkout completes on desktop and mobile.
- The browser UI and PostgreSQL show consistent states.
- Repeating checkout cannot post duplicate entries.
- A rejected checkout preserves the existing reservation and folio.
- A lost response can be reconciled without resubmitting financial activity.
- The acceptance test detects both `status` and `alert` outcomes appropriately during diagnosis, while requiring confirmed success for the passing scenario.

---

## DEFECT-003: INCOMPLETE PROFESSIONAL REPORTING

**Severity:** P0  
**Affected capability:** Sales, finance, stock, procurement, management and hospitality reporting

### Observed implementation gap

The repository's `docs/report-catalogue.md` confirms that full historical-period reporting is not implemented for several major operational areas.

In particular:

- Full sales-period registers and summaries are missing.
- Historical stock valuation reports are missing.
- Supplier payable statements are incomplete.
- Management revenue and occupancy reporting is incomplete.
- Existing browser projections often expose bounded recent-history data.
- Some views display only the latest 1,000 records.
- The current close-day CSV export is a hash-verified snapshot export, not a full financial-period reporting engine.

These limitations are unacceptable for a mature ERP/POS.

### Core requirement

**Reports must query complete, authorized, authoritative data for the selected period.**

Never construct financial reports merely by summing whatever happens to be visible in the browser's recently loaded records.

This report workstream is detailed in Phase 8 below.

### Acceptance criteria

The required reports must support:

- Complete selected date ranges.
- Correct tenant, outlet and permission scoping.
- Pagination without loss of report totals.
- Reconciled monetary and inventory amounts.
- Professional A4 printing.
- Appropriate CSV export.
- Explicit document provenance.
- Meaningful empty-state handling.

**Do not mark reporting complete simply because the report catalogue exists.**

---

# PHASE 1: CORE API, DATABASE AND BUSINESS COMMAND REGRESSION

**Priority:** P0  
**Previous maturity:** 85–90%  
**Objective:** Establish that the transaction engine is trustworthy under real operational conditions.

## 1.1 Freeze and verify the intended architecture

Maintain:

- Node API as the authoritative business command processor.
- PostgreSQL as the transactional source of truth.
- Centralized authentication and authorization.
- Tenant-scoped data access.
- Version-controlled commands.
- Idempotent retries.
- Immutable accounting and transaction evidence.
- IndexedDB as browser-local projection and recovery support.

Do not allow frontend screens to directly update business records outside the API command architecture.

Do not reintroduce duplicate legacy engines.

## 1.2 Review the full command registry

Inventory every currently registered business command.

Group commands by:

- Setup and business configuration.
- Product and catalogue.
- Inventory.
- Procurement.
- POS orders.
- Payments.
- Refunds.
- Till and shift.
- Hospitality.
- Reporting.
- Document issuance and printing.
- Staff and permissions.

For each command, document:

- Input contract.
- Required permissions.
- Expected-version requirements.
- Transaction boundaries.
- Idempotency key behavior.
- Result shape.
- Projection updates.
- Failure codes.
- Whether offline queueing is permitted.
- Whether money or stock changes.
- Associated documents or journal entries.

Commands with missing or inconsistent behavior must be corrected before functional acceptance.

## 1.3 Transaction integrity tests

**DEV-CORE-001**

Prove atomicity of financial and inventory operations.

A successful payment may affect:

- Order settlement.
- Payment record.
- Till cash entries.
- Financial journals.
- Business document issuance.
- Print-job creation.

These records must not become partially committed.

Similarly, a completed stocked sale must not independently succeed while the required stock deduction fails.

Use the existing domain transaction mechanism rather than coordinating several business writes in the browser.

## 1.4 Duplicate and retry protection

**DEV-CORE-002**

For all critical commands:

- Same command ID and same payload must resolve to the original outcome.
- Same command ID and conflicting payload must be rejected.
- Two identical button clicks must not create duplicate financial entries.
- A client timeout after commit must not trigger another payment.
- Network recovery must query or reconcile the original command.
- Version conflict messages must instruct the operator to refresh and review.
- Duplicate external M-Pesa references must be handled according to the existing payment policy.
- A failed command must leave no partial journal or stock movement.

## 1.5 Data constraints

**DEV-CORE-003**

Verify database-level enforcement of:

- Business/tenant boundaries.
- Foreign-key integrity.
- Supported units.
- Non-negative monetary values where required.
- Valid stock quantities.
- Unique active SKUs.
- Relevant barcode uniqueness.
- Unique financial source references.
- Legal business-state transitions.
- Valid till ownership.
- Valid room occupancy.
- Immutable issued document identity.

Backend validation and database constraints must complement each other.

### Core API release gate

Require a successful clean PostgreSQL migration and execution of all API tests, including integration fixtures that compare actual persisted balances, journals and business outcomes.

All newly corrected failure scenarios must become permanent regression tests.

---

# PHASE 2: ADMINISTRATOR, STAFF AND ROLE-SPECIFIC ONBOARDING

**Priority:** P0  
**Previous maturity:** 85%  
**Objective:** Make first use achievable by an ordinary hospitality operator.

## 2.1 First-administrator creation

**DEV-SETUP-001**

Test completely fresh installation state with:

- No previous business administrator.
- One-time setup credential.
- Correct administrative account creation.
- Correct first session.
- Secure setup credential retirement.
- Successful business defaults initialization.

The setup credential must not remain in browser storage or become reusable after first initialization.

Test reload, tab closure and interrupted network responses.

## 2.2 Guided business-type configuration

**DEV-SETUP-002**

The onboarding wizard must adapt to the chosen operational model.

**Bar or club:** outlet, storage, payment account, products, sealed/open stock count, staff, first till.

**Restaurant or café:** outlet, kitchen routing, ingredient stock, menu, recipes, cashier and preparation staff.

**Hotel or resort:** room types, room inventory, rate plans, Front Desk, accommodation payment accounts, staff and guest folio setup.

**Retail counter:** outlet, warehouse, catalogue, checkout, payment and inventory.

Avoid asking users to configure unrelated features before opening their core workspace.

## 2.3 First-day readiness checklist

**DEV-SETUP-003**

Create a first-use checklist showing:

- Required setup completed.
- Required setup outstanding.
- Recommended setup.
- Optional modules.
- Problems preventing trading.
- Test transaction readiness.
- Printer readiness.
- Initial inventory readiness.

Each checklist item must deep-link to the appropriate screen and accurately reflect persisted setup state.

## 2.4 Role-specific training

**DEV-SETUP-004**

Complete distinct first-use paths for:

- Administrator.
- Manager.
- Cashier.
- Storekeeper.
- Bar attendant.
- Front Desk receptionist.
- Kitchen staff.
- Accountant.

Each walkthrough must demonstrate only actions available under that role's permission set.

Include realistic tasks, not merely generic feature descriptions.

### Onboarding release gate

On a disposable fresh PostgreSQL business, an operator should be able to create the business and complete the first core transaction without developer guidance or database access.

The test must cover desktop and tablet-sized interfaces, keyboard access, form validation, reload and permission boundaries.

---

# PHASE 3: POS, CASH OPERATIONS AND PAYMENT RECOVERY

**Priority:** P0  
**Previous maturity:** 80%  
**Objective:** Make everyday selling fast, understandable and financially correct.

## 3.1 Simplified counter checkout

**DEV-POS-001**

The current ordinary sale flow contains too many confirmation stages.

Introduce a dedicated quick counter-sale experience while preserving detailed service workflows where necessary.

The expected cashier journey is:

**Find or scan item → set quantity → choose payment → confirm → receive receipt.**

The system may internally create, fire and settle an order through existing authorized commands.

Do not merge these operations in a way that bypasses transaction or inventory checks.

The UI should not force ordinary retail/bar counter customers through unnecessary table-service screens.

## 3.2 Preserve separate service modes

**DEV-POS-002**

Differentiate:

- Immediate retail/counter sale.
- Bar order.
- Kitchen/restaurant order.
- Open customer tab.
- Table service.
- Guest room charge.
- Customer credit sale.

Use shared business commands and money rules wherever possible.

Do not create separate financial implementations for each workflow.

## 3.3 Improve the cashier interface

**DEV-POS-003**

Required improvements:

- Fast product search.
- Barcode input support.
- Clear product variants and portions.
- Touch-friendly quantity controls.
- Visible unit and line prices.
- Discount and tax visibility.
- Accurate basket total.
- Clear payment methods.
- Cash tendered and change.
- Manual M-Pesa reference entry.
- Correct split payment where supported.
- Obvious transaction outcome.
- Clear link to issued receipt.
- Fast next-sale reset.

The active outlet, shift and operator must be visible.

## 3.4 Payment recovery

**DEV-POS-004**

Test:

- API unavailable before payment.
- Request committed but response lost.
- Cashier clicks Confirm twice.
- Cashier refreshes during payment.
- Payment account configuration changes.
- Till closes on another terminal.
- M-Pesa reference is reused.
- Partial payment remains outstanding.
- Split payment retries after one unknown result.

Never offer an unsafe "Try again" action that blindly posts a new payment after an unknown outcome.

Show the original transaction ID and recovery state.

## 3.5 Till and shift reconciliation

**DEV-POS-005**

Verify:

- Opening float.
- Cash sales.
- Cash refunds.
- Cash drawer additions and withdrawals.
- M-Pesa collections.
- Card collections, where applicable.
- Expected closing cash.
- Actual counted cash.
- Variance.
- Manager authorization for applicable overrides.
- Shift close report.
- Day-close report.

A cash refund must not automatically restore physical inventory.

Stock restoration requires an appropriate and auditable stock disposition.

### POS release gate

Run a complete cashier shift on real API/PostgreSQL fixtures involving cash, M-Pesa, split tender, multiple orders, partial payments, refunds and close-day reconciliation.

Amounts must agree across POS, payment records, cash drawer, journal and issued reports.

---

# PHASE 4: CSV IMPORTS, PRODUCT CATALOGUE AND BULK REPRICING

**Priority:** P0  
**Previous maturity:** 75%  
**Objective:** Enable rapid, reliable setup and maintenance of a real Kenyan hospitality catalogue.

## 4.1 Maintain the current import contract

**DEV-IMPORT-001**

Continue to use the existing API-controlled CSV importer:

`apps/api/src/csv-import.mjs`

The standard first-load template is `sellableItems`.

Preserve its existing create-only semantics.

No existing inventory, prices or product identities may be overwritten through a create-only import.

## 4.2 Make templates understandable

**DEV-IMPORT-002**

For every import template, provide:

- Downloadable blank template.
- Downloadable example template.
- Column definitions.
- Required fields.
- Conditional requirements.
- Supported enum values.
- Example product category.
- Unit calculation examples.
- Barcode formatting guidance.
- Validation limits.
- Common error explanations.

Product examples should cover:

- 24-piece soda crate.
- Single bottled beer.
- Whisky with shot and bottle pricing.
- Wine sold by glass.
- Stock-only maize flour.
- Stock-only cooking oil.
- Service with no stock.
- Room-related services.

## 4.3 Improve validation and preview

**DEV-IMPORT-003**

Before applying an import, show a structured analysis of:

- Total rows.
- Valid rows.
- Invalid rows.
- Duplicate product codes.
- Duplicate barcodes.
- Missing outlet references.
- Missing storage references.
- Missing tax classifications.
- Invalid unit conversions.
- Invalid prices.
- Invalid acquisition costs.
- Spirit/wine tracking problems.
- Potential duplicates against existing records.

For each invalid row, display the affected field, incorrect value and suggested correction.

Downloadable row-error exports are recommended.

## 4.4 First-load quantities and valuation

**DEV-IMPORT-004**

Clearly explain and consistently enforce:

`package base quantity = units_per_package × quantity_per_unit`

`opening base quantity = opening_packages × package base quantity`

`base-unit cost = package purchase_price ÷ package base quantity`

Currency input uses KES and must convert reliably to integer minor units.

A purchase price is not a selling price.

A purchase package is not necessarily the same quantity as the selling unit.

## 4.5 Bulk repricing

**DEV-IMPORT-005**

Implement a separate **reviewed price-update workflow** for existing products.

It must not be disguised as another create-only stock import.

Required columns should include an unambiguous existing product identifier, new selling price and an optional reason or authorized effective-time field.

Use current product code or a controlled export identifier rather than relying solely on human-readable names.

The operation must:

1. Match the correct existing products.
2. Display old and proposed prices.
3. Identify unknown codes.
4. Identify duplicates in the update sheet.
5. Reject ambiguous matches.
6. Validate monetary precision.
7. Validate permissions.
8. Show the number of affected products.
9. Require explicit confirmation.
10. Apply updates through audited catalogue commands.

Preserve historical orders, receipt snapshots, margins and tax evidence.

For concurrent changes, reject stale reviewed versions instead of silently overwriting a newer operator's update.

## 4.6 Catalogue consistency

**DEV-IMPORT-006**

Ensure product editing can independently manage:

- Product name.
- SKU/code.
- Category.
- Barcode.
- Selling price.
- Tax classification.
- Service route.
- Outlet availability.
- Stock link.
- Portions.
- Recipe links.
- Archived state.

Products without a valid stock or recipe link must be visibly classified according to their actual stock behavior.

### Import release gate

Import a realistic 100-item hospitality fixture using a mix of bar, restaurant, retail and stock-only products.

Then update prices for a subset of existing products without creating duplicates or changing historical transaction values.

Verify database rows, stock quantities, valuation, product visibility and representative sales.

---

# PHASE 5: STOCK, SEALED/OPEN BOTTLES AND INVENTORY CONSERVATION

**Priority:** P0  
**Previous maturity:** 65–70%  
**Objective:** Ensure physical stock and system stock remain consistent from first count through closing.

## 5.1 Correct the opening-count workflow

**DEV-STOCK-001**

The first stock import may establish total quantities without fully recording physical sealed/open bottle state.

This must be addressed before operational rollout.

For each spirit or wine stock item:

- Validate base unit `ml`.
- Validate bottle/container size.
- Validate package conversion.
- Validate serving/portion sizes.
- Capture sealed bottle count.
- Capture total open-liquid quantity.
- Reconcile the measured physical total.
- Confirm the stock location.
- Record the responsible staff member.
- Create appropriate reviewed inventory evidence.

A first import must never silently assume an opened bottle is sealed or vice versa.

## 5.2 Clarify bottle-state limitations

**DEV-STOCK-002**

The current bottle model supports sealed containers plus an aggregate opened-liquid remainder constrained below one full bottle per stock item/location.

Review this carefully against real bar practice.

Determine whether the system can correctly accommodate:

- Multiple independently opened bottles of the same brand.
- Bottles held in different bar stations.
- Partially consumed bottles.
- Measured free pours.
- Spillage.
- Breakage.
- Whole sealed-bottle sales.
- Transfers between the store and bar.

Where the business requires multiple independent open bottles, implement an appropriate physical-state model or formally identify and resolve the product limitation.

Do not hide the limitation behind total-millilitre arithmetic.

## 5.3 Stock conservation

**DEV-STOCK-003**

Every stock movement must have a documented reason and matching evidence.

Test:

- Opening stock.
- Supplier receipt.
- Receiving partial packages.
- Store-to-bar transfer.
- Shot sale.
- Bottle sale.
- Ingredient consumption.
- Stock waste.
- Breakage.
- Physical count.
- Variance adjustment.
- Refund with stock return.
- Refund without stock return.

For bottle stock:

`total ml = sealed bottle count × container size + open ml`

For location inventory:

`closing quantity = opening + receipts + transfers in - transfers out - consumption - waste + adjustments`

Apply the system's actual rounding and precision rules consistently.

## 5.4 Inventory reports

**DEV-STOCK-004**

Provide clear, printable/exportable reports for:

- Current stock on hand.
- Stock by physical location.
- Stock value by category and location.
- Stock movements.
- Purchase receipts.
- Stocktake variance.
- Sealed/open bottle reconciliation.
- Stock below reorder level.

Reports must show the applicable quantity units and valuation method.

Do not use current average cost to fabricate historical valuation.

### Stock release gate

Prove a representative inventory sequence using 250ml, 500ml, 750ml and 1-litre containers, with varied selling portions and physical counts.

No unexplained negative stock, missing inventory movement or incorrect ml conservation is acceptable.

---

# PHASE 6: HOTEL AND RESORT OPERATIONS

**Priority:** P0  
**Previous maturity:** 65%  
**Objective:** Complete the full guest lifecycle and eliminate the current checkout failure.

## 6.1 Core accommodation workflow

**DEV-HOTEL-001**

Test the following uninterrupted operator journey:

1. Configure property.
2. Configure room categories.
3. Create rooms.
4. Define rates.
5. Create a guest.
6. Make reservation.
7. Confirm availability.
8. Check in.
9. Post accommodation.
10. Post additional services.
11. Receive deposit or payment.
12. Apply credits/deposits correctly.
13. Settle folio.
14. Check out.
15. Print final guest documents.
16. Update room readiness and housekeeping.
17. Verify management and financial reports.

The current booking-to-checkout CI defect must be resolved in this phase.

## 6.2 Room pricing and stay duration

**DEV-HOTEL-002**

Verify:

- One-night booking.
- Multiple nights.
- Correct nightly rate.
- Room-rate changes.
- Stay extensions.
- Walk-in guests.
- Overlapping reservations.
- Room unavailable for maintenance.
- Housekeeping restrictions.
- Late or early checkout, where applicable.

Rates must be captured consistently in transaction snapshots so a later rate-plan change does not change the financial value of an existing booking.

## 6.3 Folio correctness

**DEV-HOTEL-003**

Ensure:

- Accommodation postings are not duplicated.
- Restaurant room charges post to the correct guest.
- Deposits remain distinct from settled revenue.
- Cash payments reconcile.
- Manual external payments retain the appropriate reference.
- Reversals do not erase historical entries.
- Check-out is blocked when a valid balance or deposit issue remains.
- Final folio statements accurately represent the stay.

## 6.4 Hotel documents and reporting

**DEV-HOTEL-004**

Provide polished documents for:

- Reservation confirmation.
- Guest folio.
- Room invoice.
- Payment acknowledgement.
- Checkout statement.

Add reconciled occupancy and room-revenue reporting in the reporting phase.

### Hotel release gate

Real PostgreSQL browser acceptance must pass for both normal and blocked checkout scenarios on desktop and mobile.

Verify the entire guest lifecycle through authoritative database records.

---

# PHASE 7: DIRECT PWA PRINTING AND PHYSICAL PRINTER ACCEPTANCE

**Priority:** P0  
**Previous maturity:** 70% software  
**Objective:** Make browser printing fully practical without a SERVEOS Print Bridge.

## 7.1 Preserve the bridge-free design

**DEV-PRINT-001**

The expected path is:

**Open issued document → Preview → Print → Native browser/OS print dialog → Operator verifies physical output.**

No SERVEOS-installed Print Bridge, service, pairing helper, localhost agent or browser extension may be required.

The printer may use its normal operating-system driver.

Do not advertise universal silent or unattended thermal printing.

## 7.2 Receipt layout requirements

**DEV-PRINT-002**

The thermal receipt must display:

- Business identity and logo.
- Receipt number.
- Date/time.
- Outlet.
- Cashier.
- Item description.
- Quantity.
- Unit price.
- Line total.
- Applicable discounts.
- Net amount and tax information.
- Grand total.
- Payment method.
- Amount paid.
- Change or balance, where relevant.
- Genuine owner-approved M-Pesa QR when enabled.
- Footer.
- Original/reprint identification.

The M-Pesa QR must appear **below the financial totals and above the footer**, with sufficient printable margin and a valid quiet zone.

Avoid clipping, illegible small text, distorted logos and oversized blank sections.

## 7.3 Printing lifecycle

**DEV-PRINT-003**

Preserve the existing distinction between:

- Transaction confirmed.
- Document issued.
- Print attempt claimed.
- Browser print dialog invoked.
- Delivery uncertain.
- Operator-confirmed physical output.
- Reprint after duplicate acknowledgment.

Opening a print dialog is not proof of paper delivery.

Cancelling printing must never cancel or duplicate a financial transaction.

## 7.4 Actual hardware tests

**DEV-PRINT-004**

Test a supported operating-system printer, preferably the known Xprinter XP-80 hardware when authorized.

Record:

- Device operating system.
- Installed PWA/browser.
- Printer driver.
- Paper width.
- Actual printable width.
- Margins.
- Receipt length.
- Logo.
- QR scan.
- Long product names.
- Multiple payment lines.
- Reprint labeling.
- Printer unavailable behavior.

### Printing release gate

A genuine issued receipt must print successfully from the installed PWA without a SERVEOS Print Bridge.

Automated `window.print()` interception does not satisfy this gate.

---

# PHASE 8: PROFESSIONAL FINANCIAL AND MANAGEMENT REPORTS

**Priority:** P0  
**Previous maturity:** 40–45%  
**Objective:** Deliver complete, trustworthy, professional reports rather than partial dashboard projections.

## 8.1 Build a proper authoritative reporting layer

**DEV-REPORT-001**

Reports must be generated from PostgreSQL queries appropriate for the selected reporting scope.

Do not infer period totals from browser bootstrap records.

Do not assume 1,000 recently loaded rows represent the complete historical period.

Implement report-oriented API queries with:

- Explicit tenant scoping.
- Correct permissions.
- Start/end date.
- Business timezone.
- Outlet/location filters.
- Appropriate status filters.
- Stable pagination.
- Complete aggregate totals.
- Source-record provenance.
- Clear definitions of every metric.

Where relevant, expose total count, page metadata and aggregate results independently of the current visible result page.

## 8.2 Sales reports

**DEV-REPORT-002**

Implement:

**Sales summary**

- Gross sales.
- Net sales.
- Discounts.
- VAT and levies.
- Refunds.
- Payment breakdown.
- Sales by outlet.
- Sales by operator.
- Sales by product/category.

**Detailed sales register**

- Timestamp.
- Receipt/order reference.
- Product.
- Quantity.
- Unit price.
- Discount.
- Tax.
- Gross/net total.
- Payment settlement.
- Refund status.

Differentiate sales recognized for a period from cash collected during that period.

Do not equate a payment report with a sales report.

## 8.3 Finance and cash reports

**DEV-REPORT-003**

Implement:

- Shift close and variance.
- Cash movement register.
- Close-day statement.
- Payment method reconciliation.
- Refund register.
- Journal report.
- Expense register.
- Customer credit/account report.
- Outstanding receivables where supported.

The existing close-day report is the starting point, not a replacement for full-period financial reporting.

## 8.4 Inventory and procurement reports

**DEV-REPORT-004**

Implement:

- Current stock quantities.
- Stock value by location/category.
- Stock movement history.
- Purchase receipts.
- Goods received and rejected.
- Stocktake variance.
- Sealed/open ml reconciliation.
- Supplier purchases.
- Supplier balances.
- Supplier credits and returns.

Historical valuation must come from appropriate transaction/cost evidence rather than the current average-cost field.

## 8.5 Hotel management reports

**DEV-REPORT-005**

Implement:

- Room availability.
- Occupied rooms.
- Occupancy percentage.
- Room nights.
- Room revenue.
- Accommodation charges.
- Folio payments.
- Outstanding guest balances.
- Guest check-in/check-out register.

Document exact metric definitions.

Do not present current occupancy as historical occupancy for an earlier date.

Do not combine rooms blocked for maintenance with occupied rooms without clearly defining the calculation.

## 8.6 Professional report presentation

**DEV-REPORT-006**

All essential reports must support a polished reading and printing experience.

Required elements:

- Business name and logo.
- Report title.
- Selected dates.
- Filter context.
- Generation timestamp.
- Report/reference ID.
- Clearly styled KPI summaries.
- Well-spaced tables.
- Numeric column alignment.
- Category subtotals.
- Overall totals.
- Variance indicators.
- Clear explanatory notes.
- Page numbering when reliably supported.
- Appropriate footer and signatures where relevant.

Support both A4 portrait and landscape.

Use intentional page breaks and repeated headings where supported.

Avoid cut-off columns, horizontal scrolling on paper, microscopic typography and truncated detail.

## 8.7 Report export

**DEV-REPORT-007**

Provide appropriately structured:

- Browser preview.
- Native browser printing.
- Print-to-PDF.
- CSV export for tabular reports.

Keep the existing immutable close-day CSV as an audit-oriented snapshot export.

Do not mistake its JSON-path/value format for a user-friendly sales or stock register.

Report CSV exports should use proper business-oriented columns, units and references.

Protect spreadsheet exports against formula injection, preserve codes with leading zeros, and avoid lossy conversions of monetary amounts.

## 8.8 Report reconciliation

**DEV-REPORT-008**

For each major report, provide a known PostgreSQL fixture with independently calculated expected totals.

Test:

- No transactions.
- Normal trading day.
- Multiple outlets.
- Refunds.
- Partial payments.
- Credit transactions.
- Overnight business-day boundaries.
- Many transactions exceeding bootstrap limits.
- Multiple pages.
- Permission-restricted staff.
- Concurrent new transactions during report generation.

The report must have consistent query/snapshot semantics so aggregates and detail rows do not contradict each other.

### Reporting release gate

A manager must be able to select a complete historical date range, obtain accurate totals, inspect the underlying records, export a usable CSV, and print a professional A4 report.

Neither visual quality nor data accuracy may be sacrificed for the other.

---

# PHASE 9: MULTI-TERMINAL CONSISTENCY AND FAILURE RECOVERY

**Priority:** P0  
**Previous maturity:** 55–60%  
**Objective:** Prove the system operates safely with simultaneous staff and unreliable connectivity.

## 9.1 Two-terminal integration tests

**DEV-SYNC-001**

Run two independent authenticated clients against the same disposable PostgreSQL business.

Required scenarios:

- Two cashiers sell the same product concurrently.
- One cashier changes quantity while another reviews an order.
- Storekeeper counts stock while cashier sells.
- Two users attempt to modify the same price.
- Manager closes a till while a cashier prepares payment.
- Two staff members try to post the same external reference.
- One terminal completes an operation while another remains stale.

The API must preserve authoritative version and financial consistency.

## 9.2 Interrupted commands

**DEV-SYNC-002**

Test:

- Request never reaches the server.
- Server commits but response is lost.
- Device reloads after submission.
- Internet disconnects during read/sync.
- Authentication expires.
- Same command is retried.
- A different command is submitted against a stale version.

The UI must identify original pending operations and recover their outcomes.

Do not silently regenerate command IDs during a retry of the same logical operation.

## 9.3 Offline semantics

**DEV-SYNC-003**

Document which operations may safely be queued offline.

Do not allow financial actions that require immediate authoritative confirmation to appear completed while disconnected.

Offline drafts must be visibly different from confirmed records.

Where user action requires connectivity, explain this clearly.

## 9.4 Cross-device projections

**DEV-SYNC-004**

After synchronization, both terminals must agree on:

- Stock balances.
- Product prices.
- Order status.
- Till status.
- Guest folio balances.
- Payment states.
- Stock-count versions.

No stale view may quietly overwrite newer authoritative data.

### Multi-terminal release gate

Run a documented concurrency suite against real PostgreSQL using two independent sessions and injected connection failures.

Demonstrate zero duplicate financial effects, no lost confirmed transactions and correct conflict recovery.

---

# PHASE 10: FINAL INTEGRATED ACCEPTANCE

This phase is mandatory after the workstreams above.

## 10.1 End-to-end business scenarios

Create three primary disposable fixture businesses:

**Scenario A: Bar and restaurant**

Initial setup → product import → sealed/open counts → first purchase receipt → stock movement → counter/bar/restaurant sales → cash/M-Pesa → kitchen tickets → refunds → close till → stock and sales reports.

**Scenario B: Hotel and resort**

Initial setup → room types/rates → reservation → check-in → room and restaurant charges → payment/deposit → folio settlement → checkout → guest statement → management reporting.

**Scenario C: Multi-terminal operations**

Two staff identities → concurrent stock and sales activities → network interruption → command recovery → reconciled payment/stock state → accurate close-day report.

## 10.2 Full acceptance requirements

A workstream may be marked complete only when all relevant evidence exists:

| Evidence class | Meaning |
|---|---|
| Source implemented | Required source exists |
| Unit tested | Business logic checks pass |
| API tested | Real domain/API behavior passes |
| PostgreSQL verified | Persisted records reconcile |
| Browser tested | Actual intended UI flow passes |
| Multi-device tested | Concurrent behavior is correct |
| Print validated | Browser output format is correct |
| Physically validated | Approved hardware produces correct paper |
| Operator accepted | Intended staff role completes task |
| Documentation verified | Guides match the current interface |

A test that only checks a command exists does not prove that an operator can use it.

A simulated print dialog does not prove physical printing.

A passing finance-unit test does not prove a correct management report.

A complete UI mock does not prove the underlying database transaction.

## 10.3 Required regression test matrix

| ID | Required scenario | Minimum acceptance |
|---|---|---|
| R001 | Fresh administrator creation | Successful, one-time bootstrap |
| R002 | Reload during onboarding | Resumes without duplication |
| R003 | Role-specific first use | Correct permissions and screens |
| R004 | Product catalogue creation | Valid product and stock links |
| R005 | First CSV stock import | Correct staged/applied records |
| R006 | Invalid CSV | Clear row-level errors |
| R007 | Repeat create-only import | No silent duplicates |
| R008 | Bulk price update | Correct reviewed updates |
| R009 | Historical price integrity | Old receipts remain unchanged |
| R010 | Physical bottle count | Correct sealed/open state |
| R011 | 45ml serving sale | Exactly 45ml consumed |
| R012 | Whole-bottle sale | Correct sealed deduction |
| R013 | Store-to-bar transfer | Quantity conserved |
| R014 | Ingredient recipe sale | Correct stock consumption |
| R015 | Cash sale | Correct settlement and receipt |
| R016 | Split payment | Correct multi-tender accounting |
| R017 | Manual M-Pesa | Correct recorded reference |
| R018 | Payment timeout | No duplicate money |
| R019 | Cash refund | Correct refund and drawer evidence |
| R020 | Till close | Correct expected/counted variance |
| R021 | Hotel reservation | Correct room availability |
| R022 | Hotel accommodation posting | Correct folio entries |
| R023 | Hotel payment | Correct settlement |
| R024 | Hotel checkout | Reservation, stay, folio closed |
| R025 | Hotel checkout blocked | Appropriate error, no damage |
| R026 | Sales receipt status | Correct original settlement |
| R027 | Receipt reprint | Immutable snapshot retained |
| R028 | 80mm receipt print | Actual paper output |
| R029 | M-Pesa QR | Correct physical scan |
| R030 | Sales-period report | Complete, reconciled period |
| R031 | Inventory valuation | Correct authoritative values |
| R032 | Supplier statement | Correct outstanding balance |
| R033 | Hotel occupancy report | Correct period metrics |
| R034 | Multi-page A4 output | No clipping or missing rows |
| R035 | Two-terminal sale | No double deduction |
| R036 | Simultaneous stock count | Version-safe reconciliation |
| R037 | Network interruption | Original command recovery |
| R038 | Permission isolation | No cross-role data exposure |
| R039 | Tenant isolation | No cross-business records |
| R040 | Complete CI | Green on one selected SHA |

---

# PHASE 11: DEVELOPER EXECUTION ORDER

Implement as reviewable pull requests.

| PR | Priority | Scope | Merge requirement |
|---|---|---|---|
| PR-00 | BLOCKER | Receipt settlement and hotel checkout defects | Full real-API browser suite green |
| PR-01 | P0 | API/DB/command regression hardening | Domain consistency proven |
| PR-02 | P0 | Product imports and bulk repricing | Correct 100-item fixture import |
| PR-03 | P0 | Physical stock and bottle-state continuity | Exact quantity conservation |
| PR-04 | P0 | Simplified cashier flow and payment recovery | Full cashier day passes |
| PR-05 | P0 | Hotel lifecycle and folio correction | Booking-to-checkout passes |
| PR-06 | P0 | Complete report query and reconciliation layer | No truncated period totals |
| PR-07 | P0 | Professional report layouts and exports | Approved A4/CSV specimens |
| PR-08 | P0 | Direct PWA receipt printing | Approved real thermal output |
| PR-09 | P0 | Multi-terminal and connectivity tests | No duplicate/lost transactions |
| PR-10 | P1 | Role-specific onboarding and UX polish | Operator walkthroughs pass |
| PR-11 | FINAL | Complete regression and acceptance pack | Release candidate approved for review |

Independent workstreams may be developed in parallel after PR-00, but they must not bypass shared domain contracts or merge with red mandatory tests.

The report-query foundation should start early because it has the largest functional gap.

The hotel and stock teams must coordinate with the reporting team so authoritative events and monetary data remain usable for full-period queries.

---

# PHASE 12: REQUIRED REPORTING FROM THE DEVELOPMENT TEAM

The development team must maintain an evidence-based completion dashboard throughout the sprint.

Each PR must include:

1. Commit SHA.
2. Summary of changed behavior.
3. Files changed.
4. Root cause of resolved defects.
5. Tests added or updated.
6. Tests executed.
7. Passing and failing results.
8. PostgreSQL evidence when relevant.
9. UI/browser screenshots or traces.
10. Physical print evidence when relevant.
11. Remaining limitations.
12. Effect on other modules.
13. Updated progress classification.
14. Recommended next action.

Use the following explicit statuses:

- **NOT STARTED**
- **IMPLEMENTED, NOT TESTED**
- **UNIT/API VERIFIED**
- **BROWSER VERIFIED**
- **PHYSICALLY VERIFIED**
- **OPERATOR ACCEPTED**
- **BLOCKED**
- **COMPLETE**

No percentage increase should be reported without naming the completed acceptance evidence.

## Final sprint exit criteria

The sprint is complete only when:

- All three critical failures are resolved.
- Core commands are regression-proven.
- Fresh onboarding and staff first use work.
- POS checkout is simple and resilient.
- Catalogue import and repricing are usable.
- Sealed/open stock reconciles.
- Hotel checkout passes real browser acceptance.
- The installed PWA produces real, legible printed receipts without a SERVEOS Print Bridge.
- Professional, complete date-range reports are available.
- Two terminals operate consistently.
- All mandatory CI and acceptance gates pass.
- Any remaining noncritical limitations are explicitly documented and accepted.
- A complete release-candidate evidence pack is produced.

## Strict deployment boundary

**STOP BEFORE PRODUCTION DEPLOYMENT.**

No changes are authorized to the live VPS, existing SERVEOS instances, pre-ServeOS applications, running databases, reverse-proxy routes, persistent volumes or current server release directories.

This sprint is solely about completing and proving the development product.

The future SERVEOS V2 fresh-stack deployment will be separately planned and separately authorized, with existing server installations preserved and unaffected.

## FINAL ENGINEERING INSTRUCTION

Do not respond to this directive by rewriting the roadmap alone.

Do not respond with an optimistic percentage.

**Implement the defects and workstreams, demonstrate the actual business workflows, and produce independently verifiable evidence.**

Begin with PR-00 and do not claim the sprint complete until the complete acceptance matrix has been satisfied.

The goal is a reliable business platform where every payment is traceable, every unit of stock is accounted for, every guest balance reconciles, every report is professionally prepared, and staff can operate without a developer standing beside them.