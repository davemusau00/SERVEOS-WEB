# Web v2 Catalog and Inventory

## Overview

Patch 11B adds the first shared transactional web business domain behind the Patch 11A activation gate. It remains staged. The live Vercel deployment must keep `VITE_ENABLE_WEB_V2=false`, and the live business Supabase project must not receive the expansion SQL yet.

The browser does not write Supabase tables directly. It enqueues a versioned `BusinessCommandV2`, sends it through `servos_v2_execute`, and then consumes the authorized change feed.

Implemented staged operations:

- `product.save`, `product.archive`, `product.reactivate`
- `stockItem.save`, `stockItem.archive`, `stockItem.reactivate`
- `stockLocation.save`, `stockLocation.archive`, `stockLocation.reactivate`
- `inventory.count`
- `inventory.transfer`
- `inventory.waste`

Stock movements are immutable. Quantities cannot be directly edited through stock-master forms. A physical count sets an exact quantity and records the variance. Transfers create paired OUT/IN movement records. Waste cannot drive stock below zero.

## Procedure

Apply Patch 11B only to source control. Validate SQL in the disposable PostgreSQL harness:

```powershell
node scripts/test-supabase.mjs --expansion
```

Then run the normal source/browser gate.

For browser rehearsal, deploy a Vercel Preview with:

```text
VITE_ENABLE_WEB_V2=true
```

and point it to a separate staging Supabase project containing the fully tested expansion stack. Do not point that preview at production.

The production deployment remains:

```text
VITE_ENABLE_WEB_V2=false
```

until the full v2 cutover gate has passed.
