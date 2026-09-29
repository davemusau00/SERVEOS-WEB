# Floorplan

Section: Floor Plan
Roles: Admin, Manager
Permission: floorplan.manage
Screen: floorplan
Keywords: floorplan, floor plan, ServOS

## Overview

The floorplan saves the complete outlet layout atomically and preserves active table ownership.

## Procedure

Choose the service outlet, add/edit/remove unoccupied tables and save. Active tables cannot be removed. Each save includes baseline record versions so stale editors cannot overwrite a newer layout.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
