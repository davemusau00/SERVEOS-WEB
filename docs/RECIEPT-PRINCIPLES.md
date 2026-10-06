RECEIPT PRINCIPLES

Both customer and business copies end with this fixed, centered four-line footer:

```text
Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440
```

On the customer copy, the replaceable business logo comes after the footer and is the final content. Keep clear paper feed after the logo/footer so the cutter does not clip it. The business copy retains the footer without the customer-facing logo.

Use only the attractive system-generated receipt/order numbers, the customer name when known, and the M-Pesa reference for M-Pesa. Never print Supabase, device, command, Auth, or other database identifiers. Align the content carefully and print all amounts with exactly two decimal places and the applicable currency.

Keep logo replacement in Admin settings, not in receipt-template code. Store a normalized bounded image and monochrome thermal raster with a versioned immutable snapshot on each new receipt. Updating or removing a logo affects future receipts only; historical receipts keep their captured identity and logo. If thermal output cannot use the saved raster, clearly report the text-only fallback.
