# Roles and Permissions

Section: User Access
Roles: Admin, Manager, Server
Permission: help.view
Screen: admin
Keywords: roles and permissions, user access, ServOS

## Overview

Authority comes from the authenticated staff PIN session, never from a role dropdown.

## Procedure

Admin owns business/security configuration. Manager supervises protected operations. Server is the bar operator. Protected actions can request a single-use manager approval without changing the operator session. Change staff by locking and unlocking with the next person’s PIN.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
