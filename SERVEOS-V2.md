# SERVEOS V2.1
# FINAL DEVELOPMENT SPRINT AND DAY-ONE ACCEPTANCE DIRECTIVE

**Repository:** `davemusau00/SERVEOS-WEB`  
**Target branch:** `reset/vps-platform`  

**Date:** 10 October 2026  
**Priority:** P0, product completion and release stabilization  
**Production deployment:** NOT AUTHORIZED

## 1. Executive mandate

This is the final product-completion sprint for SERVEOS V2.1.

The objective is to convert the existing hospitality ERP/POS into a dependable, understandable and professionally presented system that can be operated on Day One.

We are no longer prioritizing infrastructure expansion, speculative modules, architectural experimentation or additional complexity.

Development must concentrate on:

1. Restoring a completely green development and CI baseline.
2. Completing and simplifying the day-to-day hospitality operating experience.
3. Making product creation, stock onboarding and future inventory imports predictable and safe.
4. Producing excellent printed receipts, reports, invoices, statements and operational documents.
5. Printing these documents directly from the browser/PWA, without any SERVEOS Print Bridge installation.
6. Completing hotel, restaurant, bar, cashier, inventory, payment and financial acceptance.
7. Validating multi-device consistency and safe recovery from ordinary failures.
8. Preparing a plan for a future isolated fresh-stack redeployment while preserving every existing installation on the VPS.

Do not treat feature presence as feature completion.

A feature is complete only when it works through the intended operator interface, produces the correct authoritative business records, handles errors intelligibly, and passes documented acceptance tests.

## 2. Non-negotiable architecture and scope

Preserve the existing platform:

- React and TypeScript browser/PWA.
- Node.js business API.
- PostgreSQL as the authoritative database.
- IndexedDB for supported browser projections and recoverable offline state.
- Existing validated domain-command and authorization mechanisms.
- Existing financial, inventory, hospitality and business-document records.

Do not introduce a second POS, second inventory system, second database, competing import engine or alternative authentication layer.

Maintain necessary role permissions, HTTPS, idempotency, tenant separation, audit history, transaction consistency and data integrity.

Reduce operator friction rather than removing financial controls.

### Printing decision

**Direct PWA printing is mandatory.**

The operator must be able to print to an operating-system-configured printer using the native browser print dialog.

No SERVEOS Print Bridge, Windows service, companion application, localhost printer listener, device-pairing ceremony or browser extension may be necessary for everyday printing.

The legacy Print Bridge source can remain isolated temporarily if removing it would disrupt unrelated development checks. However, no normal V2 operator workflow should depend on it.

Do not promise universal silent or background printing. Standard browser printing requires user initiation and platform printer support.

### Deployment decision

**Do not deploy during this sprint.**

When deployment is separately authorized, install a fresh, isolated SERVEOS V2 stack without replacing or modifying pre-existing applications, APIs, databases, containers, hostnames, ports, volumes, proxy rules or release directories.

The previously deployed SERVEOS instances and all pre-ServeOS services must remain operational and untouched.

## 3. First action: repair the current broken CI baseline

### Observed problems

At inspected commit `f8f2ef06`, the frontend job fails during TypeScript checking.

`WebDocumentQueue` no longer accepts `apiAuth`, but the following callers still supply it:

- `src/runtime/web/WebApiGoodsReceipts.tsx`
- `src/runtime/web/WebApiPurchaseOrders.tsx`
- `src/runtime/web/WebApiSupplierPayments.tsx`

The compiler reports TS2322 property incompatibilities.

The preceding CI run also failed its new hotel end-to-end browser test at the Guest Accounts action confirmation stage on desktop and mobile.

### Instructions

**DEV-001: Correct the printing component contract**

- Establish one authoritative props interface for `WebDocumentQueue`.
- Remove obsolete `apiAuth` props from all call sites that no longer require them.
- Check every dynamic and static invocation of the component.
- Preserve API-authenticated print claim, report, confirmation and retry commands.
- Do not reintroduce the Print Bridge merely to satisfy the previous interface.
- Add a source-level regression test or compile-time coverage to prevent call-site drift.

**DEV-002: Repair hotel acceptance**

Investigate the actual command and state transitions in `tests/browser/api-postgres-setup.spec.ts`.

The scenario creates a hotel, room type, room, nightly rate, guest, walk-in reservation and guest account.

It subsequently posts accommodation, settles the balance and checks out.

Trace any failing call by its command name, server response, expected version, folio state and subsequent client projection.

Differentiate:

- A legitimate server-side domain conflict.
- A stale client projection.
- A premature UI success expectation.
- A permission or command payload error.
- A race between command confirmation and projection refresh.
- A genuine business-lifecycle defect.

Fix the root cause, not just the assertion.

Never insert arbitrary sleeps, suppress failed assertions or mark the test skipped to manufacture a green workflow.

