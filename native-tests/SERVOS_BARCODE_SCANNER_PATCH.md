# ServOS Single-Business Barcode Scanner & Inventory Patch

**Target device:** GF-6502-style wired USB handheld barcode scanner  
**Target repository:** `davemusau00/ServOs`  
**Architecture:** browser-based ServOS single-premise build, offline-first

## 1. Current repository state

The current ServOS codebase already anticipates barcode hardware at the domain level:

- `EdgeDeviceType` already contains `BARCODE_SCANNER`.
- Inventory already has stock masters, locations, immutable stock movements, physical count adjustments, transfers, waste and procurement receipts.
- POS already has a single `handleProductClick()` flow that should remain the only route from product selection into an order.
- Offline IndexedDB infrastructure already exists.

What is missing is the bridge between a physical scanner and those existing workflows.

The scanner should be treated as a **USB HID / keyboard-wedge device**. This means ServOS should not depend on a model-specific driver or WebUSB integration. The scanner sends the decoded barcode as rapid keyboard characters and normally terminates the scan with `Enter`.

---

## 2. Data model changes

Update `src/types/servos.ts`.

### ProductSellable

Add:

```ts
barcode?: string;
```

Purpose: one physical retail barcode can directly resolve the correct sellable in POS.

Keep `code` / SKU separate from `barcode`.

For spirits sold as both measures and bottles, the retail bottle barcode should normally belong to the **sealed bottle sellable**, not the shot/double sellables.

### StockItem

Add:

```ts
barcode?: string;
scanUnitQuantity?: number;
```

`scanUnitQuantity` is the quantity represented by one physical scanned pack, expressed in the stock item's existing `baseUnit`.

Examples:

```text
750ml bottle tracked in ml:
barcode = 5011007003005
baseUnit = ml
scanUnitQuantity = 750

Beer tracked per bottle:
baseUnit = bottle
scanUnitQuantity = 1

Case containing 24 cans, stock tracked per can:
baseUnit = can
scanUnitQuantity = 24
```

This is important because a barcode scan must represent packaging correctly without weakening the existing inventory ledger.

---

## 3. Shared keyboard-wedge scanner hook

Create:

`src/hooks/useBarcodeScanner.ts`

Recommended implementation:

```ts
import { useEffect, useRef } from 'react';

export interface BarcodeScannerOptions {
  enabled?: boolean;
  minLength?: number;
  maxInterKeyDelayMs?: number;
  onScan: (barcode: string) => void;
}

export const normalizeBarcode = (value: string) =>
  value.trim().replace(/[\r\n\t]+$/g, '');

export const barcodeEquals = (
  candidate: string | undefined,
  scanned: string
) => {
  if (!candidate) return false;
  return normalizeBarcode(candidate).toLowerCase() ===
    normalizeBarcode(scanned).toLowerCase();
};

export const useBarcodeScanner = ({
  enabled = true,
  minLength = 4,
  maxInterKeyDelayMs = 80,
  onScan
}: BarcodeScannerOptions) => {
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      bufferRef.current = '';
      lastKeyAtRef.current = 0;
      startedAtRef.current = 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = Date.now();

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = normalizeBarcode(bufferRef.current);
        const elapsed = startedAtRef.current
          ? now - startedAtRef.current
          : Number.POSITIVE_INFINITY;

        const scannerLike =
          code.length >= minLength &&
          elapsed <= Math.max(500, code.length * maxInterKeyDelayMs * 2);

        reset();

        if (scannerLike) {
          onScan(code);
        }
        return;
      }

      if (event.key.length !== 1) return;

      if (
        !lastKeyAtRef.current ||
        now - lastKeyAtRef.current > maxInterKeyDelayMs * 2
      ) {
        bufferRef.current = event.key;
        startedAtRef.current = now;
      } else {
        bufferRef.current += event.key;
      }

      lastKeyAtRef.current = now;
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, minLength, maxInterKeyDelayMs, onScan]);
};
```

This remains fully functional offline and avoids vendor lock-in.

---

## 4. POS scan-to-sale

Update:

`src/components/pos/POSView.tsx`

Import:

```ts
import { useBarcodeScanner, barcodeEquals } from '../../hooks/useBarcodeScanner';
```

Also expose `showToast` from `useServOS()`.

After `handleProductClick()` is declared, register the scanner:

```ts
useBarcodeScanner({
  onScan: (barcode) => {
    const product = products.find(
      p =>
        barcodeEquals(p.barcode, barcode) ||
        p.code.toLowerCase() === barcode.toLowerCase()
    );

    if (!product) {
      setSearchQuery(barcode);
      showToast(`Barcode ${barcode} is not assigned to a sellable product`, 'info');
      return;
    }

    setSearchQuery('');
    handleProductClick(product);
    showToast(`${product.name} scanned`, 'success');
  }
});
```

