# 28 — Silent ESC/POS Printing Fixes and ServOS Print Bridge

## 1. Problem statement

A browser can create excellent 80mm print layouts but standard browser security intentionally prevents arbitrary raw access to Windows printer queues and TCP printers. Therefore a pure PWA cannot universally promise silent raw ESC/POS output across all hardware.

This is a hardware-boundary problem, not a reason to keep the entire ServOS business application native.

## 2. Printing capability levels

ServOS supports three deliberate printing levels.

### Level A — Standard browser printing

Use dedicated 80mm CSS and `window.print()`.

Good for:

- laptops;
- office workstations;
- management devices;
- occasional POs/statements;
- Android/tablets using OS print services.

Advantages:

- no local software;
- works with ordinary installed printers;
- same web application everywhere.

Limitations:

- print dialog may appear;
- browser/driver may alter margins/scaling;
- cannot guarantee raw cutter/drawer/raster commands.

### Level B — Dedicated kiosk printing

On controlled counter PCs run the Chromium/Edge app in a dedicated POS launch profile with kiosk-printing behavior and a known default printer.

Good for:

- simple silent browser receipts;
- businesses where Windows driver output is visually verified and cutter behavior is adequate.

Limitations:

- depends on browser/OS/driver configuration;
- less deterministic than raw ESC/POS;
- printer routing and peripheral commands remain limited.

### Level C — ServOS Print Bridge

Recommended for **guaranteed silent raw ESC/POS**.

A tiny optional local service is installed only on hardware terminals that need it.

It is not ServOS business logic and is not another application authority.

```text
ServOS PWA
   │
   │ signed local print job
   ▼
ServOS Print Bridge
   │
   ├── Windows RAW queue
   └── LAN TCP 9100
          │
       XP-80T
```

## 3. What the Print Bridge contains

Only:

- device pairing identity;
- secure localhost endpoint;
- print job validation;
- small durable print spool;
- ESC/POS renderer/transport;
- printer discovery/health diagnostics;
- local print audit metadata;
- no business-domain mutation engine.

It does **not** contain:

- catalog;
- inventory database;
- rooms;
- customers;
- finance ledger;
- cloud sync;
- business command authority;
- pricing logic.

## 4. Reuse existing tested code

The current Rust printer implementation already contains valuable tested transport behavior for:

- Windows RAW printing;
- LAN TCP printing;
- bounded printer profiles;
- durable uncertainty states;
- cutter/feed control;
- receipt raster handling.

Extract this code from Tauri into a standalone small service/library instead of rewriting it from scratch.

Generalize receipt-only functions into:

```text
BusinessDocument
    ↓
DocumentRenderer
    ↓
EscPosDocument
    ↓
PrinterTransport
```

## 5. Generic print job

Suggested contract:

```json
{
  "jobId": "uuid",
  "deviceId": "uuid",
  "documentId": "uuid",
  "documentType": "PURCHASE_ORDER",
  "documentHash": "sha256...",
  "layoutVersion": 3,
  "printerRole": "OFFICE",
  "copies": 1,
  "createdAt": "...",
  "payload": {},
  "signature": "..."
}
```

Bridge verifies:

- origin/pairing;
- device identity;
- signature;
- payload bounds;
- document hash;
- duplicate job ID;
- printer profile.

## 6. Local security

Do not run a permissive HTTP server accepting arbitrary print bytes.

Recommended controls:

- listen only on loopback;
- use HTTPS/WSS localhost endpoint with installer-managed trust;
- CORS/origin allowlist only `https://serveos.davemusau.co.ke` plus explicit staging origin;
- pair PWA device with bridge once;
- signed requests using enrolled device key;
- maximum payload sizes;
- typed document schemas;
- never accept arbitrary ESC/POS bytes from browser JavaScript;
- bridge generates raw control bytes itself.

This prevents a compromised web payload from becoming unrestricted printer command injection.

## 7. Offline printing

Printing must work while the internet is down.

The PWA already has:

- local document snapshot;
- local business branding assets;
- device key;
- local print queue.

Therefore it can sign and submit a local print job without the VPS being reachable.

