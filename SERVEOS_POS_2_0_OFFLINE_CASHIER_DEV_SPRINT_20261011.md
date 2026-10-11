# SERVEOS POS 2.0
## Final engineering sprint, acceptance contract and non-destructive VPS deployment runbook
Supporting requirements from [Performance.md](Performance.md) are incorporated throughout this guide. Track local implementation and evidence in [the sprint checkpoint](docs/sprint/pos2-offline-cashier.md); open release gates remain binding.

**Verified update, 2026-10-12:** [Production release evidence](docs/releases/pos2-20261012-update.md) records the deployed API/PWA at `ce59c2b2caeb`, schema 077, scoped POS2 activation and retained recovery paths. Physical printer acceptance was waived for that deployment by explicit user instruction and remains unverified. Historical topology/findings below are not the current release record; the complete guide is not marked accepted.

**Prepared:** 2026-10-11

**Updated:** 2026-10-11, universal 80 mm thermal printing, short human references, professional receipt layouts and legacy-browser compatibility elevated to P0

**Repository:** `davemusau00/SERVEOS-WEB`

**Audited source:** `reset/vps-platform` at `7a3462292dc3700b9bd0aa978ccf92944fe7fb67`

**Reference CI:** https://github.com/davemusau00/SERVEOS-WEB/actions/runs/38137610469 (reported all jobs successful at audited SHA; historical reference)

**Reported live installation (verify before use):** `serveos-next` at `/opt/serveos-next`, PWA `/var/www/serveos-next/current`, API `127.0.0.1:3102`, PostgreSQL volume `serveos_next_data` (confirm before changes)

**Dedicated existing other stacks:** `sms-platform` and `sms-platform-africa`; static site `detailskilonzo.com`

**DISPLAY/PRINT IDENTIFIER REQUIREMENT:** Keep immutable UUIDs in database, sync commands and audit records, but **never expose raw UUIDs as routine receipt or cashier-screen references**. Use stable, business-scoped human document numbers and readable names; preserve statutory references unaltered.

**BROWSER REQUIREMENT:** Preserve tested modern browsers and add a measured legacy-browser fallback without weakening cash-sale authorization, secure storage or local ledger guarantees.

**PRINT FORMAT REQUIREMENT:** **ALL printed documents use 80 mm thermal roll width, without any A4/Letter/landscape fallback.** Printed height follows content. This applies to sales, tickets, stock, supplier, finance, accommodation and reports. Printer driver/hardware acceptance is a mandatory print go-live gate.

**Authority rule:** The production VPS remains the primary business authority. New offline sales are locally recorded and *provisional for central reporting* until reconciled; they must never be displayed as server-confirmed prematurely.

> **WORK ORDER FOR CODING AGENT:** Implement the milestones in order. Preserve all existing operator workflows, data, roles, database history, environment secrets, SSL certificates, Nginx virtual hosts, other Docker Compose projects and production storage. Treat **no production downtime, no silent data loss, no double payment, and no invented settlement** as release blockers. Do not run destructive commands. Never deploy without explicit approval after the specified gates are green.

## Source provenance and evidence status

This repository file is the canonical consolidated guide. The consolidation includes all four pasted attachments and preserves the target's existing uncommitted receipt, reference and browser requirements. Downloads copies and source attachments remain unchanged.

| Source | Consolidation treatment |
|---|---|
| Original pasted versions: attachments `70591f14-eaba-4261-adf1-7589c63b0988` and `a380b8e5-ba61-4ca0-a261-e74bd7dde668` | Byte-for-byte identical; retain their shared A–J engineering and deployment requirements once. |
| Thermal revision: attachment `3790c8cb-ac4c-49e1-b56a-5b576c1b32e7` / `REV80MM` | Integrate universal 80 mm printing into architecture, implementation, acceptance and release gates. |
| Final thermal, clean UI and browser revision: attachment `9967a098-a60d-45d8-854d-781ef5fbb497` / `FINAL_SPRINT_THERMAL_CLEAN_UI_BROWSER_COMPAT_20261011(3)` | Matches the pre-consolidation target; retain professional receipts, human references, browser tiers and Sprint 2B. |
| Current working document and committed baseline | Preserve existing edits; collapse repeated committed document bodies into one guide and check superseded wording for lost requirements. |

**Evidence boundary:** This is an implementation and acceptance contract, not a completion report. Source findings, the supplied CI result, SHA, catalogue counts, migration 072 and VPS topology are historical claims from the source documents. They have not been reverified against the current application or VPS during this documentation update. Record fresh evidence before treating them as current. Browser versions are evaluation baselines, not a promise of tested support. No production, printer, fiscal or browser acceptance is granted by consolidating this guide.

**Precedence:** Universal 80 mm paper policy (?A4) governs every physical print path; semantic layouts and readable references (?A5) govern its content. Preserve internal UUIDs and immutable snapshot hashes while displaying stable human references. Historical snapshot compatibility never permits an A4 fallback. Local cash evidence is retained even when central reconciliation fails. Unsupported browser capabilities never justify weaker authorization or storage guarantees. Physical printing can remain disabled pending hardware acceptance; there is no paper-size exception.

## Contents

