import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = file => readFileSync(file, 'utf8');

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
    const actualHash = createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
    assert.equal(actualHash, hash, `${file} changed; review and update the asset manifest`);
    assert.ok(manifest.includes(`| \`${file}\` | ${dimensions} |`));
    assert.ok(manifest.includes(hash));
  }
});