**DEV-003: Restore all quality gates**

Required checks include:

- TypeScript and lint.
- Production build.
- API contracts.
- Architecture validation.
- Root unit tests.
- API and PostgreSQL integration.
- Desktop and mobile real-API browser acceptance.
- Production browser acceptance.
- Documentation and UI audit.

**Acceptance:** All mandatory jobs pass on the exact same HEAD commit. No failing test is silenced, and no test counts are inflated.

## 4. Product and inventory model: establish one authoritative structure

SERVEOS must maintain the distinction between a selling product and physical inventory.

### Authoritative relationship

**Product:** what appears on the POS and is sold to a customer.

**Stock item:** what the business purchases, stores, measures and counts.

**Stock location:** where a stock quantity physically exists.

**Outlet:** where an operator sells or serves products.

**Purchase package:** how stock is received and costed.

**Product portion:** quantity and price selected by the customer.

**Recipe:** stock ingredients consumed to fulfil a product.

**Inventory movement:** auditable change caused by opening balance, receiving, transfer, waste, count or sale.

These concepts must be visible and understandable in the interface without exposing internal IDs.

### Supported item classes

| Class | Required meaning |
|---|---|
| SERVICE | Sellable item without direct stock consumption |
| TRACKED | Sellable item linked to tracked physical stock |
| SPIRIT | Bottle stock measured in millilitres with serving rules |
| WINE | Bottle stock measured in millilitres with glass/bottle rules |
| STOCK_ONLY | Physical stock not directly sold |

The advanced Catalog also supports recipe and batch relationships. Those must continue using the existing domain model rather than pretending the simple CSV import automatically creates multi-ingredient recipes.

### DEV-004: Cleanly separate product and stock editing

The item interface must clearly distinguish:

- Selling price from acquisition cost.
- Selling product code from physical stock code.
- Barcode from internal identifier.
- Package units from individual physical units.
- Stock balance from stock-master configuration.
- Selling portion from purchase package quantity.
- Tax class from business-wide tax settings.
- Service route from physical storage location.

Managers should be able to explain these distinctions after a brief guided walkthrough.

Changing a product's price must not change inventory valuation.

Changing a stock item's opening quantity must create the appropriate reviewed inventory event rather than silently editing a quantity field.

### DEV-005: Define stable product identities

Implement or verify:

- Unique active product codes.
- Unique and validated applicable barcodes.
- Stable codes for each pack size and product variant.
- Separate 250ml and 500ml SKUs where appropriate.
- Consistent search by name, barcode and product code.
- Explicit active/archived status.
- Safe product reactivation and duplicate prevention.

Preserve leading zeros in all barcodes and reject malformed scanner identifiers before saving.

## 5. CSV import: make the first stock load dependable

**Primary source:** `apps/api/src/csv-import.mjs`  
**Operator UI:** `src/runtime/web/WebApiImportCenter.tsx`

The API currently publishes 13 import templates.

For a first operational catalogue, prioritize `sellableItems`, labelled **Products and opening stock (simple)**.

Its current required header structure must remain authoritative:

`name,code,stock_mode,price,category,barcode,tax_class_id,service_area,outlet_names,stock_location_name,base_unit,units_per_package,quantity_per_unit,purchase_price,opening_packages,reorder_level,container_size,portion_size,selling_mode,whole_container_price`

### DEV-006: Establish a formal import contract

Maintain an import schema specification describing:

- Every supported template.
- Exact headers.
- Required and optional columns.
- Conditional required fields.
- Accepted field values.
- Quantity and money precision.
- Duplicate rules.
- Required permissions.
- Existing dependency requirements.
- Whether the import creates, updates or rejects existing records.
- Any business operation required after applying the file.

Do not maintain conflicting static CSV specifications.

The PWA should obtain templates from the API and offer a downloadable header/template with understandable examples.

### DEV-007: Improve importer usability

The desired workflow is:

1. Choose the business-data category.
2. Download its template.
3. Upload or paste a prepared CSV.
4. View a validation summary.
5. Review blocked rows with plain-language explanations.
6. Run the server dry run.
7. Review what will be created.
8. Explicitly apply the import.
9. Receive a clear final result, including partial failures.
10. Confirm that actual records and starting quantities match the reviewed plan.

Avoid requiring operators to understand UUIDs, expected-version maps, command payloads or API endpoints.

Error output must identify the CSV row, column, rejected value, reason and corrective action.

Example: "Row 18: Viceroy 500ml uses stock_mode SPIRIT, so base_unit must be ml and quantity_per_unit must match container_size."

### DEV-008: Import safety and validation

Preserve the current limits unless an evidenced business need requires revising them:

- Maximum 2 MB CSV.
- Maximum 20,000 data rows.
- Preview limited to 500 rows, clearly labelled as a partial display.
- Exact allowed headers.
- No sensitive credential columns.
- Non-negative money values.
- Supported units and tax classes.
- Stable external references.
- Duplicate checks within the file and against business records.

