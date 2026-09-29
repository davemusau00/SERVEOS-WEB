ServOS Bar-First Master Implementation Plan v2
The production journey should eventually be:
Install → Intake Wizard → Owner Enrollment → Business Setup Wizard → Go-Live Check → Staff Unlock → Open Till → Operate Bar → Reconcile → Close Day → Backup/Sync → Reports → Help when needed
Everything in the application should support that journey.
Phase 0: Establish a truthful engineering baseline
Before building new flows, bring code, documentation and testing into agreement.
The immediate work is to update CURRENT_RELEASE_STATE.md to reflect the now-implemented floorplan and table.ready functionality, re-run the UI interaction inventory, classify every native surface as implemented/prototype/unavailable, and eliminate remaining production buttons that only modify component state.
The repo currently has no .github/workflows and the latest commit has no GitHub status checks attached. Since you now have test:native:container and test:cloud, this is the right point to introduce CI.
The baseline CI should run:
npm ci
npm run lint
npm run build
npm test
npm run test:browser
npm run test:native:container
npm run audit:ui

Cloud tests should run against an isolated configured test project rather than silently hitting production.
Add a documentation verification command as well:
npm run docs:check

It should validate the documentation index, Help Center manifest, broken links, RBAC permission registry and feature status registry.
Phase 0 documentation
Create or update:
docs/CURRENT_RELEASE_STATE.md
docs/FEATURE_COVERAGE_MATRIX.md
docs/GAP_ANALYSIS_AND_ROADMAP.md
docs/IMPLEMENTATION_PLAN.md
docs/COMPLETION_LEDGER.md          NEW
docs/CHANGELOG.md                  NEW
docs/TEST_EVIDENCE.md              NEW

COMPLETION_LEDGER.md becomes particularly important. Every finished slice records the commit, functionality, tests actually executed, documentation changed, known limitations and acceptance status.
No more “button exists therefore feature complete.”
Phase 1: Rebuild RBAC as a native security system
This should happen before the onboarding/setup work starts creating more staff and administrative surfaces.
The current RBAC implementation has two halves that do not line up.
Frontend ROLE_DEFINITIONS currently decides things such as:
allowedTabs
canApproveDiscounts
canVoidOrders
canAdjustStock
...

while Rust separately has checks like:
Server → cannot modify masters
Server → cannot adjust stock
Server → cannot transfer/merge/void orders
Server → cannot reconcile M-Pesa
Admin → staff creation

The backend must become the single authority.
RBAC architecture
For the bar MVP I would retain the existing persisted roles to avoid unnecessary migration risk:
Persisted role	Product label	Purpose
Admin	Owner / Administrator	Business ownership and configuration
Manager	Manager / Supervisor	Operational control and approvals
Server	Bar Operator	Bartender, waiter or cashier operating the bar


Employee job title should be separate from access authority.
A bartender, waiter and cashier may all initially use the Server access role while their employee/job profile remains different.
That avoids confusing:
“What someone does at work”

with:
“What the security engine allows them to do.”

Replace broad booleans with capabilities
Introduce an explicit native permission catalogue such as:
business.view
business.configure
business.tax.configure

staff.view
staff.create
staff.update
staff.deactivate
staff.reset_pin
staff.change_role

pos.sell
pos.open_tab
pos.manage_table
order.fire
order.transfer
order.merge
order.void
order.discount
order.comp
order.refund

payment.record
payment.split
payment.reverse

till.open
till.close
till.cash_movement
till.override_variance

mpesa.record
mpesa.reconcile

catalog.view
catalog.manage
pricing.manage

inventory.view
inventory.receive
inventory.transfer
inventory.waste
inventory.count
inventory.adjust

floorplan.view
floorplan.manage

kds.view
kds.update

accounting.view
reports.view
audit.view

backup.create
backup.restore
sync.manual
system.configure

