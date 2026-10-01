ServOS DEV FINAL SPRINT — Revision 3 Receipt / M-Pesa Till QR Patch
Repository: davemusau00/SERVEOS-WEB
Reviewed main: eb3b6a1528f1a62140aad6a5b5e3d489d7f6a2c5
Reviewed time: 1 October 2026, 17:03:50 EAT
Purpose: Update the active DEV-FINAL-SPRINT.MD receipt workstream after the latest receipt-branding implementation and add the new M-Pesa Till payment QR requirement.
This patch is written to replace the active receipt audit / FS-06 wording in DEV-FINAL-SPRINT.MD. The GitHub integration was able to read the repository but returned HTTP 403 when asked to write the update directly.

Repo-grounded receipt state
The receipt system has moved materially beyond the older sprint baseline.
Current main now contains:
- fixed four-line KINGSFORGE receipt attribution;
- friendly R-xxxxxx receipt and ORD-xxxxxx order numbering for schema-v2 receipts;
- customer-name and manual M-Pesa-reference receipt snapshots;
- App emblem and Receipt logo settings on the installed terminal;
- staged Web receipt-branding settings;
- deterministic browser preparation of bounded display + monochrome thermal logo assets;
- immutable receipt branding snapshots;
- shared receipt rendering for customer/business copies;
- selected-receipt Web print root;
- direct ESC/POS logo output;
- configurable receipt paper columns;
- configurable maximum thermal logo width;
- configurable receiptFeedLines between 2 and 12;
- cutter handling and final feed safety.
The main new receipt feature gap is now M-Pesa Till QR support plus physical XP-80T acceptance, rather than basic receipt-branding infrastructure.
Replacement receipt ordering decision
The customer receipt should render in this order:
1. Centred business identity, contact details, service area and CUSTOMER COPY label.
2. Friendly receipt/order number; local date/time; cashier; table/tab/room and customer where applicable.
3. Item description, portion/modifiers; aligned quantity, unit price and amount.
4. Subtotal, discounts, actual tax/levy where applicable and prominent TOTAL.
5. Tender amounts, manually recorded M-Pesa transaction reference where applicable, cash tendered/change, paid and balance.
6. Configurable business thank-you.
7. Optional centred M-Pesa Till payment QR.
8. Fixed four-line KINGSFORGE attribution footer.
9. Configured customer-facing receipt logo.
10. Blank feed/cutter buffer.
The Till QR is therefore at the bottom of the transactional receipt immediately before the fixed footer.
The business record copy should omit the Till QR and customer-facing receipt logo unless a later explicit requirement changes that rule.
Fixed attribution remains:
Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440
FS-06 — Receipts, branding, M-Pesa Till QR and thermal output
Priority: P0 for handover.
Owner: frontend / native / domain / QA.
Dependencies: FS-02, FS-04.
Status: substantial receipt implementation landed; Till QR + physical acceptance remain.
06.1 Preserve the current receipt work
Do not regress the receipt capabilities now present on main:
- schema-v2 friendly receipt/order numbering;
- immutable receipt branding snapshots;
- customer-name and M-Pesa-reference capture;
- fixed KINGSFORGE footer;
- selected-receipt print isolation;
- receipt-logo upload/default/remove;
- browser-to-thermal image preparation;
- direct ESC/POS image output;
- configurable feed lines;
- customer/business copy separation;
- old-receipt reprint preserving its historical branding.
The QR feature must extend this architecture rather than bypass it.
06.2 M-Pesa Till QR settings
Add an optional M-Pesa Till payment QR in the Admin-authorized business/receipt settings flow.
Implement the same capability in:
- installed Terminal settings;
- staged Web business settings.
Required operator actions:
- Upload QR.
- Preview QR.
- Replace QR.
- Remove QR.
- Enable/disable Show on customer receipt.
- Show the configured Till/account label where available.
- Save with normal version/conflict protection.
Use an official uploaded business M-Pesa Till QR image as the normal path.
Do not fabricate a Safaricom/M-Pesa QR payload from a Till number unless a verified provider QR specification is deliberately implemented later.
The QR is a payment convenience. It must never be presented as proof that M-Pesa funds were received or provider-confirmed.
06.3 Suggested settings/snapshot contract
Extend receipt settings and the immutable ReceiptBrandingSnapshot with a QR object, for example:
brandingSnapshot
├── version
├── footerLines
├── receiptLogoDataUrl
├── thermalLogo
└── mpesaTillQr
    ├── enabled
    ├── label
    ├── tillNumber?          # only when already configured and appropriate to display
    ├── dataUrl
    └── thermalRaster
        ├── width
        ├── height
        └── base64
