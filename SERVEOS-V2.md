# SERVEOS V2
## DAY-ONE PLUG-AND-PLAY PRODUCT READINESS DIRECTIVE

**Project:** SERVEOS WEB / VPS Platform  
**Target branch:** `reset/vps-platform`  
**Baseline commit:** `801f265a017d0a21f130d36c398e587326dd31a2`  
**Priority:** P0 Product Readiness  
**Deployment status:** STRICTLY DEFERRED  
**Objective:** Complete all development and acceptance work required for a turnkey hospitality ERP/POS PWA.

---

# 1. EXECUTIVE DEVELOPMENT DIRECTIVE

We are changing development priorities.

The immediate objective is no longer to expand SERVEOS with additional modules, architectural layers, approval mechanisms, or infrastructure abstractions.

Our objective is to take the considerable functionality already implemented and turn it into a product that a hospitality business can start using on its first day with minimal configuration and no routine dependence on a developer.

We are building a deploy-ready product, **not deploying it during this sprint**.

The target experience must be:

1. Install the packaged system through one documented procedure.
2. Open the web application.
3. Create the initial administrator and business.
4. Select the business type.
5. Complete a short setup wizard.
6. Add products or import stock.
7. Configure cash and, where applicable, M-Pesa.
8. Start a shift and record sales.
9. Print receipts through the browser or an optional print companion.
10. Continue operating reliably, including closing the day and returning the following morning.

A business owner should never need to understand PostgreSQL, signing keys, migrations, command sequences, version numbers, infrastructure services, or GitHub to perform ordinary business tasks.

Those details belong inside SERVEOS, not in the operator experience.

## Non-negotiable deployment freeze

Until the product owner explicitly authorizes deployment:

- DO NOT SSH into production servers.
- DO NOT modify existing VPS installations.
- DO NOT publish new PWA bundles to production.
- DO NOT update any production Docker container.
- DO NOT run migrations against a live database.
- DO NOT modify production Vercel deployments.
- DO NOT replace the current production API.
- DO NOT migrate Countryside or any existing customer data.
- DO NOT trigger production deployment workflows.
- DO NOT change DNS, certificates, reverse proxies, or live services.

Development and testing may use local machines, disposable containers, and isolated test databases.

Deployment manifests, Docker images, installer assets, scripts, and release archives may be prepared and tested locally, but must not be applied to production.

**The final output of this sprint is a deployment-ready release candidate, not a live installation.**

---

# 2. ARCHITECTURE: KEEP THE WEB-FIRST DESIGN

Preserve the current architecture:

- React and TypeScript operator PWA
- Node.js business API
- PostgreSQL authoritative database
- IndexedDB browser storage where appropriate
- Existing command kernel and domain handlers
- Optional local Print Bridge
- Existing permissions and transaction mechanisms

Do not introduce another framework, database, desktop runtime, or cloud backend simply to solve onboarding problems.

Do not restore the old Tauri runtime or direct browser-to-database access.

The target production packaging architecture is:

**Browser/PWA → HTTPS reverse proxy → Node API → PostgreSQL**

An optional workstation print service may be attached when silent thermal printing is needed.

### Engineering principles

1. Prefer improving existing modules over creating parallel implementations.
2. Preserve one authoritative implementation for every business operation.
3. Use existing command handlers and server-side validation.
4. Prefer configuration defaults over additional operator decisions.
5. Hide complexity that is unnecessary for normal workflows.
6. Do not discard legitimate payment, inventory, or accounting controls.
7. Design every ordinary failure with an understandable recovery action.
8. Keep the default product usable without offline grants or native printer services.
9. Preserve compatibility with existing business data wherever feasible.
10. Produce evidence that features work, rather than treating compilation as proof.

Avoid creating a second POS system, second inventory system, or second authentication implementation in the name of simplification.

---

# 3. P0: REPAIR THE BASELINE AND ESTABLISH TRUSTWORTHY TESTS

Before introducing substantial new functionality, stabilize the development baseline.

## 3.1 Fix the current GitHub Actions failure

The latest inspected workflow fails in:

`tests/browser/api-postgres-sync.spec.ts`

The browser acceptance test expects stocktake controls that no longer match the current UI.

It looks for a dialog named `Full stocktake`, a button named `Real store`, continuous scanner controls, and older review buttons.

The current implementation in:

`src/runtime/web/WebPhysicalCountDialog.tsx`

uses a dialog titled `Count stock at a location`, a location dropdown, physical quantity fields, and the `Review and record count` action.

### Required work

- Rewrite the browser test to use the actual current stocktake controls.
- Use stable accessible labels and roles rather than brittle DOM selectors.
- Select the stock location through the current dropdown.
- Enter actual counted quantities.
- Supply the required count note.
- Submit the count and verify the confirmed outcome.
- Verify the resulting PostgreSQL inventory balance.
- Preserve the existing reload, synchronization, and recovery assertions.
- Move scanner testing into a separate test only if scanning is actually implemented in that specific dialog.
- Investigate any remaining failure rather than increasing timeouts indiscriminately.

Do not delete the test or mark it as skipped to obtain a green CI result.

## 3.2 Separate fast development checks from full acceptance

Retain a fast verification path covering:

- TypeScript
- Build
- Command contracts
- Architecture boundaries
- Unit tests
- Essential documentation consistency

Retain a release-candidate path covering:

- Real PostgreSQL integration tests
- API browser acceptance
- POS financial correctness
- Inventory posting
- Authentication
- First-run setup
- Browser/PWA behavior
- Receipt generation
- Backup and restore