Rust evaluates these. React merely consumes them.
runtime_snapshot should return something like:
actor
role
permissions[]
records[]
pendingCount
lastSync
terminalId

Then navigation and individual buttons derive visibility/disabled state from that returned permission list.
Native role switching must be removed
The current native header still renders:
Admin
Manager
Server

as a role selector inherited from preview mode.
In production there must be no role simulation.
Instead:
Current User: Jane | Manager
and a:
Change Staff / Lock
action.
Selecting another staff member must require that person's PIN.
Browser sample-preview mode may keep simulated roles, but it must remain explicitly labelled preview behavior.
Manager override without disrupting service
For seamless bar operation, don't make staff completely log out every time a discount or void needs approval.
Add an audited supervisor elevation flow.
Example:
Operator clicks Void
        ↓
Requires order.void
        ↓
Manager approval modal
        ↓
Manager chooses identity + enters PIN
        ↓
Rust validates manager locally
        ↓
Short-lived authorization token
        ↓
Void command executes

Audit should preserve both:
initiatedBy: bartender
approvedBy: manager

The authorization should be:
specific permission
specific operation/record
short TTL
single use

not a blanket manager session.
That will make ServOS dramatically smoother during busy service.
Staff lifecycle
Add native operations for:
staff.update
staff.deactivate
staff.resetPin
staff.changeRole

Rules should include:
- cannot deactivate the final active Admin;
- role changes revoke active sessions;
- deactivation revokes active sessions;
- Server cannot create or modify staff;
- Manager cannot create another Admin;
- only Admin can change business ownership/security configuration;
- no staff record is physically deleted once referenced by transactions.
RBAC documentation
Create:
docs/RBAC_AND_PERMISSIONS.md

It should contain the permission dictionary, default role matrix, manager-override rules, staff lifecycle and examples.
The Help Center should expose the same matrix in friendlier language.
Phase 2: Intake Wizard
This is not the Business Setup Wizard.
The Intake Wizard asks:
“What kind of business am I configuring ServOS for?”

It prepares the system before operational records are created.
Currently a new installation goes almost immediately from business name/owner credentials into generic seeded records such as:
Main outlet → RESTAURANT
Main store

That is too presumptive for the bar-focused deployment.
Installation state machine
Introduce explicit installation states:
NEW
↓
INTAKE_IN_PROGRESS
↓
READY_FOR_ENROLLMENT
↓
ENROLLMENT_PENDING
↓
SETUP_REQUIRED
↓
READY_FOR_GO_LIVE
↓
LIVE

runtime_status should return this instead of merely:
enrolled: true / false

That allows the frontend to route correctly after crashes/restarts.
Intake Wizard stages
Stage	Information captured
Venue profile	Bar, pub, lounge, club, restaurant + bar, other
Service model	Counter service, open tabs, tables, mixed
Operating pattern	Opening days/hours, shifts, late-night operation
Payment methods	Cash, M-Pesa, external card
M-Pesa profile	Till/paybill/account identifier
Sales structure	Drinks, food, bottle service, cocktails, packages
Stock model	Bottle-only, ml-based spirits, recipes, mixed
Service areas	Main bar, VIP, terrace, counter, etc.
Stock areas	Main store, bar store, fridge, wine store, reserve
Tables/seating	None, bar stools, tables, VIP tables
Staff estimate	Managers, bartenders, waiters, cashiers
Equipment	Receipt printer, cash drawer, barcode scanner
Existing data	Manual entry or CSV import
Go-live	Intended operating date and checklist


For the bar-first build, choices outside the supported scope should say:
Available later

rather than creating fictional capabilities.
Persistence
The intake draft should survive a restart.
Do not use browser localStorage.
Persist the draft locally in SQLite metadata because the terminal has not yet been enrolled.
Add native functions similar to:
runtime_intake_load
runtime_intake_save
runtime_intake_clear

The draft contains configuration intent, not transactional business records.
Intake summary
At the end, show something like:
ServOS will configure:

