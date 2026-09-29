# Folios and hotel settlement

Section: Rooms
Roles: Admin, Manager
Permission: folio.view, folio.manage, payment.record
Screen: Folios

## Overview

Folios is the financial control surface for a room reservation and stay. One reservation, one stay, and one folio use the same stable ID.

The folio stores two independent amounts:

- `balanceMinor` is the guest receivable.
- `depositMinor` is unapplied guest deposit liability.

Deposits are not revenue. Applying a deposit reduces both deposit liability and guest receivable. Direct settlement cannot exceed the outstanding receivable.

Accommodation, services, POS room charges, payments, deposit applications, refunds, and reversals create immutable folio history. Checkout requires all booked accommodation periods to be posted and both balances to equal zero.

## Procedure

### Open a folio before arrival

1. Open **Folios**.
2. Select a reserved booking.
3. Choose **Open folio**.
4. Record any advance deposit using **Record deposit**.

A folio can exist before check-in. Check-in reuses the same folio and rejects an incompatible or closed folio.

### Post accommodation

Choose **Post due accommodation** to catch up accommodation periods whose billing boundary has been reached.

Choose **Post booked stay** when settling the full originally booked stay before checkout. Each original reservation period has a deterministic immutable key, so repeating the action cannot bill the same period twice.

Accommodation uses the rate/tax snapshot captured by the reservation.

### Post hotel services

1. Configure active hotel service masters with a code, KES price, and tax basis points.
2. Select a checked-in folio.
3. Choose **Hotel service**.
4. Select the service and quantity.
5. Confirm.

The folio entry snapshots the service master and posts guest receivable, service revenue, and inclusive tax atomically.

### Record a deposit

Choose **Record deposit** and select CASH, MPESA, or CARD.

Cash requires an open till. External methods require a reference and explicit manual confirmation. ServOS never infers provider confirmation.

A deposit debits the received tender and credits `GUEST_DEPOSITS`. It does not credit sales or accommodation revenue.

### Apply a deposit

When the guest has both an outstanding receivable and unapplied deposit, choose **Apply deposit**.

ServOS applies no more than the smaller of the receivable and deposit liability. The journal debits guest deposits and credits guest receivable.

### Settle the receivable

Choose **Settle balance**.

Direct settlement cannot overpay. Excess funds must be recorded separately as a deposit. Cash tender/change is explicit. External references are normalized and protected against duplicate use.

### Refund unapplied deposit

Choose **Refund deposit** and record the payout method, amount, reason, and external payout reference when applicable.

The payout reduces guest deposit liability and records separate refund evidence. Historical receipt/payment records are never edited to simulate a refund.

### Reverse an unpaid charge

A Manager/Admin with `folio.reverse` can reverse a folio charge that is still represented in the outstanding receivable.

Reversal links to the source entry, requires a reason, and posts the opposite receivable/revenue/tax journal. Paid charges require a separate refund workflow rather than silent mutation.

### Extend an active stay

1. Select a checked-in folio.
2. Choose **Extend stay**.
3. Select a compatible active rate plan and number of rate units.
4. Record exact payment evidence.
5. Confirm.

The extra room interval, extension charge, exact payment, immutable extension record, reservation departure, and audit/outbox commit together. A rejected duplicate payment reference leaves the original departure unchanged.

### Check out

Before checkout:

1. Post all booked accommodation.
2. Settle the receivable to zero.
3. Apply or refund all remaining deposit liability.
4. Choose **Check out**.

Checkout closes reservation, stay, and folio together, marks the room DIRTY, creates a turnaround block when required, records an immutable stay event, and captures an immutable hotel receipt.

## POS room charge

At POS, **Charge room** transfers the outstanding restaurant order to a checked-in guest folio.

It is a receivable transfer, not money received:

- restaurant revenue/tax is recognized once;
- guest receivable is debited;
- the folio balance increases;
- cash, M-Pesa, and card totals do not increase;
- the POS order completes and its receipt records `ROOM_CHARGE`.

This prevents double revenue and keeps cash-up truthful.
