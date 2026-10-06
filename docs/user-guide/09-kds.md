# Bar Pass / KDS

Section: KDS / Bar Pass
Roles: Admin, Manager, Server
Permission: kds.update
Screen: kds
Keywords: bar pass / kds, kds / bar pass, ServOS

## Overview

Preparation state is item-specific and routed by BAR, KITCHEN or SERVICE.

## Procedure

Fire the order first. In Bar Pass select the station. Move each item FIRED → PREPARING → READY → SERVED. The station filter changes which routed items are displayed.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