1 Bar business
Counter + table + tab service
Cash / M-Pesa / card
Spirit ml tracking
Cocktail recipes
Main Store + Bar Store
12 tables
3 Managers
8 Operators
Receipt printer enabled

The owner confirms this before enrollment.
Phase 3: Owner enrollment
Keep the current online owner-authentication model.
The difference is that enrollment should now establish identity and terminal ownership, not pretend the business is already configured.
Current initialize() creates:
organization
property
main RESTAURANT outlet
main stock location
owner employee

I would change this.
Enrollment should create only:
organization/business identity
property shell
owner staff identity
owner employee identity
terminal identity
setup state

The operational outlet/store/catalog should come from the Business Setup Wizard.
This prevents placeholder configuration from leaking into real trading.
The owner then unlocks locally with the new PIN even if internet disappears.
Phase 4: Business Setup Wizard
This is where ServOS becomes an actual operational bar.
It should open automatically after successful enrollment and resume exactly where the owner left off.
The owner should not see the normal POS until mandatory setup steps pass.
Setup progress record
Create a durable setup record such as:
businessSetup

containing:
version
currentStep
completedSteps[]
skippedOptionalSteps[]
startedAt
updatedAt
completedAt
goLiveApprovedAt

The UI should be able to say:
Business setup: 7 of 11 required steps complete
rather than guessing from record presence.
Setup Wizard sequence
Step 1: Business identity
Configure:
Trading name
Legal/business name
Phone
Email
Address
KRA PIN
Receipt footer
Currency
Timezone

Single business and single premises remain hard constraints.
Step 2: Tax configuration
Configure current native:
VAT %
Catering levy %
Tax-inclusive pricing

ServOS should not silently invent Kenyan tax values.
The owner explicitly confirms them.
The guide should explain that this is business configuration and not itself evidence of eTIMS submission.
Step 3: Payments
Select:
Cash
M-Pesa
Card

For M-Pesa:
Account label
Till / Paybill
Account/business number

These become the allowed accounts against which manual transaction codes can be entered.
Do not expose Room Charge yet.
Step 4: Service areas
Based on intake, create the real service topology.
Example:
Main Bar
VIP Lounge
Terrace

For the first release these are logical internal service areas of one premises.
No multi-property concepts.
Step 5: Stock locations
Example:
Main Store
Bar Store
Cold Fridge
Wine Rack
Reserve Store

Inventory UI must become dynamic before this phase is considered finished.
It currently still assumes legacy IDs such as:
loc-bar-store
loc-warehouse

That must be removed.
Step 6: Catalog and portion standards
Allow three paths:
Create manually
Import CSV
Start with empty catalog

Never load fake production data.
Configure products such as:
Jameson
Tusker
House Red
Mojito
Coke

and the product/stock relationship.
Step 7: Recipes and spirit portions
Configure:
Single 30ml
Double 60ml
Half bottle
Bottle

per applicable product.
Then configure recipes:
Mojito
Rum 50ml
Lime 1
Syrup 20ml
Mint
Soda

The existing catalog's demo-centric JAM- prefix logic must disappear.
Step 8: Opening inventory
Owner enters the actual first physical count.
This must create explicit:
OPENING_BALANCE

stock movements.
Never directly mutate stock quantities.
This creates an auditable beginning to the inventory ledger.
Step 9: Tables and floorplan
The recently improved Floor Plan Studio slots neatly here.
Allow:
sections
tables
bar stools
VIP tables
capacity
minimum spend
joinable flag
server assignment

The native floorplan.save should be the only persistence path.
Step 10: Staff and access
Create initial:
Managers
Operators

For each:
Name
Job title
Access role
PIN
Active status

Show a plain-language permission preview before saving.
Example:
Bar Operator can sell, fire orders and record payments but cannot adjust stock or approve refunds.

Step 11: Till configuration
Configure:
Default opening float
Cash variance policy
Receipt printer behavior
Cash drawer/manual drawer behavior

