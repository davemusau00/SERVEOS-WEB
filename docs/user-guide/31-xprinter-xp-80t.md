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
4. Choose **Print with browser**, select the operating-system printer and verify **80 mm thermal roll**, 100% scaling, no fit-to-page and disabled browser headers/footers.
5. Inspect the paper output before confirming delivery or retrying an uncertain document.

## What ServOS handles

The API authorizes each print attempt and records its status. The browser dialog does not confirm that paper emerged from the printer.

## Common mistakes and correction

Operating-system queue readiness and a test page do not prove that a ServOS receipt is correctly scaled. Inspect the actual receipt before retrying; a retry may create a duplicate.


## Physical acceptance record

Record the actual printer model, Windows driver/version, 80 mm roll preset, measured printable width (72 mm by default), margins, density, feed/cut policy, workstation/browser version, test date and approver. The guide filename does not establish that a particular printer is installed or accepted.

Test legibility, unclipped totals and long names, logo, a scannable QR, a two-metre continuous document or clearly numbered 80 mm continuation slips, cold browser restart and marked reprints. An operating-system test page or spooler success does not establish ServOS paper delivery. Keep physical acceptance open and direct printing disabled if these tests cannot be completed; never choose A4 as a substitute.