The bridge returns one of:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Do not claim `PRINTED` when neither Windows spooler nor TCP printer provides physical paper acknowledgement.

## 8. Delivery uncertainty

If connection opens and fails during write, do not silently retry.

Display:

> The printer may have received part or all of this document. Check the paper before retrying.

A retry after uncertainty should require explicit operator confirmation and create an audit note such as `POSSIBLE_DUPLICATE_REPRINT`.

## 9. Printer roles

Support logical roles:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

Small business can map every role to one printer.

Larger business can map:

- customer receipt → counter printer;
- KOT → kitchen printer;
- BOT → bar printer;
- PO/GRN/report → office/store printer.

## 10. Business document rendering

The print bridge must not read live business tables. It receives an immutable BusinessDocument snapshot.

Document types include:

- sale receipt;
- refund receipt;
- purchase order;
- goods receipt note;
- supplier return;
- stock requisition;
- stock transfer;
- blind count sheet;
- variance report;
- till opening/close/cash-up;
- customer credit statement;
- guest folio statement;
- reservation confirmation;
- housekeeping list;
- maintenance work order;
- KOT/BOT.

## 11. Logo and payment QR fix

Both business logo and uploaded payment QR use **one generic thermal-image path**.

The QR is a PNG asset. ServOS does not parse QR modules.

```text
PNG
  ↓
decode
  ↓
white background composite
  ↓
resize to printer profile
  ↓
monochrome raster
  ↓
append_image()
```

Same algorithm for logo and QR.

Receipt order:

```text
[BUSINESS LOGO]
Business identity
...
TOTAL / PAYMENT
Thank-you

Scan to Pay via One app
[PAYMENT QR PNG]

Fixed footer
feed/cut
```

The business logo moves to the top.

## 12. Browser fallback for the same document

Every BusinessDocument renderer should have:

```text
HTML/CSS renderer
ESC/POS renderer
plain-text/download renderer where useful
```

If Print Bridge unavailable:

```text
[ Print ]
```

uses browser print.

If Bridge healthy:

```text
[ Print ]
```

can silently queue to configured printer.

Settings can expose:

```text
Printing mode
○ Browser print
○ Kiosk/default printer
● ServOS Print Bridge
```

## 13. Bridge discovery UX

Settings → Devices → Printing:

```text
ServOS Print Bridge
Status: Connected
Version: 1.0.0
Device: Counter 01

Receipt Printer   XP-80T USB
Kitchen Printer   192.168.1.80
Office Printer    XP-80T USB

[Test Receipt]
[Test PO]
[Test Logo + Payment QR]
```

If absent:

> Direct printing is unavailable on this device. You can still use browser printing.

## 14. Windows launch mode

Dedicated POS workstation can use a startup shortcut that launches the installed PWA in application/fullscreen mode. Kiosk print flags may be used only after physical acceptance on the target Chrome/Edge version and printer driver.

Treat browser flags as deployment configuration, not product guarantees.

## 15. Android

Android PWA remains supported for operational use.

Printing levels may differ:

- OS/browser print service;
- network printer support through a future Android bridge;
- vendor print service where appropriate.

Do not promise silent raw ESC/POS on arbitrary Android hardware until separately accepted.

## 16. Test matrix

Required physical tests on XP-80T class hardware:

- USB raw receipt;
- LAN raw receipt;
- logo at top;
- uploaded PNG payment QR;
- printed QR scans successfully;
- long receipt;
- short receipt;
- purchase order;
- GRN;
- count sheet;
- KOT/BOT;
- two printer roles;
- printer unavailable;
- cable disconnect during send;
- duplicate retry confirmation;
- browser offline;
- browser restart;
- bridge restart;
- Windows restart;
- cutter margin;
- five consecutive jobs;
- 50-job stress queue.

## 17. Recommendation

For ServOS 1.0:

- PWA is the product;
- browser print is universal fallback;
- kiosk printing is supported deployment mode after local validation;
- ServOS Print Bridge is the recommended optional component for dedicated Windows POS machines needing deterministic silent ESC/POS.

This removes the need for Tauri to own the entire POS while preserving the best part of the native investment: reliable printer transport.
