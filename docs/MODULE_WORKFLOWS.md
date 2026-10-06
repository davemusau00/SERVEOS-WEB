# Operational workflows

## Setup

Intake → owner enrollment → business setup → native readiness validation → Admin Go Live → staff unlock.

## Bar service

Open till → open quick tab/table → add quantity/portion/modifier → snapshot price/tax/recipe → fire → deplete frozen ingredients once → KDS PREPARING/READY/SERVED → repeat rounds → settle → table CLEANING → staff Mark Ready.

Unpaid transfer/merge and protected void/discount/comp flows retain audit attribution. Fired voids require a stock disposition.

## Payments

Cash updates expected drawer. Card requires external approval evidence. M-Pesa requires cashier confirmation of the actual business receipt, unique configured account/code recording and later manager statement reconciliation. Split tender must equal the exact outstanding balance and posts atomically.

Refund reverses an original payment/journal up to the remaining refundable amount. Non-cash refunds require external evidence. Refund does not automatically return ingredients to stock.

## Inventory

Opening balance during setup → receipts with weighted-average cost → transfers/counts/waste → sale consumption at order fire. Every change produces stock movements.

## Day close

Resolve open tabs → reconcile tenders → physical drawer count → manager variance approval if necessary → close till → backup/sync → generate persisted close-day report.

## Offline/recovery

Locally enrolled staff work against SQLite without server availability. Accepted commands atomically persist records/audit/outbox. Reconnection uploads in sequence idempotently. Replication is not backup.

## Customer tabs and credit

Named tabs may link a reusable customer. Normal tender remains actual money received. Charge to Account transfers the exact remaining order balance to Customer Accounts Receivable, completes the order and preserves sale/tax recognition. Later Cash/M-Pesa/Card settlements reduce receivables without recognizing revenue again. Cash collections affect expected drawer but are reported separately from cash sales. M-Pesa collections reuse provider-statement reconciliation. Day close requires open POS tabs to be resolved, but completed credit sales do not remain open merely because the customer still owes A/R.