Do not actually open the first live till yet.
Step 12: Backup and synchronization
Run:
local backup test
cloud configuration test
sync test if available

Cloud failure should create a warning, not prevent local go-live, provided enrollment is complete and local operation is safe.
Phase 5: Go-Live Readiness Check
Before normal POS access is enabled, run a deterministic readiness engine.
Hard blockers
Examples:
Tax configuration missing
No active outlet
No stock location
No products
No Admin
No payment method
No opening stock acknowledgement

Warnings
Examples:
No manager added
No printer configured
No backup created
Cloud sync unavailable
No M-Pesa account configured
No tables configured

Counter-only bars should not be blocked because no tables exist.
When all mandatory checks pass:
GO LIVE

becomes available.
The owner confirms:
These settings represent the actual business configuration.

ServOS stores:
goLiveApprovedBy
goLiveApprovedAt
setupVersion

From that point onward, setup changes happen through Business Admin rather than the first-run wizard.
Phase 6: Help Center foundation
This should be implemented early and then grow with every later phase.
The Help Center must work offline.
It should not simply link to GitHub documentation.
Add:
Help

to the sidebar/header for every role.
Help Center structure
Section	Coverage
Getting Started	What ServOS is, unlocking, navigation
First-Time Setup	Intake, enrollment, setup wizard, go-live
User Access	Roles, PINs, switching staff, manager approval
Opening the Bar	Unlock, opening checks, opening till
POS	Products, tabs, tables, rounds, quantities
Portions	Shots, doubles, bottles, wine portions
Modifiers	Mixers, cocktail modifications
KDS / Bar Pass	Fire, preparing, ready, served
Tables	Open, transfer, merge, cleaning, ready
Payments	Cash, card, M-Pesa, mixed tender
M-Pesa	Manual receipt verification and reconciliation
Cash Drawer	Float, cash sales, paid-in/out, close
Discounts & Comps	When/how they work, approvals
Voids & Refunds	Financial and stock implications
Inventory	Items, locations, receiving, counts
Transfers & Waste	Bar/store movements and spillage
Stocktake	Expected vs actual
Pricing	Standard prices, Happy Hour, promotions
Floor Plan	Sections, tables, capacities
Closing the Bar	Till count, reconciliation, Z report
Reports	Sales, tenders, stock, margin
Offline Mode	What works without internet
Synchronization	Pending queue and reconnect behavior
Backup & Recovery	Backup procedure and restore
Troubleshooting	Common errors and recovery steps
Owner/Admin Guide	Setup, staff, permissions, configuration
Manager Guide	Approvals, reconciliation, exceptions
Operator Guide	Daily bar workflow
Glossary	ServOS terms


Context-sensitive help
Every major page should expose:
?

and open the relevant guide article.
Examples:
POS → Running a bar tab
M-Pesa modal → Recording a manual M-Pesa receipt
Inventory Count → Performing a stocktake
Till Close → Closing and reconciling the drawer
This dramatically reduces training friction.
Search
The Help Center should provide offline search:
"refund"
"stock count"
"forgot PIN"
"mpesa"
"happy hour"
"close till"

Results can contain:
Guide article
Relevant screen
Required permission
Step-by-step procedure
Common mistakes

One source of truth
Do not write a separate React help manual and Markdown manual.
Create:
docs/user-guide/

with Markdown source files.
Example:
docs/user-guide/01-getting-started.md
docs/user-guide/02-setup.md
docs/user-guide/03-rbac.md
docs/user-guide/04-opening-bar.md
...

Then add:
scripts/build-help-index.mjs

which generates:
src/generated/help-index.json

for the native Help Center.
That gives us:
one documentation source → developer docs + in-app user guide
and makes documentation drift much harder.
Phase 7: Finish the bar master-data engine
Now resume the previous bar-first operational roadmap.
Complete:
products
stock items
stock locations
recipes
portions
modifiers
mixers
product routes
tax classes

