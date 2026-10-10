# SERVEOS V2.1
## Product Completion, Print-Perfect Documents and Isolated Fresh-Stack Redeployment Roadmap

**Project:** SERVEOS WEB / VPS Platform  
**Target branch:** `reset/vps-platform`  
**Audit baseline:** `de0bf868a5b02f888515b2baf526acd9c837b3cf` (10 October 2026)  
**Status:** Active development directive  
**Deployment:** **NOT AUTHORIZED. DO NOT TOUCH THE LIVE VPS.**  
**Supersedes:** Conflicting printing, Print Bridge, one-stack deployment, and acceptance instructions in the original `SERVEOS-V2.md`. Existing business-engine and security requirements remain in force.

---

## 0. Executive decision record

We are completing **SERVEOS as a reliable, beautifully documented, plug-and-play hospitality operating system**, not adding another layer of features before day-one basics are right.

Three architectural and product decisions are binding:

1. **Report and document quality is a first-class release gate.** Receipts, kitchen/bar tickets, close-day statements, inventories, stock counts, financial and supplier reports, purchase orders, invoices and hotel folios must have professional layouts and accurate, legible paper/PDF output. A screen that looks acceptable but prints poorly is unfinished.
2. **Printing happens directly from the browser/PWA.** No SERVEOS Print Bridge installation, Windows service, local native companion, bridge pairing, localhost HTTPS print daemon, browser extension, or proprietary printer connector is required or offered for day-one operations. Supported users select an OS-configured printer from the browser's standard print dialog. **Do not promise universal silent or unattended printing:** standard cross-browser `window.print()` opens the browser/OS dialog. Printing a document and proving paper physically emerged are distinct events.
3. **Future redeployment must be parallel and fresh.** Deploy the V2 stack as a new, isolated environment, not over an existing deployment. Preserve **every pre-ServeOS stack, legacy SERVEOS release, unrelated website, process, database, volume, port assignment, certificate, file tree and route**. No migrations or historical customer data imports occur automatically. All server actions remain deferred until the owner authorizes them in a separate instruction.

### Evidence at the baseline, not assumptions

- On `de0bf868`, the full GitHub Actions run `38051514920` passed five jobs: frontend, browser-production, API/PostgreSQL, and Print Bridge CI on Linux and Windows.
- The API suite passed **37/37**; the dedicated real-PostgreSQL browser suite passed **2/2**.
- A full disposable business flow was exercised: first administrator → resumable business setup → stock item/product → 500 g physical count → KES 100 cash sale consuming 10 g → receipt preview and browser print-call interception → full cash refund → till close with zero variance → reconciled close-day report.
- A local disposable PostgreSQL backup/restore script exists, but its execution in browser acceptance is conditional on `TEST_PG_CONTAINER`; the standard checked-in CI does not configure that variable. Its hosted/disaster-recovery behavior is **not established**.
- Browser print-call tests **do not** establish physical 80mm output, a successful customer-phone QR scan, or Windows/Android installed-PWA printer compatibility.
- The current interface still uses multiple confirmations during an ordinary counter sale. M-Pesa, hotel, multi-terminal, bottle/shot and extensive operator UX acceptance remain incomplete.
- `docs/STATUS.md` records a historical deployment using `/var/www/serveos-prod/current`; that existing path is **protected legacy infrastructure**, not the destination for the new stack.

---

## 1. Updated priority matrix

| Priority | Workstream | Current status | Done only when |
|---|---|---|---|
| P0 | Print-perfect 80mm receipts and kitchen/bar tickets | Templates exist; physical proof missing | Hardware prints clearly from the PWA, no bridge, QR scans, reprints labeled |
| P0 | Beautiful A4 reports and business documents | Partial/document-dependent | Long reports print cleanly with reconciled totals and coherent pagination |
| P0 | Direct PWA printing | Browser pathway exists; bridge UX/code still present | No operator-facing bridge or native install anywhere in printing flow |
| P0 | Fast day-one cashier operation | First cash sale integrated; unnecessary steps remain | Start shift → products/cart → payment → receipt, no developer intervention |
| P0 | Stock, sealed/open spirits and operations | Backend depth exists | Imported, sold, counted, reversed and reconciled with correct ml balances |
| P0 | Manual M-Pesa + financial reconciliation | API features exist | Complete authenticated end-to-end browser acceptance incl. references and refunds |
| P0 | Hotel operations | Modules exist | Reservation → check-in → room/restaurant charges → folio → checkout → report |
| P0 | Multi-device, retries and recovery | Partial tests exist | Two active staff terminals consistent through conflicts/outages |
| P1 | Real backup/restore as standard CI gate | Local script exists | Disposable restoration verified automatically, evidence attached |
| P1 | First-run walkthrough and operator UX | Initial setup passing | Cashier, manager, storekeeper and receptionist pass usability walkthroughs |
| P2 / FUTURE | Fresh isolated redeployment | **Not started, explicitly deferred** | Independently authorized deployment that leaves older stacks untouched |