Every PostgreSQL test must run against a disposable database.

Tests that require PostgreSQL must not silently become evidence of success when the database is missing.

### Definition of done

- All previously passing essential checks remain passing.
- The known browser stocktake failure is corrected.
- The test pipeline accurately distinguishes skipped, passed, and failed tests.
- All release-critical flows can be exercised locally without contacting production.

---

# 4. P0: CREATE A SELF-CONTAINED INSTALLATION PACKAGE

This phase prepares deployment capability without performing deployment.

## 4.1 Build a complete Docker Compose stack

The repository currently has an API Dockerfile and separate PWA packaging scripts, but not the self-contained fresh-install experience we need.

Create a packaging directory, preferably `infra/`, containing:

- `compose.yml`
- `compose.local.yml` where useful
- Reverse-proxy configuration
- Environment templates
- Database initialization/migration job
- Persistent-volume definitions
- Backup configuration
- Health-check definitions
- Local smoke-test scripts

The planned runtime should contain:

1. Web frontend/reverse proxy
2. Node API
3. PostgreSQL
4. Migration/init job
5. Scheduled backup facility

Do not deploy the zero-handler worker as a mandatory running service. Activate a worker only when a real registered handler requires it.

Use pinned, reproducible image versions and lockfile-based builds.

### Required behavior

A new local environment should be provisioned without manually installing PostgreSQL, creating database users, copying frontend bundles, or running multiple unrelated commands.

The database must persist independently of application-container replacement.

Use explicit service health checks and wait for database readiness before running migrations.

Migration failures must prevent the application from advertising itself as ready.

The existing API's `/health/ready` route currently establishes only limited schema readiness. Improve readiness evidence to account for the expected migration state.

Do not execute schema migrations implicitly on every frontend start.

## 4.2 Create a single preflight command

Introduce a developer-facing preflight tool such as:

`scripts/preflight.mjs`

It must verify:

- Docker and Compose availability
- Required runtime configuration
- Required writable directories
- Port availability
- Database configuration
- Valid environment values
- Presence of generated application secrets
- Container/image readiness where applicable
- Valid migration inventory
- Backup configuration
- Reverse-proxy configuration

It must distinguish missing optional integrations from true launch blockers.

Never print passwords, private keys, or credentials.

## 4.3 Automate environment generation

A fresh installation must not require developers to manually construct:

- Database credentials
- Setup secrets
- Application session configuration
- Signing-key pairs
- Internal service URLs
- Environment file relationships

Provide a local setup command that generates appropriate secrets, validates them, and stores them securely in the expected configuration location.

Keep server secrets out of browser build variables.

The operator must not be asked to edit `.env` files.

## 4.4 Prepare same-origin operation

Prefer one public application address with API requests routed through `/api`.

This avoids making an owner understand separate frontend and backend hostnames.

However, do not change only the reverse proxy and assume the current app will work.

The current application expects an API origin through `VITE_API_URL`, and parts of `apiAuth.ts` use absolute URL parsing. Refresh-session cookies also have API-relative paths.

Developers must update and test:

- Relative API URL normalization
- Session storage scoping
- Browser request credentials
- Refresh cookie paths
- CORS behavior for same-origin requests
- Reverse-proxy path rewriting
- WebSocket behavior if added later
- API health routing
- Frontend fallback routing
- Deep links and PWA navigation

A request to `/api/v1/...` must reach the correct backend route without breaking session refresh.

Do not leave an installation dependent on undocumented proxy behavior.

## 4.5 Reproducible packages

Produce deterministic application packages and record:

- Source commit
- Package version
- Build date
- Applied migration head
- API contract version
- Required environment variables
- Release archive checksums

A locally built release candidate must be independently testable.

### Definition of done

A developer can start a clean, isolated SERVEOS environment through one documented command and complete the installation preflight without ad hoc configuration.

**Stop at local verification. Do not install this package on the VPS.**

---

# 5. P0: BUILD A REAL FIRST-RUN SETUP WIZARD

This is one of the most important missing product capabilities.

## 5.1 Improve initial administrator creation

The API currently provides:

`POST /v1/setup/initial-admin`

It requires an initialization secret and explicit business/staff IDs.

Keep the one-time protected bootstrap concept, but remove unnecessary operator complexity.

Create a guided first-run interface.

Suggested frontend structure:

- `src/runtime/web/setup/SetupGate.tsx`
- `src/runtime/web/setup/InitialAdminStep.tsx`
- `src/runtime/web/setup/BusinessProfileStep.tsx`
- `src/runtime/web/setup/BusinessTypeStep.tsx`
- `src/runtime/web/setup/CatalogSetupStep.tsx`
- `src/runtime/web/setup/PaymentSetupStep.tsx`
- `src/runtime/web/setup/SetupComplete.tsx`

Use shared design-system controls.

A new setup API may be introduced if necessary. Keep it protected by a one-time installation secret or equivalent securely provisioned bootstrap credential.

Do not expose a permanently unauthenticated administrator-creation endpoint.

Generate internal UUIDs automatically.

The visible form should require only reasonable business and administrator information.

## 5.2 Business setup steps

### Step 1: Administrator

Collect:

- Administrator display name
- Login name
- Password
- Password confirmation

Provide a clear password-creation screen rather than the current login form's optional `New password, if account setup requires it` field.

Show password rules before submission.

### Step 2: Business identity

Collect:

- Business name
- Business category
- Contact telephone
- Address or location
- Receipt display name
- Optional logo

Default currency to KES for the initial Kenyan product.

