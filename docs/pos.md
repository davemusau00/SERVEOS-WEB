# Point of sale

The POS workspace uses API commands for tabs, order lines, pricing, discounts, service routing, payment and refunds. The API records money in integer minor units and validates reviewed record versions before committing a command.

Staff should verify the selected outlet, customer and items before confirming payment. The API records only the tender information the cashier confirms. A saved draft, queued command or unknown outcome is not proof that a payment completed.

Orders may consume inventory according to the saved product recipe and service state. Receipt documents capture the committed transaction snapshot. Printing uses the browser/PWA print dialog and an operating-system printer. Opening the dialog does not prove paper output.

See the [API command contract](api.md), [inventory](inventory.md) and [receipt printing guide](user-guide/30-receipt-printing.md).
