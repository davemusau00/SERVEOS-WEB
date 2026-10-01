# Receipt branding setup

This guide configures the business emblem and receipt logo without changing the receipt template. It applies to an Admin on the installed terminal and to the staged Web workspace. Web v2 remains default-off and online-only until its authority/cutover gates are accepted.

## Set the business images

1. Sign in as an operator with **business.configure** (Admin in the terminal role model).
2. Open **Business settings → Business branding and receipt logo** in the terminal, or **Administration → Settings** in the Web workspace.
3. For the app emblem and receipt logo separately, choose **Use supplied default** to use the repository's APP-LOGO.png / reciept-logo.png, or choose **Replace …** to upload a PNG, JPEG, or WebP image. Check the visible preview. **Remove custom …** clears that image; receipts then use the explicit text-only fallback.
4. Save the branding settings and wait for a confirmed result. Native settings are local terminal configuration. Web settings are a business.settings.save command and require an online server response; a draft or pending command is not an effective setting.
5. Make a small test transaction only in an authorized rehearsal/business environment. Open its saved receipt and confirm the new branding. Existing receipts intentionally keep the logo and footer snapshot they had at payment time.

The uploader decodes the image, composites transparent pixels onto white, and bounds the saved JPEG to 720×360 pixels and 240,000 encoded characters. It also prepares a black/white thermal raster no wider than 576 dots or 220 dots high. Invalid, oversized, or undecodable files are rejected before save. Keep a copy of the original business artwork separately; the normalized file is a print asset, not a replacement for the supplied source.

## Printer profile and feed margin

On the terminal, open **Business settings → Till and printer**. Select OS printing, the exact Windows USB queue, or the local XP-80T LAN address. For direct ESC/POS, set the maximum logo width supported by the actual printer profile (64–576 dots), the configured text width, and **Feed lines before cut** (2–12, default 5). Save and use **Test saved printer** only after checking the selected queue/address and paper.

The thermal raster is centered after the four fixed footer lines on the customer copy; the business copy contains the footer but no customer logo. Feed margin follows the logo/footer before each cut. Browser/OS print also adds a bottom margin. A profile that cannot use the saved raster prints text-only and reports that fallback. **SENT** means only that the print transport accepted bytes. Check the actual paper before deciding it is correct.

## What appears on the receipt

- Friendly sequential receipt and order numbers (for new records), customer name when known, and M-Pesa reference only for M-Pesa tender.
- Two-decimal amounts with the configured currency; no Supabase/device/command/Auth IDs or arbitrary provider references.
- The four-line centered KINGSFORGE footer on both copies.
- The saved logo as the last customer-copy content, never a current mutable logo substituted into an old receipt.
- Web receipt history prints only the selected immutable receipt document. Plain-text export shows an image marker because plain text cannot carry the raster.

## Open acceptance gates

Local verification must cover save authorization, online outcome recovery, image-size/malformed-image boundaries, branding-version retention, old reprints, output consistency, selected-document print scoping, thermal fallback, and cutter feed configuration. Hardware acceptance still requires the actual packaged Windows terminal and XP-80T, both copies, logo readability/alignment, approved feed/cut margin, reload/reprint, and saved photos/profile/receipt IDs. Neither source presence nor disposable cloud SQL constitutes that proof.
