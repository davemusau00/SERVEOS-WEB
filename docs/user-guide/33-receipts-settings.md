# Receipts and ongoing business settings

Section: Administration
Roles: Admin, Manager, Server
Permission: pos.sell
Screen: Bar POS / Business Admin

## Overview

New payments capture their receipt from saved transaction data. Both 80mm copies show the fixed developer attribution. Print failures do not reverse payments. Business Admin settings require the separate business.configure capability (Admin).

## Procedure

1. Record a payment. Review both saved copies, then print or copy the text.
2. For an offline printer, retry the retained job. If delivery is uncertain, inspect the paper before confirming a duplicate-risk reprint.
3. Use Receipt history in POS to reopen one of the latest 100 captured receipts. Reprints are labelled. Earlier payments without captured documents are not fabricated from current settings.
4. In Business Admin, open Business identity, Tax and receipt message, Payment methods, or Till and printer. Save changes; stale settings require reopening the editor.
5. Test the saved direct printer configuration and check actual paper output. The system dialog and spooler acknowledgement are not proof of physical printing.

Existing transactions and receipt documents retain their original identity/tax/payment snapshots. Business thank-you text is configurable; the attribution footer is fixed. KES, Africa/Nairobi and tax-inclusive pricing remain the supported installed policy.