Important: scans must go through the existing `handleProductClick()` logic so modifiers, portions, packages, order accounting and eventual stock consumption are not bypassed.

Add a small UI cue beside search:

```text
USB Scanner Ready
Scan barcode or search manually
```

The normal search box should also match `barcode` in addition to name/category/SKU.

---

## 5. Catalog barcode assignment

Update:

`src/components/catalog/CatalogStudioView.tsx`

Add state:

```ts
const [productFormBarcode, setProductFormBarcode] = useState('');
```

On create:

```ts
setProductFormBarcode('');
```

On edit:

```ts
setProductFormBarcode(prod.barcode || '');
```

Before save, validate duplicate barcode:

```ts
const normalized = productFormBarcode.trim();

if (
  normalized &&
  products.some(
    p =>
      p.id !== editingProductId &&
      p.barcode?.trim().toLowerCase() === normalized.toLowerCase()
  )
) {
  showToast('That barcode is already assigned to another product', 'error');
  return;
}
```

Persist:

```ts
barcode: normalized || undefined
```

Add a field to the product editor:

```tsx
<div>
  <label className="text-xs text-slate-300 block mb-1">
    Barcode / EAN / UPC
  </label>
  <input
    type="text"
    value={productFormBarcode}
    onChange={e => setProductFormBarcode(e.target.value)}
    placeholder="Click here and scan, or type barcode"
    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300"
  />
  <p className="mt-1 text-[10px] text-slate-500">
    Optional. Keep SKU and physical retail barcode separate.
  </p>
</div>
```

A USB keyboard-wedge scanner can populate this input directly.

---

## 6. Inventory item barcode assignment

Update:

`src/components/inventory/InventoryView.tsx`

Add form state:

```ts
const [stockFormBarcode, setStockFormBarcode] = useState('');
const [stockFormScanUnitQuantity, setStockFormScanUnitQuantity] = useState(1);
```

When adding:

```ts
setStockFormBarcode('');
setStockFormScanUnitQuantity(1);
```

When editing:

```ts
setStockFormBarcode(item.barcode || '');
setStockFormScanUnitQuantity(item.scanUnitQuantity || 1);
```

Validate duplicate stock barcode before saving.

Persist:

```ts
barcode: stockFormBarcode.trim() || undefined,
scanUnitQuantity: stockFormScanUnitQuantity > 0
  ? stockFormScanUnitQuantity
  : 1
```

Add two form fields:

```text
Physical Barcode / EAN / UPC
Quantity Represented by One Scan
```

Example helper copy:

```text
For a 750ml bottle tracked in ml, enter 750.
For an item tracked by pieces, normally enter 1.
```

---

## 7. Inventory scan-to-count workflow

Import the scanner hook into `InventoryView.tsx`.

Register:

```ts
useBarcodeScanner({
  onScan: (barcode) => {
    const item = stockItems.find(
      s =>
        barcodeEquals(s.barcode, barcode) ||
        s.code.toLowerCase() === barcode.toLowerCase()
    );

    if (!item) {
      showToast(`Unknown stock barcode: ${barcode}`, 'info');
      return;
    }

    const increment = item.scanUnitQuantity || 1;

    if (!isStocktakeOpen) {
      setStocktakeItemId(item.id);
      setStocktakeCounted(increment);
      setStocktakeNotes(`Barcode count session - last scan ${barcode}`);
      setIsStocktakeOpen(true);
      return;
    }

    if (stocktakeItemId === item.id) {
      setStocktakeCounted(prev => prev + increment);
    } else {
      setStocktakeItemId(item.id);
      setStocktakeCounted(increment);
    }
  }
});
```

Inside the existing physical stock count modal, show:

```text
SCANNER COUNT ACTIVE
Each scan adds: {selectedItem.scanUnitQuantity || 1} {selectedItem.baseUnit}
```

The final **Commit Adjustment** button must continue calling the existing:

`recordStockCountAdjustment(...)`

This preserves the existing immutable movement ledger and accounting behaviour.

Do not mutate `currentStock` directly from scanner events.

---

## 8. Procurement barcode assistance

Update:

`src/components/procurement/ProcurementView.tsx`

When the New PO modal is open, scanner input should select the matching stock item:

```ts
useBarcodeScanner({
  enabled: isNewPoOpen,
  onScan: barcode => {
    const item = stockItems.find(
      s =>
        barcodeEquals(s.barcode, barcode) ||
        s.code.toLowerCase() === barcode.toLowerCase()
    );

    if (!item) {
      showToast(`No stock master assigned to ${barcode}`, 'info');
      return;
    }

    setPoItemId(item.id);
    showToast(`${item.name} selected for purchase order`, 'success');
  }
});
```

