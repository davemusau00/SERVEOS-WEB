# Offline Mode and Synchronization

Section: Offline Mode
Roles: Admin, Manager, Server
Permission: help.view
Screen: help
Keywords: offline mode and synchronization, offline mode, ServOS

## Overview

Local committed operations continue when the server is unreachable.

## Procedure

Keep trading after local staff unlock. The outbox records every committed operation. When connectivity returns ServOS uploads operations in sequence and only removes pending status after durable server acknowledgement. Replication is not backup.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
