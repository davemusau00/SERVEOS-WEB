# Receipt contract and layout

## Customer and business copies

Use 80mm paper with a 74mm content area. Print the customer copy first and the business record copy second. Center the business name/contact, service area, copy label, and the fixed footer. The customer copy may include the customer name and the manually recorded M-Pesa reference. Show the human-readable system receipt number and order number; never print database UUIDs, device IDs, command IDs, Auth IDs, or arbitrary provider references. The business copy may add cashier/table/tab context, but must not expose internal identifiers.

Each copy includes item description, portion/modifiers, quantity, unit price, aligned amount, subtotal, discount, included tax/levy when present, TOTAL, tender, M-Pesa reference only, cash/change, paid, and balance. Format every amount to exactly two decimal places with the property currency (`KES 0.00`). Preserve saved tax arithmetic and do not add ETR/eTIMS claims. The configurable thank-you message is separate from the fixed footer.

Fixed footer, in this exact order, on both copies:

```text
Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440
```

For the customer copy, the replaceable business receipt logo follows the footer and is the final printed content. Add a feed margin after the logo/footer before the cutter. The business copy retains the footer and does not print the customer-facing logo. Samples identify themselves; reprints say `REPRINT`.

## Immutable document and branding

Native SQLite captures receipt data inside the payment transaction. Staged Web v2 captures it in the server payment transaction. Neither payment commit downloads an image nor depends on printer availability. Schema v2 records a friendly receipt number, order number, customer name when known, timestamp/timezone/currency, business identity, item/portion/modifier snapshots, amount and tax snapshots, payment/M-Pesa/cash/change evidence, credit/balance, the four footer lines, and a branding version. The logo image plus bounded monochrome thermal raster are captured with that version. A branding change affects future receipts only; old documents remain readable and reprints use their saved snapshot. Historical v1 receipts keep their old three-line footer and existing numbers.

Admin branding settings accept raster image inputs only, normalize them to bounded JPEG data for screen/OS printing and a white-composited monochrome raster for ESC/POS, and reject oversized/malformed payloads. The receipt template consumes the snapshot rather than a mutable current setting. If no compatible thermal raster exists for the selected printer profile, print the receipt text-only and say so explicitly.

Customer-facing numbers are sequential `R-000001` receipts and `ORD-000001` orders. They contain no device namespace. The operational writer remains the installed SQLite terminal; the staged Web/Supabase writer remains default-off and online-only until the identity, reconciliation, rollback and cutover gates pass.

## Output and recovery

HTML preview, plain-text download/copy, and ESC/POS share receipt identity and two-decimal currency formatting. Plain-text output marks the position of a saved image rather than embedding binary image data. Web receipt history prints only the selected immutable document through the shared print portal; it must not print the arbitrary page behind the history list. Native print jobs persist the exact lines and thermal raster. `SENT` means the transport accepted bytes, not that paper was produced. `QUEUED`, `SENDING`, `DELIVERY_UNCERTAIN`, and failures require clear operator recovery; inspect paper before retrying uncertain delivery and confirm duplicate risk.

## Acceptance evidence

Source and automated acceptance must cover both copies, footer order, logo-last customer layout, old-branding reprint, customer and M-Pesa fields, attractive identifiers, all amount formatting, long receipts, missing/invalid logo fallback, profile-width boundaries, exact selected Web print root, busy/uncertain/retry behavior, and no fiscal-provider claims. Physical acceptance remains separate: XP-80T actual USB/LAN, readable logo/wordmark at 80mm, alignment, accepted feed margin, cutter, reload/reprint, and saved photos/profile/receipt IDs. No source or disposable SQL result substitutes for paper evidence.