Changing, disabling or deleting the current QR must affect future receipts only.
An old receipt must reprint using the QR snapshot that belonged to that receipt version.
Do not look up the current QR at reprint time.
06.4 QR-specific image preparation
Do not process the Till QR exactly like a photographic logo.
Create a QR-specific preparation path with these rules:
- require a valid square QR source;
- normalize to black/white for thermal output;
- preserve crisp module edges;
- do not use photographic dithering over QR modules;
- preserve at least a four-module quiet zone inside the QR image;
- preserve aspect ratio;
- bound source dimensions and encoded data size;
- reject malformed, empty or non-square input;
- never crop to satisfy printer width;
- prevent user image data from becoming raw printer control bytes.
If useful, the normal receipt logo and QR may share safe image-loading infrastructure, but their raster algorithms and acceptance criteria should remain distinct.
06.5 Print-safe QR sizing and margins
The current receipt CSS uses a validated 74mm content area on 80mm paper.
QR placement must stay safely within it.
Target the printed QR at roughly 30–36mm square unless physical XP-80T testing establishes a better size.
Required whitespace:
- minimum four-module internal QR quiet zone;
- approximately 3mm or more outer visual clearance around the QR block in browser/OS print;
- explicit blank raster rows / line spacing before and after QR on direct ESC/POS;
- QR must not touch item totals, footer text, logo, paper edge or cutter region.
The existing final cutter feed remains after the footer + receipt logo.
Do not use the cutter-feed area as the QR's bottom margin.
06.6 Customer-only placement
Customer copy:
transaction content
↓
thank-you
↓
M-PESA TILL QR   [optional]
↓
KINGSFORGE footer
↓
receipt logo     [optional]
↓
feed margin
↓
cut
Business record copy:
transaction content
↓
business/audit detail
↓
KINGSFORGE footer
↓
feed margin
↓
cut
No Till QR on the business copy by default.
06.7 Receipt commit semantics
QR rendering must never be a dependency of payment completion.
At payment commit:
1. complete financial transaction;
2. persist immutable receipt document;
3. snapshot current QR/branding state into the receipt;
4. queue/display printing separately.
If QR conversion/printing fails:
- payment remains committed;
- receipt remains valid;
- system reports QR/printing failure explicitly;
- operator can reprint from the same immutable receipt;
- fallback must not silently substitute today's QR for historical receipt data.
06.8 Web/HTML/text parity
Update all receipt paths together.
At minimum:
- ReceiptDocumentView
- selected Web receipt print root
- receipt download/text formatter
- Native receipt dialog
- Native receipt text generation
- ESC/POS direct printer path
Text-only output should say something like:
M-Pesa Till QR: included on customer print
when useful for a non-image representation.
Never dump QR base64 into text output.
06.9 Thermal ESC/POS rendering
For direct ESC/POS output:
- center QR raster;
- print explicit blank rows before and after it;
- keep within actual printer dot width;
- print QR before the fixed footer;
- print customer receipt logo after footer;
- apply configured final feed only after final customer-facing content;
- keep automatic cut behavior independent of QR presence.
SENT still means the printer transport accepted bytes. It does not prove the QR is physically readable.
06.10 Settings UX touchpoints
Current source already has:
- Business branding and receipt logo;
- Payment methods;
- primary M-Pesa account input;
- Till and printer.
Recommended UX:
Business branding and receipt
- App emblem
- Receipt logo
- M-Pesa Till QR
- Show QR on customer receipt
- QR preview
- Replace / Remove
Payment methods
- M-Pesa enabled
- Primary M-Pesa account / Till number
Avoid asking the operator to enter the same Till identifier twice.
06.11 Code touchpoints
Expected implementation touchpoints include:
src/types/receipt.ts
src/receipts/branding.ts
src/receipts/ReceiptBrandingEditor.tsx
src/components/pos/ReceiptDocumentView.tsx
src/receipts/format.ts

src/native/NativeSettingsPanel.tsx
src/native/NativeReceiptDialog.tsx