A server dry run must not commit business records.

No import may silently overwrite an existing record.

A partially applied batch must provide an accurate per-row result and a safe correction procedure.

Applied row IDs and source hashes must remain auditable.

### DEV-009: Simplified first-stock initialization

The `sellableItems` importer currently uses `catalog.createWithOpeningStock`.

Preserve the command's atomic creation of:

- New stock master.
- Optional selling product.
- Product-to-stock link.
- Purchase package definition.
- Initial cost rate.
- Opening quantity movement, when nonzero.
- Actual storage location balance.

Do not split this into loosely coupled client-side operations that can leave a product disconnected from its stock.

The first import must make it easy to confirm:

- Number of products created.
- Number of stock-only items created.
- Total opening quantities by location.
- Opening stock valuation.
- Products missing tax classifications.
- Duplicate and rejected items.
- Stock items without sellable product relationships.
- Sellable products without stock or recipes where stock tracking is expected.

**Acceptance:** A new manager can import a realistic catalogue, verify stock on hand and make a test sale without manual SQL or API repairs.

## 6. Packaging, costs and physical unit handling

### DEV-010: Ensure package calculations are comprehensible

For every tracked item, display:

**Package quantity = units_per_package × quantity_per_unit**

**Opening quantity = opening_packages × package quantity**

**Unit acquisition cost = purchase_price ÷ package quantity**

Use the configured base unit consistently.

Example:

- Soda crate contains 24 bottles.
- Each bottle equals 1 piece.
- One crate costs KES 1,440.
- Opening count is two crates.

Expected opening stock is 48 pieces at a calculated unit cost of KES 60.

For products bought in boxes but sold individually, support this distinction without creating duplicate product records.

### DEV-011: Avoid unit ambiguity

Test representative businesses using:

- Piece and each.
- Gram and kilogram.
- Millilitre and litre.
- Boxes, cases and crates as purchase packages.
- Single units as sale portions.

Ensure conversions never silently multiply or divide by the wrong factor.

Do not allow a kitchen recipe defined in grams to consume the same numerical quantity of kilograms.

Avoid fake zero-cost valuations unless the actual supplier cost is genuinely zero. For unavailable costs, offer a clearly visible review or correction workflow rather than inventing purchase prices.

## 7. Spirits and wine: finish the sealed/open model

This is a launch-critical area for bars, clubs and resorts.

The current system requires millilitre-based stock and can model sealed bottles and opened-liquid balances.

However, the simple CSV opening-stock command records total quantity without necessarily initializing the physical sealed/open composition needed for sales.

### DEV-012: Repair opening bottle-state continuity

When importing SPIRIT or WINE stock:

- Enforce base unit `ml`.
- Enforce `quantity_per_unit = container_size`.
- Validate positive container and portion sizes.
- Distinguish `BOTTLE_ONLY` from `SERVING_AND_BOTTLE`.
- Ensure every offered whole-bottle price maps to the correct portion.
- Prevent a whole-bottle transaction from consuming a fractional container.
- Preserve package acquisition cost independently of selling prices.

After import, one of the following must happen:

**Preferred behavior:** A guided physical-count step records sealed containers and open liquid before bottle stock becomes sellable.

**Alternative:** If the import explicitly declares that all opening stock is sealed and that assertion is valid, initialize a documented all-sealed physical state through a reviewed command.

Never silently invent a physical bottle state.

### DEV-013: Validate mixed bottle/shot sales

Example fixture:

- 750ml spirit.
- Twelve sealed bottles received.
- 45ml pour price.
- Separate whole-container price.

Test:

- Single shot.
- Multiple shots.
- Exact remaining-liquid exhaustion.
- Sale requiring a new bottle to be opened.
- Whole-bottle sale.
- Whole-bottle sale when insufficient sealed stock exists.
- Transfers between Store and Bar.
- Waste and spillage.
- Bottle count reconciliation.
- Refund of unopened stock versus consumed stock.
- Duplicate and timeout-safe consumption.

The existing implementation represents an aggregate open remainder smaller than one full container per stock/location balance. Determine whether this is acceptable for real bar operations with multiple opened bottles.

If a customer workflow needs independently tracked open bottles, either implement that correctly using the existing inventory architecture or document an explicitly accepted operating limitation. Do not claim full open-bottle tracking when multiple bottle states cannot be represented.

### DEV-014: Protect stock conservation

Always validate:

`total ml = sealed containers × container size + open ml`

Stock must remain consistent through every sale, transfer, adjustment and count.

A zero-quantity condition must never produce negative stock, negative sealed counts or inconsistent open quantities.

Test product sizes including 250ml, 500ml, 750ml and 1,000ml, as applicable.