Do **not** silently change the current GRN accounting logic yet.

The current `receivePurchaseOrder()` implementation receives every ordered line in full. The next procurement iteration should extend it to accept actual scanned quantities and rejected quantities:

```ts
receivePurchaseOrder(
  poId,
  notes,
  receivedQuantitiesByStockItem
)
```

That should then support partial receipt status and a scanner-driven GRN screen.

---

## 9. Edge Hardware representation

`src/types/servos.ts` already contains:

```ts
| 'BARCODE_SCANNER'
```

Add a scanner device to `initialEdgeDevices` in:

`src/context/ServOSContext.tsx`

```ts
{
  id: 'edge-scn-01',
  name: 'GF-6502 USB Barcode Scanner',
  type: 'BARCODE_SCANNER',
  connection: 'USB',
  status: 'ONLINE',
  lastPing: new Date().toISOString()
}
```

For a production implementation, "ONLINE" should mean a recent successful test scan rather than pretending browser JavaScript can enumerate a keyboard-wedge device.

Update `src/components/edge/EdgeHardwareModal.tsx`:

```ts
case 'BARCODE_SCANNER':
  return ScanLine;
```

For the device action, add a **Test Scan** prompt:

```text
Scan any barcode now.
ServOS should display the decoded value without changing inventory or creating a sale.
```

Do not use WebUSB as the default path.

---

## 10. Offline behaviour

Barcode lookup must remain local.

The physical scanner needs no internet connection. Catalog/stock barcode fields should be present in any cached inventory/catalog snapshot.

Unknown scans must never create products automatically.

A scanner event may select or count something locally, but final inventory mutation must still occur through ServOS's existing ledger actions and offline queue rules.

---

## 11. Barcode safety rules

1. Product barcodes must be unique among sellable products.
2. Stock barcodes must be unique among stock masters.
3. Barcode matching should be trimmed and case-insensitive.
4. Unknown barcodes produce a visible warning only.
5. One trigger pull must produce at most one sale/count increment.
6. Scanner events must not bypass modifiers, portions, approval logic, stock ledger posting or audit logging.
7. SKU/code fallback is supported so ServOS-generated labels can be scanned too.
8. Keep the system scanner-model agnostic.

---

## 12. Practical single-premise workflows

### Bar sale

```text
Scan bottle
  -> barcode resolves ProductSellable
  -> existing POS product flow
  -> ticket line created
  -> normal payment
  -> normal stock consumption
```

### Weekly bottle count

```text
Inventory
  -> Count
  -> choose Main Bar
  -> scan every physical bottle
  -> 750ml bottle adds 750ml each scan
  -> commit
  -> COUNT_ADJUSTMENT movement
  -> variance visible in AvT report
```

### New stock master

```text
Inventory
  -> New Stock Item
  -> enter name/category/base unit
  -> click Barcode field
  -> scan package
  -> set Quantity per Scan
  -> save
```

### New sellable

```text
Catalog Studio
  -> Add Product
  -> click Barcode field
  -> scan bottle/can
  -> save
  -> immediately scannable at POS
```

### Purchase order

```text
Procurement
  -> New PO
  -> scan item
  -> stock master selected
  -> enter quantity and price
  -> create PO
```

---

## 13. Acceptance test

Use a real scanner on the target terminal.

1. Plug the scanner into USB.
2. Open Notepad/text editor and scan a product.
3. Confirm the code appears once and the scanner sends Enter.
4. Assign that code to a ServOS product.
5. Scan it from POS and confirm exactly one item is added.
6. Assign the same physical code to the corresponding stock master where appropriate.
7. Set `scanUnitQuantity`.
8. Open Inventory > Count.
9. Scan the item three times.
10. Confirm the count equals 3 × `scanUnitQuantity`.
11. Commit.
12. Confirm the movement ledger shows `COUNT_ADJUSTMENT`.
13. Disconnect internet and repeat POS lookup and inventory counting.
14. Scan an unknown code and confirm no stock or sale mutation occurs.
15. Verify ordinary keyboard typing and search still work.

---

## 14. Recommended next iteration

After basic HID scanning is stable, extend ServOS with a dedicated **Receiving / GRN Scan Session**:

- choose open PO;
- scan delivered units/cases;
- show ordered vs scanned vs rejected;
- prevent over-receipt unless manager-approved;
- commit partial/full GRN;
- create exact purchase receipt movements;
- update AP only from accepted quantity;
- preserve offline queue if internet is unavailable.

That is the correct next step for turning the scanner from a POS shortcut into a full stock-control instrument.