Default timezone to Africa/Nairobi, while storing authoritative timestamps consistently.

Tax registration details should be editable, with tax treatment requiring an explicit valid choice rather than an invented assumption.

### Step 3: Business type

Offer:

- Bar / Club
- Restaurant / Café
- Hotel / Resort
- Retail POS
- Mixed Hospitality

Use these choices to configure initial navigation, settings, and relevant setup steps.

Do not create separate applications for each business type.

### Step 4: Outlets and storage

Automatically create sensible defaults based on the selected business type.

Examples:

- Bar: Main Bar and Bar Store
- Restaurant: Main Restaurant and Main Store
- Hotel: Main Property, Front Desk, and Main Store where required
- Retail: Main Shop and Main Store

The owner may rename these immediately.

One business may later add multiple outlets or stock locations.

### Step 5: Payments

Enable Cash as the basic payment option.

Ask whether the business accepts:

- M-Pesa Till
- M-Pesa Paybill
- Card
- Bank transfer

Request only the settings needed for the chosen methods.

Manual M-Pesa recording should be available without requiring Daraja integration.

A configured M-Pesa destination must be real information provided by the owner, not a fabricated default number.

### Step 6: Products and opening balances

Present:

- Add first product
- Import products
- Continue to inventory later

Hotels should also receive room setup options.

Do not force hotel owners through a stock import before they can configure rooms.

### Step 7: Staff

Allow the owner to add staff now or later.

Provide sensible role templates.

### Step 8: Finish

Display a setup checklist that clearly distinguishes completed and incomplete configuration.

Allow normal operation only for workspaces whose essential requirements are met.

## 5.3 Implement reusable business initialization

Current first-admin creation inserts the business and administrator but does not establish all operational prerequisites.

Create a business-initialization service that safely provisions the selected defaults.

Reuse the existing business settings, outlet, stock-location, and payment-account domain validation.

If implementing a consolidated initialization command, use a single business-scoped, authorized transaction rather than several unrelated frontend writes.

The initialization process must be:

- Idempotent
- Resumable
- Business-scoped
- Transactionally safe
- Auditable
- Resistant to duplicate default records
- Compatible with existing installations

Use stable identities or stored setup progress, not repeated uncontrolled UUID creation.

If setup is interrupted after the administrator is created, restarting the wizard must resume instead of failing permanently or creating another business.

Store setup state authoritatively in PostgreSQL. Browser localStorage may remember progress visually but must not be the source of truth.

### Definition of done

A completely fresh local database can be initialized through the browser without SQL commands or manual database seeding.

The resulting administrator can sign in and find a valid business, outlet, stock location, business settings, and selected payment accounts.

Restarting setup does not duplicate records.

---

# 6. P0: REDESIGN THE CORE POS EXPERIENCE

The default POS must optimize the most frequent activity: making a sale.

Relevant existing files include:

- `src/runtime/web/WebApiPosView.tsx`
- `src/runtime/web/WebApiTillPanel.tsx`
- `src/runtime/web/WebApiPaymentPanel.tsx`
- `src/runtime/web/WebApiPreparationPanel.tsx`
- `apps/api/src/pos-commands.mjs`
- `apps/api/src/payment-commands.mjs`
- `apps/api/src/till-commands.mjs`

## 6.1 Introduce Simple POS mode

Provide a default operator screen with:

- Product search
- Barcode scanning
- Product categories
- Favorites
- Cart
- Quantity adjustment
- Order total
- Cash payment
- M-Pesa payment
- Complete sale
- Print receipt
- Start new sale

Advanced operations should not dominate the normal cashier interface.

Keep table transfers, split tenders, refunds, discounts, complementary items, course preparation, and order merging accessible through contextual controls.

Do not delete these capabilities.

## 6.2 Remove unnecessary opening-order friction

Currently an order must exist before adding items.

For a counter sale, permit the operator to select products immediately.

The interface may create the underlying order as needed.

Support separate operational modes:

**Quick Sale:** Select products, accept payment, finish.

**Table/Tab Service:** Open a persistent tab, add rounds, fire items, settle later.

**Room Charge:** Link a supported POS transaction to an active guest folio.

These interfaces must share the existing authoritative POS and payment logic.

Do not introduce a parallel payment path with different stock deduction or tax behavior.

## 6.3 Simplify multi-command sales

The existing order lifecycle involves creating, adding, firing, and paying.

For quick sales, the user should experience one coherent transaction.

Developers may use a server-side orchestration command if that is the safest way to maintain atomicity and consistency.

If existing commands are orchestrated sequentially, implement deterministic recovery from partial completion.

Do not repeat a payment with a new command identity after an uncertain result.

Do not issue receipts for transactions that have not reached the appropriate recorded state.

## 6.4 Simplify till opening

The current payment panel expects an open till matching the operator, device, and outlet.

Retain the underlying till accounting.

Replace the scattered requirement with a clear `Start Shift` workflow.

When a cashier starts work:

1. Identify the active outlet.
2. Detect any existing eligible open shift.
3. If needed, ask for opening float.
4. Open the till.
5. Enter the POS.

Once a shift is open, the user should not repeatedly encounter till-setup prompts.

Never silently create duplicate till sessions.

Closing the shift must remain a deliberate action with an actual cash count.

## 6.5 Cash payment

The basic payment form should show:

- Sale total
- Amount received
- Change due
- Complete Sale button

The calculator must handle Kenyan shilling amounts correctly without floating-point money errors.

Preserve the existing minor-unit financial model.

