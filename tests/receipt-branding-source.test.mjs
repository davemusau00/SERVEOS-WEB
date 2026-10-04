import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = file => readFileSync(file, 'utf8');

test('the ESC/POS byte stream uses valid commands for every receipt block', () => {
  const printer = read('src-tauri/src/printer.rs');
  // GS ! is the character-size command. It must never appear as a positioning
  // command; the previous QR placement used it and reset it afterwards.
  assert.ok(!/0x1d,\s*b'!'/.test(printer), 'GS ! must not be used for positioning anywhere in the encoder');
  assert.match(printer,/bytes\.extend_from_slice\(&\[0x1b,b'a',1\]\);/);
  assert.match(printer,/bytes\.extend_from_slice\(&\[0x1b,b'a',0\]\);/);
  // A font switch must never be combined with pre-padded centering.
  assert.match(printer,/line\.trim\(\)\.to_string\(\), 1u8/);
  assert.match(printer,/fn font_switched_footer_is_never_pre_padded/);
  assert.match(printer,/fn qr_placement_uses_justification_and_never_the_character_size_command/);
  // The byte-level tests must be real, not just source markers.
  assert.match(printer,/let after_justify = font_b \+ 9;/);
  assert.match(printer,/row_bytes, 0, 16, 0/);
});

