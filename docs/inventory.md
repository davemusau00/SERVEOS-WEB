# Inventory

Inventory masters include stock items, stock locations, purchase packages, scan identifiers, reorder levels and optional sealed container sizes. Quantities use the stock item's base unit. The API validates quantity precision and sealed/open balances in domain commands.

Receiving, counts, corrections, transfers, waste and recipe batch preparation are separate reviewed commands. The client submits the balance and versions the operator reviewed; the API rejects stale or malformed changes. A count is saved only after the count command is confirmed.

CSV import creates supported master records only. It does not import opening balances or transaction history. See [import](import.md), [procurement](procurement.md) and the [stock count guide](user-guide/21-stocktake.md).