## 6.6 M-Pesa payment

The default manual M-Pesa flow should require:

- Payment amount
- Receiving account
- Transaction reference where configured
- Explicit operator confirmation that funds were received

Clearly communicate that manual recording does not verify funds with Safaricom.

Do not implement automatic confirmation without an actual payment integration.

Daraja integration is not required for this sprint.

## 6.7 Product interaction

Improve cashier efficiency:

- Enter adds the selected search result where appropriate.
- Barcode scan works without extra dialogs when a sale is active.
- Common products can be selected through favorites.
- The cart updates immediately.
- Quantity changes are intuitive.
- Product prices are clearly displayed.
- Stock availability messages are understandable.
- Buttons provide immediate progress feedback.
- Slow API calls do not allow accidental duplicate submissions.

## 6.8 Payment result handling

The operator should see plain-language states:

- Payment completed
- Payment pending
- Payment could not be confirmed
- Check transaction status
- Resume saved sale

Do not expose command IDs, record versions, or raw backend error codes in normal workflow messages.

Retain diagnostic details in an advanced support panel.

### Definition of done

A trained cashier can make an ordinary counter sale without manually configuring an outlet, creating an empty order, firing items through an unrelated screen, or navigating technical recovery screens.

Cash and manually confirmed M-Pesa sales must produce correct, persistent financial and inventory results.

---

# 7. P0: SIMPLIFY PRODUCTS, INVENTORY AND INITIAL IMPORTS

Relevant files:

- `src/runtime/web/WebCatalogInventory.tsx`
- `src/runtime/web/WebApiImportCenter.tsx`
- `src/runtime/web/SmartItemDialog.tsx`
- `src/runtime/web/WebPhysicalCountDialog.tsx`
- `apps/api/src/catalog-commands.mjs`
- `apps/api/src/csv-import.mjs`
- `src/utils/bottleInventory.ts`
- `src/utils/inventoryUnits.ts`

## 7.1 Replace technical product creation with guided creation

The default Add Product interface should ask for:

- Product name
- Category
- Selling price
- SKU or barcode, optional
- Whether stock is tracked
- Opening stock, if applicable
- Tax classification
- Outlet availability

Hide internal relationships unless the chosen product requires them.

Generate sensible SKU values when the operator does not provide them.

A service item should not be forced through physical stock setup.

## 7.2 Maintain valid linked stock models

For physical goods, create or link the appropriate stock item through the supported domain commands.

For bar inventory, retain volume-based stock tracking.

Support:

- Sealed bottles
- Open bottles
- Sales by shot
- Sales by whole bottle
- Millilitre-based balances
- Purchase packages
- Conversion between purchasing and selling units

A bottle product must not become disconnected from the stock item used for shot consumption.

Make these relationships understandable visually rather than forcing operators to enter technical identifiers.

## 7.3 Create business-specific product presets

Examples:

- Drinks
- Spirits
- Beer
- Wine
- Food
- Snacks
- Accommodation services
- Retail goods

Presets should preselect relevant fields, not impose fabricated stock levels or tax classifications.

For bottled spirits, the operator should enter bottle size and supported serving sizes. SERVEOS should calculate linked base-unit quantities.

## 7.4 Implement one simple bulk import

The current importer uses typed CSV templates with external IDs and explicit dependencies.

Retain the validated import engine.

Build a simpler operator-facing process:

1. Download one user-friendly spreadsheet template.
2. Populate product rows.
3. Upload CSV.
4. Preview accepted and rejected rows.
5. Correct errors.
6. Confirm import.
7. Review the created products.

Automatically resolve supported internal dependencies where the input provides sufficient data.

Do not bypass validation or directly write imported rows into business tables.

Offer clear diagnostics such as:

- Duplicate product code
- Barcode already assigned
- Invalid quantity
- Missing selling price
- Invalid tax classification
- Unsupported measurement unit
- Missing stock-location assignment

If supporting updates to existing products, explicitly distinguish create from update and preview every intended change. Do not silently overwrite an existing selling price or stock balance.

## 7.5 Make stock counting practical

Redesign the count workflow to clearly show:

- Storage location
- Searchable stock list
- System quantity
- Physical quantity
- Difference
- Confirm count

For bar inventory, show sealed containers and open millilitres separately.

Add a review screen only when it contributes to preventing mistakes.

The system must prevent unintended overwrites when inventory has changed during the count.

Do not remove the optimistic concurrency checks.

## 7.6 Simplify routine inventory movements

Make the following actions discoverable:

- Receive stock
- Count stock
- Transfer stock
- Record waste
- Correct stock
- View movement history

Advanced movement evidence, reversals, accounting journal references, and provenance should remain accessible but not dominate everyday entry forms.

### Definition of done

An owner can create one product, import a realistic inventory sheet, set opening balances, count bottles and loose units, and complete a sale without knowing the internal inventory schema.

---

# 8. P0: MAKE RECEIPT PRINTING EASY

Printing must work on Day One, even without the local native Print Bridge.

Relevant files:

- `src/runtime/web/WebDocumentQueue.tsx`
- `src/runtime/web/BusinessDocumentRenderer.tsx`
- `src/receipts/branding.ts`
- `src/runtime/web/WebBridgeSettings.tsx`
- `apps/print-bridge/`

## 8.1 Browser printing is the default

Provide a complete browser-printing workflow that requires no native companion installation.

The user should be able to:

1. Complete a sale.
2. Open the receipt.
3. Select Print.
4. Use an installed operating-system printer.
5. Print a readable document.

