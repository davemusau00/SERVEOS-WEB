# Offline work and recovery

Section: Operations
Roles: Admin, Manager, Staff
Permission: help.view
Screen: help
Keywords: offline, sync, queued, unknown outcome, recovery

## Overview

Supported work may continue offline when the device has an unexpired grant for that command.

## Procedure

1. Check the connection and offline grant status before starting work.
2. Keep the browser open while queued work synchronizes.
3. Review Activity after reconnecting.
4. Recover an unknown outcome using the original command before taking the action again.

## What ServOS handles

The API checks the signed grant and command identity when queued work is submitted.

## Common mistakes and correction

Do not clear browser storage to remove a queued action. This can discard recovery evidence. Ask an administrator to help resolve the command.