The UI must stop having demonstration configuration hidden in component state.
Particularly:
INITIAL_PRICE_BOOKS
demo recipe displays
JAM- portion trigger
hardcoded stock location IDs

need to disappear.
Phase 8: Finish seamless bar service
A bartender should be able to remain inside POS for almost the entire shift.
Required native commands should include:
order.updateItem
order.setQuantity
order.setPortion
order.setModifiers
order.addNote
order.compItem
order.discount

Bar workflow:
Open tab
↓
Add drinks
↓
Select portion
↓
Select mixer/modifier
↓
Adjust quantity
↓
Fire
↓
Prepare / Ready / Served
↓
Repeat round
↓
Settle

Add speed features:
Favorites
Recent drinks
Repeat last round
Duplicate line
+ / − quantity
Barcode lookup
Fast search
Quick tabs

Phase 9: Correct KDS / Bar Pass
The current stationFilter only changes UI selection state. It does not genuinely filter the tickets.
Fix routing around the product snapshot:
BAR
KITCHEN
SERVICE

Then make lifecycle item-specific:
FIRED
↓
PREPARING
↓
READY
↓
SERVED

Do not mark every fired item in an entire order simultaneously unless that action genuinely targets all of them.
For bar-only operations, make BAR the default station view.
Phase 10: Money and till completeness
Retain the strong existing foundation:
Cash
Card approval reference
Manual M-Pesa
Split payment
M-Pesa uniqueness
Reconciliation

Add:
till.cashMovement
payment.reverse
payment.refund

and proper manager authorization.
Cash lifecycle becomes:
Opening float
+ cash sales
+ paid in
- paid out
- cash drops
= expected drawer

Then compare:
expected
vs
physical count

at close.
Phase 11: Discounts, comps, voids and refunds
These are visible in the UI today but not fully real.
Make them native and auditable.
Discount
Record:
original value
discount percentage/value
reason
operator
approver
timestamp

Comp
Stock still depletes.
Accounting treats the item as complimentary rather than making stock magically disappear.
Fired void
Require a disposition:
Returned sealed
Waste
Consumed
Manager adjustment

Refund
Refunding money must not automatically restore ingredients.
For a cocktail:
Refund → money reversal

and separate:
stock disposition

This is an important accounting/inventory invariant.
Phase 12: Pricing and Happy Hour
Replace component-local price books with persisted priceRules.
Support:
Timed Happy Hour
Fixed promotional price
Percentage discount
Bottle promotion
Category promotion
VIP price
Staff price

Every sold item snapshots:
basePrice
appliedRuleId
effectivePrice
discountAmount
tax
levy

Historic receipts never recalculate after rule changes.
Phase 13: Inventory operational completeness
Build on the already-native:
inventory.adjust
inventory.transfer
inventory.waste

Add:
inventory.receive

before implementing the whole procurement ERP.
Receiving should capture:
Supplier
Delivery note
Invoice reference
Quantity
Unit cost
Location
Date
Actor

Then bar stock reconciliation becomes:
Opening
+ received
+ transfers in
- transfers out
- sales consumption
- declared waste
= expected

Expected
vs
physical count
= variance

That becomes one of ServOS's strongest controls.
Phase 14: End-of-shift / End-of-day workspace
Create a purpose-built close workflow instead of making the owner hunt through modules.
Show:
Area	Metrics
Sales	Gross, net, VAT, levy
Tenders	Cash, card, M-Pesa, mixed
Cash	Float, paid in/out, expected, actual, variance
Orders	Open, completed, voided
Adjustments	Discounts, comps, refunds
M-Pesa	Reconciled, pending, discrepancy
Products	Top sellers, category mix
Stock	Consumption, waste, variance
Margin	Revenue, COGS, gross margin
Staff	Sales by operator
System	Pending sync, latest backup


