# Procurement

The API supports suppliers, purchase orders, goods receipts, supplier invoices, payables, supplier payments, returns and supplier credits. Receipt and payment commands preserve their links to the reviewed order, supplier and source records.

Create or review a purchase order, then record only the quantities actually delivered. A rejected or short delivery must be represented in the receipt details. Supplier payment is a distinct accounting event and does not rewrite the receipt.

Import suppliers as master data before importing records that depend on their external IDs. See [inventory](inventory.md), [imports](import.md) and the in app [receiving guide](user-guide/19-receiving.md).
