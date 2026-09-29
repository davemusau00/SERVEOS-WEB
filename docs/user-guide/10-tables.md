# Tables and Cleaning

Section: Tables
Roles: Admin, Manager, Server
Permission: pos.manage_table
Screen: floorplan
Keywords: tables and cleaning, tables, ServOS

## Overview

Paid, transferred or voided tables enter CLEANING before reuse.

## Procedure

Open an AVAILABLE table from POS. After settlement or movement it enters CLEANING. Staff select the cleaning table to mark it ready; the native table.ready command verifies the state and version before returning it to AVAILABLE.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
