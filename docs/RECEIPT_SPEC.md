# Receipt contract and layout

80mm paper, 74mm content; customer followed by business copy. Center business name/contact/service area/copy label. Receipt number/date/cashier/table/tab/room, item description with portion/modifiers, quantity/unit price/aligned amount; subtotal, discount, tax/levy where applicable, TOTAL, tenders/references, cash/change, paid/balance. Business copy includes transaction identity. Full screen preview matches print.

No ETR/eTIMS wording; preserve actual tax calculations. Hard-code small centered footer on both copies:

```text
Built By Davemusau.co.ke
info@davemusau.co.ke
0746157440
```

Business thank-you is separate and configurable. Samples say SAMPLE; reprints identify themselves.

Native backend constructs/persists versioned documents from saved transactions, not supplied UI text. Capture header/contact, timestamp/timezone/currency, items/amounts/taxes/discounts, cashier/device, payments and cash/change on payment commit. Partial payments create separate immutable document states; split snapshots after every leg commits. Old missing cash/change remain unknown, no invention. Existing numbers retained; future device namespace prevents collisions.

HTML/text/ESC-POS use the same document. HTML print root outside scrolling/fixed modal; hide app during print, reset overflow/page breaks. Numeric columns cannot clip. ESC/POS sanitize control bytes, deterministic glyph handling, feed before cut. Queue exact immutable payload. SENT means transport accepted, not paper verified; interrupted SENDING uncertain, retry needs duplicate confirmation. Payment success does not depend on printer availability.

Tests: both copies/footer/no fiscal wording, long/many items, zeros/change, split/partial/refund, header changes after payment, historical unknowns, restart/reprint, forged text rejection, print overflow, actual USB/LAN/cutter and retry.