Browser printing may display the system print dialog. Do not promise silent printing in this mode.

Use the existing `printBusinessDocument` implementation as a foundation.

## 8.2 Create a receipt setup screen

Allow the administrator to configure:

- Business name
- Receipt logo
- Address
- Telephone
- Tax PIN
- Receipt footer
- M-Pesa payment QR image
- QR visibility
- Print layout preferences
- Printer selection guidance

The existing QR/logo preparation should be reused.

For M-Pesa QR, validate image clarity and provide a printed scan test.

## 8.3 Thermal receipt layout

Support 80mm thermal paper with printer-safe margins.

Ensure:

- No text clipping
- No overly wide tables
- Readable product descriptions
- Clear quantities and prices
- Correct KES formatting
- Totals visually emphasized
- Appropriate tax information
- Consistent logo scaling
- QR placed before the footer
- QR quiet zone preserved
- Sufficient spacing from the paper edges

Avoid assuming that every 80mm printer has exactly 80mm of printable width.

Use a configurable or validated printable content width, with real hardware acceptance for supported printers.

## 8.4 Print companion becomes optional

Preserve the existing Print Bridge architecture for automatic receipt and kitchen-ticket delivery.

Do not require it to activate the basic POS.

Prepare a future installer experience with:

- Packaged Windows binaries
- Automatic service setup
- Assisted printer discovery
- Local TLS provisioning and trust guidance
- Guided device pairing
- Test receipt
- Service-health reporting
- Recoverable printing errors

Do not remove authentication or trust verification simply to avoid pairing steps.

Move necessary complexity into installation automation.

The existing source-only Windows installer should not be presented as a validated one-click installer until it has passed a clean-workstation test.

## 8.5 Printing failures

A failed or uncertain print attempt must not reverse or duplicate a completed sale.

Separate:

- Transaction success
- Document issuance
- Printing attempt
- Physical print confirmation

Provide a simple retry/reprint workflow that retains the original document identity.

### Definition of done

A successfully completed sale can be printed from the browser.

80mm receipts must pass layout inspection and actual supported-printer testing before the feature is certified as hardware-ready.

The native Print Bridge must not be mandatory for core POS use.

---

# 9. P1: BUSINESS-TYPE-SPECIFIC WORKSPACES

SERVEOS serves different types of hospitality businesses.

Do not show every module to every operator by default.

## 9.1 Introduce workspace presets

### Bar / Club

Prioritize:

- POS
- Open tabs
- Inventory
- Stock count
- Receiving
- Suppliers
- Shift closing
- Reports

### Restaurant

Prioritize:

- POS
- Tables
- Kitchen preparation
- Inventory
- Receiving
- Staff
- Reports

### Hotel / Resort

Prioritize:

- Front Desk
- Reservations
- Rooms
- Guest accounts
- POS
- Housekeeping
- Finance
- Reports

### Retail

Prioritize:

- Quick POS
- Products
- Inventory
- Receiving
- Suppliers
- Reports

### Mixed Hospitality

Enable combined workspaces.

Presets control navigation and setup defaults, not underlying permissions.

Staff should see only the workspaces relevant to their jobs and granted capabilities.

## 9.2 Improve hotel first-run setup

For hotel mode, provide a guided path to:

- Create room types
- Add room numbers
- Set room capacity
- Configure rates
- Create the first reservation
- Check in a guest
- Link accommodation and restaurant charges where supported
- Check out and settle the folio

Do not force accommodation users through irrelevant bar setup.

## 9.3 Avoid feature loss

Do not remove existing procurement, customer credit, financial journals, assets, housekeeping, or room-management functionality.

Use progressive disclosure: common work first, advanced work when needed.

### Definition of done

A bar operator sees a bar-oriented product.

A hotel receptionist sees hotel-oriented workflows.

An administrator can still access the complete authorized system.

---

# 10. P1: SEPARATE PWA INSTALLABILITY FROM OFFLINE TRANSACTIONS

The current service-worker registration is gated by:

`VITE_ENABLE_WEB_OFFLINE`

This conflates two different concerns.

A web app should remain installable even when offline financial operations are disabled.

## 10.1 Correct the PWA architecture

Update:

- `src/runtime/web/registerShell.ts`
- `scripts/web-shell-plugin.ts`
- `public/manifest.webmanifest`
- PWA initialization and recovery interfaces

Separate:

**PWA shell capability**

- Installable application
- Appropriate icons
- Standalone display
- App-shell caching
- Version update handling
- Friendly disconnected screen

**Offline business operations**

- Authorized offline commands
- Offline grant issuance
- Transaction queue
- Synchronization
- Conflict recovery
- Business-specific offline permissions

The first category should not require the second.

## 10.2 Default online-first behavior

Day-One operations should be online-first.

If the network disconnects:

- Preserve unsent form data when safe.
- Display a clear connectivity indicator.
- Do not claim that an unconfirmed payment was saved.
- Prevent unsupported online-only operations.
- Allow the user to reconnect and resume.
- Preserve the identity of any previously submitted uncertain command.

Do not silently clear IndexedDB or discard pending work.

## 10.3 Optional advanced offline sales

Retain the existing offline grant system, but hide its configuration unless offline mode is explicitly enabled for the business.

Do not make offline grant signing keys and entitlement configuration mandatory to run the default online POS.

Any optional offline sale mode must pass its own financial correctness and conflict recovery tests before activation.

## 10.4 PWA usability tests

Verify:

