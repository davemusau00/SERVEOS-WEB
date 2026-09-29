# Troubleshooting

Section: Troubleshooting
Roles: Admin, Manager, Server
Permission: help.view
Screen: help
Keywords: troubleshooting, troubleshooting, ServOS

## Overview

Error messages are designed to describe the failed business invariant without claiming success.

## Procedure

If a command fails, read the red runtime message. Reload is safe because committed records are durable. Common issues include no open till, table not ready, insufficient stock, duplicate M-Pesa code, missing manager approval and setup not LIVE.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