## 8. Recipes, kitchen production and shared ingredients

### DEV-015: Make recipe creation practical

A restaurant product should be able to consume multiple stock masters.

Example: Chicken, ugali and greens may consume chicken, maize flour, oil and greens according to a configured recipe.

Implement or improve:

- Recipe ingredient search and selection.
- Stock units and conversion.
- Quantity consumed per selling portion.
- Ingredient cost visibility.
- Calculated food cost and indicative margin.
- Portion changes.
- Ingredient substitutions or modifiers where already supported.
- Clear kitchen production routing.
- Correct consumption when an order is fired.
- Correct separation of payment refunds and physical returns.

Do not represent the same physical ingredients as unrelated duplicate stock items for every menu dish.

### DEV-016: Explicitly document importer limitations

The simple product CSV currently does not create complex multi-ingredient recipes.

The importer must not imply otherwise.

Provide a post-import checklist identifying recipes that need manual linking or a dedicated future recipe-import contract.

If introducing a recipe CSV during this sprint is unavoidable, ensure it reuses existing stock external references, validates units and remains transactional. Do not create another parallel recipe engine.

## 9. POS: complete the simplified cashier experience

### DEV-017: Implement a truly simple counter-sale mode

For ordinary bar and retail transactions, the ideal operator experience is:

**Select product → adjust quantity → choose payment → confirm → view/print receipt.**

Remove needless intermediate review screens where they do not protect a meaningful financial or inventory decision.

Preserve:

- Correct outlet and till association.
- Valid product prices and tax classes.
- Immutable recorded payment facts.
- Stock consumption.
- Transaction version checks.
- Idempotent command behavior.
- A meaningful failure/retry response.
- Original receipt identity.

Kitchen/table service may require an explicit fire or preparation stage. Ordinary takeaway counter sales should not inherit unnecessary restaurant workflow complexity.

### DEV-018: Cashier productivity features

Verify or improve:

- Product search, SKU and barcode input.
- Keyboard Enter selection.
- Quick quantity changes.
- Categories and favorites.
- Responsive grid for touchscreen terminals.
- Scanner keyboard-wedge compatibility.
- Accurate line totals and basket total.
- Cash tendered and change calculation.
- Manual M-Pesa selection and transaction reference.
- Mixed payment where already supported.
- Refund and void workflows that require appropriate review.
- Clear "Payment confirmed" versus "Payment awaiting verification" language.

Every operator must be able to identify what is completed, pending, rejected or unresolved.

No page refresh should create a second transaction.

## 10. Manual M-Pesa and payment accuracy

### DEV-019: Validate manual M-Pesa from UI to database

Manual M-Pesa support is a priority. Daraja automation is not required in this sprint.

Test:

- Cash-only transaction.
- M-Pesa-only transaction.
- Split cash/M-Pesa payment where supported.
- Correct account destination.
- Entered transaction reference.
- Duplicate-reference handling.
- Partial payment.
- Unconfirmed payment.
- Network interruption.
- Repeated Complete click.
- Receipt showing the actual method and reference.
- Refund or payment reversal.

No user interface should imply a manual payment was automatically verified by Safaricom.

If payment confirmation relies on a staff member checking the customer's transaction, the UI must say so.

Amounts should remain consistent across POS, payment records, cashier till, sales reports and customer receipts.

## 11. First-run setup and guided business initialization

### DEV-020: Complete day-one onboarding

The setup flow must do more than create an administrator and open a workspace.

Provide a clear post-setup checklist tailored by business type:

**Bar/club**

- Confirm bar outlet.
- Confirm stock location.
- Add or import saleable products.
- Count spirits and wine.
- Set cash/M-Pesa accounts.
- Open first shift.
- Print test receipt.

**Restaurant**

- Configure restaurant/kitchen routing.
- Import ingredients and selling products.
- Link recipes.
- Configure preparation tickets.
- Open shift.
- Process test order.

**Hotel/resort**

- Configure room types.
- Create rooms.
- Define rates.
- Configure Front Desk and payment accounts.
- Add a sample guest.
- Process a sample booking/stay.
- Print sample folio and receipt.

The wizard must distinguish **required**, **recommended** and **later** tasks.

It must remain resumable and must not create duplicates after refresh or retry.

Use business-facing terminology rather than schema and API terminology.

## 12. Hotel/resort acceptance must be complete

### DEV-021: Validate the whole guest lifecycle

Using real API and PostgreSQL browser acceptance:

1. Create hotel business and room category.
2. Create rooms and rates.
3. Create guest.
4. Make reservation or walk-in booking.
5. Check availability and prevent overlaps.
6. Check in.
7. Post accommodation.
8. Add a restaurant or additional-service charge.
9. Record deposit/partial payment if supported.
10. Settle folio.
11. Check out.
12. Generate guest folio and checkout statement.
13. Confirm room and housekeeping state transitions.
14. Reconcile financial and operational records.

