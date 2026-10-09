# Finance and assets

The API records business payments, tills, supplier payables, customer credit, expenses, journals, close-day reports and fixed assets through domain commands. Monetary values are stored as integer minor units. Reports derive from committed records and do not replace source transactions.

Asset records have permanent tags and explicit lifecycle events for custody, transfers, inspection, maintenance and disposal. Stock parts consumed by maintenance remain inventory movements; they are not fixed assets.

Financial corrections use the relevant reversal, reconciliation or adjustment workflow with a reason. Do not edit ledger rows or change a past transaction to force a report to balance. See [POS](pos.md), [procurement](procurement.md) and [customer credit](customer-credit.md).