**Do not assign inflated product completion percentages from CI alone.** Track *Implemented / API-proven / Browser-proven / Physical-proven / Operator-accepted / Hosted-proven* independently.

---

# PHASE A: REPORTS, RECEIPTS, DOCUMENTS AND PRINTING

## 2. Introduce a unified document design system

**Owner:** Frontend/UI + domain/reporting + QA  
**Primary files to inspect:**

- `src/runtime/web/BusinessDocumentRenderer.tsx`
- `src/runtime/web/WebDocumentQueue.tsx`
- `src/runtime/web/WebApiCloseDayReports.tsx`
- `src/runtime/web/WebApiSettings.tsx`
- `src/receipts/branding.ts`
- Existing report, journal, inventory, supplier and hospitality projections

Create shared paper/document components instead of composing each report ad hoc. Establish **document header, business identity, period/filter metadata, KPI summary, grouped table, subtotal, reconciliation, signatures, page footer, print layout and export tools**.

### Mandatory paper profiles

| Profile | Documents | Design rule |
|---|---|---|
| **80mm continuous thermal** | Sales receipts, short customer copies, KOT/BOT, compact shift slip | Support varying actual printable widths (often narrower than paper), no clipping or huge blank feed |
| **A4 portrait** | Invoices, folios, POs, GRNs, vouchers, statements, detailed daily reports | Consistent margins, repeated table heads, clear section breaks, page numbers |
| **A4 landscape** | Detailed stock registers, financial comparisons, occupancy and wide sales reports | Usable column widths, no crushed type, accurate totals and column continuity |
| **Browser Save as PDF** | All supported A4 reports and customer documents | Output retains readable text/figures and exactly the same data as print preview |

Design tokens: limited typeface family, purposeful heading scale, strongly contrasted text, restrained neutral accents, consistent KES amount formatting, 1px rules where appropriate, deliberate whitespace and printed grayscale legibility. Reports should feel like finished business documents, not screenshots of dark-mode dashboards.

### Common document identity and control fields

Every official report/document includes, where applicable:

1. Business name, outlet/property, contact, tax PIN and owner-configured logo.
2. Clearly distinguished title and state: **DRAFT**, **ISSUED**, **VOIDED**, **REFUND**, **COPY** or **REPRINT**, never ambiguous.
3. Unique document number, stable source reference, generated/issued time in **Africa/Nairobi**, report start/end period and filters.
4. Prepared by, authorized by or cashier name based on actual audit records.
5. Correct labels/units and consistently formatted numerical amounts; totals cannot be inferred from the visual formatting layer.
6. Footer with reference number, page x/y if supported, acknowledgment/signature fields where relevant, and a truthful description of payment/document status.

**Authoritative-source invariant:** official issued documents must render from the original immutable server document snapshot. Never rewrite old receipts with a later product name, price, tax rate, QR image or payment account setting. New summaries must reconcile to persisted API/PostgreSQL records. No browser-only calculations can silently become official financial truth.

## 3. Required print/report catalogue

Implement designed **on-screen preview + print CSS + native print/PDF output** for each item, with the appropriate data permission.