Use varied dates, night counts, room rates and payment conditions.

A one-night test alone is insufficient. Include multi-night stays, date changes, overlapping reservations and unpaid balances.

Review the current Guest Accounts CI failure as a mandatory blocker.

## 13. Professional business documents and reports

This is a major release requirement.

**DEV-022: Treat reporting as a product, not an afterthought**

Every major operational document must be properly composed for actual printing and PDF output.

Use consistent:

- Business logo and identity.
- Report title.
- Outlet/branch.
- Financial or activity period.
- Date and time, using the intended business timezone.
- Record/document number.
- Clear sections.
- Aligned numeric columns.
- KES formatting.
- Subtotals and grand totals.
- Source references.
- Page margins.
- Pagination.
- Appropriate footer.
- Original, copy, refund or void indicators.

A functional but ugly table is not acceptable.

A screenshot of a dashboard is not a professional report.

### DEV-023: Required document catalogue

| Area | Required output |
|---|---|
| POS | Customer sales receipt |
| Payments | Payment acknowledgement and refund receipt |
| Bar/kitchen | KOT, BOT, cancellation and void notice |
| Till | Shift opening/closing and cash reconciliation |
| Sales | Detailed sales register and sales summary |
| Finance | Close-day, journal, expenses, refund and account reports |
| Inventory | Stock-on-hand, stock valuation and stock movement |
| Stocktake | Physical count, variance and adjustment report |
| Bar inventory | Sealed/open bottle and ml movement report |
| Procurement | Purchase order and goods received note |
| Suppliers | Return note, payment voucher and payable statement |
| Customers | Account statement, credit and settlement documentation |
| Hotel | Reservation confirmation, guest folio, invoice and checkout statement |
| Management | Daily business summary and available occupancy/revenue reports |

If a required report lacks authoritative data, label it incomplete rather than populate it with fictitious values.

### DEV-024: Establish the reusable layout engine

Build on:

- `BusinessDocumentRenderer.tsx`
- `documentPaperProfiles.ts`
- Existing immutable document snapshots.
- Existing reporting and domain projections.

Keep one central composition system for:

- Identity/header.
- Metadata.
- Line-item tables.
- KPIs.
- Financial totals.
- Signatures.
- Footer.
- Print styles.

Create explicit paper profiles:

- 80mm continuous thermal.
- A4 portrait.
- A4 landscape.

Ensure that a document's snapshot remains immutable. A reprint must not recalculate historical prices, costs or taxes from the current catalogue.

### DEV-025: Thermal printing quality

An 80mm receipt must:

- Fit within the actual supported printable width.
- Avoid clipping.
- Wrap long item names.
- Display quantity, price and line total clearly.
- Show business logo without excessive raster size.
- Show correct payment figures.
- Differentiate subtotal, tax, total, amount paid and change.
- Preserve QR quiet zones.
- Place the owner-supplied M-Pesa payment QR below payment details and immediately before the footer.
- Print a readable receipt number and timestamp.
- Clearly identify a reprint.
- Avoid excessive blank paper.
- Avoid unnecessary page headers and margins imposed by the browser configuration.

Do not assume that setting CSS width to 80mm establishes the printer's physical printable width.

Test the current print CSS across actual supported browsers. In particular, validate named `@page` handling, physical media selection and the current thermal-width calculation.

### DEV-026: A4 layout quality

For each report, provide:

- A readable title area.
- Report metadata.
- Summary figures.
- Detail table or grouped sections.
- Correct subtotals.
- Proper table-head repetition where supported.
- Clean breaks across multiple pages.
- Reasonable row heights and line wrapping.
- No hidden or horizontally clipped columns.
- No blank trailing pages.
- Clear final reconciliation.
- Correct PDF appearance.

For wide stock and financial tables, support landscape orientation deliberately.

Test reports with 1 row, 100 rows and a larger multi-page fixture.

### DEV-027: Data reconciliation

Each report must reconcile to persisted business data.

Examples:

**Cash close**

Opening float + cash sales + cash movements - refunds = expected drawer cash, subject to the documented treatment of each entry.

**Inventory**

Opening + receipts + transfers in - transfers out - sales consumption - waste + reviewed adjustments = closing quantity.

**Hotel**

Posted accommodation and services - payments/credits = outstanding folio balance, with the actual accounting treatment explicitly documented.

Do not assume visually attractive reports are financially accurate.

Automate reconciliation tests and include a known fixture report.

## 14. Direct printing from the PWA, no native bridge

### DEV-028: Complete the native print path

The intended operator flow is:

**Confirm business transaction → View official document → Preview → Print → OS print dialog.**

There must be no requirement to:

- Install a SERVEOS Print Bridge.
- Start a local print daemon.
- Pair a terminal.
- Configure localhost HTTPS.
- Run a workstation installer.
- Manage bridge credentials.
- Use a separate desktop application.