test('the OS print fallback uses valid CSS paged media syntax', () => {
  // `size: 80mm auto` mixes a length with `auto`, which is invalid CSS paged
  // media; browsers and drivers ignore it and fall back to A4/Letter.
  for (const file of ['src/index.css', 'src/components/pos/ReceiptDocumentView.tsx', 'src/components/pos/ThermalReceiptModal.tsx']) {
    const text = read(file);
    assert.ok(!/@page\s*\{[^}]*size\s*:\s*80mm\s+auto/.test(text), `${file} must not declare size:80mm auto`);
    assert.match(text, /@page\s*\{?\s*margin/, `${file} must keep a valid @page margin rule`);
  }
  // The receipt root must stay inside the printable area of an 80mm roll.
  const view = read('src/components/pos/ReceiptDocumentView.tsx');
  assert.match(view,/#servos-receipt-print\{display:block!important;width:72mm;max-width:72mm;margin:0 auto/);
  const modal = read('src/components/pos/ThermalReceiptModal.tsx');
  assert.match(modal,/width:\s*72mm;\s*max-width:\s*72mm;\s*margin:\s*0 auto/);
});

test('receipt money formatting is one shared contract, not a floating-point per-runtime guess', () => {
  const rust = read('src-tauri/src/receipts.rs');
  const ts = read('src/receipts/format.ts');
  const tests = read('src-tauri/src/tests.rs');
  // Grouped thousands separators on both runtimes.
  assert.match(rust,/pub fn receipt_money\(minor:i64,currency:&str\)->String/);
  assert.match(rust,/grouped\.push\(','\)/);
  assert.match(ts,/toLocaleString\('en-KE'/);
  // Integer minor units only: no f64 in the authoritative money path.
  assert.ok(!/fn amount\(value:&Value,currency:&str\)->String\{[^}]*f64/.test(rust), 'amount() must not convert through f64');
  assert.match(rust,/fn amount\(value:&Value,currency:&str\)->String\{receipt_money/);
  assert.match(tests,/fn receipt_money_matches_the_preview_contract_with_integer_minor_units/);
});

test('a full-format acceptance slip exercises the real receipt pipeline', () => {
  const lib = read('src-tauri/src/lib.rs');
  assert.match(lib,/fn runtime_printer_acceptance/);
  assert.match(lib,/fn printer_acceptance_lines/);
  // Synthetic content must be unmistakably not a sale.
  assert.match(lib,/SERVOS PRINTER ACCEPTANCE - NOT A SALE/);
  // The blocks a text-only connection slip never proved.
  for (const marker of [
    'CUSTOMER COPY', 'BUSINESS RECORD COPY', 'Item / Qty x Unit',
    'Subtotal', 'Discount', 'VAT included', 'TOTAL',
    'CASH', 'MPESA', 'M-Pesa ref:', 'Cash tendered', 'Change', 'Paid', 'Balance',
    'Thank you for your business.',
  ]) assert.ok(lib.includes(marker), marker);
  // A long item name and a 20+ item receipt.
  assert.match(lib,/Imported premium single-origin Arabica beans 1kg whole bean roasted/);
  assert.match(lib,/for index in 1\.\.=21/);
  // The configured branding and QR must be the ones exercised.
  assert.match(lib,/receiptThermalLogo/);
  assert.match(lib,/receiptMpesaTillQr/);
  // The settings under test must be recorded as acceptance evidence.
  assert.match(lib,/"kind":"PRINTER_PAPER_OBSERVED"/);
  assert.match(lib,/"printerMode":profile\.mode/);
  assert.match(lib,/"columns":profile\.columns/);
  assert.match(lib,/"feedLines":profile\.feed_lines_before_cut/);
  assert.match(lib,/"autoCut":profile\.auto_cut/);
  assert.match(lib,/"maxQrWidthDots":profile\.max_qr_width_dots/);
  assert.match(lib,/"maxLogoWidthDots":profile\.max_logo_width_dots/);
  assert.match(lib,/runtime_printer_acceptance,/);
  // The plain connection slip must remain, as the cheaper connectivity check.
  assert.match(lib,/fn runtime_printer_test/);
});

test('receipt branding preserves the fixed current footer and legacy receipt schema', () => {
  const types = read('src/types/receipt.ts');
  const view = read('src/components/pos/ReceiptDocumentView.tsx');
  assert.match(types, /RECEIPT_FOOTER\s*=\s*\['Built By KINGSFORGE',\s*'info@kingsforge\.co\.ke',\s*'info@davemusau\.co\.ke',\s*'0746157440'\]/);
  assert.match(types, /LEGACY_RECEIPT_FOOTER/);
  assert.match(view, /d\.schemaVersion===1\?LEGACY_RECEIPT_FOOTER:RECEIPT_FOOTER/);
  assert.match(view, /!business&&d\.customerName/);
  assert.match(view, /!business&&d\.brandingSnapshot\?\.receiptLogoDataUrl/);
});

test('receipt customer output includes only M-Pesa references and downloads both copies', () => {
  const formatter = read('src/receipts/format.ts');
  const web = read('src/runtime/web/WebPosView.tsx');
  const native = read('src-tauri/src/receipts.rs');
  assert.match(formatter, /payment\.reference&&\/M\[\\s_-\]\?PESA\/i\.test\(payment\.tenderType\)/);
  assert.match(native, /if method\.contains\("MPESA"\)\{p\["referenceNumber"\]\.clone\(\)\}else\{Value::Null\}/);
  assert.match(web, /receiptText\(d\).*receiptText\(d,true\)/);
  assert.match(web, /setPrintReceipt\(receiptDocument\(receipt\)\)/);
  assert.match(web, /<ReceiptPrintRoot document=\{printReceipt\} autoPrint/);
});

test('branding input and stored thermal payload are bounded before use', () => {
  const image = read('src/receipts/branding.ts');
  const editor = read('src/receipts/ReceiptBrandingEditor.tsx');
  const store = read('src-tauri/src/store.rs');
  const printer = read('src-tauri/src/printer.rs');
  assert.ok(image.includes('!/^image\\/(png|jpeg|webp)$/.test(blob.type)'));
  assert.match(image, /bitmap\.width\s*>\s*4096\s*\|\|\s*bitmap\.height\s*>\s*4096/);
  assert.match(editor, /Use supplied default/);
  assert.match(store, /valid_base64/);
  assert.match(printer, /max_logo_width_dots/);
  assert.match(printer, /feed_lines_before_cut/);
});

test('staged branding is server-commanded and receipt snapshots remove non-M-Pesa references', () => {
  const admin = read('src/runtime/web/WebAdministrationView.tsx');
  const migration = read('supabase/expansion/043_receipt_branding_snapshots.sql');
  assert.match(admin, /business\.settings\.save/);
  assert.match(admin, /ReceiptBrandingEditor/);
  assert.match(migration, /capture_receipt_branding/);
  assert.match(migration, /then payment else payment-'reference' end/);
  assert.match(migration, /'receiptLogoDataUrl',receipt_settings->'logoDataUrl'/);
});

test('the Till QR has its own preparation path and never reuses the photographic logo algorithm', () => {
  const image = read('src/receipts/branding.ts');
  // A distinct entry point exists rather than folding the QR into prepareBrandingImage.
  assert.match(image, /export async function prepareMpesaTillQr\(/);
  assert.match(image, /export async function prepareBrandingImage\(/);
  // Hard binarize, never the photographic luminance-threshold used for logos.
  assert.match(image, /luminance < 128/);
  // Square-only input, bounded source, and no cropping to satisfy printer width.
  assert.match(image, /bitmap\.width !== bitmap\.height/);
  assert.match(image, /MAX_TILL_QR_SOURCE_PX/);
  assert.match(image, /MAX_TILL_QR_DOTS/);
  // A QR is only accepted when a real module grid and quiet zone are recovered.
  assert.match(image, /modules < 21 \|\| modules % 4 !== 1/);
  assert.match(image, /TILL_QR_MIN_QUIET_MODULES/);
  // Malformed / empty / solid input is rejected with an operator-readable reason.
  for (const message of ['contains no Till QR', 'is almost entirely solid', 'does not contain a square QR code', 'could not be read as a QR code']) {
    assert.ok(image.includes(message), `missing rejection: ${message}`);
  }
});

test('the Till QR renders on the customer copy only, after the thank-you and before the footer', () => {
  const view = read('src/components/pos/ReceiptDocumentView.tsx');
  const footer = view.indexOf('receipt-attribution');
  const qr = view.indexOf('receipt-till-qr');
  const logo = view.indexOf('receipt-logo');
  assert.ok(qr > 0 && qr < footer, 'QR block must precede the fixed footer');
  assert.ok(footer < logo, 'receipt logo must remain after the footer');
  // Customer-copy only: the QR is gated on !business exactly like the logo.
  assert.match(view, /!business&&d\.brandingSnapshot\?\.mpesaTillQr\?\.enabled/);
  // Explicit print margins around the QR keep it clear of totals, footer and paper edge.
  assert.match(view, /\.receipt-till-qr\{[^}]*margin:3mm auto[^}]*\}/);
  assert.match(view, /\.receipt-till-qr img\{[^}]*width:34mm;height:34mm/);
  assert.match(view, /\.receipt-till-qr\{[^}]*break-inside:avoid/);
});

test('text and download output marks the QR position without leaking raw image data', () => {
  const formatter = read('src/receipts/format.ts');
  const native = read('src-tauri/src/receipts.rs');
  for (const source of [formatter, native]) {
    assert.match(source, /M-Pesa Till QR/);
    assert.match(source, /included on customer print/);
    // Only the enabled flag gates it, and never on the business copy.
    assert.match(source, /!businessCopy&&|!business_copy &&/);
    // Never print the raster payload into text output.
    assert.ok(!/base64/.test(source.split('\n').filter(line => /included on customer print/.test(line)).join('\n')));
  }
});

test('Terminal and staged Web persist the same Till QR meaning and snapshot it immutably', () => {
  const nativePanel = read('src/native/NativeSettingsPanel.tsx');
  const webAdmin = read('src/runtime/web/WebAdministrationView.tsx');
  const store = read('src-tauri/src/store.rs');
  const receipts = read('src-tauri/src/receipts.rs');
  const migration = read('supabase/expansion/044_mpesa_till_qr.sql');
  const editor = read('src/receipts/ReceiptBrandingEditor.tsx');
  // Same field name on both runtimes, and a QR editor with enable/remove controls.
  for (const source of [nativePanel, webAdmin]) assert.match(source, /mpesaTillQr|receiptMpesaTillQr/);
  assert.match(editor, /Show on customer receipt/);
  assert.match(editor, /Remove Till QR/);
  // Server-side and native validation bound the payload and bump the branding version.
  assert.match(store, /receiptMpesaTillQr/);
  assert.match(store, /M-Pesa Till QR must be a bounded square monochrome raster no wider than 320 dots/);
  assert.match(receipts, /"mpesaTillQr":till_qr/);
  assert.match(migration, /guard_business_till_qr/);
  assert.match(migration, /capture_receipt_branding/);
  // An enabled QR must carry a printable raster, otherwise Web shows a QR the XP-80T cannot print.
  assert.match(migration, /an enabled M-Pesa Till QR requires a thermal raster/);
  // jsonb_typeof of an absent key is 'null', so the enabled flag must be tested directly.
  assert.match(migration, /coalesce\(jsonb_typeof\(qr->'enabled'\),'missing'\)<>'boolean'/);
  // The QR is never presented as payment confirmation.
  assert.ok(!/provider-confirmed|provider confirmed/i.test(editor.replace(/never proof that M-Pesa funds were received/gi, '')));
});

test('the ESC/POS path centers the QR inside the printer profile and keeps feed after final content', () => {
  const printer = read('src-tauri/src/printer.rs');
  const lib = read('src-tauri/src/lib.rs');
  assert.match(printer, /max_qr_width_dots/);
  assert.match(printer, /receiptMaxQrWidthDots/);
  // The business copy is encoded with no QR.
  assert.match(printer, /append_copy\(&mut bytes, business, profile, None, None\)/);
  // The QR is emitted immediately before the first footer line, not after the whole block.
  assert.match(printer, /if Some\(index\) == footer_start/);
  // Explicit blank rows before and after the raster, and a centered horizontal offset.
  assert.match(printer, /fn append_qr/);
  assert.match(printer, /qr_supported/);
  assert.match(lib, /mpesaTillQr/);
  // SENT still only means the transport accepted bytes.
  assert.match(lib, /exceeds this printer profile or is unusable/);
});

test('brand asset manifest records exact checked-in source hashes and PNG dimensions', () => {
  const manifest = read('docs/BRAND_ASSET_MANIFEST.md');
  for (const [file, dimensions, hash] of [
    ['APP-LOGO.png', '2000 × 2000, PNG', 'BBE8277B3E5394371C2B1F62A3F8742F0F83167D8C9F619200CB418D534C45C6'],
    ['reciept-logo.png', '1374 × 1088, PNG', '1DD07A970A8C4C65A2E82648601AA7698B545D1BFD706EC88A8D10F921A7C5E4'],
  ]) {
    const bytes = readFileSync(file);
    const actualHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
    assert.equal(actualHash, hash, `${file} changed; review and update the asset manifest`);
    assert.equal(`${bytes.readUInt32BE(16)} × ${bytes.readUInt32BE(20)}, PNG`, dimensions, `${file} dimensions changed`);
    assert.ok(manifest.includes(`| \`${file}\` | ${dimensions} |`));
    assert.ok(manifest.includes(hash));
  }
  for (const [file, dimensions, hash] of [
    ['public/icons/servos-192.svg', '192 × 192, SVG', '051156042EBCDF6D79B9CA8A8E17E74EED93462CA077C7B0CDBD6DF7C9E98CFD'],
    ['public/icons/servos-512.svg', '512 × 512, SVG (`viewBox` 192 × 192)', '66F10EE084BFB858F7933AE51C36022E5A08F379857192E5E516B9BCD52C552F'],
    ['public/icons/servos-maskable.svg', '512 × 512, SVG (`viewBox` 192 × 192)', 'B0867A4ABE32E93358B4F4D2AD5DBC88E086F6B10487CD0F7B039D08DFD620E9'],
  ]) {
    const actualHash = createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex').toUpperCase();
    assert.equal(actualHash, hash, `${file} changed; review and update the asset manifest`);
    assert.ok(manifest.includes(`| \`${file}\` | ${dimensions} |`));
    assert.ok(manifest.includes(hash));
  }
});