| Group | Required print-ready outputs | Required content |
|---|---|---|
| Sales | Original 80mm sales receipt; reprint/copy; refund/void notice | Outlet, cashier, date, receipt ID, items, quantity, unit/line prices, tax, discounts, tenders, change, total, references |
| Kitchen/bar | Kitchen order ticket, bar order ticket, changed/voided item notice | Destination, table/room, order/round/time, course, modifiers, preparation notes and clear cancellation status |
| Till | Shift X report; Z/close-day report; cash reconciliation | Opening float, sale tenders by method, cash in/out, returns, counted vs expected, variance, issue time |
| Sales reports | Period summary, per-item/category, staff/outlet performance, detailed sales register | Filters, gross/net sales, taxes, discounts, refunds, quantities, meaningful totals |
| Inventory | Stock-on-hand, stocktake, variance, movement ledger, receiving and wastage | Location, base unit, stock ID, opening/closing, expected/count, adjustment, valuation, sealed/open/ml |
| Procurement | PO, GRN, supplier return, credit note, payment voucher | Supplier, linked order/invoice, receipt source, items, unit costs, amounts, authorizations |
| Finance | Revenue reconciliation, payment/refund journal, expenses/payables, customer credit | Accurate balances, debit/credit or inflow/outflow, tax, aging, anomalies, source IDs |
| Hotel | Room invoice, guest folio, receipt, checkout summary | Guest, room, nights/rates, extras, deposits, adjustments, due/settled balances |
| Leadership | Daily operations summary, stock exceptions, occupancy summary, sales trends | Dates, KPIs, period comparison where grounded, clear units, definitions, actionable exceptions |

If the source module cannot yet produce authoritative figures, mark that report **not accepted**. Do not fake a PDF by rasterizing a whole dashboard. Report data must be available as meaningful text and tables, including multi-page printing.

## 4. A4 report visual and content acceptance

**Layout anatomy:**

```text
[LOGO]  BUSINESS / PROPERTY NAME                        REPORT REF: X-00042
        DAILY SALES & COLLECTIONS                       GENERATED: 10 OCT 2026
        Outlet: All   Period: 09 Oct 2026 00:00–23:59 EAT   By: Manager
────────────────────────────────────────────────────────────────────────────
 GROSS SALES        REFUNDS          NET COLLECTIONS        EXPECTED CASH
 KES xx,xxx.xx      KES x,xxx.xx     KES xx,xxx.xx           KES x,xxx.xx
────────────────────────────────────────────────────────────────────────────
 SALES BREAKDOWN
 Item / Category            Qty      Gross       VAT      Refunds       Net
 ...                        ...      ...         ...      ...           ...
 SUBTOTAL                                      ...                    ...

 PAYMENT RECONCILIATION
 Cash   M-Pesa   Card   Credit     Counted    Expected    Variance
 ...    ...      ...    ...        ...        ...         ...

 EXCEPTIONS / NOTES
 ...
────────────────────────────────────────────────────────────────────────────
 Prepared by: _________   Reviewed by: _________   Page 1 of n
```

The example represents layout hierarchy, **not accounting data**. Production outputs must label revenue, refunds, tenders, tax and balances correctly. Requirements:

- Page headers repeat where useful; split a very long report across pages without losing the table header or accidentally clipping final totals.
- Long products, supplier addresses, staff names, exception notes and multi-line folio charges wrap cleanly.
- KES values right-aligned and consistent; precise base units, fractional ml and negative adjustments never rounded into false counts.
- Printed summaries show period, filters, outlet and author. Zero-activity reports must render intentionally, not as an empty white sheet.
- A4 portrait/landscape variants preserve all significant columns. Never solve overflow by reducing all text to illegible sizes.
- Add explicit **Print**, **Save as PDF**, and where appropriate **Export CSV** for the data table. CSV is a data export, not a substitute for a well-laid-out printable report.
- Ensure all reported money/stock numbers can be independently recomputed from fixtures and checked against PostgreSQL.

## 5. Thermal 80mm receipt specification

**Target:** Real thermal paper output from an installed PWA with **no Print Bridge**.

```text
             [BUSINESS LOGO]
          BUSINESS / OUTLET NAME
         Contact · Location · PIN
────────────────────────────────
SALES RECEIPT           #R-000231
10 OCT 2026 14:42 EAT   Cashier: X
────────────────────────────────
Item with a longer name that
wraps neatly
  2 × KES 250.00       KES 500.00
Second item
  1 × KES 120.00       KES 120.00
────────────────────────────────
Subtotal                KES 620.00
Tax included             KES xx.xx
Discount                  KES 0.00
TOTAL                   KES 620.00
────────────────────────────────
Payment: Cash           KES 700.00
CHANGE                   KES 80.00

        [OWNER M-PESA QR]
    Payment QR (if configured)

       Thank you for visiting!
        Copy status: ORIGINAL
```

