# Printer setup

Section: Printing
Roles: Admin, Manager
Permission: system.configure
Screen: settings
Keywords: printer, Print Bridge, USB, network, receipt

## Overview

The browser sends authorized documents to the optional local Print Bridge. Configure the printer through the bridge settings and operating system.

## Procedure

1. Install and start the approved Print Bridge service on the workstation.
2. Confirm the bridge reports a healthy local connection.
3. Select the configured USB queue or printer network address.
4. Send a test document and confirm that paper output is correct.
5. Check print job history before retrying any uncertain job.

## What ServOS handles

The API authorizes the document and the bridge records transport status.

## Common mistakes and correction

Transport acceptance does not prove that paper printed. Inspect the printer before retrying an uncertain receipt.
