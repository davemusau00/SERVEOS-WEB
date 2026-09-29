# Xprinter XP-80T receipt printing

Section: Hardware and Receipts
Roles: Admin, Manager, Server
Permission: pos.sell
Screen: POS, Business Setup
Keywords: XP-80T, Xprinter, USB printer, receipt printing, customer copy, business copy, Windows driver

## Overview

ServOS supports four receipt routes: direct XP-80T LAN ESC/POS, direct ESC/POS through a Windows USB printer queue, the operating system print dialog, and manual copy. Direct profiles send a two-copy receipt without opening a print dialog. The LAN profile uses TCP port 9100 by default.

## Procedure

## Before connecting

The XP-80T is an 80 mm thermal receipt printer. Use the supplied 24 V, 1.25 A adapter and load an 80 mm thermal paper roll with the paper feeding from the correct side. Set receipt width to 48 columns unless a printed test shows that the installed font needs another width.

## Install and test the Windows queue

1. Install the XP-80T-compatible 80-series Windows driver from the [official Xprinter driver page](https://www.xprinter.net/companyfile/11/).
2. Connect printer power and USB data, then run `scripts/configure-xprinter-usb.ps1` from elevated PowerShell. It reuses an XP-80 queue already assigned to the selected USB port, or creates `XP-80T USB` from the installed driver. Record the exact queue name it reports.
3. To check the USB queue with a short non-sale receipt, run `scripts/test-xprinter-usb.ps1 -QueueName '<queue name>' -Send` and confirm that paper physically prints. This test sends no cash-drawer signal. Replace `<queue name>` with the exact name reported by the setup helper.
4. For direct USB printing, open ServOS Business Setup → Till policy, choose **XP-80T direct USB (Windows queue)**, and enter that exact local queue name.
5. For direct LAN printing, reserve or set the printer's local network address using its setup utility, connect its Ethernet cable, select **XP-80T direct LAN (ESC/POS)**, and enter the printer's private-network IP. Keep port **9100** unless the printer was configured differently.
6. Set receipt width (default 48 columns) and whether to cut after each copy. Save the profile and choose **Save & send test slip**.

For **Windows / OS print dialog**, ServOS opens the operating system print window and the operator selects the installed queue. Direct USB uses the local Windows queue to pass ESC/POS data in RAW mode. Direct LAN connects to the configured address and sends ESC/POS bytes. The LAN address must be local to the POS network.

## Print the sale receipts

After a native POS payment is recorded, ServOS opens the receipt dialog. Choose **Print both copies**. The print job includes:

- **Customer copy:** business and outlet, receipt number and time, ordered items, total, tender and reference, and any cash change.
- **Business record copy:** the same sale details plus the transaction ID and operator name for filing and reconciliation.

Direct profiles print the customer copy and business record copy as separate receipts, with an optional cut after each copy. The OS print dialog may paginate according to driver settings. A `SENT` status means the printer socket or Windows spooler accepted the bytes; it cannot confirm that paper physically came out. Inspect the test slip and first sale before relying on the printer. Receipt printing is not eTIMS confirmation; fiscal submission is not connected.

## If nothing prints

1. Use the printer's self-test: turn it off, hold **FEED**, turn it on, and release FEED when the test starts.
2. If self-test works but the ServOS test slip does not, verify the Windows queue name or LAN IP, then check that the selected connection matches the cable in use.
3. For USB, check Windows Printers & scanners and the queue's paused/error state. For LAN, check that the POS and printer share the local network and that TCP port 9100 is reachable.
4. If a send is **QUEUED**, fix the connection and select **Retry**. If it is **DELIVERY_UNCERTAIN**, check the paper first; choose **Reprint anyway (may duplicate)** only when the receipt did not print.
5. If text is clipped, adjust receipt width and cut setting in Till policy, save, and send another test slip. A sent job is not proof of paper output.

## Related workflows

Use [Business Setup](04-business-setup.md) to set till policy, [M-Pesa](12-mpesa.md) to reconcile manual receipt codes, and [Close Day](24-close-day.md) to retain transaction and shift records.