The sample is purely illustrative. The real receipt must distinguish historical payment from an optional owner-configured *pay-to* QR and must not imply a fresh payment is needed after settlement. If a QR is shown on an already paid receipt, label it clearly rather than inviting an accidental second payment. also include footer Developed By Kingsforge, 0746157440

**Requirements:**

- Validate actual paper width vs printable content width: do **not** assume the full 80mm is printable. Test common 203dpi devices and configured OS drivers.
- Keep legible minimum type, strong hierarchy, wrapped item descriptions, accurate decimal points and spacing between the last character and the cutter edge.
- Business logo processed through existing bounded image pipeline; grayscale-ready, not stretched, no huge raster blocks.
- Owner-provided **M-Pesa Till/Paybill payment QR goes after payment totals and before footer**. Maintain quiet zone and use a customer-phone scan test of the correct business destination.
- Never invent or silently replace the provided QR. Preserve payment/reference integrity and avoid falsely labelling a generic QR as an official transaction confirmation.
- Allow receipt logo, tax PIN, contact details, footer, logo visibility, QR visibility and paper calibration preferences through ordinary settings.
- Receipt copies must retain original issue ID, numbers and source payment, with a prominent REPRINT/COPY indication; never create another order/payment because of printing.
- Prevent clipping, white pages, mid-row breaks, mangled currency glyphs, cut-off logos, black fills, or QR overlapping footer text.

## 6. Native PWA printing, no bridge installation

### User-visible path

**Confirmed payment → issued receipt → Preview → Print → choose OS printer**  
**Reports/Documents → choose filters/period → Preview → Print / Save as PDF**

1. Use `BusinessDocumentRenderer` and existing snapshot machinery for financial/business documents, then create reusable print-specific page templates and CSS.
2. The user activates a clear **Print** control from an installed PWA or browser tab. Trigger browser `window.print()` from the prepared print document after images/fonts settle.
3. Apply `@media print` and `@page` rules. Paper size is chosen/calibrated in the browser/OS printer settings; exact custom-paper CSS support varies by browser/printer.
4. The printer is OS-recognized. Windows may need the manufacturer's ordinary printer driver. **SERVEOS does not install or run a companion bridge.**
5. The browser print dialog is expected and supported. No silent printing promises, automatic ESC/POS commands, installed Windows services, TLS localhost origins or native print queue pairing.
6. For Android tablets, verify the actual browser/OS print-service path and supported printers. If a printer combination is unsupported, label it as such and provide a documented compatible configuration, not a hidden bridge requirement.
7. Keep `print()`, `afterprint`, and dialog-close evidence separate from **physically verified paper delivery**. Never mark a sale reversed or a document delivered simply because the dialog was launched/closed.
8. Preserve print attempt/retry history with duplicate warning. After an uncertain attempt, require a user-confirmed inspection before reprinting a financial document.
9. Remove bridge setup and pairing from normal Settings, cashier flows, onboarding, training and release criteria. Retire bridge-specific integration only after verifying no business document depends on it. Existing bridge source need not be deleted without a safe cleanup PR, but it must never be required or marketed as V2's printing system.
10. Clarify kitchen/bar expectations: manual browser print is supported. **Unattended printing to multiple printers is out of scope** for a pure cross-browser PWA; if later required it needs a new, explicitly approved technical direction and separate acceptance.

### Quality tests

- Print and Save-as-PDF on Windows Chrome and Edge, installed PWA; at least one supported Android tablet/browser/PWA configuration; other browsers according to declared compatibility matrix.
- Real 80mm printer: short, 20+ line, long-name, multiple tax classes, cash/M-Pesa/mixed tender, refund, reprint, kitchen ticket, logo and actual QR scanning.
- A4 printer/PDF: single-page, 10+ page tables, portrait/landscape, filtered report, print with and without logo, blank/zero periods, finance/stock reconciliation.
- Simulated dialog cancellation, unavailable printer, stale print jobs and duplicate retry. Confirm no duplicate money, stock or invoice state.
- Golden visual specimens captured and reviewed, plus scanned or photographed **real printed samples** with printer model, OS/browser/version, paper profile and reviewer.

