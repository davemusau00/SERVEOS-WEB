# Web v2 Procurement and Room Rate Contract

## Scope

Patch 11C adds the staged PostgreSQL-authoritative procurement workflow and fixes the native Room Rate dialog payload.

The live Vercel deployment remains on the legacy Remote Manager while `VITE_ENABLE_WEB_V2=false`. This patch does not run expansion SQL and does not enable v2.

## Native room rate fix

The Room Rate dialog previously kept an editable `price` value in UI state and submitted the entire state object together with `priceMinor`. The strict Rust room-domain validator rejects unsupported fields, producing:

`VALIDATION_FAILED: rate field price`

11C strips `price` before dispatch and sends only the canonical contract:

- `name`
- `roomTypeId`
- `mode`
- `priceMinor`
- `currency`
- `taxBasisPoints`
- `durationMinutes` where applicable
- `mealPlan`
- `minNights`
- `maxNights`

Existing reservation rate snapshots remain immutable.

## Staged procurement commands

- `supplier.save`
- `supplier.archive`
- `supplier.reactivate`
- `purchaseOrder.create`
- `purchaseOrder.receive`
- `supplierPayable.matchInvoice`
- `supplierPayable.pay`
- `asset.commission`

## Procurement conservation rules

A posted GRN is one atomic transaction. Accepted lines produce:

### STOCK
- stock quantity increase
- weighted average cost update
- immutable purchase stock movement
- Inventory debit

### EXPENSE
- expense-account debit

### ASSET
- asset-clearing debit
- one pending acquisition record per accepted physical unit

All accepted value credits Accounts Payable.

Invoice matching is exact against the approved PO and accepted GRN. Supplier payments are manually confirmed records only; ServOS does not initiate a bank, M-Pesa or cash transfer.

Commissioning moves acquisition value from Asset Clearing to Fixed Assets and creates the permanent asset plus immutable asset event.

## Browser workspace

The staged browser gains a Procurement tab containing:

- suppliers
- mixed-treatment POs
- scanner-assisted receiving
- GRN history
- payables
- invoice matching
- manually confirmed supplier payments
- pending capital-asset commissioning

Disconnected browser actions remain drafts. No offline financial or stock finalization is enabled.

## Validation

Run the expansion SQL only in the disposable PostgreSQL harness:

```powershell
node scripts/test-supabase.mjs --expansion
```

Production remains:

```text
VITE_ENABLE_WEB_V2=false
```

Do not paste `012_procurement.sql` into the live Supabase project.
