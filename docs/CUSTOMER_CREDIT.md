# Customer Tabs, Credit Accounts & Reconciliation

ServOS customer credit is an **accounts-receivable ledger**, not a long-running POS tab.

## Operational model

1. Open or link a named customer tab.
2. Sell and fire stock normally.
3. Cash, card or M-Pesa can settle any part of the order.
4. **Charge to Account** transfers the remaining balance to the customer's credit ledger.
5. The order becomes completed and no longer blocks day close.
6. Revenue/tax are recognized once. The receivable is collected later through Cash, M-Pesa or Card.
7. Customer account reconciliation compares an external/customer statement to the immutable ServOS ledger. A difference creates an explicit discrepancy and never silently edits the balance.

## Financial rules

- `orders.amountPaid` remains actual tender received.
- `orders.amountCredited` is the portion transferred to Accounts Receivable.
- A credit sale debits Customer Accounts Receivable and credits Sales/VAT/Levy.
- A later settlement debits Cash/M-Pesa/Card and credits Customer Accounts Receivable. It does not recognize revenue again.
- Cash credit collections increase expected drawer cash but are reported separately from cash sales.
- M-Pesa credit settlements reuse the existing `mpesaReceipts` and statement reconciliation workflow.
- Write-off debits bad-debt expense and credits receivables.
- Credit ledger entries and reconciliation snapshots are immutable under SQLite schema 13.

## Commands

- `order.assignCustomer`
- `customerCredit.configure`
- `customerCredit.charge`
- `customerCredit.settle`
- `customerCredit.reconcile`
- `customerCredit.discrepancy`
- `customerCredit.discrepancy.resolve`
- `customerCredit.writeOff`
- `customerCredit.reverse`

## Permissions

- `credit.view`
- `credit.manage`
- `credit.charge`
- `credit.settle`
- `credit.reconcile`
- `credit.write_off`
- `credit.override_limit`

Admin has all. Manager has operational credit authority. Server can view, charge approved active accounts within limit, and receive ordinary settlements; limit overrides, terms, reconciliation and write-off remain manager/admin work.

## Release boundary

The installed native terminal remains authoritative. This patch does not activate staged web-v2/PostgreSQL credit writes. Staged cloud authority remains disabled until the later controlled cutover.