**Hard release gate:** Bridge-free physical receipt output and accurately formatted, reconciled reports must pass. A headless test that intercepted `window.print()` is insufficient.

---

# PHASE B: REMAINING DAY-ONE OPERATIONAL GAPS

## 7. Cashier/POS simplicity and consistency

- Keep a clear default counter-sale mode: product selection, cart, tender, receipt. Reduce confirmations for ordinary no-risk actions; retain transactional security and approval for genuinely risky actions.
- An operator should not need to manually create a blank order before adding an ordinary item. Existing `order.quickAdd` is a starting point, not a complete cart UX.
- Simplify **Start Shift**, selecting a cash outlet and default float without exposing command versions and storage internals.
- Persist cart/resume state safely without treating an uncertain payment as confirmed; idempotency and retry outcomes remain authoritative.
- Cash: proper received amount, calculated change, partial tender, refund, and end-of-day reconciliation.
- Manual M-Pesa: require correct method/account and transaction reference where configured; distinguish unverified customer claim from manager-confirmed receipt. Do not misrepresent Daraja integration as delivered.
- Verified payment automatically makes the immutable receipt available; printing must not add payment/stock side effects.

## 8. Product/inventory and wholesale/hospitality stock

- Clear guided product editor for stocked goods, untracked services, dishes/recipes, spirit/wine bottles and stock-only items.
- Retain server-valid **stock unit, outlet/location link, explicit tax class and unit cost**; avoid misleading defaults or creating orphaned products.
- Make the simplified `sellableItems` CSV import a friendly **Preview → Fix errors → Commit → Verify counts** workflow. Print an import summary/exception report when useful.
- Validate sealed/unopened bottles, open ml consumption, shot sizes, refunds and counts with exact canonical units and consistent stock valuation.
- Test receiving, returns, transfers, waste, negative/zero balance policy, two operator conflicts, count reversals and inventory reports.

## 9. Hotel/resort and restaurant acceptance

- Hotel: first room/rate → reservation → check-in → restaurant charge to folio → partial or full settlement → invoice/receipt → checkout → occupancy/finance report.
- Restaurant/bar: dining table, fire/prepare, split/partial tender, modifications, void/refund, kitchen/bar ticket and close day.
- No extra unrelated ERP modules until the above can be completed without a developer.

## 10. Multiple terminals, recovery and secure operating defaults

- Two devices, at least two roles, same outlet and inventory, concurrent orders and genuine stale-version conflicts.
- Refresh, network interruption, uncertain mutation outcome and retry must not double-record payment, stock deduction, refund, folio charge or document print job.
- API health, database migration head and recent backup evidence must be shown truthfully; **unknown** remains unknown.
- Keep HTTPS, tenant isolation, role permissions, audit, session security, financial atomicity and safe authorization. Do not remove protections to save clicks.
- Review the outstanding UI audit signals and record actual failures and accessibility blockers separately from automated static warnings.

---

# PHASE C: BACKUPS AND FULL PRODUCT ACCEPTANCE

## 11. Database recovery gate

- Use `apps/backup/rehearse-local.sh` only with **disposable source and restore databases**; never target a customer database during this sprint.
- Make the local restore test a reproducible CI acceptance gate, rather than merely conditional on an env var the standard workflow does not set.
- Compare business identity, migrations, orders, cash entries, refunds, journal lines, stock balances/movements, counts, till close, and close-day reports. Confirm cleanup of temporary artifacts.
- Document that local dump/restore proof is **not equivalent** to remote encryption, offsite retention, hosted recovery, or disaster-recovery sign-off.

## 12. Acceptance matrix and evidence format

