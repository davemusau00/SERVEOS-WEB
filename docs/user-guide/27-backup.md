# Backup and Recovery

Section: Backup & Recovery
Roles: Admin, Manager
Permission: backup.create
Screen: admin
Keywords: backup and recovery, backup & recovery, ServOS

## Overview

A local backup copies the authoritative SQLite database consistently.

## Procedure

Create a backup at day close and before upgrades. Keep seven daily and four weekly copies as the target policy. Encryption, remote rotation and replacement-terminal restore must be acceptance-tested before claiming deployment verification.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
