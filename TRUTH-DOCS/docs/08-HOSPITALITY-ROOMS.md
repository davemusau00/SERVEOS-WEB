# 08 — Hospitality and Rooms Reset

## 1. Objective

Support both:

1. a small property where a walk-in guest simply checks in, pays and checks out; and
2. a mature hotel operation using reservations, deposits, customer profiles, folios, extensions and room moves.

The advanced engine remains. The simple workflow stops forcing the operator through it.

## 2. Primary Front Desk model

Room board:

```text
AVAILABLE
Room 1   KES 3,000   [ Check in ]
Room 2   KES 3,000   [ Check in ]

OCCUPIED
Room 3   John   Checkout today   Paid
Room 4   Mary   Balance 3,000

NEEDS CLEANING
Room 6

OUT OF ORDER
Room 8
```

Room cards are the central navigation element.

## 3. Quick check-in

Example:

```text
CHECK IN ROOM 6

Guest name
[ John ]

Guests
[ 1 ]

Stay
[ 1 night ]

Checkout
Tomorrow · 10:00

Rate
KES [ 3,000 ]

Payment
● Pay now
○ Pay later

[ Check in ]
```

No required customer account.
No required reservation wizard.
No required deposit.
No manual folio opening.

## 4. Domain command

Use an atomic high-level command:

`stay.quickCheckIn`

It performs, in one transaction:

```text
validate room/rate/policy
capture guest snapshot
create stay
create internal guest bill/folio
post accommodation charge
record optional payment
mark room occupied
create audit/change records
```

## 5. Guest snapshot

A stay records the guest details supplied at check-in even when no reusable profile exists.

Recommended fields:

```text
guestName required
guestPhone optional
guestIdentification optional
guestNotes optional
guestProfileId optional
```

Business policy controls which fields are required.

Example policies:

- Walk-in minimal: name only.
- Standard: name + phone.
- Registration: name + phone + identification.

## 6. Link/create guest profile later

From an active stay:

`Save guest for future visits`

creates or links a profile without changing historic snapshot evidence.

## 7. Deposits

Business setting:

```text
Never required
Optional
Required for reservations
Required for all stays
```

Simple hotels can choose Never/Optional.

Advanced hotels retain deposit accounting.

## 8. Checkout

Paid stay:

```text
ROOM 6
John
Balance: KES 0

[ Check out ]
```

Unpaid:

```text
ROOM 6
John
Amount due: KES 3,000

[ Pay & Check Out ]
```

Payment methods appear inline.

## 9. Stay state machine

Recommended core states:

```text
RESERVED
READY
CHECKED_IN
CHECKED_OUT
CANCELLED
NO_SHOW
```

Room availability/condition remains separate from stay state.

## 10. Advanced workflows

Keep:

- future reservation;
- customer/guest profile;
- deposit;
- room charges;
- POS-to-room transfer;
- folio payment;
- folio reversal;
- room move;
- extend stay;
- late checkout;
- corporate/customer account;
- cancellation;
- no-show;
- block/out of order;
- housekeeping inspection.

These live under appropriate advanced/task views instead of obstructing quick check-in.

## 11. Room setup

Simple setup:

```text
Default nightly rate
KES 3,000

Default checkout
10:00 AM

Number of rooms
10

Room numbers
1–10

[ Create Rooms ]
```

Internally ServOS may create a default room type/rate plan.

Advanced setup can later introduce multiple room types/rates.

## 12. Room readiness

Statuses:

```text
READY
OCCUPIED
DIRTY
CLEANING
INSPECTION
BLOCKED
OUT_OF_ORDER
```

Front Desk should translate them into clear actions.

## 13. Housekeeping

Housekeeper view focuses on:

- rooms to clean;
- clean complete;
- inspection needed;
- maintenance/problem report;
- room blocked/unblocked by authorized role.

No pricing/folio/guest financial UI unless permission demands it.

## 14. Concurrency

Check-in/reservation must lock/check the room interval in PostgreSQL transactionally.

Two clients attempting Room 6 for overlapping intervals must result in one success and one deterministic `ROOM_UNAVAILABLE` conflict.

Client-side availability is advisory only.

## 15. Rates

Historic stay charge captures the actual applied rate.

Changing the default rate tomorrow must not rewrite yesterday's folio.

## 16. Folio terminology

Backend/internal documentation may use `folio`.

Simple UI should normally say:

- Guest bill
- Balance
- Charges
- Payments

Advanced hotel/accounting UI can expose Folio where appropriate.

## 17. Acceptance scenarios

Mandatory:

1. Walk-in, name only, 1 night, pay now, checkout.
2. Walk-in, pay at checkout.
3. Guest profile linked optionally.
4. Reservation → check-in → extra service → pay → checkout.
5. Deposit → check-in → apply deposit → checkout.
6. Extend stay.
7. Move room while maintaining financial history.
8. Concurrent attempt to book same room.
9. Dirty room prevents check-in when policy requires Ready.
10. Housekeeper cleans → room returns to available.
11. Network response loss during check-in resolves by command ID without duplicate stay.