| ID | Scenario | Acceptance evidence |
|---|---|---|
| V01 | New admin/business setup and resume | Browser + PostgreSQL, no duplicate defaults |
| V02 | First stocked cash sale | Paid exactly once, precise stock consumption |
| V03 | Manual M-Pesa including wrong/missing reference | Confirmation and payment records correct |
| V04 | Counter-sale UX | Measured steps, no needless order/fire dialogs for simple sale |
| V05 | Shot, open/sealed bottle, mixed products | Exact ml and cost conservation |
| V06 | Refund and cash shift close | Drawer/ledger and report totals reconcile |
| V07 | Business day across two terminals | Conflicts/reconnect handled without double booking |
| V08 | Hotel room-to-checkout and folio | Nights/charges/tenders match source records |
| V09 | Real 80mm receipt print without bridge | Physical sample, supported OS/printer, user sign-off |
| V10 | Customer M-Pesa QR scans on thermal | Actual correct destination; QR above footer |
| V11 | Kitchen/bar ticket | Printed modifier/notes/voids correct |
| V12 | 80mm refund and reprint | Historical amounts and COPY/REFUND indicators correct |
| V13 | A4 long sales and close-day reports | 10+ pages, repeat headings, all totals visible |
| V14 | A4 stock/finance/PO/GRN/guest folio | Branded, readable, reconciled, proper pagination |
| V15 | PWA print-to-PDF | Print output equivalent to preview, legible/searchable text |
| V16 | Cancelled/uncertain print attempt | No false delivery assertion or duplicate finance action |
| V17 | PWA install/reload with offline-sales grants disabled | Working shell, secure online-first operations |
| V18 | Disposable automated database restore | Successful restore and financial/inventory proof attached |
| V19 | Accessibility/touch/keyboard operator workflow | Human-reviewed critical flows documented |
| V20 | Fresh V2 legacy-preservation dry run | Noncolliding project, DB, volumes, origin, ports; **not production** |
| V21 | Later authorized V2-only rollback rehearsal | Only V2 stopped/restored; old stacks healthy |

For each scenario record: **Not run / Automated pass / Physical pass / Operator pass / Failed**, commit SHA, environment, device/printer, screenshots/PDF/photos, expected vs actual, reviewer and issue reference. Never convert a unit-test pass into an unverified physical pass.

---

# PHASE D: FUTURE ISOLATED REDEPLOYMENT (PREPARATION ONLY)

## 13. Preserve existing VPS deployments completely

**Future objective:** Install this V2 web/API/PostgreSQL system **fresh and alongside** every existing stack. It is a new tenant-independent platform instance, not a replacement of the pre-ServeOS or previous SERVEOS installation.

### Noninterference contract

| Resource | Existing deployments | New V2 on later authorization |
|---|---|---|
| Releases/site roots | Preserve every old release directory and symlink | New independent directory, e.g. `/srv/serveos-v2-fresh` |
| Containers and Compose | Preserve old running containers and project names | Unique Compose project, e.g. `serveos_v2_fresh` |
| PostgreSQL | Preserve DBs, roles, schemas and data volumes | V2-only database/role/volume, no imported records |
| Docker network and ports | Preserve existing networks and occupied host ports | V2 network and preflight-cleared unique loopback ports |
| Reverse proxy and TLS | Preserve old vhosts and hostnames | Separate new hostname and carefully additive route/cert only |
| PWA and sessions | Preserve old origin, SW scope, cookies and browser cache | Separate origin, manifest, service worker and session namespace |
| Uploads, reports and logos | Preserve old paths and files | Dedicated V2 storage, report output and log paths |
| Config, signing keys and backup | Preserve old secrets and backup retention/destinations | V2-generated secrets, V2-only backup and restore location |

**The names above are illustrations only.** Neither their availability nor VPS capacity has been verified. Do not pick a route/port/path on assumption.

## 14. Required future server inventory, before any installation

The existing repository records a historical PWA path `/var/www/serveos-prod/current` and an older release deployer `scripts/Deploy-ServOSProductionFeatures.ps1`. **Do not reuse that production path or run its Pwa/RouteRollback actions for the fresh V2 deployment.** They are legacy deployment machinery, not an isolation procedure.

**When the owner later authorizes server reconnaissance**, collect a read-only inventory of:

- OS resources, available memory/CPU/disk/inodes, capacity margins, running services and host load.
- All Docker/Compose projects, images, container IDs, volumes, attached paths, networks and published ports.
- All active listening ports and service bindings.
- Reverse proxy routes/site configs, HTTP/HTTPS endpoints, TLS certificates and expiration dates.
- Existing database instances, database names, role identifiers, locations and backup jobs **without extracting customer data/secrets**.
- Existing web roots, immutable release directories, symlinks, cron timers, logs and uploaded file locations.
- Baseline checks of existing application availability, health and critical business endpoints.