src/runtime/web/WebAdministrationView.tsx
src/runtime/web/WebPosView.tsx

src-tauri/src/receipts.rs
src-tauri/src/printer.rs
src-tauri/src/store.rs

supabase/expansion/
docs/RECEIPT_SPEC.md
docs/RECIEPT-PRINCIPLES.md
docs/RECEIPT_BRANDING_SETUP.md
docs/user-guide/33-receipts-settings.md

tests/receipt-branding-source.test.mjs
tests/browser/preview.spec.ts
tests/browser/transactions.spec.ts
tests/supabase/pos.sql
native-tests / desktop receipt-printer tests
Prefer a new additive migration after the current 043_receipt_branding_snapshots.sql rather than rewriting an already-shipped migration if 043 has been applied anywhere outside disposable development environments.
06.12 Automated acceptance
Required tests:
1. No QR configured → receipt remains valid.
2. QR configured but disabled → omitted.
3. QR configured + enabled → customer copy contains QR.
4. Business copy omits QR.
5. QR appears after thank-you and before footer.
6. Footer remains before receipt logo.
7. Final feed remains after footer/logo.
8. Replacing QR affects new receipts only.
9. Removing QR affects new receipts only.
10. Historical receipt reprint retains old QR.
11. Malformed QR rejected.
12. Non-square QR rejected or safely normalized only if decoder validation proves it remains valid.
13. Oversized QR rejected.
14. QR thermal raster width remains inside printer profile.
15. Quiet zone is retained.
16. Long receipt cannot clip QR/footer/logo.
17. M-Pesa payment reference and Till QR can coexist without conflating the two.
18. QR presence does not change receipt totals.
19. QR failure does not roll back payment.
20. Stale settings write conflicts safely.
21. Native and Web receipt snapshots use equivalent QR semantics.
22. Text/download output does not leak raw image data.
06.13 Physical XP-80T acceptance
On the actual packaged Windows terminal:
- print Cash customer/business copies;
- print M-Pesa customer/business copies;
- print a long multi-item receipt;
- print with QR enabled;
- print with logo + QR together;
- verify left/right edges are not clipped;
- verify QR has visible quiet space;
- verify footer is readable;
- verify logo is readable;
- verify final feed leaves safe paper below content;
- verify cutter does not touch QR/footer/logo;
- scan the printed Till QR successfully multiple consecutive times using a normal phone/M-Pesa scanning path;
- power/restart printer and reprint the same historical receipt;
- confirm historical QR and branding are unchanged.
Retain:
- receipt IDs;
- printer profile;
- queue/driver details;
- accepted QR print size;
- accepted receiptFeedLines value;
- photos of customer and business copies.
06.14 Definition of done
FS-06 closes only when:
- Admin can configure the M-Pesa Till QR without editing receipt templates;
- Terminal and staged Web use the same business meaning;
- receipt commit snapshots the QR immutably;
- QR is customer-copy only;
- QR sits at the bottom before the footer;
- QR has scan-safe margins/quiet zone;
- footer + logo + cutter spacing remain correct;
- no-QR fallback is clean;
- QR never represents provider payment confirmation;
- old receipts reprint with old QR;
- actual XP-80T paper output scans reliably.
Sprint priority impact
This is not a new independent module. It belongs inside existing FS-06.
Recommended immediate order:
FS-01 / FS-02        release-green baseline
        ↓
FS-04                command outcome safety
        ↓
FS-06A               retain current receipt branding implementation
        ↓
FS-06B               add M-Pesa Till QR settings + immutable snapshot
        ↓
FS-06C               shared HTML/text/ESC-POS rendering
        ↓
FS-06D               QR margin / quiet-zone / cutter tests
        ↓
FS-06E               physical XP-80T scan acceptance
        ↓
FS-14                complete POS/financial-shift acceptance
        ↓
FS-23 / FS-24        fresh terminal commissioning + go-live rehearsal
The QR should not delay unrelated domain repair, but physical receipt acceptance cannot close until the QR + logo + footer + cutter stack has been proven together on the actual printer.

