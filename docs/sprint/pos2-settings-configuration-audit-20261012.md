# SERVEOS settings and configuration surface audit — 2026-10-12

This audit was added while implementing the authoritative [POS 2.0 V2 patch](../../SERVEOS_POS2_DEVICE_STOCK_ERROR_UI_PATCH_V2_20261012.md). It records where operators and administrators configure the web product, which controls are deliberately elsewhere, and the confirmed navigation issue fixed in this pass.

## Confirmed surfaces

| Task | Workspace or entry point | What it controls |
| --- | --- | --- |
| First business setup | Initial setup wizard while setup is `IN_PROGRESS` | Business identity, stock location, outlet and payment-account prerequisites; setup remains incomplete until the API verifies required records. |
| Shared business settings | Settings (requires `business.configure`) | Business receipt identity and tax rates, hospitality policy and guest services, preparation settings, stock alerts, outlets and default stock locations, till policy, payment accounts, and system health. |
| Product and tax setup | Catalog | Product availability, prices, tax class, routing, barcodes, and stock links. |
| Inventory configuration | Inventory | Stock items, locations, counts, receiving policy, transfers and corrections under their existing permissions. |
| Purchasing setup and operations | Procurement workflow tabs | Suppliers, purchase orders, receiving, invoices/payables, credits, returns and recorded supplier payments. |
| Staff and device authority | Staff, devices & access (requires the corresponding staff/device permissions) | Staff sign-ins and roles, pending signed-device requests, approval/denial, outlet assignment and permission ceiling, enrolled-device status and revocation. The persistent device-request notification opens this workspace and focuses the access section. |
| Active sign-in sessions | Sessions button in the application header | Session revocation and inspection, separate from device enrollment and device revocation. |
| Shift and offline cashier authority | POS → More / Shift / Activity and the cashier setup flow | Till lifecycle and signed offline shift lease. Device approval alone does not grant offline checkout; there is no client-side permission toggle that can mint signed authority. |
| Printing | Browser print flow and workstation operating-system printer setup | Printer selection and physical output. ServOS does not configure printer drivers in Settings; print outcomes remain uncertain until evidence confirms delivery. The retired Print Bridge is not part of the current V2 operator workflow. |

## Confirmed issue fixed

The shared `workspaceRegistry` advertised Settings only to users with customer/room-type/category management permissions, while the actual workspace and every shared-settings command require `business.configure`. That mismatch could hide Settings for a business configurator in consumers of the shared registry. Its Settings permission now matches the server contract. The workspace label and description now name staff, devices and access explicitly. The device-notice destination focuses the access administration section instead of merely changing the workspace heading.

The primary `WebBusinessApp` navigation already grants Settings to `business.configure` and keeps the save commands online-only. No authorization contract or financial, stock, printer, or signed-device checks were weakened.

## Deliberate boundaries and remaining review

- Room types, rates, product taxes, outlet defaults, payment accounts and stock policies are configured in their task workspaces; Settings is not the only home for every master record.
- Device enrollment, session revocation and signed offline shift authorization are separate workflows with separate authority.
- The browser delegates printer discovery to the operating system. A new in-app printer-driver configuration panel would misrepresent the current web print architecture.
- The generated UX audit has 314 heuristic candidates, primarily disabled-action explanations and accessibility review signals. They require manual validation and are not automatically product defects.
- Confirm Settings, setup, device access, session controls and print guidance at desktop, tablet and 390×844 mobile sizes in the release browser suite. Physical printer validation remains separate hardware evidence.

## Acceptance status

Implementation is complete for the navigation metadata and device-access focus fix. The full `npm run verify:release` gate passed on 2026-10-12: production browser acceptance passed 71 tests with one configured mobile skip; the UI audit gate inventoried 2,231 interactions and 318 heuristic candidates; architecture and documentation checks passed. The live server was only inspected read-only in the subsequent deployment preflight. Physical printer validation, authenticated HTTPS staging, backup/restore proof, and live deployment remain separate gates; no live change was made.