Save sanitized **before** evidence (config checksums, paths, service identities, open ports, health response) and get approval for the *exact V2 resource map* before provisioning anything. If new V2 services would conflict with or starve old stacks, **abort and recommend a separate VPS**.

## 15. Design an isolated deployment bundle, for future approval

The new V2 composition should include:

1. Web/PWA static server with its own origin and printed document styles.
2. Dedicated Node API accessible only through the V2 route/internal network.
3. Fresh PostgreSQL (container or otherwise truly isolated DB/role) with separate durable storage; **not the old business database**.
4. Explicit migration job with positive allowlist restricting it to the new empty DB; never run on legacy DBs.
5. Independent backup container/job and verified restore destination. No legacy backup-path reuse.
6. Distinct private network, unique project-scoped volumes, V2-scoped secrets/log paths and versioned images.
7. Preflight checks for resources, collisions, schema head, secure configuration, health and rollback.

**Do not** declare `container_name` or globally named volumes that shadow legacy identifiers. Don't publish PostgreSQL to public host interfaces. Use unique available loopback ports for V2 where required. Prefer a new dedicated HTTPS hostname so session cookies, IndexedDB and service workers cannot collide. If using a reverse proxy that also serves old sites, edit only a new route/server-block file after approved diff, verify the configuration, and reload only when authorized and safe. No old virtual-host rewrites or DNS repoints.

Ensure API origin handling, refresh cookies, CORS/origin validation, CSRF controls, HTTPS, proxy path rewriting, PWA scope and deep links work with the new URL. The current frontend's API URL assumptions must be tested, not bypassed.

### Absolutely prohibited during the current sprint

- Any SSH/production VPS access, DNS/proxy/certificate change, live service reload or production command.
- Any `docker compose down -v`, prune, forced replacement or restart of an existing stack.
- Any mutation of prior Postgres data, migrations against old DBs, shared volume or secret reuse.
- Any switch of `/var/www/serveos-prod/current` or use of legacy release rollback scripts.
- Any migration of Countryside or other customer data without its own separately approved plan.
- Any automatic CI deployment; current CI remains a testing pipeline.

## 16. Future deployment sequence (not a current to-do action)

**Gate 0: Owner authorizes the deployment stage separately.**

1. Read-only inventory and legacy system health baseline approved.
2. V2 target name, hostname, ports, storage, DB, backup and machine capacity checked for collisions.
3. Prepare owner-approved rollback and restore documents; snapshot relevant baseline configs without disrupting old service.
4. Bring up **new V2 services only**, under unique names and volumes; migrate **new empty V2 database only**.
5. Expose a new HTTPS origin without changing legacy hostnames or traffic.
6. Complete first admin/product/shift/payment/receipt, report printing and backup/recovery smoke tests on the new stack.
7. Repeat old-stack health checks and compare running containers, image IDs, routes, DB names, mounts, ports and critical endpoints to the baseline. **Unexpected drift stops the process immediately.**
8. Maintain old and new side by side. Any eventual customer transfer is a different explicit project.
9. Roll back **only V2** in the event of failure; keep old services, data, routes and uptime unaffected.

Legacy writes/logs may naturally change during live usage, so preservation proof focuses on **no unapproved configuration, data migration, DB schema change, volume mutation, container replacement or service disruption** caused by V2.

**Definition of done for the current stage:** a detailed proposed isolation architecture, read-only inventory template, risk register and new-only rollback procedure. **No actual redeployment.**

---

# PHASE E: DEVELOPER WORK PACKAGES

## 17. Pull-request program

