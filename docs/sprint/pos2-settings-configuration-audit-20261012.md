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

Implementation is complete for the navigation metadata and device-access focus fix. The full `npm run verify:release` gate passed on 2026-10-12: production browser acceptance passed 71 tests with one configured mobile skip; the UI audit gate inventoried 2,231 interactions and 318 heuristic candidates; architecture and documentation checks passed. The later operator-approved deployment preparation uploaded the exact-release PWA and API image to a private incoming directory and loaded the unused candidate image tag. It did not start a candidate or alter active API, PWA, Nginx, database, or business state. The operator waived staging for this update. Physical print outcome and terminal IndexedDB evidence remain unresolved; see the dated deployment log before any cutover.

## Follow-up investigation and fixes — 2026-10-13

I rechecked the reachable setup and Settings routes against their API command permissions and manually reviewed relevant generated UI-audit candidates. Focused browser, UI-audit, documentation, and release-gate results are recorded below.

| Finding | Evidence | Resolution |
| --- | --- | --- |
| Hotel stay policy and guest-service controls appeared for every configured business type. | `WebApiSettings` mounted `ApiHospitalitySettings` without checking the saved `businessSetup.configuration.businessType`. | The Settings surface now shows those controls for `HOTEL_RESORT` and `MIXED_HOSPITALITY`. For older businesses without a saved type, it keeps them available so legacy hospitality setup is not hidden. |
| First-run “Save business defaults” could begin writes before a later permission denial. | The wizard persisted setup progress, then `business.settings.save` required `business.tax.configure`; creating its stock location also required `catalog.manage` or `inventory.adjust`. The visible button only checked form values and connectivity. | The wizard now receives the signed-in permission set, checks all required capabilities before starting, disables the write when access is incomplete, and explains which administrator access is needed. This is UI preflight; server authorization remains authoritative. |
| Receipt identity and tax settings were silently absent for a user who could open Settings but lacked the separate tax permission. | The button was correctly gated by `business.tax.configure`, while the Settings workspace itself used `business.configure`; no explanation connected the two. | Settings now explains that receipt identity and tax-rate changes need an administrator with business tax configuration access. No permission was broadened. |
| A local Print Bridge preferences component exists in source but has no route or import from the active web shell. | `WebBridgeSettings` has no usage sites. The active V2 print path delegates printer selection to the browser and operating system. | Kept it unreachable and recorded it as an orphaned legacy utility. It is not presented as a missing active settings feature and is not wired to an unsupported print path. |
| The shared command-recovery card displayed the server-provided error string directly. | The generated audit flagged `CommandResolutionCard`; command responses can contain protocol or infrastructure details. | The card now uses the existing `operatorError` mapper for operator text. Structured code and redacted details remain in the diagnostic disclosure. A browser regression covers technical-message sanitization. |

The refreshed `npm run audit:ui` inventory records 2,231 interactions and 317 heuristic candidates with source digest `b8ef28de115e707ddb7a919f5397c0d95dee23fd1918c986418772f61a7068df`. These remain review candidates rather than verified defects. The Settings and setup candidates were checked against their visible explanations and permission rules; the raw-error candidate in the shared recovery card was confirmed and fixed. The remaining audit candidates across other workspaces still require manual triage. Feature cohort and signed-device capabilities remain server/deployment controlled and are intentionally not business-editable toggles in Settings.

**Follow-up verification:** setup browser coverage passed on desktop and 390×844 mobile; POS2 recovery/Procurement coverage passed 8/8 across both viewports after the error-message fix. `npm run lint`, contracts, architecture, production build, and all 51 root tests passed during the release attempt. The full production browser suite passed 71 tests with one configured skip before the final error-message sanitization; the focused suite passed after it. `npm run audit:ui:gate` passed with 2,231 interactions and no prompt/confirm findings; `npm run docs:check` passed with 22 current docs, 22 help guides, and 97 canonical permissions.

The overall `npm run verify:release` is **incomplete**. Its API stage passed 30 tests and failed 14 database-backed tests because `127.0.0.1:55432` refused connections. The API browser suite was not reached. Local Docker Desktop was stopped and no local PostgreSQL service or binaries were available; I did not start the general Docker engine. Re-run the API and API-browser stages when the disposable PostgreSQL service is available, then rerun the complete release gate. Source changes are on branch `feat/pos2-cashier-tickets-offline`, worktree based on `978b58dd852e1fba7f7bd01c62083a02899b4dcb`; they are not deployed. No live service or business data was touched.
