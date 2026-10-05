# 04 — Database and Domain Model

## 1. Philosophy

The new backend should move from a generic record/document database toward relational business entities with explicit invariants.

The current system's generic record approach helped accelerate development, but it also made partial-record replacement, command routing and cross-domain validation harder to reason about.

The new database should make invalid states difficult to store.

## 2. Common columns

Most mutable business tables include:

```text
id UUID
business_id UUID
version BIGINT NOT NULL DEFAULT 1
created_at timestamptz
updated_at timestamptz
archived_at timestamptz nullable
created_by UUID
updated_by UUID
```

Version increments on every committed change.

Financial/history tables are normally append-only rather than version-updated.

## 3. Core business tables

```text
businesses
business_settings
outlets
service_areas
storage_locations
business_capabilities
number_sequences
```

Business capabilities might include:

```text
POS
KITCHEN
INVENTORY
PROCUREMENT
ROOMS
HOUSEKEEPING
CUSTOMER_CREDIT
ASSETS
```

## 4. Identity and access

```text
users
staff
roles
permissions
role_permissions
staff_roles
devices
device_enrollments
sessions
refresh_tokens
manager_approvals
offline_grants
```

A login identity and a staff record are related but distinct.

This allows:

- staff who do not need remote login;
- one user potentially serving multiple business memberships later;
- device enrollment independent of staff record lifecycle.

## 5. Catalog

```text
item_families
items
item_barcodes
stock_items
item_stock_links
purchase_packages
selling_options
recipes
recipe_lines
batch_recipes
```

### Item vs stock item

Internally the distinction remains valuable.

Operator UX hides it.

Examples:

- Menu dish may be sellable but not independently stocked.
- Beef may be stocked but not sold directly.
- Jameson can have one stock basis with several selling options.

## 6. Inventory

```text
stock_balances
stock_movements
stock_count_sessions
stock_count_lines
stock_transfer_headers
stock_transfer_lines
inventory_adjustments
sealed_open_balances
```

### Stock balance invariant

`stock_balances` is a current projection.

Every quantity-changing command also writes immutable `stock_movements`.

Never directly edit a stock balance without a corresponding movement.

### Sealed/open drinks

For tracked volume items:

```text
sealed_open_balances
  stock_item_id
  storage_location_id
  sealed_container_count
  open_quantity_canonical
  container_quantity_canonical
```

Conservation invariant:

```text
total canonical quantity
=
sealed_container_count × container_quantity
+ open_quantity
```

## 7. POS and orders

```text
orders
order_lines
order_line_modifiers
order_events
payments
payment_allocations
refunds
receipt_documents
printer_jobs   // Terminal-local may be separate
```

Recommended order state machine:

```text
DRAFT
OPEN
FIRED
PARTIALLY_PAID
PAID
CANCELLED
REFUNDED/PARTIALLY_REFUNDED via separate refund records
```

Avoid rewriting historical order lines after payment. Corrections happen through explicit reversal/refund operations.

## 8. Tills and money

```text
tills
till_sessions
till_cash_movements
cash_counts
mpesa_transactions
mpesa_reconciliations
card_references
```

Opening/closing a till is explicit.

Cash expected is derived from committed movements, never stored as manually editable truth.

## 9. Customer credit

```text
customers
credit_accounts
credit_entries
credit_settlements
credit_writeoffs
```

Credit balance is derived from immutable entries or maintained as a transactionally consistent projection.

## 10. Procurement and AP

```text
suppliers
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
supplier_invoices
supplier_invoice_lines
payables
supplier_payments
```

PO lines record the package selected at order time so later package changes do not rewrite historic intent.

A receipt line records:

- ordered package;
- received package quantity;
- accepted quantity;
- rejected quantity;
- conversion to canonical inventory;
- unit/package cost;
- reason/evidence for exceptions.

## 11. Hospitality

```text
room_types
rooms
rate_plans
room_blocks
reservations
stays
stay_guests
guest_profiles
folios
folio_entries
housekeeping_tasks
room_condition_events
```

### Critical design: guest profile optional

`stays` must support an immutable/retained inline guest snapshot:

```text
guest_name
phone nullable
identification nullable
notes nullable
guest_profile_id nullable
```

Therefore a walk-in can:

```text
check in
pay
stay
check out
```

without creating a persistent CRM/customer account.

### Folio internal, not mandatory UI

Every stay may use an internal folio/bill for financial correctness.

The simple receptionist flow does not need to expose the word "folio".

## 12. Assets

```text
assets
asset_assignments
asset_events
maintenance_cases
maintenance_events
```

Procurement-to-asset acquisition must be explicit so the same purchase line does not accidentally become both consumable stock and an asset.

## 13. Commands, audit and sync

```text
commands
changes
audit_events
client_cursors
sync_bootstraps
offline_grants
offline_grant_consumption
```

These are infrastructure-domain tables and should be carefully indexed.

## 14. Imports

```text
import_jobs
import_files
import_mappings
import_rows
import_errors
import_apply_runs
```

Raw CSV text should not be copied indefinitely into immutable command history.

Store the import as a controlled object/job with retention rules and audit the applied result separately.

## 15. Monetary representation

Use integer minor units wherever practical:

```text
KES 2,450.50 → 245050 cents
```

If current product requirements only use whole Kenyan shillings, the API may display whole values, but the storage model should avoid floating-point money.

Never use JavaScript floating point as authoritative accounting arithmetic.

## 16. Quantity representation

Canonical quantities should use an exact numeric representation appropriate to domain scale.

Examples:

- COUNT: integer pieces where possible;
- WEIGHT: canonical grams;
- VOLUME: canonical millilitres;
- decimal quantity where partial canonical units are unavoidable.

Package conversion belongs in domain services and is stored in historic transaction lines when needed for evidence.

## 17. Time and timezone

Store timestamps in UTC.

Store business timezone in business settings, for example `Africa/Nairobi`.

Business-day calculations, nightly checkout cutoffs and reports use business-local time through a shared time library.

Never store ambiguous local timestamps without timezone interpretation.

## 18. Database constraints to enforce

Examples:

- unique barcode within business;
- unique active room number/name within property/outlet scope;
- non-negative stock where policy requires it;
- accepted + rejected cannot exceed physically received quantity;
- payment allocations cannot exceed payment amount;
- room cannot have overlapping active stays/reservations where prohibited;
- duplicate supplier invoice references rejected according to supplier/business policy;
- one active till session per till where configured;
- command ID unique globally;
- change cursor monotonically increasing;
- offline grant consumption cannot exceed grant limits.

## 19. What not to encode only in the database

Avoid giant trigger/procedure systems for:

- entire command dispatch;
- user-facing error wording;
- workflow branching;
- role navigation;
- API payload parsing;
- package wizard logic.

The database protects truth. The application explains and orchestrates it.
