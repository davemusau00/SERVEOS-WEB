# Housekeeping

Section: Rooms
Roles: Admin, Manager
Permission: rooms.manage, rooms.view
Screen: Housekeeping

## Overview

Housekeeping is the room-readiness board for the native Rooms engine. It separates cleaning state from occupancy and from the room's maintenance condition.

The supported housekeeping sequence is:

`DIRTY → CLEANING → INSPECTION → CLEAN`

Inspection can fail back to `DIRTY`. A clean room can be marked dirty when operational evidence requires it.

`OUT_OF_ORDER` is a separate room condition and prevents reservation/check-in availability.

## Procedure

### Work the cleaning board

1. Open **Housekeeping**.
2. Find the room under `DIRTY`.
3. Choose **Start cleaning**.
4. When cleaning is complete, choose **Send to inspection**.
5. During inspection choose **Pass inspection** or **Fail inspection**.

Every transition is version checked and audited.

### Take a room out of service

1. Choose **Out of order**.
2. Record the defect or operational reason.
3. Resolve any active reservations before taking a conflicting room out of service.
4. When the room is safe again, choose **Return to service**.

### Review room blocks

Active blocks appear on the room card with their interval and reason. Choose **Release block** only after recording an inspection/release note.

Patch 08 adds maintenance work orders and maintenance-linked blocks. Until then, use room condition and ordinary room blocks without pretending they are completed maintenance records.

### Occupied rooms

Housekeeping state and occupancy are independent. An occupied room can appear in the board, but staff should not change cleaning state unless the real-world room workflow supports that action.