| PR | Task | Gate |
|---|---|---|
| PR-10 | Print design system, layouts, paper profiles, golden templates | A4 + thermal specimens aesthetically and technically approved |
| PR-11 | Direct PWA receipt/report printing, bridge-free path and settings cleanup | No native installation; supported browsers invoke native printing |
| PR-12 | Physical receipt tests and real M-Pesa QR verification | Real paper/phone evidence, readable margins and reprints |
| PR-13 | Cashier quick checkout / manual M-Pesa UX | Human walkthrough and PostgreSQL end-to-end tests |
| PR-14 | Stock + spirits/bottles/ml + import reporting | Accurate operational inventory and printed variance reports |
| PR-15 | Hotel folios, purchase and financial document completeness | Reconciled A4 and 80mm reports and hotel end-to-end acceptance |
| PR-16 | Multi-terminal, error recovery, operator audit and accessibility | Repeatable multi-user and outage proof |
| PR-17 | Disposable DB restore in CI | Restored real fixture financial/stock data proven; no production contact |
| PR-18 | Final golden report pack + full acceptance matrix | All P0 critical gates pass; unresolved issues explicitly listed |
| PR-19 (FUTURE) | Isolated fresh V2 deployment planning | Resource inventory template and coexistence/rollback sign-off; **no deployment** |

Keep PRs reviewable and test each behavior with the live API code but **disposable test data**. No unrelated framework change, Kubernetes, native print middleware or new ERP feature expansion. Preserve transactional permissions, audit trails, tenant isolation, immutable documents and existing authoritative business logic.

## 18. Report and printing deliverables to hand over

A handover is incomplete without:

- Version-controlled design specification and receipt/report template catalogue.
- 80mm thermal specimens (ordinary, long, mixed, refunded, copied, kitchen/bar and M-Pesa QR).
- A4 specimens (daily sales, close-day, payments, stock, valuation, inventory movements, purchase order, goods receipt, guest folio and finance).
- Test-captured PDFs/screenshots plus scanned or photographed real thermal output.
- Reconciliation record verifying every sample report's critical totals from PostgreSQL.
- Printer model/OS/browser/paper profile, test date, QR scan proof and sign-off.
- Accessibility and print-to-PDF compatibility notes, including explicitly unsupported devices.
- Clear operator instructions for printing **without a bridge**.
- Disposable backup/restore CI results and detailed unresolved items.
- Written, separate V2 deployment/isolation/legacy-preservation plan.

## 19. Final release gates

- [ ] A restaurant/cafe cashier finishes a simple sale and receipt with minimal steps.
- [ ] Cash, manual M-Pesa, partial tender, refund, shift and close-day totals reconcile.
- [ ] Sealed/open bottles, ml/shot recipes, stock counts and imports are accurate and usable.
- [ ] Hotel reservation → folio → checkout → printed invoice passes end-to-end.
- [ ] Two terminals can operate concurrently and recover safely.
- [ ] All mandatory reports and documents are styled, legible and multi-page safe.
- [ ] A real **80mm receipt prints directly from an installed PWA with no SERVEOS Print Bridge installed**.
- [ ] Actual owner M-Pesa payment QR prints **above footer** and scans correctly.
- [ ] Browser print cancellation and possible duplicate reprint preserve financial truth.
- [ ] A4 print and PDF output passes specimen and PostgreSQL totals checks.
- [ ] Disposable PostgreSQL restore is included in CI and its result is recorded.
- [ ] All critical UI interactions and permissions are reviewed by target staff roles.
- [ ] Source release candidate is versioned; known limitations and hardware support list are explicit.
- [ ] The later V2 redeployment plan **protects every old stack** with independent hostname, containers, database, volumes, paths, ports, origin, cookies, secrets and backups.
- [ ] **No production VPS deployment, SSH change, schema mutation or legacy service change has occurred in this sprint.**

### Handover status labels

Use only accurate labels: **Implemented**, **Automated acceptance passed**, **Physically printed/verified**, **Operator accepted**, **Locally restore-proven**, **Future deployment approved**, **Hosted deployment completed**. Do not use any latter status until that exact gate has passed.

---

## FINAL ENGINEERING DIRECTIVE

**Build the system for the owner, cashier, receptionist and manager, not the developer.** An ordinary user should be able to start work, understand their numbers, produce attractive accurate paper reports, and print an 80mm receipt straight from the PWA without installing any SERVEOS print service.

Then prepare to deploy V2 as a **fresh, parallel, isolated stack** when separately approved. **Never overwrite, stop, restart, migrate or repoint the pre-existing deployments simply to launch the new one.**

**STOP BEFORE DEPLOYMENT.**