The close sequence should be:
Resolve open tabs
↓
Reconcile tenders
↓
Count cash
↓
Close till
↓
Review exceptions
↓
Complete stock count if scheduled
↓
Create backup
↓
Sync if online
↓
Generate day-close report

Phase 15: Full Help Center content and training layer
By this stage the Help Center framework already exists.
Now ensure every production workflow has:
Overview
Who can do it
Prerequisites
Step-by-step
What ServOS records
Common errors
How to reverse/correct
Related reports

Add role-specific quick-start journeys.
Operator quick start
Unlock
Open tab
Add drinks
Fire
Take payment
Print receipt
Clean table
Change staff

Manager quick start
Open till
Approve exceptions
Adjust stock
Review waste
Reconcile M-Pesa
Resolve variance
Close day

Owner quick start
Configure business
Manage staff
Review reports
Create backup
Check synchronization
Change pricing

Phase 16: Bar production acceptance
Do not call the bar complete because all components compile.
Run a full scripted rehearsal:
Fresh installation
↓
Intake Wizard
↓
Enrollment
↓
Business Setup Wizard
↓
Create manager/operator
↓
Opening stock
↓
Go Live

Open till
↓
Counter order
↓
Table order
↓
Named tab
↓
Spirit single/double
↓
Cocktail with modifier
↓
Beer round
↓
Repeat round
↓
Transfer table
↓
Merge table
↓
Waste item
↓
Stock transfer
↓
Cash payment
↓
M-Pesa payment
↓
Card payment
↓
Mixed payment
↓
Discount
↓
Comp
↓
Void
↓
Refund

Lose internet
↓
Continue trading
↓
Restart application
↓
Continue trading
↓
Reconnect
↓
Sync

Reconcile M-Pesa
↓
Stock count
↓
Cash count
↓
Close till
↓
Day-close report
↓
Backup
↓
Restart
↓
Verify complete persistence

Only then does the feature matrix move the bar slice to deployment verified.
Then expand beyond the bar
After that production gate, extend ServOS in this dependency order:
Restaurant service → Procurement/AP → Production/batches → Accounting hardening → CRM → Host/reservations → Events/nightlife → Hotel PMS → HR/payroll → Guest ordering.
The bar establishes most of the transactional spine those modules need.
Documentation becomes part of every Definition of Done
This is the most important change to the development process.
From now on, a feature is not complete until its documentation is complete.
Every user-visible or domain completion must update the relevant documentation before the work item is closed.
Change	Mandatory documentation
Any completed feature	CURRENT_RELEASE_STATE, FEATURE_COVERAGE_MATRIX, CHANGELOG, COMPLETION_LEDGER
User workflow changed	MODULE_WORKFLOWS + relevant User Guide article
Data model changed	DATA_DICTIONARY
Permission changed	RBAC_AND_PERMISSIONS
Wizard/setup changed	ONBOARDING_AND_SETUP + User Guide
Architecture changed	SYSTEM_ARCHITECTURE
Deployment/sync/backup changed	DEPLOYMENT_RUNBOOK
Test/acceptance completed	TEST_EVIDENCE
UI controls added/removed	regenerate UI_INTERACTION_INVENTORY.json


I would also add a short required completion entry like:
Feature: table.ready
Status: locally verified
Backend: implemented
Frontend: implemented
RBAC: Operator allowed
Persistence: restart verified
Offline: verified
Sync: pending
Tests: 4 native tests
User guide: Tables → Cleaning & Ready
Known gaps: sync acceptance
Commit: ...

That single discipline will stop the current problem where one document says a feature is missing while two other files and the Rust implementation say it exists.
The resulting ServOS philosophy
The revised target is now much clearer:
ServOS should be installable by a business owner who has never seen the codebase, guide them through configuring their real bar, teach every staff member how to use it, strictly enforce what each person is allowed to do, operate a complete shift offline, explain every transaction afterward, and keep its own documentation synchronized with the software as it evolves.