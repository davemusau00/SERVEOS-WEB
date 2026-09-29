# Web v2 POS / Orders / Tabs / Tables / Recipes

## Scope

Patch 11D adds the staged PostgreSQL-authoritative sale/order lifecycle. It deliberately does not add payments. Patch 11E owns tendering, M-Pesa, receipts, refunds and close-day accounting.

Production remains on the legacy terminal while `VITE_ENABLE_WEB_V2=false`.

## Staged commands

Configuration:
- `posPolicy.save`
- `outlet.save`, `outlet.archive`, `outlet.reactivate`
- `table.save`, `table.archive`, `table.reactivate`, `table.ready`
- `product.salesConfig`

Sales:
- `order.create`
- `order.addItem`
- `order.updateItem`
- `order.removeItem`
- `order.fire`
- `order.kds`
- `order.repeatRound`
- `order.void`

## Order invariants

- order/table/product/stock versions are checked server-side
- two devices cannot seat the same table from the same baseline
- price, product version and tax policy are snapshotted onto each order item
- item quantity/removal is blocked after stock has fired
- fire aggregates ingredient requirements before touching stock
- a replayed command cannot consume stock twice
- insufficient stock rejects the whole command
- stock movement history remains immutable
- voiding fired stock requires an explicit disposition
- `RETURN_SEALED` reverses the exact fired ingredient snapshot
- voided table orders release the table to `CLEANING`
- only an unoccupied `CLEANING` table can return to `AVAILABLE`

## Recipes / portions / modifiers

`product.salesConfig` adds:

- portions with stable IDs, prices and optional volume
- modifiers with price deltas
- modifier ingredient adjustments
- recipe ingredients with tracked quantities

If a product has no explicit recipe but links a stock item, POS falls back to that linked stock item using the selected portion volume or product portion volume.

## Browser POS

The staged browser workspace adds:

- outlet selection
- quick tabs
- named/customer tabs
- table seating
- cleaning → ready transition
- product search
- barcode/SKU scanner support
- portions/modifiers
- quantity edits before fire
- order firing
- repeat round
- fired-state display
- explicit order void/stock disposition

Payments are rendered as disabled with `Payments · 11E`.

## Validation

Run only in the disposable expansion harness:

```powershell
node scripts/test-supabase.mjs --expansion
```

Do not apply `013_pos.sql` to live Supabase before coordinated v2 cutover.
