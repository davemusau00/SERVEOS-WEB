# Housekeeping

Section: Property
Roles: Admin, Manager, Housekeeper
Permission: rooms.view, rooms.operate
Screen: housekeeping
Keywords: housekeeping, room readiness, cleaning

## Overview

Housekeeping updates room readiness as work is completed.

## Procedure

1. Open the assigned room and review its current readiness state.
2. Complete the physical room task.
3. Record the next valid readiness transition.
4. Report damage or maintenance work through the maintenance workflow.

## What ServOS handles

The API validates the room status transition and updates the workspace projection.

## Common mistakes and correction

Do not mark a room ready before the physical check is complete. Record maintenance instead of hiding an unresolved defect.