An existing OS printer driver remains the responsibility of the operating system.

### DEV-029: Harden browser print preparation

Verify:

- The correct immutable snapshot is loaded.
- Snapshot hash verification succeeds.
- Images and fonts are loaded before printing.
- The correct paper profile is applied.
- Printing works from installed PWA and ordinary browser tabs.
- Printing handles Windows desktop, representative Android tablet and supported mobile/desktop browser behavior.
- The browser print dialog opening is not recorded as guaranteed paper delivery.
- Cancelling the dialog does not cancel the sale.
- Printer failure does not duplicate the order.
- Reprinting preserves the original document number and indicates COPY/REPRINT.
- The operator can confirm physical delivery or safely retry an uncertain job.

If the platform cannot support unattended kitchen ticket output without a companion, document the limitation explicitly and provide an operator-driven print flow. Do not implement an unapproved hidden browser workaround.

### DEV-030: Physical printer certification

Test at least one actual supported 80mm thermal printer, including the available Xprinter XP-80 hardware if it is authorized for testing.

Record:

- OS version.
- Browser/PWA version.
- Printer and driver model.
- Paper profile.
- Width/margin settings.
- Logo result.
- Long item-name result.
- QR scan result.
- Reprint result.
- Paper-cut or feed issues.
- Operator verification.

The current source records a previous workstation inspection of two XP-80 queues sharing USB001 and a pre-existing pending job. Do not assume either queue is correctly configured merely because Windows lists it. Never clear the old queue or print to it without an explicit controlled test.

## 15. Full inventory and procurement continuity

### DEV-031: Verify receiving and replenishment

Test:

- New supplier.
- Purchase order.
- Goods receipt.
- Quantity and cost posted to stock.
- Weighted-cost behavior as applicable.
- Purchase package conversion.
- Returned/damaged delivery.
- Supplier credit.
- Stock transfer.
- Stock waste.
- Physical stock count.
- Variance report.
- Reorder threshold visibility.

The physical stock model must work whether stock is counted in pieces, grams, kilograms, ml or litres.

### DEV-032: Confirm price-changing workflows

The importer currently creates new master records and does not bulk-update existing prices.

Therefore:

- Existing price editing must be simple and tested.
- Repricing must never be achieved by reimporting a second copy of the product.
- Preserve historical sales at their original prices.
- Make current price, previous value and change audit clearly understandable.
- For businesses with frequent repricing, assess whether a reviewed price-update CSV is required before handover.

If bulk repricing is implemented, it must be a separate, explicitly selected and previewable update operation. Do not quietly change the create-only import contract.

## 16. Operator usability and permissions

### DEV-033: Complete role-specific walkthroughs

Use actual representative scenarios for:

- Owner/administrator.
- Manager.
- Cashier.
- Bar attendant.
- Storekeeper.
- Accountant.
- Front Desk receptionist.
- Kitchen operator.

Check each for:

- Correct permitted actions.
- Appropriate menu visibility.
- Minimum required clicks.
- Clear primary actions.
- Good field labels.
- Sensible defaults.
- Readable validation and recovery messages.
- Keyboard and touchscreen accessibility.
- Mobile/tablet layouts.
- No overlapping dialogs or hidden action buttons.

The UI audit has previously recorded 255 review signals. These are not automatically 255 confirmed defects. Triage them by severity and actual operator impact, fixing validated P0 and P1 issues.

## 17. Concurrent operation, offline states and recovery

### DEV-034: Two-terminal acceptance

Use separate authenticated browser contexts or devices connected to the same API/database.

Prove:

- Two cashiers see appropriate latest stock.
- A purchase is not deducted twice.
- Stale inventory edits are rejected appropriately.
- A stock count cannot overwrite a newer balance silently.
- Order version conflicts produce understandable recovery.
- A transaction does not appear confirmed until its result is actually confirmed.
- Duplicate payment attempts cannot post duplicate money.
- Refresh/reconnect restores the correct business projection.

### DEV-035: Network failure acceptance

Inject:

- Lost response after successful server commit.
- Failed API connection before commit.
- Browser refresh during pending work.
- Offline period followed by reconnect.
- Application restart after partial preparation.
- Concurrent price/stock change.

The system must recover the original operation where possible rather than ask the cashier to create another transaction.

Preserve separate states for pending, confirmed, rejected and unknown outcomes.

Do not enable unsafe automatic replay of financial commands to simplify the UX.

## 18. Backup and recoverability

### DEV-036: Make restore evidence repeatable

The current local restore rehearsal is useful, but the standard CI path does not automatically enable the optional container-based restore test.

Add a dedicated, repeatable acceptance gate using disposable PostgreSQL infrastructure.

Verify restored:

- Business identity.
- Products and stock masters.
- Inventory balances and movements.
- Sales.
- Payments and refunds.
- Cash drawer records.
- Journals.
- Guest folios where exercised.
- Close-day reports.
- Receipt/document snapshots.

Compare before and after using both row counts and relevant financial/inventory totals.

A local successful restore must not be presented as proof of hosted backup retention, encryption or disaster recovery.

Do not run destructive restore tests against production.

## 19. Future fresh-stack redeployment, plan only

### DEV-037: Prepare an isolation-first deployment strategy

The future deployment must create a separate SERVEOS V2 installation.

Never overwrite or reuse an existing production deployment by default.

The planning document must account for:

| Resource | Required future handling |
|---|---|
| Application directory | New, uniquely named V2 directory |
| Docker project | Separate Compose project and container namespace |
| PostgreSQL | Independent V2 database, credentials and storage |
| Docker volumes | V2-only volumes |
| Docker networking | V2-only internal network |
| Ports | Distinct, preflight-checked bindings |
| Public URL | New approved hostname or nonconflicting route |
| Reverse proxy | Additional isolated configuration, never overwrite old sites |
| TLS | V2-specific approved certificate handling |
| Sessions/PWA | Separate origin, cookies and service worker scope |
| Uploads and logs | New dedicated filesystem paths |
| Backups | Independent V2 backup/restore configuration |
| Rollback | Disable or revert only V2, never unrelated services |

The old `/var/www/serveos-prod/current` release path is not the future fresh-stack destination.

The existing production deployment script's original symlink-switching behavior is also not acceptable as a fresh-stack rollout method.

### DEV-038: Legacy preservation requirements

Before any separately authorized future deployment, create a read-only server inventory identifying:

- Existing websites.
- Existing APIs.
- Existing database servers and schemas.
- Running Docker containers and Compose projects.
- Active host ports.
- Proxy virtual hosts.
- TLS certificates.
- Release directories.
- Persistent Docker volumes.
- Backup targets.
- Scheduled services.
- Host CPU, RAM and storage headroom.

No production commands are authorized in this sprint.

Do not run `docker compose down -v`, prune commands, live database migrations, old deployment scripts or existing application restarts as part of preparing the new system.

If the VPS lacks enough resources to safely host both generations, recommend additional capacity or a separate server rather than impacting an existing business.

### DEV-039: Future noninterference acceptance

After separate authorization, a new-stack installation will be acceptable only if before/after evidence proves:

- Every older application remains accessible.
- Legacy URLs remain unchanged.
- Legacy database identities and contents are untouched.
- Old services have not been stopped or replaced.
- No unexpected ports or volume mounts have changed.
- New SERVEOS data is isolated.
- V2 can be independently rolled back.
- Any change to shared proxy infrastructure is minimal, reviewed and non-disruptive.

This sprint prepares the plan. It does not execute it.

## 20. Mandatory acceptance matrix

Use a single authoritative acceptance register.

| ID | Gate | Required result |
|---|---|---|
| F01 | Frontend compilation | No TS errors |
| F02 | Full CI | All mandatory jobs green on one commit |
| F03 | First admin setup | New browser account works |
| F04 | Setup resume | No duplicate defaults |
| F05 | Product import | All valid rows apply correctly |
| F06 | Import validation | Invalid rows blocked clearly |
| F07 | Import partial failure | No silent duplicate or overwrite |
| F08 | Product and stock link | Correct identifiers and quantities |
| F09 | Package costing | Correct purchase conversion |
| F10 | Opening inventory | Correct movements and balances |
| F11 | Sealed/open bottle count | Validated physical state |
| F12 | 45ml serving | Exact ml deduction |
| F13 | Whole bottle sale | Exact sealed-container deduction |
| F14 | Multi-ingredient recipe | Correct ingredient usage |
| F15 | Cash counter sale | Accurate receipt and stock |
| F16 | Manual M-Pesa payment | Correct amount and reference |
| F17 | Cashier shift close | Correct counted/expected variance |
| F18 | Refund | Correct cash and stock disposition |
| F19 | Hotel check-in | Correct reservation/stay state |
| F20 | Hotel settlement | Correct folio and payment |
| F21 | Hotel checkout | Closed folio and valid statement |
| F22 | Browser receipt | Print dialog without bridge |
| F23 | Physical thermal receipt | Correct print and legibility |
| F24 | M-Pesa QR | Correct placement and real scan |
| F25 | Receipt reprint | Original snapshot, copy label |
| F26 | A4 reports | Clean pagination and margins |
| F27 | Financial reporting | PostgreSQL-reconciled totals |
| F28 | Inventory reports | Correct quantities and valuation |
| F29 | Concurrent terminals | No duplicated or lost effects |
| F30 | Network recovery | Safe original-command reconciliation |
| F31 | Backup/restore | Reconciled disposable restoration |
| F32 | Role-based access | Operator permissions correct |
| F33 | Responsive/touch | Main workflows usable |
| F34 | Guided onboarding | Nontechnical staff complete first use |
| F35 | Future stack isolation plan | Reviewed; no live execution |