- [A. Architecture and operational requirements](#a-architecture-and-operational-requirements)
- [B. Source-baseline findings requiring remediation](#b-source-baseline-findings-requiring-remediation)
- [C. Git and deployment workflow: safeguards first](#c-git-and-deployment-workflow-safeguards-first)
- [D. Detailed implementation sprints and acceptance contracts](#d-detailed-implementation-sprints-and-acceptance-contracts)
- [E. Release/test gates](#e-releasetest-gates-must-pass-in-order)
- [F. Read-only VPS preflight](#f-vps-safe-preflight-read-only-run-before-every-release)
- [G. Non-destructive staging](#g-non-destructive-staging-on-the-existing-vps)
- [H. Production deployment and rollback](#h-production-deployment-sequence-no-blind-overwrite)
- [I. Verification commands and release evidence](#i-concrete-verification-commands-for-developer)
- [J. Developer rules and definition of done](#j-one-page-developer-implementation-rules)
- [Requirement-to-sprint-and-gate matrix](#requirement-to-sprint-and-gate-matrix)
- [Completion checklist and acceptance evidence](#completion-checklist-and-acceptance-evidence)

---

# A. Architecture and operational requirements

## A1. One cashier, many ticket authors

- Exactly **one authoritative checkout terminal** per outlet/installation in v1. It is the only device permitted to accept and record in-person cash, operate the cash till, issue final server-backed receipts, or complete sales. It may be used by cashier accounts with explicit role permissions, but the *device* is enrolled as the dedicated checkout device.
- Waiters and authorized staff log in on phones/tablets and **create order tickets**. They may name a table/customer/order, choose available products, add preparation notes, submit, monitor status and amend/re-submit an unapproved ticket. They cannot record settlement, fire preparation, touch stock or issue a completed-sale receipt.
- Cashier receives a **Tickets (N)** inbox, reviews ticket, adjusts or rejects with reason, and approves. Approval fires only approved lines, consumes/reconciles inventory via the existing POS handler, and generates bar/kitchen preparation outputs *once*.
- Direct cashier transactions skip waiter ticket approval. Tap product -> current bill -> Pay, with minimum round trips and no superfluous editor forms.
- Multiple waiter devices work **online**. In phase 1 of offline support, waiters can only keep personal drafts while internet/API is unavailable. They **must not claim the ticket has reached the cashier** without acknowledgement. Local Wi-Fi ticket delivery is a separate later ServOS Edge milestone, not a condition of the single-terminal cash-sale release.
- Existing rooms, tab, account charge, discounts, refunds, split payments, housekeeping, KDS, stocks, credits and finance functionality remain available in their current authorized screens until explicitly replaced and tested.

## A2. Online + offline have ONE cashier UI

- Normal POS layout is independent of network state. Status appears in a small banner or header. Never show the huge `One offline cash sale` panel once new flow is enabled.
- Uninterrupted consecutive local **cash** sales on the enrolled cashier terminal during outages; no **one-sale / 30-minute** gate, no `BAR`/`KITCHEN` exclusion, no global freeze when an unrelated command is outcome-unknown.
- The operator can use the full cached sellable catalogue, stock rules, inclusive tax, modifiers and portions that have been provisioned. All money computed in integer **minor units** (KES cents). All physical quantities use deterministic fixed-point units (e.g., ml, whole containers), never floating-point money rounding.
- Save each sale atomically and durably: sale snapshot + item IDs + price/tax snapshots + local cash payment entry + provisional stock movements + local receipt/print evidence + same-ID sync outbox entry. If local persistence fails, sale is NOT recorded and the cashier must see a hard failure.
- Local state names: `RECORDED_LOCALLY`, `QUEUED`, `SYNCING`, `SERVER_CONFIRMED`, `OUTCOME_UNKNOWN`, `RECONCILIATION_REQUIRED`. These have distinct meanings. The cashier must see that cash was physically received even if the central ledger has not yet confirmed the sale.
- Offline cash accounting is allowed under a **preprovisioned, signed, enrolled-device capability** (scoped business, cashier device, staff/role, outlet and shift). Authorization is renewable while online and has an explicit validity period and risk policy. Do **not** turn off authorization, assume an expired role is valid indefinitely or accept unsigned/offline forged permissions. Remove an arbitrary *per-sale* quota, not security.
- No automatic assertion that unverified offline **M-Pesa** or bank payments have settled. Support recording a local *customer-claimed* external reference for later reconciliation only, or defer external tender to online mode. Cashier must not label it 'paid/confirmed' until verified against configured evidence. Room charges, credit, refunds and manager overrides remain online-only until individually specified and accepted.
- Printing: **80 mm thermal roll only, for every document type**. Local provisional customer slip, local preparation ticket with stable sale/ticket ID and visible `PENDING SYNC` / `NOT FISCAL INVOICE` where applicable. Full receipt and eTIMS/fiscal compliance remain separate evidence gates. An OS print dialog is not proof of physical printing. No automatic duplicate printing on retries.
- Terminal PWA must reopen offline with a provisioned local operator identity, loaded catalogue and local activity. Signing into a previously unused browser requires network. Locally authenticated identity must be secured by a kiosk PIN or equivalent security mechanism: do NOT persist access/refresh tokens or passwords in localStorage or plaintext IndexedDB.

## A3. Non-negotiable scope boundary

The first production offline release supports **one cashier device**. Waiter phones need API reachability to deliver tickets. There is **no promise of offline multi-device stock agreement**. Multiple offline cashier devices, LAN routing, local print servers and server-side multi-master merging are explicitly future work.

## A4. UNIVERSAL 80 MM THERMAL PRINTING (MANDATORY, P0)

**Scope:** Every operation with a physical **Print**, **Reprint**, **Print report**, **Print ticket**, or **Print PDF** action must generate an **80 mm thermal-roll** layout. There is NO A4, Letter, landscape or generic browser print-layout fallback, including reports and supplier/finance/hotel records. CSV and on-screen analytics may retain their own formats because they are data exports rather than physical printouts. If a future document cannot be rendered at 80 mm, explicitly refuse physical print and log a validation issue; never silently print it on A4.

**Audited source defect at SHA `7a34622`:** `src/runtime/web/documentPaperProfiles.ts` declares `'thermal-80mm' | 'a4-portrait' | 'a4-landscape'`; `CLOSE_DAY_REPORT` maps to `a4-landscape` and unlisted types default to `a4-portrait`. `BusinessDocumentRenderer.tsx` has named `@page report-portrait` / `report-landscape`, conditionally uses 210/297 mm iframes, and its generic preview has large 8–9 mm inner padding. These rules violate the all-80 mm requirement; address them in this sprint, not only in a later printer hardware task.

### 80 mm document matrix: no exceptions

| Printed output | 80 mm-specific rendering | Trigger / authority |
|---|---|---|
| Customer sales receipts (cash, M-Pesa, split, settled / provisional) | Business header/logo, date, document #, cashier, line items, clear KES totals/tax/tender/change/payment state, optional pay-to QR **above footer**, reprint marker | Cashier; authoritative receipt only after server confirmation; offline slip labeled provisional |
| Bar order ticket (`BOT`), kitchen order ticket (`KOT`), re-fire / cancellation | Large station label, table/order #, waiter, quantities, modifiers, notes, time, **NO price columns unless explicitly needed** | Only when cashier approves/fires; idempotent print job; never on unapproved waiter ticket |
| Payment acknowledgements, refund receipts, void notices, cancellation notes | Reference, amount, tender, actor, audit status, original document association | Authorized payment/void/refund outcomes |
| Purchase orders, GRNs, supplier returns, supplier payment vouchers and other supplier documents | Narrow stacked rows instead of horizontal commercial tables; quantity and KES in separate legible lines; sequential items and totals | Existing audited procurement/finance command paths |
| Stock count sheets, stock adjustments, goods receiving, transfers, waste reports | Item/code/location, counted/system/variance quantities and units, sign-off lines; multi-section continuous roll | Inventory workflows; respect locally provisional versus server accepted status |
| Hotel guest folio, checkout statement, reservation confirmation, room charges | Room/guest/stay, line-by-line charges, payments, balance, policy/terms, signatures where required | Existing PMS document issuance paths |
| Shift close report, till reconciliation, day-end sales, financial summaries | Stacked label/value rows, sections with subheaders, sales/payment reconciliation, audit IDs; long output continues vertically | Reports generated from verified ledger; `CLOSE_DAY_REPORT` must not be landscape |
| Any future printable record | Must be explicitly assigned the 80 mm renderer and pass snapshot tests | Unknown type fails closed rather than defaulting to A4 |

### Shared rendering contract

1. **Physical paper**: 80 mm thermal roll. **Safe default content width: 72 mm** (approximately 576 dots at 203 DPI); configurable by *printer model* only after test of effective printable width. Use physical units for layout. Do not confuse physical roll width with actual printable head width. A 74 mm setting is permitted only if that printer's measured printable width supports it. Never let printer-specific differences trigger A4 output.
2. **Page length**: driven by content; long invoices/reports continue down the roll. For browser printing, configure OS/driver paper as 80 mm roll, disable printer/browser headers and footers and use 100% scaling. CSS `@page` may not reliably negotiate automatic length across browsers; provide measured driver guidance and, when needed, segmented 80 mm continuation slips. Never switch long outputs to A4.
3. **Margins**: typically center 72 mm within 80 mm paper with ~4 mm total each side from hardware/driver printable constraints; adjust by empirical calibration. Use zero browser-default padding/print headers; document design adds small safe insets to avoid clipped totals, barcode and text. Avoid default renderer's 8–9 mm all-sides padding in printed output.
4. **Typography**: readable monochrome high-contrast text, main body ~9–10 pt, prominent totals 12–14 pt, small legal labels >=8 pt where possible; avoid faint gray text and huge header graphics that waste paper. Use compact vertical spacing, clear section boundaries, sensible word wrap; no horizontal scroll, cut-off columns or CSS shrink-to-fit as a substitute for proper 80 mm reflow.
5. **Tables**: render narrow item rows as a 2-line/3-line item block (`name` / `qty × unit` / `amount`) rather than forcing four-column A4-style tables. Long stock, supplier, hotel and reporting documents must wrap vertically, with repeated document ID or continuation markers on multiple slips where printing systems introduce page breaks.
6. **Brand and codes**: downscale/dither logos in black-and-white; constrain widths within printable area. Render QR/barcodes at actual scannable size with adequate quiet zone. If M-Pesa payment QR is enabled, place it **after payment totals and before the business/footer text**, not outside printable margins. Include payee verification text; QR is not payment confirmation.
7. **Printing authority**: render immutable issued document snapshots when server confirmed. Offline slips include stable local sale ID + `PENDING SERVER SYNC` (and non-fiscal qualification where appropriate). Do not silently replace an offline slip with a fiscal receipt or auto-print again after sync. Keep copy number, attempt, claimed job ID and duplicate/uncertain delivery workflow intact.
8. **Unified code path**: `documentPaperProfile()` must return `thermal-80mm` for every supported type and throw explicitly on unknown types. Remove `a4-*` print branches, `@page report-*`, A4 iframe widths and any CSS width based on desktop document types. `BusinessDocumentRenderer` and `printBusinessDocument` must share a single 80 mm sheet style, with document-specific **content** rather than paper-size switching. Every printing entry point must route through this policy.
9. **Transport boundary**: use browser/OS thermal print today; optionally integrate the existing print bridge only after verified capability. Do not confuse showing a browser print dialog or spooler acceptance with paper delivery. Printer preset should be **80 mm thermal, correct head width, no margins/headers, no fit-to-page**. QR and receipts should not get clipped by automatic cutter/driver margins; include tested feed/cut policy if using supported ESC/POS.
10. **Printer fault behavior**: offline and online print jobs must remain auditable, with `QUEUED`, `DELIVERY_UNCERTAIN`, `FAILED`, confirmed and marked `REPRINT` statuses as appropriate. Printing retry must never repeat the POS command or debit stock. Restrict job creation for BOT/KOT to cashier-approved preparation; pending waiter ticket is not a station job.

### Required code changes

- `src/runtime/web/documentPaperProfiles.ts`: collapse supported paper profiles to 80 mm only; enumerate every supported document type; **no A4 default**. Add a contract test that fails if any supported `BusinessDocumentRenderer` title/document type lacks an explicit thermal profile.
- `src/runtime/web/BusinessDocumentRenderer.tsx`: remove portrait/landscape `@page` CSS; standardize print frame at physical 80 mm and safe internal 72 mm; implement stacked 80 mm item, reporting, folio and purchasing layouts. Ensure preview matches printed geometry and QR appears before footer.
- `src/runtime/web/WebDocumentQueue.tsx`, `WebApiCloseDayReports.tsx`, and every module invoking print/preview (POS, procurement, guest documents, inventory and finance): use shared 80 mm renderer, not native page/document wide printing.
- `apps/api/src/print-commands.mjs`: keep existing idempotent print claims and audit; only generate KOT/BOT following cashier approval. No new payment/stock writes for printing retries.
- Add printer-specific paper settings to business/device configuration, with **roll width fixed to 80 mm**; only *effective printable width, density, margins, copies and auto-cut/feed* are configurable by hardware compatibility. Never expose A4/Letter in POS print settings.
- Update operator printer setup documentation for the actual Countryside 80 mm printer model and Windows print driver. Do not claim hardware acceptance until a test ticket physically prints.

### Automated and physical acceptance (P0)

- Unit contract: all existing `BusinessDocumentRenderer` types, including `CLOSE_DAY_REPORT`, supplier return/voucher, PO, GRN, guest folio/checkout, reservation confirmation, zero-value receipts and refund/cancellation outputs, have an **80 mm** profile. Unknown future types fail explicitly. `grep`/AST CI checks reject `a4-portrait`, `a4-landscape`, `size:A4`, `297mm` or `210mm` in any active print path.
- Browser/visual tests: capture 80 mm print-media screenshots or PDFs for every type (including documents with 1, 15, 100 items); assert a measured <=72 mm design width on the default profile, no horizontal overflow/clipping, complete long values, item totals, receipt QR and footer. Assert the output remains 80 mm at 1366x768 desktop and tablet viewports.
- Fidelity: printed amount = immutable document snapshot amount; tax/net/totals and tender statuses match, exact issued human document reference appears and maps to the retained internal UUID, `REPRINT` is explicit; local offline documents are unmistakably provisional.
- Printed KOT/BOT is created once per approved ticket even with double-click/replay; cancellation prints an explicit **cancel** ticket rather than replaying a normal food ticket.
- On the actual 80 mm printer, measure left/right clipping, legibility, 2m+ continuous print, QR scan reliability, logo, auto-cut/feed and reprint behavior; test cold browser restart and uncertain print delivery. Record printer model, driver preset, roll width, effective printable width, hardware outcome, and approver.
- **Release gate:** production can ship code with universal 80 mm renderer while keeping direct printing disabled if physical hardware test cannot be completed; do not claim live printing acceptance until the physical device tests pass. No A4 fallback, regardless of hardware availability.

---


## A5. PROFESSIONAL THERMAL RECEIPTS + HUMAN REFERENCES (MANDATORY, P0)

**Source-reported user-visible problem (reverify at candidate SHA):** `src/runtime/web/BusinessDocumentRenderer.tsx` prints an entire `document.id` as `Source reference`; uses UUID fallbacks for cashier names and references; and can expose `orderId`, `paymentId`, `payableId`, `locationId`, entry IDs or full order UUIDs inside receipts and business notices. In `apps/api/src/pos-commands.mjs`, one zero-value sales receipt number is `SALE-${command.commandId}`, a full UUID. The generic 4-column item table, large identity area, overlong technical explanatory paragraphs and A4-oriented spacing cause awkward receipt rendering. These are source-reported issues; exact physical symptoms still require driver/printer tests.

### Customer-facing receipt rule: only operationally necessary information

Default **SALES RECEIPT** should contain in this order:

1. Compact logo (if configured), business/trading name, venue, essential address/contact and required tax identity fields. Do **not** remove required KRA/eTIMS identifiers or fiscal verification data.
2. **RECEIPT** / `REPRINT` / `PROVISIONAL - PENDING SYNC` status with stable readable reference, date/time in `Africa/Nairobi`, optional cashier name and table/order label. No UUIDs, JSON keys, debug statuses, `API authority`, internal revision numbers, source document hash, token, device ID or long business IDs.
3. Product name (wrap to two or more lines without clipping), then `qty × unit price` and right-aligned line total on the following line. Selected portions/modifiers/discounts appear only where relevant.
4. Clean totals: subtotal where useful, discounts, taxes/levies where legally required, **TOTAL KES**, paid by method/amount, remaining balance or change. Settlement status must match the **verified immutable issued snapshot**. Never imply a payment was confirmed when unresolved.
5. Optional scannable M-Pesa pay-to QR in a quiet zone **before the footer**, with payee/till identity and appropriate payment-status wording; never encourage double payment on an already settled bill. A fiscal QR, if legally required, is separate and must preserve mandatory validation data.
6. Small configurable thank-you/footer, offline provisional warning only when relevant, and required fiscal/legal metadata. Move developer branding and support contacts to About/System Settings instead of placing a large developer footer on every customer receipt by default. Do not erase legally required business details.

KOT/BOT prints should contain ticket reference, order/table, timestamp, station, prepared item name, quantity, preparation note, priority/cancellation label where applicable. Do **not** print customer sale totals, UUIDs, cash, internal domain explanations or unnecessary tax fields on preparation tickets.

Financial, supplier, hotel and stock documents still retain their **required commercial/audit fields**, but use human labels and minimal operational summary by default. When a long reference is genuinely needed (e.g. payment provider receipt/reference), print it in full and wrap naturally. Keep a separate authorized `Technical details`/`Copy reference` view within Activity/Sync, not on standard paper output.

### Identity architecture (preserve auditability, avoid collisions)

- **Never replace the underlying UUID primary keys, command IDs, payload hashes or database foreign keys.** These remain immutable for deduplication, reconciliation, audit and recovery.
- Create or consistently reuse a **server-issued immutable document number** per business, document type and issuance sequence (`R-000142`, `BOT-000143`, `PO-000044`, etc.). These are **examples**, not guaranteed current live sequences. Generate safely with PostgreSQL unique constraints and concurrency-safe allocation. Never derive the unique receipt number by slicing a random UUID.
- Where fiscal/authority numbering rules impose a serial, use that compliant official number, not an arbitrary friendly replacement. Never change an already issued document's number or hash when changing presentation.
- Cashier/waiter order card uses a **short, stable display number**, e.g. `Order #142`, `Table 4`, or `Waiter ticket #38`; database and API continue to address UUID. Receipt/document number is separate from an order label.
- During a disconnected shift, use collision-safe **device-scoped local references** such as `POS01-20261011-0124` with an atomic IndexedDB monotonic counter; include `PROVISIONAL` and preserve its mapping to the eventual server-issued receipt number after reconciliation. Never silently renumber a slip that has already been printed.
- Legacy issued documents with UUID-heavy `documentNumber` must remain valid and hash-verifiable; do not mutate historic snapshots or rename receipts in-place. Add an explicitly deterministic **display-only label** where safe, preserve the immutable legal/original receipt reference where required, and avoid claiming a shortened legacy ID is globally unique.
- Full UUIDs should be accessible in **authorized Technical Details / Activity & Sync** with a copy control and searchable backend support tools, not prominent on the POS, printed receipt, cashier shifts or waiter tickets.

### Renderer and ergonomics tasks

- Introduce separate small templates such as `ThermalSaleReceipt`, `ThermalPrepTicket`, `ThermalShiftSummary`, `ThermalInventorySlip`, `ThermalHotelFolio`, `ThermalSupplierDocument` sharing an 80 mm shell, styles, currency formatter, number formatter, QR rules and print job state machine. **Do not break document `layoutVersion:1` rendering and hash verification**; add a new `layoutVersion` for genuinely different snapshot contracts and keep the old renderer for historical print/reprint.
- Refactor `DocumentIdentity` to show a short relevant header. Remove default `<dt>Source reference</dt><dd>{document.id}</dd>` from customer-visible output; convert other raw ID-bearing fields to human labels or hide under technical details where not legally needed. Never print a staff UUID in place of the staff member's name; show `Cashier` or `Not available` if no authorized name is present.
- Replace the 4-column general `<table>` for 80 mm with stacked line rows; row wrapping is mandatory for `CHROME BRANDY 250ML`, longer names, modifiers, discount reason and long external M-Pesa references. Keep amounts aligned using tabular numeric rendering and no fractional-cent rounding.
- Preview must represent the **same thermal geometry** as the printed result, not an A4-width white card in a modal. Provide 80 mm realistic preview on-screen and a compact print action with observable outcome `queued/sent/uncertain/failed`, not false `Printed` success.
- Provide a tiny test fixture (see layout below); screenshot and physical tests include blank lines, accidental whitespace, over-wide logos, distorted receipt fonts, cut-off QR/footer, duplicated totals, huge UUID blocks and broken line wrapping.

**Desired example format (illustrative business data, not a real issued receipt):**

```text
       COUNTRYSIDE RESORT
          SALES RECEIPT
         R-000142
11 Oct 2026  8:24 PM | Cashier Jane
--------------------------------
BLACK AND WHITE 375
  1 x 900.00              900.00
WHITE CAP CAN
  2 x 300.00              600.00
--------------------------------
TOTAL KES                1,500.00
CASH RECEIVED            2,000.00
CHANGE                     500.00
--------------------------------
             Thank you!
```

The actual issued receipt must calculate totals and taxes from its immutable snapshot. The example does not prescribe omission of required tax details.

### Must-pass P0 tests

- Every printed-document type has a snapshot-golden with `no raw UUID`, no unnecessary internal labels and no clipped width, **except where an actual external/legal identifier is mandated or explicitly requested**. Search printed DOM for UUID patterns in customer-facing/operational fields.
- Concurrent receipts produce unique stable document numbers; same command replay returns original number and print-job ID; old historical UUID-numbered receipts still verify and reprint safely.
- 1 / 15 / 100 line items, 50+ character product names, high-value KES totals, zero-value receipt, partial/fully paid receipt, refunds, KOT/BOT cancel, very long supplier/folio reports, and M-Pesa/reference/QR all render correctly on **80 mm** only.
- 203 DPI and, when available, 300 DPI thermal head; Windows printer presets, cutter, whitespace/margins, safe width; an actual printer acceptance recording must match visual snapshots. Network/API disruption during printing cannot change money or duplicate a receipt.
- Staff/device UUIDs, database sequence IDs, debug messages and source hashes remain **fully retained in secured server records** and technical panels, not truncated or removed from the system.

## A6. OLDER BROWSER COMPATIBILITY AND SAFE FALLBACK (MANDATORY, P0)

**Source-reported browser findings (reverify at candidate SHA):** `vite.config.ts` uses React, Tailwind 4 and a custom `webShellPlugin()` with **no** `@vitejs/plugin-legacy`. `src/main.tsx` directly imports the application and immediately mounts React. `src/runtime/web/registerShell.ts` assumes a production Service Worker when available. Critical workflows also rely on Web Crypto (`crypto.subtle`), IndexedDB, structured cloning/persistence, modern CSS and a secure origin. The current PWA has no consolidated browser-capability gate. These are reasons an older engine can show a blank/incomplete screen; the exact affected browser versions require a device inventory and tests.

**Source-supplied Vite 8 production baseline (verify against installed toolchain and official documentation before implementation):** Chrome/Edge >=111, Firefox >=114, Safari/iOS >=16.4. Vite's `build.target` alone **does not provide polyfills** and cannot promise offline compatibility. `@vitejs/plugin-legacy` can emit additional legacy chunks plus appropriate language polyfills, but DOM APIs and Tailwind 4 CSS must be checked independently.

### Browser tiers

- **Tier A - supported full offline cashier:** maintained and tested modern Chrome/Edge/Firefox; Safari/iOS only after IndexedDB, private-mode, WebCrypto, storage durability and actual printer workflow tests. The physical Countryside Windows terminal is the mandatory real-device test.
- **Tier B - tested older-browser online mode:** limited fallback built with `@vitejs/plugin-legacy` for **specific versions actually passing CI and manual testing**; aim to evaluate Chrome/Edge 100, Firefox ESR 102/115, and Safari 15.4 as candidate targets, **not guaranteed support**. Allow online tickets/POS only where authenticated sessions, checkout and secure transport work correctly. Offline mode remains **disabled per unsupported capability**.
- **Tier C - incompatible:** Internet Explorer, antiquated Android WebViews, browsers missing secure Web Crypto/IndexedDB, disabled storage, unsafe TLS or other critical transaction guarantees show a **clear, lightweight explanation** with approved upgrade instructions. They must not show a blank page or quietly accept financial actions. Compatibility messages must never advise bypassing TLS or security checks.

### Implementation instructions

1. **Collect real device data:** version of Chrome/Edge/Firefox installed on Windows POS; Android tablet WebView/Chrome version; OS, HTTPS, PWA installed state, default thermal printer, available storage, WebCrypto, IndexedDB and SW. Avoid relying only on user-agent parsing.
2. Add optional `@vitejs/plugin-legacy` to Vite production config with pinned compatible version; pick Browserslist targets from test results, not universal `defaults`. Generate separate modern/legacy assets without downgrading modern users. Verify the new build still ships `index.html`, SW and content-hashed chunks and compiles with the existing CI toolchain.
3. For features unavailable on older engines, test targeted `core-js` polyfills or minimal modern-syntax fallbacks. **No polyfill can manufacture durable IndexedDB, trusted WebCrypto or secure context**. Do not bundle sensitive secrets or privileged offline credentials to make a browser appear supported.
4. Audit **Tailwind 4-generated CSS** for unsupported constructs (e.g. color syntax, CSS variables/cascade, nesting). The legacy JS plugin is not a CSS transpiler. Implement an explicitly tested lightweight compatible cashier stylesheet or carefully configured CSS build transforms if needed. Preserve 80 mm print media styles regardless of browser.
5. Introduce `src/runtime/web/browserCapabilities.ts` (proposed) with a simple, fast, **feature detection** gate: secure context, HTTPS, IndexedDB open/write/read/delete test, `crypto.subtle` + required algorithms, `crypto.randomUUID` alternative only when cryptographically secure, Web Storage availability, SW/Cache API availability, print method, `Intl` formatting/timezone support, persistent storage quota and detection of private-mode failures. Test storage transaction completion and errors; `navigator.onLine` is not authoritative API reachability.
6. Add a **minimal static HTML/CSS fallback** in `index.html` that remains readable if React/JS/ESM fails to load, reporting **'This browser cannot safely run ServOS. Please update Chrome or Edge.'** Give a simple Compatibility Check link and support instructions. On compatible boot, hide this fallback. Avoid exposing raw stack traces or infinite refresh loops; do not make a legacy browser risk business records. Test JavaScript-disabled and module-parse-failure cases.
7. Use capability matrix to gate roles/features: browser may qualify for online waiter tickets but not offline cashier/cached authorization. If the browser loses storage mid-shift, stop claiming a sale was saved and display hard failure before taking more money. Do not discard, overwrite or silently reset an unsynchronized ledger after failed browser upgrade.
8. Ensure **PWA Service Worker precache includes modern + legacy chunks, critical HTML, styles and print assets** for the selected browser; legacy chunks must not be omitted by custom `webShellPlugin`. Cache versioning and waiting-worker activation must preserve pending offline commands. Rehearse upgrade and rollback with offline IndexedDB data present.
9. Implement render/behavior regression tests across Windows desktop and Android tablet viewport using actual browser binaries or real devices. A screenshot from Chromium alone is **not** proof of Firefox/Safari/old WebView compatibility.
10. Expose user-friendly diagnostics under Settings > Device: Browser support `Full / Online only / Unsupported` and specific missing feature; never show low-level feature IDs to cashiers. Update deployment documentation with supported minimum versions derived from test results.

### Required browser acceptance gates

- Modern baseline: Chrome 111+, Edge 111+, Firefox 114+, Safari 16.4+ **subject to financial/offline capability checks** and production-like tests. Legacy candidates above may be advertised only when their exact version successfully passed the specified transaction tests.
- On every listed browser: login/session refresh, cashier search/product add, ticket submission/review, KES computation, payment status, print preview and **80 mm** print-layout fidelity, reload and route assets, accessible error messaging.
- Offline-enabled terminals additionally pass: secure capability issuance, 100 saved cash sales, forced browser restart during outage, storage durability, reconnect/replay exactly once, updated SW without wiping ledger, intentional low-storage failure, device/PIN expiry behavior and cash report reconciliation.
- Unsupported browsers must show **clear upgrade instructions instead of a blank screen**. If the only safe solution is installing current Chrome/Edge or updating Android WebView, say so. Do not lower cryptographic protection or API authorization to add support.
- **Release gate:** no browser-support change deploys directly to active `serveos-next` without modern PWA parity + legacy branch regression, staged release manifest/SW asset scan, immutable PWA symlink rollback test and preservation of the existing offline queue.

# B. Source-baseline findings requiring remediation

Historical source findings supplied by the versions above. Recheck each against the candidate SHA; this table does not assert that the current checkout or deployment still has every defect:

| File/module | Actual gap |
|---|---|
| `src/runtime/web/WebApiPosView.tsx` | 264-line tightly composed UI with separately rendered offline sale, till, payment, prep, room charge, credit, detailed order, document queue and numerous advanced forms in one long vertical page. |
| `src/runtime/web/BusinessDocumentRenderer.tsx`, `documentPaperProfiles.ts` | Raw UUIDs (`document.id`, IDs in notice details), UUID-based receipt numbers in some flows, narrow-paper table overflow and A4 defaults; implement thermal templates, short human references and compatible legacy reprint rendering (§A4, §A5). |
| `vite.config.ts`, `src/main.tsx`, `registerShell.ts`, `web-shell-plugin.ts` | No Vite legacy bundle, missing capability gate, possible unsupported modern CSS/JS and SW precache of all versioned assets; implement tested browser tiers (§A6). |
| `src/runtime/web/WebApiOfflinePosPanel.tsx` | `maxCommands:1`, `durationMinutes:30`, `pendingEntry` blocks another sale, `['KITCHEN','BAR']` product filter and offline-only separate form. |
| `apps/api/src/offline-pos-commands.mjs` | `order.offlineCashSale` rejects `KITCHEN` and `BAR` route-to; only `COUNTER`/`TAKEAWAY` service destinations; chained create/add/fire/pay in one API command. |
| `apps/api/src/server.mjs` | Grant issuance caps sale to one for up to 30 minutes and rejects broader offline authorization. |
| `src/runtime/web/WebBusinessApp.tsx` | Explicit `navigator.onLine` blocks nearly all POS, payment, till, hospitality operations; any queued `OUTCOME_UNKNOWN` blocks new unrelated actions. |
| `src/runtime/web/BusinessStore.ts` | IndexedDB command queue and bootstrap exist, but there is no full atomic local cashier sale, payment, inventory and print ledger. Grant validation has global maximum 100. |
| `src/runtime/web/sync.ts` | Single sequential queue; `synchronizeStore` stops if earlier command fails. Existing command ID recovery and change feed are useful foundation. |
| `src/runtime/web/apiAuth.ts` | Restores access via API refresh; cold PWA entry needs a separate secure offline identity/session reopening path. |
| `apps/api/src/pos-commands.mjs` | `order.create` and `order.addItem` require `pos.sell`, `order.fire` requires `order.fire`, and these are ONLINE_ONLY. Waiter-specific nonfinancial ticket capability does not yet exist. |
| `src/runtime/web/WebApiPaymentPanel.tsx` | Payment UI depends on a pre-fired order with open, operator/device-owned till. Local provisional cash accounting not present in main POS. |
| `apps/api/src/command-kernel.mjs` | API has durable command IDs, payload hashes, locks and idempotent replay. Preserve these. |
| `apps/api/Dockerfile` | **Broken in repository:** only copies `src`, `migrations`, package files under `/app`; but `src/staff-commands.mjs` imports root `contracts/permissions.json` and `contracts/roles.json`. VPS had a local staged Dockerfile repair to load `/app/contracts/`. Make upstream package path correct and test as nonroot. |
| `scripts/Deploy-ServOSProductionFeatures.ps1` | **Unsafe for current topology:** PWA mode hardcodes `/var/www/serveos-prod`, other modes hardcode `serveos-prod-api-1`, `3101`, old healthcheck and old release paths. Do not execute this unchanged against the new VPS. |
| `scripts/package-pwa-release.mjs` | Requires a clean committed checkout; SHA-bound manifest, SHA-256 asset hashes, immutable release dir. Keep/reuse after parameterizing deployment script. |
| `src/runtime/web/documentPaperProfiles.ts` | **P0: A4 output defect.** `CLOSE_DAY_REPORT` is `a4-landscape`, unknown types fall back to `a4-portrait`. Universal 80 mm output requires explicit type coverage and a fail-closed unknown type policy. |
| `src/runtime/web/BusinessDocumentRenderer.tsx` | **P0:** contains A4 `@page` rules, A4-size print iframe logic and wide multi-column document layouts; migrate all print types to 80 mm thermal roll and 72 mm default safe content width. |

**Source-reported payment diagnostic to resolve before financial changes:** Screenshot shows `Payment confirmed` while order still displays `Paid KES 0 / Balance KES 900`, with one change waiting to sync. This does NOT prove a double charge or data loss, but is a serious UI consistency risk. Inspect exact command ID and terminal outcome in Activity before submitting further payments. Make consistency and recovery acceptance P0.

**Historical production snapshot (as shared):** New `serveos-next-api-1` was healthy at `127.0.0.1:3102`, with migrations `expected=72/applied=72`; PWA staged release `7a3462292dc3`, and first-use account created subsequently. The source records that deployment succeeded. **Do not infer the current live SHA or containers without a fresh read-only preflight.**

---

# C. Git and deployment workflow: safeguards first

## C0. Start feature branch, never edit the active production checkout

Developer Windows PowerShell:

```powershell
cd 'C:\Users\Admin\Downloads\SERVEOS-RESET'
git status --short
git remote -v
git fetch origin reset/vps-platform
git switch reset/vps-platform
git pull --ff-only origin reset/vps-platform
git switch -c feat/pos2-cashier-tickets-offline
```

**Before branching:** do not discard uncommitted local work. Resolve/stash it explicitly, never `git reset --hard`. The development checkout stays on Windows or an isolated working directory, **not** `/opt/serveos-next/source` if that checkout is used by active deployment tooling.

Establish an implementation contract in `docs/sprint/pos2-offline-cashier.md`. In CI record source SHA, API image digest, migration high-water, PWA manifest digest, database compatibility, flag status and operator acceptance artifacts. All risky features start with default `false` in production runtime configuration.

## C1. Flag design

Recommended server-controlled effective capabilities: `pos2.simpleCashier`, `pos2.waiterTickets`, `pos2.offlineCash`, `pos2.localKitchenTickets`, `pos2.offlineAuthV2`. Scope flags to business/outlet/device/role where relevant. Default OFF for all existing businesses and devices. A flag should be computed and verified by the API and embedded in the authorized business session, not treated as a frontend security check. A PWA build-time flag is insufficient for per-business rollback because SW assets are cached. Avoid flag proliferation: one release phase may activate multiple backend capabilities as a single small cohort.

Rollout states: `LEGACY_ONLINE_ONLY` -> `SIMPLE_UI_ONLINE` -> `WAITER_TICKETS_ONLINE` -> `SINGLE_CASHIER_OFFLINE_PILOT` -> `GENERAL_AVAILABILITY`. A server feature kill switch must not delete or strand locally queued commands; disabling new creation must retain the replay/reconciliation path for existing local IDs.

## C2. Database migration rules

1. SQL **append-only migration names** after the freshly verified migration head (072 in the historical baseline). Do not edit previously applied migration files or rewrite existing business tables destructively.
2. Use expand-and-contract: add new nullable columns/new ticket and reconciliation tables, indices and constraints that coexist with old code. Backfill separately, with throttling and validation. Do not remove or rename existing fields until the last old API/PWA can no longer use them and all queues are drained.
3. Schema must support **old API + old PWA**, **new API + old PWA**, **new API + new PWA** during cutover; the new PWA with old API is *not* required only if activation prevents it, but should fail gracefully.
4. Never use `docker compose down -v`, `docker volume rm` or recreate the current `serveos_next_data` volume.
5. Migrations must be rehearsed against a disposable restored database and validated for lock duration before production.
6. **Fix migration readiness** to validate expected names/checksums, not just hardcoded count `72`. Readiness must match the active binary's migration manifest while remaining tolerant of authorized later migrations during transition.

---

# D. Detailed implementation sprints and acceptance contracts

## SPRINT 0: Make existing POS trustworthy before refactoring (P0)

**Tasks**

- Reproduce screenshot inconsistency (server-confirmed `payment.record`, order projection still amountPaid=0 and pending change); trace returned `ApiCommandOutcome`, `synchronizeStore`, change-feed application, stale React record state, and duplicate prevention. Only display `Confirmed by server` if confirmed payment ID/receipt and current projection agree, otherwise `Recorded, updating display` with original-command recovery link.
- Replace broad unknown-outcome global blocking with *per-aggregate* blocking for current online operations; retain conservative behavior for affected order/till. Do not enable unrelated offline operations yet. Keep conflict evidence.
- Add tests that replay a timed-out payment with the **same** command ID and identical payload; ensure settlement once. Simulate stale response and UI refresh.
- Verify current importer-generated products at Countryside: 73 sellables, 72 stock masters as last seen; no duplicate SKU creation. Validate there is one consistent till owner.
- Capture baseline `health/ready`, navigation, current database migration head, current operator role, `git sha`, queue size, DB backup timestamp.
- Add failing regression fixtures for receipt UUID clutter, malformed 80 mm CSS/long line items, stale printed settlement status and unsupported browser startup. Preserve historical snapshot hashes and IDs.

**Accept:** repeated payment retry cannot create second settlement; 900-KES sale shows paid/balance consistent after server confirmation; outstanding queue status is explicit; previous online operations unaffected.

## SPRINT 1: Simplify cashier POS, no backend behavior change (P0)

**Build**

- Replace monolithic `WebApiPosView.tsx` render tree with container and small components, suggested files: `src/runtime/web/pos2/CashierWorkspace.tsx`, `ProductSearchGrid.tsx`, `OrderBasket.tsx`, `PaySheet.tsx`, `TicketsInbox.tsx`, `ShiftHeader.tsx`, `PosMoreMenu.tsx`, `PosConnectivityBadge.tsx`.
- Desktop: top row venue/outlet, shift indicator, network state, waiting-ticket count; center product search/category/favorites; fixed-right visible active bill. Keep total and Pay button always on screen. Mobile/tablet: product view with sticky basket/pay drawer, touch targets >=44 px.
- **Single tap** product adds it at qty 1 (or starts immediate counter order); repeat tap increments. Optional modifiers/portion show a small sheet **only when product requires a choice**. Barcode scanner auto adds exact unique match, with disambiguation on multiple matches.
- One primary action `Pay KES n`. In PaySheet choose Cash, M-Pesa, Split, More. Cash: tendered amount + live change. M-Pesa: actual reference/received amount/time/verification policy. More contains charge room, customer account, discounts, etc. Out-of-scope actions must not vanish for authorized legacy users; route them to existing advanced screens.
- Use compact order tabs `New sale`, `Tickets`, `Held`, `History`; hide advanced form proliferation behind `More`. Remove separate favorite buttons and reduce redundant order name input; use automatic user-friendly sale ID and optional rename.
- Preparation pass remains in KDS view; till cash in/out/close moves to Shift header dialog.
- Replace disabled without reason with contextual tooltip/message. Preserve keyboard Tab focus, screen reader roles, high contrast, input validation, ESC handling, and the **universal 80 mm thermal** print contract in §A4.
- Replace raw cashier-facing UUIDs and debug identifiers with human order/ticket labels; show complete internal ID only in authorized Activity > Technical details (§A5).
- Add a **thermal-specific** compact preview/receipt template and fixture tests; use `layoutVersion` compatibility so historical receipts still reprint with their original issued content intact.
- Introduce browser feature detection and user-readable unsupported-browser fallback. Add optional legacy asset build only after compatibility tests (§A6).
- Preserve all existing API commands and order revision rules for this sprint. Feature flag `pos2.simpleCashier` OFF by default.

**Acceptance tests:** 73 products searchable; tap and barcode; two-tap qty; quick add; open tab; create/fire/pay; change; cash/M-Pesa split; room charge/credit More; scanner keyboard focus; 1366x768, 1024x768 and 390x844 viewports; legacy POS screenshot/regression unchanged when flag off. Main cashier flows do not require vertical scrolling; cashier sees no raw UUIDs; receipt preview is 80 mm; supported old browser shows the functional tested online fallback; unsupported engine shows clear upgrade guidance rather than blank screen.

## SPRINT 2: Waiter ticket proposals -> cashier approvals (P0)

**New domain proposal**

- Add additive table(s): `pos_ticket_submissions` with `business_id`, `ticket_id UUID`, `outlet_id`, `table_id nullable`, `created_by_staff_id`, `source_device_id`, `status`, `revision`, `ticket_payload` or normalized lines, item IDs, `created_at`, `submitted_at`, `approved_by_staff_id nullable`, `approved_at nullable`, `approval_order_id nullable`, `reason nullable`, immutable audit links. Key business+ticket ID; indexed on business/outlet/status/time; row lock+unique command approval.
- Statuses: `SUBMITTED`, `APPROVED`, `REJECTED`, `NEEDS_REVIEW`, `CANCELLED`. Local unsent drafts stay in device IndexedDB and are NOT submitted server tickets.
- Commands: `ticket.submit`, `ticket.revise` only if still pending, `ticket.cancel` (author prior to approval), `ticket.approve` (cashier), `ticket.reject` (cashier). These are **new additive API commands**, not overloaded paid orders. Each uses existing command-kernel IDs, idempotency, audit, validation and permissions.
- Staff permissions: `ticket.create`, `ticket.view_own`, `ticket.view_outlet`, `ticket.approve`, `ticket.reject`; `payment.record`, `payment.split`, `till.*`, `order.fire` restricted to cashier/manager and enrolled checkout device. API must enforce cashier terminal authorization, not just permission/UI. Keep manager supersets explicit.
- Ticket carries reviewed **product ID, modifiers, portion, quantity, note, table/outlet, source version**, but approval uses the current validated catalog/stock/tax rules and highlights meaningful price differences for cashier review. Never silently take funds or alter stock on mere ticket submission.
- `ticket.approve` in one PostgreSQL transaction must validate ticket state+revision, check outlet/table, create or attach to canonical POS order as appropriate, add lines, fire selected lines via existing handler, emit KDS/print ticket once, record approval/audit, mark ticket approved. If stock or price changed, return `NEEDS_REVIEW` and show cashier meaningful choices. No partial fire or duplicate stock debit if transaction fails.
- Support multiple waiters submitting concurrently. Ticket status updates via existing sync/change feed or optional SSE. Do not require cashier to refresh manually.
- The cashier may edit submitted ticket before approval, maintaining an auditable final revision. A later waiter add-on creates a **new pending round**, preserving the prior fired items and payment history.
- Waiter UI: choose table / takeaway, product search, quantities, prep note; `Send to cashier` is one primary action; status pill `Waiting`, `Approved`, `Needs changes`, `Rejected`.
- Cashier inbox: compact card with time, waiter, table, 1–3 line preview, total; `Review`, `Approve & send`, `Reject` (reason). One-tap approval optional only where no validation discrepancy. Avoid automatic release before explicit approval.

**Acceptance:** two or more waiters submit simultaneously, ticket appears within e.g. 5 seconds when online; cashier approves once under simultaneous clicks; exactly one stock effect and each BAR/KITCHEN prep ticket emitted once; waiter cannot record payment or approve; prohibited API calls return 403; a stale ticket returns reviewable 409, no partial state; legacy POS order flow intact.

## SPRINT 2B: Uniform thermal print renderer, short references, browser compatibility (P0)

- Implement §A5 user-facing numbering/display policy with concurrency-safe server document-number allocation for newly issued documents; preserve immutable source IDs, old hashes and historic receipt numbers. Test concurrent and replayed commands.
- Implement universal §A4 thermal print styles for all types with reusable 80 mm components and no A4/landscape branch; update long reports, stock and supplier outputs. Confirm QR safe width, logo grayscale, receipt-only payment content, pre-footer QR and KOT/BOT minimal detail.
- Implement §A6 browser matrix and fallback: legacy build for versions proven to pass, static unsupported-browser messaging, capability-gated offline transactions, safe SW asset caching. Test Windows POS browser and Android device.
- No live traffic cutover or live browser storage/cache clearing in this sprint. Preserve previous source, PWA release and API as rollback options.

**Accept:** all supported document types print/render at 80 mm without raw internal IDs or clipping; old receipt hashes still verify; contemporary and tested legacy browsers pass specified scope; no blank unsupported browser.

## SPRINT 3: Full single-cashier offline cash ledger (P0)

**Data-layer design**

- Add new IndexedDB version **incrementally**; never wipe or rename the existing store while pending commands may be present. Suggested objects: `cashSales`, `cashEntries`, `localStockMovements`, `localOrderTickets`, `outboxV2`, `syncReconciliations`, `localShiftLedger`, `localPrintEvidence`, `capabilityLeases` (retain existing `records`, `queue`, `drafts`, `offlineGrants` during migration).
- Ensure a **single readwrite IndexedDB transaction** stores (1) immutable sale envelope; (2) local cash entry; (3) provisional inventory deltas; (4) receipt/ticket; (5) outbox command with stable UUID; (6) local monotonic checkout sequence. Use `navigator.locks` across browser tabs; refuse new offline sale only when this same terminal is genuinely already processing a local commit or local store isn't durable.
- Make the sale envelope deterministic: business, outlet, till ID, cash drawer device, cashier, event timestamp, client transaction UUID, monotonic sequence, service destination, item snapshots/portion/modifier/price/tax, stock/bottle-consumption snapshot, currency, total minor, cash tendered minor, change minor, local document ID and signature/checksum evidence.
- Share the same pricing/tax algorithms between online and offline through a pure package or copied verified deterministic module, including inclusive tax, discounts, sealed bottle unit conversion (ml), modifiers, mixed units, and cash change. No independent rounding forks.
- Price and tax snapshot is locked to the customer-accepted sale. On sync, if server configuration changed, flag the discrepancy; never silently rewrite a cash-received transaction.
- Add a new `pos.offlineSale.commitV2` API command and versioned contract. It must be idempotent and atomic and must accept BAR and KITCHEN product routes. Keep `order.offlineCashSale` as supported legacy behavior for old PWAs until drained. Do not weaken other ONLINE_ONLY operations globally.
- The server validates device-capability signature, business/outlet/till ownership, payload UUIDs, counter uniqueness, catalog snapshots, stock movement consistency, currency, tax and tender. Store a durable replay/dedupe outcome with same command ID and payload hash. Reject command-ID mutation. If server detects stock or configuration conflict, preserve local cash evidence and create actionable `RECONCILIATION_REQUIRED`; **never erase a locally recorded cash receipt**.
- Project pending stock locally and show provisional balances; do not use fake settled figures in central reporting. When server confirms, collapse temporary local overlay without double deducting.
- Local cashier shift can collect cash offline, count cash locally and reconcile on reconnect. Closing remotely should not silently finalize a shift with unsynced sales. Prevent a new device/till from independently becoming offline cashier without explicit handoff and reconciliation.

**Offline identity/security**

- Provision only one specific enrolled checkout device for offline cash acceptance; signed, renewable device/outlet/role capability valid over configured shifts, no arbitrary one-sale/30-minute cap. Introduce V2 policy rather than widening v1 grants blindly.
- Secure offline reopening with a per-device local PIN/approved kiosk identity and cryptographically verifiable cached capability. Do not store raw credentials; secret keys remain server-side. Offline revocation is unknowable in real time, so constrain maximum lease duration, enforce local PIN lockouts, and reconcile activity on reconnection.
- Detect storage quota/storage eviction risk. Use `navigator.storage.persist()` where available, plus durable kiosk configuration and local encrypted recovery mechanisms if necessary. Local browser storage is not guaranteed durable through disk failure or profile deletion.

**Acceptance:** 100 varied offline cash sales across four-hour simulated outage, sequential order IDs, no unauthorized product-route filtering; 3 forced reloads; survive browser close/reopen with provisioned offline user; no lost/double cash and stock locally; cash drawer totals match; deduped replay; no second cashier enabled. Offline M-Pesa remains unverified; refunds, room charges and credit remain disabled offline unless separately approved.

## SPRINT 4: Automatic reconciliation and printing (P0/P1)

**Synchronization**

- Replace global blocking and one poisoned sequential queue with dependency-aware replay. Independent completed offline sales can proceed even when another sale enters review. Preserve within-order dependencies and local shift sequencing; never apply a payment without its order or ticket approval.
- Upon reconnect, use `commandStatus(id)` then replay identical payload+ID. Handle `CONFIRMED`, `RECEIVED`, `PROCESSING`, `REJECTED`, `CONFLICT`, `OUTCOME_UNKNOWN` individually. For HTTP timeout, retain same ID; do not silently produce a new `payment.record` ID.
- Recognize `navigator.onLine` as only a hint, not proof of API reachability; use authenticated API probe and retry with bounded jitter/backoff. Trigger on visibility, online and user request; periodic background work is best-effort only. UI shows `X locally recorded, Y pending, Z exceptions`.
- Reconcile cash, items, receipt numbering and stock. Idempotently issue official server documents only after confirmed central commit. Store local provisional slip identity, link final receipt and do not auto-print a second copy. Expose exportable local evidence for disaster recovery with privacy guardrails.
- Add a prominent but compact **Recovery / exceptions** panel accessible to cashier and manager. It must not block other independent cash sales. For unresolved cash already physically received, issue financial reconciliation workflow rather than losing transaction or treating failure as simple cancellation.
- KDS: during no internet, local cashier can print an order preparation ticket if local printer supports it. Waiter smartphones cannot auto-reach cashier/kitchen without LAN edge. No phantom station receipts.

**Acceptance:** API killed and restored; connectivity flapping; 100+ queue backlog; reboot between local commit and network send; server restarts after durable RECEIVE; replay 5x same IDs; rejected ticket approvals; sold sealed 750ml then count; sync after catalog price change; checksum/fiscal document reconciliation; independent ticket/status commands continue without deadlock.

## SPRINT 5: Release hardening and operations (P0)

- Add named CI suites: `pos2-cashier-ui`, `tickets-approval`, `offline-cash-ledger`, `offline-replay`, `backward-compatibility`, `schema-expand`, `PWA-update-pending-ledger`, `print-reconciliation`, `thermal-80mm-contract`, `thermal-80mm-visual-regression`, `thermal-80mm-physical-acceptance`. Use real PostgreSQL 16 integration, not mocked db only.
- Test all RBAC permutations against actual API, including waiter POST to restricted payment/fire/void routes.
- Keep old POS and API protocol operable while flags off. Existing 73 catalogue items, CSV import, inventory, rooms, till, payment, KDS and receipt behavior must remain intact.
- Run `npm run lint`, `npm run contracts:check`, `npm run architecture:check`, `npm run build`, `npm test`, `npm run test:api`, `npm run test:browser:api`, `npm run test:browser:production`, `npm run audit:ui:gate`, `npm run docs:check`; these integration tests require disposable PG and browser dependencies as described in `docs/testing.md`.
- Preserve the repository's five green CI jobs. Explicitly repair/test the upstream API Dockerfile: import full API module graph as `node` user and verify `/app/contracts/permissions.json` and `roles.json` are files beneath executable directories. Do not rely solely on the bespoke repair staged at `/opt/serveos-next`.
- Add operator help/tour updates, screenshot comparisons, accessibility smoke, kiosk full-screen, quick recovery card, universal 80 mm thermal receipt/ticket/report layouts and privacy/access logging.

---

# E. Release/test gates (MUST PASS IN ORDER)

### Requirement-to-sprint-and-gate matrix

Use these IDs in implementation reviews and release evidence. A mapping identifies where proof is required; it does not mark the requirement complete. Execute Sprint 0 ? 1 ? 2 ? 2B ? 3 ? 4 ? 5. Shared thermal/browser foundations introduced in Sprint 1 are completed in 2B before offline activation.

| ID | Requirement / authoritative section | Implementation milestone | Release gates / required evidence |
|---|---|---|---|
| R01 | Truthful payment display; same-ID recovery; per-aggregate blocking (?B, Sprint 0) | 0, 4 | G0, G1, G6: 900-KES projection and timed-out payment replay; one settlement |
| R02 | Products + bill + Pay; scanner; authorized advanced workflows (?A1?A2) | 1, 5 | G1, G5, G6: desktop/tablet/mobile, keyboard and legacy flag-off regression |
| R03 | Waiter proposal only; enrolled checkout authority; explicit approval (?A1, Sprint 2) | 2, 5 | G1, G5, G6: concurrent submissions, API 403, revision conflict, stock/fire once |
| R04 | Every physical output 80 mm; 72 mm default safe width; unknown type fails closed (?A4) | 1 foundations, 2B, 5 | G1, G5b: all-type contract and 1/15/100-item visual coverage; no A4 branch |
| R05 | Professional receipts, human references, historical snapshot integrity (?A5) | 1, 2B, 4 | G1, G5b, G6: number uniqueness, replay stability, legacy hash/reprint, QR before footer |
| R06 | Secure browser capability tiers and readable startup fallback (?A6) | 1, 2B, 3, 5 | G1, G5, G6: exact versions, supported modes, storage/crypto failure and real-device evidence |
| R07 | Atomic local cash/payment/stock/document/outbox ledger; integer money (?A2, Sprint 3) | 3 | G1, G3, G6: 100 sales/four hours, crash/reload, quota failure, matching drawer/stock |
| R08 | One offline cashier, signed lease, PIN, expiry and safe handoff (?A3, Sprint 3) | 3, 5 | G1, G6: second-device rejection, expiry/lockouts, offline reopening, no plaintext credentials |
| R09 | Dependency-aware reconciliation without losing received cash (?A2, Sprint 4) | 4 | G1, G6, G8: flapping API, 100+ backlog, same-ID replay, price/stock review, retained evidence |
| R10 | Auditable print delivery; no auto duplicate; approved station jobs only (?A4, Sprint 4) | 2, 2B, 4 | G5b, G6: KOT/BOT once, cancellation label, uncertain/reprint recovery; actual paper tests |
| R11 | Unverified external tender stays unverified; advanced offline actions excluded (?A2) | 1, 3, 4 | G1, G6: cash vs claimed reference, online-only room/credit/refund/override controls |
| R12 | Append-only schema; old/new API/PWA and legacy queue compatibility (?C2) | 2, 2B, 3, 5 | G1, G3, G4, G8: restored DB, locks, checksums, exact old-command replay |
| R13 | Server flags OFF by default; disable creation but retain reconciliation (?C1) | 1?5 | G1, G6, G8: cohort/role/device enforcement and kill-switch replay |
| R14 | Safe PWA update, modern/legacy cache assets, no ledger wipe (?A6, ?H5) | 2B, 3, 5 | G5, G6, G8: waiting SW, nonempty outbox, restart and bundle rollback |
| R15 | Root contracts in nonroot API image; target-aware deployer (?B, ?H0) | 5 before release | G1, G2, G4: full module imports, file traversal, topology rejection and staging rehearsal |
| R16 | Current-business backup/restore, isolated staging, reversible ServOS-only switch (?F?H) | 0 baseline, 5 operations | G0-G8: off-VPS restore, exact digests, isolated ports/volume, approval and rollback |
| R17 | Preserve SMS/Details hosts, production records and operator workflows (?H7, ?J) | Every milestone | G0, G7, G8: before/after host checks and browser workflows; no unrelated modifications |
| R18 | Physical printer and fiscal acceptance are separate from software success (?A4?A5) | 2B, 5 / operator acceptance | G6: model/driver, clipping, 2m+ roll, QR/cutter and approver; fiscal evidence separate |

**Additional hard gates:** 80 mm profile enforcement across every physical print action; no UUID clutter or misleading payment status on customer receipts; concurrent short-reference uniqueness with historic document compatibility; real browser-matrix checks + friendly unsupported-engine fallback; no partial offline sale when IndexedDB, WebCrypto or trusted storage is unavailable. Include these test results and printer/browser evidence in every release record.


| Gate | Condition | Stop if |
|---|---|---|
| G0 Baseline | Live 3102 health, actual Nginx routing, source SHA/image ID, pending sync counts documented; fresh business DB backup + off-VPS restore verified | Any pending financial command unresolved or live health unhealthy |
| G1 Source | Feature branch committed; CI green; code review; signed build manifest; old UI/commands backward-compatible | Broken tests, permission regression, missed contract files |
| G2 Staging | Dedicated `serveos-stage` Compose project, isolated DB volume, ports 3202/3203 bound to loopback; synthetic business data | Any staging component shares live database or overwrites live files |
| G3 Migration | Restored staging DB tests; expand-only migration checks; old/new binaries against migrated schema | Irreversible migration, excessive locks, rollback incompatibility |
| G4 Candidate API | Image built, canary at unused loopback 3103, no public route; healthy, active binary migration names/checksums verified | Wrong DB/secret, no health, fails origin/auth checks |
| G5 UI staging | Candidate PWA release under new immutable directory, exact assets+API compatibility verified, test staff workflows | Missing assets, stale SW, uncaught browser exceptions |
| G5b Thermal-print contract | Every printable type exactly 80 mm thermal, long reports reflow, QR/footer/margins verified, no A4 fallback, approved-ticket KOT/BOT idempotence | Any printable type uses A4/Letter, truncates totals, misplaces QR, or creates duplicate station ticket |
| G6 Internal pilot | Feature flags ON only authorized test/cohort; one terminal; waiter ticket and 100-offline-sales test; actual 80 mm printer smoke for printing acceptance | Lost/duplicate payments, unapproved stock consumption, wrong balances, physical clipping/failed QR scan |
| G7 Controlled switch | Change only ServOS web symlink and API proxy target; test HTTPS, SMS hosts, DB, staff workflows | Any unrelated host fails or new routes return incorrect release |
| G8 Retention | Keep previous live API image/config and old PWA release; keep migrations additive; retain pending queue for replay | Any attempted deletion or cache clear with pending transactions |

**Gate interpretation:** G5b software layout acceptance is mandatory even when physical printing is disabled. If hardware acceptance is unavailable, record G6 printing as `NOT_RUN`, keep direct printing disabled, and explicitly limit the approved rollout to the accepted non-printing capabilities. Do not label the complete printing release or definition of done accepted. Fiscal acceptance remains a separate evidence item. G7 requires explicit deployment approval after the applicable gates; approval of this documentation task is not deployment approval.

**Health 200 and green CI are necessary but not sufficient:** business-flow and recovery tests must also pass.

---

# F. VPS: safe preflight (READ ONLY, run before every release)

From **Windows PowerShell**, use discrete SSH commands (no heredoc CRLF issues):

```powershell
$server = 'administrator@93.127.131.55'
$key = "$env:USERPROFILE\.ssh\id_ed25519"

ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker compose ls --all'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker volume ls'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n nginx -t'
ssh -T -o BatchMode=yes -i $key $server 'curl -fsS --max-time 10 http://127.0.0.1:3102/health/ready'
ssh -T -o BatchMode=yes -i $key $server 'readlink -f /var/www/serveos-next/current'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n docker inspect serveos-next-api-1 --format "{{.Image}} {{.State.Status}} {{.State.Health.Status}}"'
ssh -T -o BatchMode=yes -i $key $server 'sudo -n grep -E "root /var/www/serveos|proxy_pass http://127.0.0.1:31" /etc/nginx/sites-enabled/serveos-production'
```

Separate each of the three unrelated HTTPS origin checks and record the HTTP response. Site 200 and SMS 307 (login redirect) were prior baseline, but measure again:

```powershell
ssh -T -i $key $server 'for h in detailskilonzo.com sms.detailskilonzo.com africa.detailskilonzo.com; do printf "%s " "$h"; curl -sS -o /dev/null -w "%{http_code} SSL:%{ssl_verify_result}\n" --resolve "$h:443:127.0.0.1" "https://$h/"; done'
```

For complete login/session verification use browser tests, because 307 alone doesn't prove SMS service health. Capture API and PWA source SHA/digests, Nginx active config checksum, env *variable names only* (no values), count of pending/unknown commands by status, live backup evidence. Never print credentials or bearer tokens to the terminal transcript.

**DO NOT continue if live accounting transactions are pending and the planned change touches their protocol or stored IndexedDB schema.** Drain/reconcile them first, or test exact old-command replay against the candidate API while both APIs remain available.

---

# G. Non-destructive staging on the existing VPS

Prepare a **new** staging project, never reuse the production Compose project or volume:

```
/opt/serveos-stage/           # isolated git/source + compose + private credentials
/var/www/serveos-stage/      # staged test PWA files
serveos-stage-postgres       # distinct container
serveos_stage_data           # distinct database volume
127.0.0.1:3202              # suggested staging API (check free)
127.0.0.1:3203              # suggested staging web server (check free)
```

- Use PostgreSQL 16 and Node 22. Source = exact candidate git SHA.
- Stage DB contains **synthetic or sanitized data only**, never production credentials. If using a restored production copy, restrict users, anonymize sensitive personal data, prevent SMS/email/M-Pesa transmissions, ensure workers and cron are disabled, and do not expose it on the public internet.
- Source checkout and Docker build contexts must be separate and mode-safe; correct upstream Dockerfile to include root permission contracts. Containers run unprivileged; preflight module imports as `node`.
- Build stage PWA with API origin **staging API**. DO NOT point stage PWA at the live `serveosapi.davemusau.co.ke`. The current API enforces a fixed `WEB_ORIGIN`; for SSH tunneled local staging use that actual local PWA origin (e.g. `http://127.0.0.1:3203`) and API `http://127.0.0.1:3202` as explicitly configured; test cookies/CORS/session and SW. Alternatively use dedicated correctly TLS-provisioned staging subdomains, only after separately authorizing their DNS and Nginx config.
- `ssh -L 3202:127.0.0.1:3202 -L 3203:127.0.0.1:3203` from developer workstation can expose staging services locally without opening VPS public ports. Never point the production PWA at 3202.
- Run full user flows, real API+PG integration, controlled worker settings, browser offline simulation and stable replay testing. Keep staging separated by project/volume/network and no public host by default.

---

# H. Production deployment sequence: no blind overwrite

## H0. DO NOT USE RETIRED DEPLOYER

`Deploy-ServOSProductionFeatures.ps1 -Mode Pwa` currently hardcodes `/var/www/serveos-prod`. Other modes use `serveos-prod-api-1` and port 3101. **It is not suitable for your successful `serveos-next` installation without refactoring and testing.** Do not execute it as-is. Change to required `-TargetEnvironment ServeosNext` or parameterized `-WebRoot -ComposeProject -ApiPort -ComposeFile`, validate against an explicit allowlist and fail closed if the current symlink or current virtual host doesn't match expected baseline. No silent fallback to old paths.

The source reports an on-VPS API image using a locally repaired staged build context because the repository API Dockerfile omitted required root permission JSON files. The first deployment task must commit the upstream Dockerfile correction and test the new image in staging. Otherwise the next production build can reintroduce `ERR_MODULE_NOT_FOUND` for `/app/contracts/permissions.json`.

## H1. Snapshot the **NEW LIVE** business, not the discarded old instance

The user explicitly chose not to preserve the *old* `serveos-prod` business database. This does NOT authorize risking data now being created in *new live* `serveos-next`.

Before releasing new code or schema:

- Read-only record `serveos-next` current container/image IDs, current DB migration names, business identity and representative totals, PWA release symlink, Nginx config checksum, queue and current POS order states.
- Take a consistent `pg_dump -Fc` of **new** database, verify `pg_restore -l`, copy encrypted off VPS, restore to a temporary isolated DB, and verify representative business totals. Keep database credentials private.
- Do not copy live `.env` into logs or upload it to GitHub. Keep at least 2 independently restorable generations of current business records.
- Confirm current cashier shift, order, ticket and payment state; pause only the affected high-risk writes briefly if essential for a migration, never assume quiet operation.

## H2. Publish expand-only SQL migrations

- Test against a staging restore first. All new objects use independent UUIDs, business scoping, unique command IDs and indexes. Establish a schema-compatibility test demonstrating the current production API still works **after** the migration.
- Production migrations run against the verified existing `serveos-next` database ONLY, with explicit confirmation and observed timing. Never use `db push` against a legacy Supabase project or volume recreation.
- Migrations are *not* rolled back by switching a PWA symlink or reverting the API Docker image. Recover via additive fix-forward migration wherever possible; DB restore is a separate business recovery decision requiring reconciliation of writes that occurred since snapshot.

## H3. Deploy canary API separately (blue/green)

- Build candidate immutable Node image by git SHA and Docker image digest. Configure a **separate container/service** (`serveos-pos2-canary-api`) on loopback port **3103** (only after port check), using the same intended production DB *only after compatible schema migration*, and the proper existing Docker private network. Keep original `serveos-next-api-1` alive on 3102.
- Candidate must not run migrations automatically on web requests, generate data on boot or start jobs that duplicate processing; if necessary use read-only validation until cutover. Restrict canary endpoint to loopback and keep its credentials root-only.
- First test with isolated staging DB. Then on production canary, test `/health/ready`, login/session, RBAC, GET projections and synthetic non-mutating checks. Do not run example sales against live business or issue duplicate print jobs.
- **Do not directly attach an untrusted container to the live database without passing the source/CI/restore/compatibility gates.**

## H4. Switch API route with verified rollback

- Current site: `/etc/nginx/sites-enabled/serveos-production`; expected production API proxies currently target `127.0.0.1:3102` (confirm live).
- Prior to changes, copy that one Nginx site file into an owned, restricted, timestamped release checkpoint. Preserve all certificate directives and all unrelated enabled sites.
- Edit **only** the two `proxy_pass http://127.0.0.1:3102;` lines belonging to the ServeOS API virtual host, including `/v1/sync/stream`, to `127.0.0.1:3103`. Fail if expected exact count/host does not match; never blanket replace every 31xx port across `/etc/nginx/`.
- Run `sudo nginx -t`; only then `sudo systemctl reload nginx` (graceful). Check serveos website, serveos API, SMS hosts, Details Kilonzo, and browser origin/CORS. Retain 3102 API and its image as an immediate route fallback while schema remains old-compatible.
- For rollout where changing API is unnecessary, skip API switch and deploy only a compatible PWA.

## H5. Stage and atomically switch PWA

- Build production PWA with `VITE_API_URL=https://serveosapi.davemusau.co.ke` and correct public verification keys; **never** ship signing private keys in the bundle. Confirm new feature flags OFF at first. Inspect the built legacy chunk/script graph if legacy mode is enabled; assert the SW precaches all required runtime and print assets for supported browser tiers. Do not activate an offline mode that cannot pass the terminal compatibility gate.
- Build from clean committed worktree; use `npm run build`, `npm run release:pwa:package`. The existing `scripts/package-pwa-release.mjs` creates SHA-bound SHA-256 manifest. Refactor target-aware web deployer to accept `serveos-next` root; it must verify archive paths/file hashes and immutable target release.
- Copy immutable build into `/var/www/serveos-next/releases/<candidate-git-sha>`. Do not overwrite existing directories, and make sure Nginx can traverse/read all asset paths.
- Preflight `readlink -f /var/www/serveos-next/current` and confirm expected previous release. Atomically replace **only** this symlink after checks; preserve previous symlink target in release record. Do not use `rm -rf` on existing releases.
- Probe production page, exact hashed **modern and legacy** JS/CSS referenced by current `index.html`, `/sw.js`, `/manifest.webmanifest`, API readiness, CORS preflight, login flow, thermal receipt preview and cashier test business. Avoid clearing service-worker caches when pending commands exist. SW update must wait for durable local financial outbox and safe restart boundary.
- After new release is stable, enable **one feature cohort at a time** via server-configured flags; verify and only then expand to Countryside operators.

## H6. Rollback matrix

| Symptom | Immediate action | Notes |
|---|---|---|
| POS UI broken but API compatible | Disable `pos2.simpleCashier`, or atomically point PWA current symlink back to known-good bundle | Service worker may retain old/new caches; do not clear local IndexedDB. |
| Ticket approvals faulty | Disable **new ticket creation/approval** flag; continue legacy sales and preserve submitted tickets for repair | Do not delete ticket rows. |
| Offline ledger faulty | Disable **creation** of new offline sales; keep sync decoder, replay and recovery enabled | Never orphan recorded cash entries. |
| API error after switch | Restore only ServOS API `proxy_pass` from 3103 to 3102, validate and gracefully reload Nginx | Safe only if older API accepts migrated schema and pending command protocol. |
| Migration introduced incompatibility | Stop rollout, perform additive fix-forward; use restored DB only as explicitly approved disaster recovery | PWA symlink rollback does not revert PostgreSQL schema or transactions. |
| Failed unrelated-host baseline | Immediately restore only ServOS site checkpoint; verify why Nginx reload impacted unrelated host | Never restart/uninstall other Docker projects. |
| Printed document outcome unknown | Audit print evidence; ask operator to confirm physical output before retry | No automatic duplicate prints. |

**Rollback is not simply deleting the new API.** Business transactions committed after a candidate goes live must not disappear if old code is reinstated. Feature rollout must tolerate mixed versions and retained offline commands.

## H7. No-destruction list

Never use on this VPS during this sprint:

```
docker compose down -v
docker system prune -a --volumes
docker volume prune
docker rm -f $(docker ps -aq)
docker stop $(docker ps -q)
sudo rm -rf /opt/serveos-next
sudo rm -rf /var/www/serveos-next
git reset --hard     # in a workspace with local work
```

Never modify or remove `sms-platform`, `sms-platform-africa`, their Docker volumes/networks, their `.env` files, or Nginx sites `details`, `sms`, `africa-sms`. Avoid global `systemctl restart docker`; use per-project changes and graceful Nginx reload only after validation.

---

# I. Concrete verification commands for developer

Developer, from clean branch with correct test PostgreSQL configured:

```powershell
npm ci
npm ci --prefix apps/api
npm run lint
npm run contracts:check
npm run architecture:check
npm run build
npm test
npm run audit:ui:gate
npm run docs:check
# Only with a disposable PostgreSQL 16 in TEST_DATABASE_URL and Playwright installed:
npm run test:api
npm run test:browser:api
npm run test:browser:production
```

**Add test cases** for dedicated device: cashier vs waiter roles; ticket idempotency; `order.fire` once; BAR/KITCHEN prep tickets once; no stock consumption preapproval; 900 KES cash paid display; pending sync UI; 100 offline sales; 100 replays; browser process crash; partial network restoration; cached identity and expired capability; stock ml precision; SW version update while queue nonempty; receipt duplicate protection; universal 80 mm profiles for all document types; no raw UUID clutter on cashier/printed receipt; collision-free human identifiers with old document compatibility; long-report wrapping; QR before footer; KOT/BOT reprint idempotency; current/older browser render and safe capability fallback; SW legacy chunk caching; old/new API compatibility.

Release information to paste into PR/release record:

```
release_sha=<40hex>
ci_run=<url>
api_image_digest=<sha256>
pwa_manifest_sha256=<sha256>
prod_migration_before=<name>
prod_migration_after=<name>
backend_health=<expected/applied>
preflight_sms_status=<codes>
preflight_details_status=<code>
prod_backup_restored=<YES + evidence>
staging_acceptance=<PASS + evidence>
cashier_pilot_transactions=<count>
replay_duplicates=<measured count + evidence; required 0>
pending_unresolved_cash=<measured count + evidence; required 0 for activation>
rollback_pwa=<path>
rollback_api=<image and loopback port>
feature_flags=<values>
printed_uuid_regression=<NOT_RUN / PASS / FAIL + evidence>
short_reference_collision_test=<NOT_RUN / PASS / FAIL + evidence>
thermal_80mm_all_types=<NOT_RUN / PASS / FAIL + evidence>
old_browser_matrix=<tested versions + mode/evidence>
unsupported_browser_fallback=<NOT_RUN / PASS / FAIL + evidence>
operator_approver=<name/role>
thermal_physical_acceptance=<NOT_RUN / PASS / FAIL + model, driver, measurements, evidence>
fiscal_acceptance=<NOT_RUN / PASS / FAIL + evidence>
direct_printing_enabled=<true / false; false until physical acceptance>
release_approval=<PENDING / APPROVED + approver, scope, timestamp>
```

---

# J. One-page developer implementation rules

1. **Reuse** existing `pos-commands`, `payment-commands`, inventory pricing, KDS, `command-kernel` and PostgreSQL transaction model. Add only the commands/data required for tickets and single-device offline receipts. No second parallel billing engine.
2. **Waiter ticket is not a sale** until the cashier approves; approval is exactly-once and initiates existing fire/stock/KDS logic. No waiter permissions for settlement.
3. **One enrolled offline cashier terminal** holds local operational continuity; other devices are ticket clients (online) or local draft holders (offline).
4. The cashier's main screen is **products + bill + Pay**, not a vertical aggregation of ten admin modules. Make it genuinely operable in 1366x768 and 1024x768, including scanner.
5. Money and stock must reconcile by stable UUIDs and explicit status. Never say `confirmed` based on a saved local command or optimistic UI notification.
6. Preserve old protocols/UI while flags are off. No destructive migrations or schema rewrite. Do not introduce client cache wipes.
7. Stage with **separate database and API**, validate with real Postgres and production-like browser tests, only then canary the API and atomically switch ServOS routes.
8. Never use the current hardcoded `serveos-prod` deploy script to update `serveos-next`; parameterize, preflight and rehearse it first.
9. **Every physically printed ServOS document uses an 80 mm thermal roll**. No A4/default-wide fallback for receipts, tickets, stock, reports, hotel, supplier or finance. Enforce §A4 with render/print tests and device acceptance. **Production remains open and usable** until the complete successor passes business verification. A green CI check alone is not permission to cut over.
10. **Hide raw UUIDs and unnecessary technical copy** from customer receipts, waiter/cashier pages and everyday printed reports. Preserve original document identifiers, references and immutable hashes in the backend. Each type has a simple semantic thermal layout; supplier/legal/fiscal identifiers are retained where required. See §A5.
11. **Old browsers:** prove support per exact browser version using a compatibility matrix. Legacy Vite bundles can improve reach but must never bypass IndexedDB, WebCrypto or safe session/storage requirements. Unsupported engines receive readable upgrade instructions. See §A6.
12. Never touch the unrelated SMS projects or Details Kilonzo website; measure their health before and after release.

## Definition of done

At Countryside a waiter submits a ticket, the cashier approves it, the bar/kitchen receives the appropriate items once, a cashier takes cash and gets correct change, sales survive hours of API downtime on the single checkout terminal, then reconcile automatically without data loss or duplicates. The POS has no superfluous scrolling to finish ordinary sales, customer slips and operational printouts show concise human references without raw UUID clutter, every printed document is 80 mm thermal, tested older browsers have a safe supported mode or clear upgrade notice rather than a blank screen, and all pre-existing production systems and records remain intact. Any necessary caveat about physical printer evidence, fiscal receipt compliance or offline M-Pesa confirmation is explicit rather than disguised as a passed test.

### Completion checklist and acceptance evidence

All items start unchecked. Set a checkbox only when its requirement has passed with an accessible evidence artifact. Use `NOT_RUN`, `IN_PROGRESS`, `PASS`, `FAIL` or `BLOCKED` in the release record; omitted evidence is `NOT_RUN`. Hardware, fiscal and exact-browser tests cannot be inferred from CI, a preview or an OS print dialog.

| Complete | Requirement | Evidence to attach before checking |
|---|---|---|
| [ ] | R01 payment trustworthiness | Command IDs/payload hashes, projection assertions, retry trace and one-settlement count |
| [ ] | R02 cashier ergonomics and legacy workflows | Viewport captures, scanner/keyboard/a11y results, cash/M-Pesa/split/room/credit and flag-off regression |
| [ ] | R03 waiter ticket authority | Real PG/API role matrix, concurrent approval trace, stock/KDS/print effects, stale revision outcome |
| [ ] | R04 universal thermal geometry | Explicit type inventory, print-entrypoint audit, contract/visual suite, long values/reports and unknown-type rejection |
| [ ] | R05 document identity and fidelity | Concurrency/replay number tests, old snapshot hashes/reprints, UUID scan exceptions, totals/tax/tender fixtures |
| [ ] | R06 browser support | Exact browser/OS/device versions, Full/Online only/Unsupported modes, startup fallback and financial capability tests |
| [ ] | R07 local cash ledger | 100-sale/four-hour log, local totals/stock, transaction failure/crash/reload/quota evidence |
| [ ] | R08 offline authorization | Enrollment/lease policy, one-device tests, expiry/PIN lockout/reopening and credential-storage audit |
| [ ] | R09 reconciliation and disaster recovery | Backlog/replay/flapping/restart traces, duplicate count, price/stock exceptions and protected evidence export |
| [ ] | R10 print lifecycle | Stable job IDs, approved KOT/BOT once, cancel/reprint and delivery-uncertainty results; retries do not repeat sale |
| [ ] | R11 tender and online-only limits | Unverified reference tests and offline room/credit/refund/override denial evidence |
| [ ] | R12 schema and mixed-version compatibility | Candidate migration manifest/checksums, restored DB results, lock timing, old/new binaries and queued legacy replay |
| [ ] | R13 flags and rollback cohort | Effective server flag values by device/role/outlet; creation disabled with existing replay still working |
| [ ] | R14 PWA update safety | Modern/legacy asset manifest, waiting-worker test with pending cash, restart/rollback with IndexedDB retained |
| [ ] | R15 packaging and deployment tooling | Nonroot image import logs, image digest, root contract paths, deployer allowlist and isolated rehearsal |
| [ ] | R16 backup and deployment gates | Two restorable backup generations, off-VPS restore/totals, G0-G8 records, scoped approval and rollback targets |
| [ ] | R17 protected systems and data | Baseline/post-switch HTTPS and browser checks, preserved business identity/data/workflows and narrow change record |
| [ ] | R18 physical thermal printing | Actual model/driver/preset, 80 mm roll, measured safe width, 2m+ output, QR scan, feed/cut, restart/reprint and operator sign-off |
| [ ] | Fiscal receipt acceptance | Applicable fiscal verification evidence and approver; retain provisional/non-fiscal labels until accepted |
| [ ] | Complete definition of done | Countryside end-to-end waiter -> cashier -> preparation -> offline cash -> reconciliation evidence, with every applicable row accepted |

Use this evidence record for each requirement and gate; keep credentials and private customer data out of artifacts:

```text
requirement_or_gate=<R01..R18 / fiscal / G0..G8 including G5b>
status=NOT_RUN
candidate_sha=<40hex>
environment=<local / disposable PG / staging / production / physical device>
api_image_digest=<digest or not applicable>
pwa_manifest_sha256=<digest or not applicable>
browser_os_device=<exact versions or not applicable>
test_or_rehearsal=<command / scenario>
artifact=<path or restricted evidence link>
expected_result=<acceptance criterion>
observed_result=<actual result; never prefill PASS>
unresolved_commands=<count and protected audit references>
limitations=<unverified hardware, fiscal or other boundaries>
owner=<name / role>
reviewer_or_operator=<name / role>
recorded_at=<timestamp with timezone>
approval_scope=<accepted capabilities; deployment approval recorded separately>
```

This checklist records future implementation and acceptance. The consolidation itself completes documentation only; it does not check any business-release item.