I’d put ServOS source/product completion at roughly 90%, but production readiness lower at about 80–84%.
The distinction matters. The software has most of its organs now. What remains is increasingly about making sure they all share one bloodstream. 🧾⚙️
Area	Current completion	State
Native/Terminal domain implementation	~95%	Very high
PostgreSQL/Supabase v2 backend	~92%	Very high
Web operational parity	~83%	High, edge gaps remain
Core business feature implementation	~91%	Most major domains exist
UX/workflow hardening	~82–86%	Command outcomes improved substantially
Automated release verification	~85%	Most CI green, desktop still red
Physical terminal acceptance	~65–70%	Printer/scanner/fresh install/full shift remain
Full Web + Terminal shared-authority production	~75–80%	Architecture exists, final cutover/rehearsal still outstanding
Overall repo/product completion	~90%	Finish-line stage
Actual production readiness	~82%	Not yet release-approved


The current parity ledger has 90 tracked operations. Native has 84 fully implemented, 3 partial, 2 missing and 1 blocked. PostgreSQL has 80 implemented, 6 partial, 2 missing and 2 blocked. Web has 66 implemented, 17 partial, 6 missing and 1 blocked. Using partial implementations as roughly half-complete gives approximately 95% Native, 92% backend, and 83% Web source parity.
That is a significant improvement from the earlier state where routing, Cloud v2 and Native tests were broken.
Current CI state
The latest ServOS CI #110 is especially encouraging:
- ✅ Frontend: lint, production build, Node tests, UI audit and docs check all passed.
- ✅ Native domain: passed.
- ✅ Cloud protocol base: passed.
- ✅ Cloud protocol v2: passed.
- ✅ Vercel deployment: passed.
- ❌ Desktop shell: check:desktop failed.
- ⏳ Browser preview acceptance: still running when I checked.
- ⏳ Browser production acceptance: still running.
So one of the biggest earlier red lights has changed: Cloud v2 is now genuinely passing its expansion test job. That is a large maturity jump.
What is effectively complete
POS itself is now very mature: tabs, tables, portions, modifiers, firing, transfers, merging, discount/comp architecture, cash, M-Pesa, card, split payment, room charging, customer credit, refunds/reversals, receipt history and till handling are all substantially there.
Inventory has also crossed from prototype into serious operational software: packaging, canonical quantity conversion, barcode handling, sealed/open spirits, location counts, batch production, recipes, transfers, waste, corrections and purchasing integration are present.
Hospitality now has real Front Desk, reservations, stays, rooms, housekeeping, guest accounts, folios, rate configuration and maintenance/floorplan work.
Receipts have moved considerably: friendly receipt numbers, immutable branding snapshots, business/customer copies, receipt logo, thermal raster support, cutter/feed margins, customer names and M-Pesa references are in the current tree.
The new M-Pesa Till QR requirement we just defined is therefore an incremental FS-06 completion item, not a foundational missing subsystem.
What keeps me from calling it 95%+
There are five remaining chunks that contain disproportionate risk:
1. Desktop shell must become green. Native domain passing is excellent, but the actual Tauri integration/build boundary still has a failing CI job.
2. Browser acceptance needs to finish green. Frontend compilation passing is different from real workflow acceptance.
3. FS-06 receipt completion. Add the M-Pesa Till QR, then physically prove QR + logo + footer + feed/cutter behavior on the XP-80T.
4. Fresh terminal commissioning. Clean Windows install → Intake → real business setup → scanner → printer → opening stock → real staff → first till.
5. Operational torture test. A full shift, internet outage, restart, printer failure, scanner failure, backup/restore and replacement-terminal recovery all need to survive.
And for the full dual-runtime vision, there is another gate: Terminal and Web must be deliberately cut over to the common v2 authority without accidentally leaving legacy and v2 writers active together.
The way I would frame maturity today
ServOS is no longer 70–80% “still being built.”
It is now around:
90% built
82% production-proven
one concentrated final stabilization/acceptance sprint away from a defensible first deployment

For the fresh single-business terminal specifically, I would put it slightly higher, around 87–90% deployable, because we do not need to solve every future distributed-Web/offline-grant problem before commissioning that machine.
For the complete ServOS Terminal + Web distributed product, I would keep the figure around 78–82% production-ready until shared authority, cutover, failover and real multi-client concurrency have been accepted.
The remaining work is no longer “build the ERP.” It is now close the last protocol differences, kill the red desktop gate, finish receipt QR, then beat the system up on real hardware until it stops surprising us.