- Installation on supported Chromium desktop browsers
- Installation/add-to-home-screen behavior on Android
- Appropriate iOS instructions where installation prompts are unavailable
- App icon and splash behavior
- Reopening after closing
- Updating an installed version
- Returning from offline to online
- Correct cache behavior
- No stale business API responses returned from the app shell cache
- No duplicate writes after reconnection

### Definition of done

The PWA can be installed and reopened with offline transactions disabled.

An internet outage produces a recoverable and understandable experience, not false transaction confirmations.

---

# 11. P1: SIMPLIFY STAFF, PERMISSIONS AND FIRST-TIME TRAINING

## 11.1 Provide simple staff presets

The existing code supports multiple staff roles.

Retain these roles and their permission contracts, but simplify the initial setup.

Recommended first-run choices:

- Administrator
- Manager
- Cashier / Staff

Provide optional specialist roles for:

- Server
- Chef
- Receptionist
- Housekeeper
- Accountant

Use existing role templates where suitable.

Do not replace server-authorized permissions with frontend-only role restrictions.

## 11.2 Create a straightforward Add Staff flow

Ask for:

- Name
- Login name
- Role
- Initial password or secure invite method
- Assigned outlet, if needed

Automatically apply the selected role template.

Keep advanced permission editing behind an administrator-only control.

## 11.3 Improve initial login

Move compulsory password creation/change into a dedicated, understandable screen.

Device enrollment should normally be completed transparently using the existing browser identity mechanism.

Only request administrator approval when the current device policy genuinely requires it.

Show useful messages for invalid credentials, revoked sessions, storage failure, or a missing device approval.

## 11.4 Build actionable onboarding guidance

Reuse:

- `src/runtime/web/WebGuidanceViews.tsx`
- `src/runtime/web/WebStaffWelcome.tsx`
- `src/guidance/core.ts`
- Existing contextual help

Extend the current guided tour into task-specific assistance.

Required short guides:

1. Set up the business.
2. Add a product.
3. Import stock.
4. Start a shift.
5. Make a sale.
6. Record M-Pesa.
7. Print a receipt.
8. Receive stock.
9. Count stock.
10. Close the day.
11. Add staff.
12. Make a reservation where relevant.

Guides must target actual current UI elements.

Avoid tours that point to removed controls.

Track completion locally or through existing supported guidance persistence without introducing a separate onboarding database.

### Definition of done

A first-time operator can reach a useful task from the Home screen and understand what to do next without reading technical documentation.

---

# 12. P1: UX, ERROR RECOVERY AND PERFORMANCE

## 12.1 Conduct a focused usability audit

Review the primary workflows on desktop, tablet, and mobile.

Prioritize actual operator friction over cosmetic perfection.

Audit:

- Navigation clarity
- Number of actions per task
- Form labels
- Required fields
- Error feedback
- Loading states
- Dialog behavior
- Screen overflow
- Keyboard navigation
- Barcode input
- Touch targets
- Small-screen layout
- Returning to interrupted work

The generated UI audit currently records many review signals. Treat these as investigation prompts, not automatically as confirmed defects.

## 12.2 Establish a shared operator error language

Keep technical error codes available for support.

For normal operators, translate errors into:

**What happened?**

**Was the action saved?**

**What should the operator do next?**

Examples:

Instead of `RESOURCE_CONFLICT`, explain which record changed and offer a refresh/review action.

Instead of a raw network failure, explain that the connection failed and whether the transaction outcome is known.

Instead of exposing `OUTCOME_UNKNOWN`, display `Transaction status not yet confirmed` and offer `Check status`.

## 12.3 Improve interruption recovery

The application must survive:

- Page refresh
- Browser tab closure
- Temporary connection loss
- API request timeout
- PostgreSQL connection interruption
- Device switching
- Print-dialog cancellation

For each operation, explicitly distinguish unsaved input, saved draft, pending server operation, confirmed operation, and failed operation.

A user must not be encouraged to repeat an uncertain payment or stock movement blindly.

## 12.4 Improve performance

Review:

- Main PWA bundle
- Large logo assets
- Unnecessary initial data loading
- Excessive render cycles
- Catalog search performance
- Product list responsiveness
- Offline storage initialization
- Unnecessary API polling

Retain lazy loading already present in the repository.

Avoid loading hotel, asset, finance, and kitchen workspaces before a simple cashier POS requires them.

### Definition of done

Critical screens are responsive and recoverable.

Ordinary users see helpful instructions rather than implementation details.

---

# 13. P1: BACKUPS, RECOVERY AND OPERATIONAL READINESS

The repository already contains backup-related code under `apps/backup/`, but the current documentation states that fully tested backup and restore acceptance is still outstanding.

Do not mistake the existence of a backup script for disaster recovery readiness.

## 13.1 Integrate the existing backup foundation

Build deployment-package support for:

- Scheduled PostgreSQL backups
- Encrypted archives
- Retention policy
- Backup health status
- Storage-failure reporting
- Off-host backup configuration
- Documented restoration

Prefer adapting `apps/backup/backup.sh` rather than introducing an unrelated backup mechanism.

Do not require operators to know how `pg_dump`, `age`, or `rclone` work.

## 13.2 Rehearse local restoration

Use a disposable database.

Create representative transactions, produce a backup, destroy the disposable database, restore it, and verify:

- Business identity
- Staff accounts
- Product records
- Inventory balances
- Orders
- Payments
- Customer credit where used
- Financial totals
- Migration head

Verify that restored financial and stock records agree with the pre-backup state.

## 13.3 Build a system health screen

Provide administrators with plain-language status for:

- API connection
- Database health
- Last successful backup
- Application version
- Pending synchronization
- Receipt-printing availability
- Optional companion-service status

Avoid exposing secrets or raw database connection details.

### Definition of done

A backup can be created and restored successfully in a local isolated environment.

The application can display meaningful operational health without administrator SSH access.

---

# 14. REQUIRED ACCEPTANCE TEST MATRIX

The product is not ready merely because `npm run build` passes.

Create a full acceptance suite for the following scenarios.

| ID | Scenario | Required result |
|---|---|---|
| A01 | Fresh local installation | All required services become healthy |
| A02 | Initial administrator | Created through guided setup |
| A03 | Interrupted setup | Resumes without duplicates |
| A04 | Business defaults | Correct outlet, storage, settings and accounts |
| A05 | New product | Sellable through POS |
| A06 | Bulk inventory import | Accurate preview and confirmed records |
| A07 | Cash sale | Correct order, payment, tax and balance |
| A08 | M-Pesa manual sale | Reference captured, manually confirmed |
| A09 | Double-click Complete | No duplicate payment |
| A10 | API timeout during payment | Original outcome recovered |
| A11 | Thermal receipt | Correct 80mm layout |
| A12 | Browser printing | Print dialog works without bridge |
| A13 | Stock receiving | Correct inventory increase and evidence |
| A14 | Physical stock count | Correct balance and movement records |
| A15 | Bottle and shot sales | Correct millilitre consumption |
| A16 | Shift closing | Accurate cash and variance calculation |
| A17 | Staff permissions | Appropriate access by role |
| A18 | Hotel reservation | Correct room and booking state |
| A19 | Guest charge | Correct guest folio and financial record |
| A20 | Two active terminals | Consistent shared state |
| A21 | Page refresh | No lost committed transaction |
| A22 | Network interruption | No false confirmation or duplicate |
| A23 | PWA installation | Works with offline sales disabled |
| A24 | Backup and restore | Recovered data matches expected state |
| A25 | App update | Safe restart and persistence |
| A26 | Mobile/tablet use | Critical flows remain usable |

## Required testing environments

Run automated browser tests at representative:

- Small phone widths
- Tablet widths
- Desktop widths

Test with actual PostgreSQL.

Use isolated, disposable databases for destructive testing.

Physical printer verification may be recorded separately from automated tests, but an untested printer must not be described as accepted hardware.

Test multiple browser sessions against one API.

Test a complete shift, not just isolated form submissions.

## Test data

Prepare realistic fixtures for:

- Bar products
- Sealed bottles
- Shot measures
- Restaurant dishes
- Rooms and room rates
- Customers
- Suppliers
- Cash and M-Pesa accounts
- Staff roles
- Opening inventory
- Customer credit scenarios

Fixtures must be clearly separate from real business records.

Demo data must never automatically populate a production business without explicit owner selection.

---

# 15. DEVELOPER WORK PACKAGES

Organize implementation into small reviewable pull requests.

## PR 01: Baseline stabilization

**Deliverables**

- Fix current API-browser CI failure.
- Repair stale selectors and obsolete interactions.
- Confirm database integration tests run.
- Establish clear CI results.

**Gate:** Baseline trustworthy.

## PR 02: Turnkey packaging

**Deliverables**

- Local Compose stack
- Environment generation
- Migration runner
- Preflight tooling
- Health checks
- Reverse-proxy configuration
- Local installation guide

**Gate:** One-command isolated local setup.

## PR 03: First administrator and onboarding

**Deliverables**

- Protected first-run setup
- Business creation
- Business-type selection
- Resumable wizard
- Idempotent default creation
- Setup-progress tracking

**Gate:** Browser-only business initialization.

## PR 04: POS usability

**Deliverables**

- Simple POS
- Quick sale
- Shift startup
- Improved cart
- Cash flow
- M-Pesa manual flow
- Transaction recovery

**Gate:** Reliable first sale.

## PR 05: Inventory onboarding

**Deliverables**

- Simplified product editor
- Linked stock creation
- Product presets
- Unified bulk import
- Stock count improvements
- Bottle/shot usability

**Gate:** Complete product and inventory onboarding.

## PR 06: Receipts and printing

**Deliverables**

- Browser printing default
- Receipt configuration
- 80mm layout
- Logo and QR support
- Print recovery
- Optional bridge setup preparation

**Gate:** Printable completed sale.

## PR 07: PWA and workspace simplification

**Deliverables**

- Installability separated from offline transactions
- Business-type workspaces
- Cleaner staff roles
- Guided first-use tasks
- Responsive improvements

**Gate:** Accessible operator experience.

## PR 08: Operational recovery

**Deliverables**

- Backup packaging
- Restore rehearsal
- Health dashboard
- Simplified operational errors
- Resumable failed workflows

**Gate:** Recoverable business operation.

## PR 09: Final product acceptance

**Deliverables**

- Full acceptance matrix
- Test reports
- Known-issues register
- Local installation demonstration
- Release candidate archive
- Deployment checklist
- Rollback and restore documentation

**Gate:** Product ready for deployment authorization.

No PR should perform a live rollout.

Each PR must be reviewed and tested before merging.

---

# 16. REQUIRED DOCUMENTATION

Prepare the following documentation under the repository's `docs/` structure.

### For developers

- Local development setup
- Fresh local installation
- Environment configuration
- Database migrations
- Architecture overview
- Test execution
- Feature-flag behavior
- Release-package generation
- Recovery and troubleshooting

### For installation technicians

