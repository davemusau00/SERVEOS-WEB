# Configure an operating-system printer

Section: Printing
Roles: Admin, Manager
Permission: system.configure
Screen: settings
Keywords: printer, Windows, driver, USB, network, receipt

## Overview

ServOS uses the browser/PWA print dialog and an operating-system printer. ServOS does not install a Print Bridge, local service or printer driver. The printer model and print profile must be checked on the actual workstation before being treated as supported.

## Procedure

1. Install the printer using its manufacturer instructions and the workstation's operating-system settings.
2. Print an operating-system test page and confirm the queue is ready.
3. In ServOS, open Activity, choose an issued document and preview it.
4. Choose **Print with browser**, select the operating-system printer and verify the paper-size and scaling options.
5. Inspect the paper output before confirming delivery or retrying an uncertain document.

## What ServOS handles

The API authorizes each print attempt and records its status. The browser dialog does not confirm that paper emerged from the printer.

## Common mistakes and correction

Operating-system queue readiness and a test page do not prove that a ServOS receipt is correctly scaled. Inspect the actual receipt before retrying; a retry may create a duplicate.