For each gate, record:

- Implemented or not.
- Automated test result.
- Human UI verification result.
- Physical hardware result when relevant.
- Commit SHA.
- Test fixture/business.
- Evidence artifact.
- Responsible developer.
- Known limitation.
- Reviewer acceptance.

Do not mark a test physically verified merely because Playwright intercepted `window.print()`.

## 21. Pull request execution program

Implement in small, reviewable, sequential or clearly independent work packages.

| Work package | Priority | Deliverable |
|---|---|---|
| PR-01 | Blocker | Resolve TS2322 issues, hotel acceptance failure and restore green CI |
| PR-02 | P0 | Final product/stock/import integrity and physical bottle-state continuity |
| PR-03 | P0 | Simplified cashier workflow and manual M-Pesa acceptance |
| PR-04 | P0 | Complete hotel and restaurant lifecycle acceptance |
| PR-05 | P0 | Print-perfect 80mm receipts and direct PWA hardware testing |
| PR-06 | P0 | Professional A4 reports, procurement documents and financial reconciliations |
| PR-07 | P0 | Concurrent-terminal, recovery and full-business-day tests |
| PR-08 | P1 | Operator usability, import guidance and first-day training |
| PR-09 | P1 | CI recovery gate, documentation and release acceptance pack |
| PR-10 | Future | Isolated-stack redeployment design and noninterference runbook only |

Each PR must include source changes, relevant regression tests, user-facing documentation changes and an honest acceptance statement.

Do not combine unrelated unfinished features into a massive PR that is difficult to review.

## 22. Definition of done

The final development sprint is complete only when:

- [ ] All mandatory CI jobs pass on the selected release commit.
- [ ] Initial setup works without developer intervention.
- [ ] The business can create or import products and accurate physical stock.
- [ ] Stock masters and selling products remain properly linked.
- [ ] Spirit/wine opening counts and subsequent sales are accurate.
- [ ] Restaurant recipe deductions reconcile.
- [ ] A cashier can open shift, sell, receive payment and issue a receipt easily.
- [ ] Manual M-Pesa transactions are correctly documented.
- [ ] Cashier close-day totals reconcile.
- [ ] Hotel booking-to-checkout acceptance passes.
- [ ] Two terminals operate without corrupting stock or money.
- [ ] Important interrupted operations recover safely.
- [ ] Receipts print directly from the installed PWA without a SERVEOS Print Bridge.
- [ ] Actual 80mm paper output is verified.
- [ ] The M-Pesa QR is correctly placed and genuinely scannable.
- [ ] A4 reports and official documents have professional layouts.
- [ ] Printed report totals match persisted authoritative records.
- [ ] Realistic multi-page reports have no clipping or broken pagination.
- [ ] Local backup/restore passes a repeatable automated gate.
- [ ] Operators can complete critical workflows without internal developer knowledge.
- [ ] Unresolved limitations are documented and classified.
- [ ] The future parallel fresh-stack deployment plan is reviewed.
- [ ] Existing VPS deployments, databases, routes, containers and volumes remain untouched.
- [ ] No production rollout has occurred.

## 23. Final developer handover

Deliver a single release-candidate evidence pack containing:

1. Release commit and branch.
2. Full change log.
3. Passing CI results.
4. API/PostgreSQL integration results.
5. Desktop/mobile browser test results.
6. Import template specifications and sample CSV files.
7. Item type, purchase package, recipe and bottle-stock explanations.
8. Opening stock reconciliation samples.
9. Receipt and report template catalogue.
10. 80mm paper samples and physical printer test results.
11. Genuine M-Pesa QR scan acceptance.
12. A4 portrait and landscape report PDF specimens.
13. Full cashier business-day verification.
14. Hotel booking-to-checkout verification.
15. Multi-terminal/recovery verification.
16. Database backup/restore evidence.
17. Operator onboarding guides.
18. Unresolved issues register.
19. Future isolated-stack architecture and legacy-preservation plan.
20. Explicit confirmation that no VPS or production deployment was modified.

### Final engineering instruction

SERVEOS must stop feeling like a collection of powerful features that require a developer to operate.

It must function as a connected hospitality business system with clear actions, trustworthy inventory, clean financial records and professionally designed business documents.

Prioritize the operator's actual day:

**Set up → import stock → open shift → serve customers → receive payments → print receipts → reconcile stock → close accounts → generate excellent reports → return tomorrow without complications.**

**DO NOT DEPLOY. DO NOT MODIFY LEGACY STACKS.**

Only request deployment authorization after the product acceptance pack is complete and the owner has reviewed the separate clean-stack redeployment plan.