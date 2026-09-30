# Floorplan

Section: Floor Plan
Roles: Admin, Manager
Permission: floorplan.manage
Screen: floorplan
Keywords: floorplan, floor plan, ServOS

## Overview

The floorplan saves the complete outlet layout atomically and preserves active table ownership.

## Procedure

In the installed terminal or the Web Floorplan workspace, choose a service outlet, add or edit table labels, capacity, section, shape, position, minimum spend and assigned server, then save the complete layout. A table with an active order cannot be removed; its order and operational state are preserved while layout settings are saved. Each save includes baseline versions, so reload the latest layout if another operator changed the outlet while you were editing.

## What ServOS records

All business mutations go through the authorized native command or queued online `floorplan.save` operation. Each save is atomic across the outlet layout; offline Web edits remain local drafts until the business server can accept them.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