- VPS prerequisites
- Installation package contents
- Domain and HTTPS configuration
- Printer setup
- First administrator setup
- Backup configuration
- Health verification
- Rollback procedure

These are preparation documents only. The actual VPS procedure must not be executed during this sprint.

### For operators

- First login
- Initial setup
- Starting a shift
- Adding products
- Importing inventory
- Making a sale
- Recording payments
- Printing receipts
- Counting stock
- Closing the day
- Basic troubleshooting

Documentation must match the current interface and tested behavior.

Remove outdated instructions that reference retired runtimes or commands.

---

# 17. SECURITY AND ENGINEERING SCOPE CONTROL

This sprint is not an open-ended security-hardening project.

Retain essential protections:

- HTTPS
- Strong credential handling
- Session authentication
- Authorization checks
- Database isolation
- Financial transaction consistency
- Idempotent writes
- Command replay protection
- Audit records
- Backup integrity
- Safe device and print-service access

Reduce unnecessary ceremony:

- Repeated confirmation dialogs
- Excessive role configuration
- Unnecessary initial environment flags
- Mandatory advanced offline configuration
- Native printer requirements for browser printing
- Routine exposure of command IDs
- Technical reconciliation screens for successful transactions
- Complex setup dependencies exposed to owners

Do not remove critical protections to make a test pass.

Do not expand signing-key systems, permission models, or approval architecture unless a concrete release-blocking defect requires it.

Prefer eliminating unnecessary prompts through sensible defaults and better orchestration.

Any proposed security-related work outside the immediate launch-critical path should be logged for later consideration.

---

# 18. SPECIFIC NON-GOALS

The following are not required to complete this sprint:

- New ERP modules
- New frontend framework
- Full application redesign
- Tauri or Electron desktop application
- Native Android application
- Automatic M-Pesa Daraja integration
- Full eTIMS integration
- New accounting engine
- Multi-region infrastructure
- Kubernetes
- Advanced analytics or AI features
- Full offline-first transactional expansion
- New complex role and approval systems
- Replacing PostgreSQL
- Reintroducing Supabase business runtime
- Countryside production migration
- Production deployment

Do not divert the core readiness sprint into any of these tasks.

Existing features remain available, but their expansion is deferred.

---

# 19. FINAL DEFINITION OF DONE

The sprint is complete only when every statement below is true.

- [ ] A fresh isolated installation requires no manual database creation.
- [ ] The local deployment package starts successfully.
- [ ] Initial administrator creation works through the browser.
- [ ] Business setup resumes after interruption.
- [ ] Required operational defaults are created automatically.
- [ ] Cashier can start a shift through a simple workflow.
- [ ] Cashier can create and complete a sale.
- [ ] Manual M-Pesa payments are correctly recorded.
- [ ] Payment retry cannot create duplicate financial records.
- [ ] Product creation is understandable and functional.
- [ ] Inventory imports provide accurate validation.
- [ ] Stock counts update inventory correctly.
- [ ] Bottle and shot tracking retains quantity accuracy.
- [ ] Browser receipt printing works.
- [ ] Thermal receipt layouts are validated.
- [ ] PWA installation works without offline transaction grants.
- [ ] Appropriate roles and workspaces are available.
- [ ] Relevant hotel workflows pass acceptance.
- [ ] Two simultaneous operators can work consistently.
- [ ] Interrupted actions are recoverable.
- [ ] Database backup and restore passes locally.
- [ ] Essential CI checks are passing.
- [ ] Critical browser acceptance tests are passing.
- [ ] Test results distinguish proven, untested and failed capabilities.
- [ ] User documentation matches the implemented product.
- [ ] A versioned release candidate has been packaged.
- [ ] No production deployment has occurred.

## Final demonstration

Demonstrate the system on a clean, disposable local environment.

Start with no existing business data.

Show the complete process from installation and first administrator creation through business setup, product creation, first sale, payment, receipt, inventory update, shift closing, logout, login, and next-day record retrieval.

Repeat relevant portions for a hotel deployment.

Demonstrate a database restore separately.

Record all evidence and unresolved defects.

If developer intervention is needed to fix ordinary configuration or complete a normal business workflow, document the failure and resolve it before declaring readiness.

---

# 20. FINAL HANDOVER REQUIREMENTS

At completion, provide the product owner with:

1. A clean release candidate branch and commit.
2. A complete change summary.
3. A list of implemented usability improvements.
4. A list of functionality preserved.
5. A list of intentionally deferred capabilities.
6. Automated test results.
7. Manual acceptance evidence.
8. Supported printer test results.
9. Fresh-install instructions.
10. Sample business setup demonstration.
11. Backup and restore evidence.
12. Known limitations and unresolved defects.
13. Deployment package inventory.
14. A deployment readiness checklist.
15. An explicit statement that production has not been touched.

The final release status must distinguish:

- **Development complete**
- **Locally accepted**
- **Release candidate prepared**
- **Deployment not yet authorized**

Do not label the product fully production-validated until hosted deployment, physical hardware checks, and live-environment acceptance have actually been completed.

## FINAL ENGINEERING INSTRUCTION

SERVEOS already has a substantial business engine.

The responsibility now is to remove avoidable friction between that engine and the people who will use it.

Every implementation decision should answer:

**Does this make SERVEOS faster to initialize, simpler to operate, easier to understand, more reliable, or easier to recover?**

If not, it probably belongs in a later sprint.

Build the complete, locally verified, deployment-ready Day-One experience.

**STOP BEFORE DEPLOYMENT.**

No live rollout is permitted without a separate instruction from the product owner.