# Front Desk

Section: Rooms
Roles: Admin, Manager
Permission: rooms.view, rooms.operate, rooms.guests.view
Screen: Front Desk

## Overview

Front Desk is the operational view over the native Rooms engine. It combines today's arrivals and departures, occupied-room counts, search, a multi-day tape chart, check-in, and room moves.

The screen uses the timezone configured on the property (currently `Africa/Nairobi` for this installation). In the staged Web workspace, the session returns only the timezone and room-stay policy times needed by operational screens; it does not expose the full property record. Reservation availability still comes from the authorized business records and backend rules, including turnaround buffers and room blocks.

Check-in creates the stay and, when one does not already exist, a zero-value folio shell using the reservation ID as the stable ID. Room moves preserve the reservation rate snapshot, dirty the old room, and create a turnaround block. The Web Front Desk previews destination capacity, cleanliness/service state, overlapping reservations, and active room blocks; the business server rechecks these facts when it accepts the queued move.

Checkout is available only after booked accommodation is posted, the folio balance is settled, and any deposit is applied or refunded. The Front Desk readiness panel explains the next action when one of these conditions is not met. The server remains authoritative and may reject a submission if the folio or stay changed after the screen loaded.

## Procedure

### Review arrivals

1. Open **Front Desk**.
2. Review **Arrivals today**.
3. Confirm that the arrival time has been reached.
4. Confirm that the assigned room is `CLEAN` and not `OUT_OF_ORDER`.
5. Choose **Check in**.

The backend rechecks reservation and room versions, room cleanliness, room condition, timing, and interval availability before committing.

### Review departures

The **Departures today** queue shows active reservations whose planned departure falls on the current property-local date.

Checkout remains unavailable until Patch 07. Do not simulate checkout by cancelling a checked-in reservation or manually changing room state.

### Use the tape chart

Choose a start date and a seven- or fourteen-day view. Each row is a room. Reservation cells show reserved or checked-in occupancy. Block cells show active availability blocks.

Turnaround time is included in reservation occupancy for availability even when the displayed departure has passed.

### Move an in-house guest

1. Choose **Move** on a checked-in stay.
2. Select a room; ServOS previews capacity, room condition, bookings, and active blocks.
3. Record the reason.
4. Confirm the move.

ServOS checks versions for the stay, reservation, current room, and destination room. It updates reservation and stay together, marks the old room dirty, preserves the existing rate snapshot, and adds a turnaround block for the old room. If a destination blocker appears, resolve it and refresh before retrying. A queued command is not complete until accepted by the business server.

### Handle conflicts

A version conflict means another committed action changed the reservation, stay, or room after the screen loaded. Refresh the Front Desk and repeat the action using the current data.
