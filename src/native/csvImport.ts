export interface CatalogCsvRow {
  rowNumber: number;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  salePrice?: number;
  costPrice?: number;
  quantity: number;
  baseUnit: string;
  scanUnitQuantity: number;
  routeTo: string;
  taxClassId: string;
  createProduct: boolean;
  portionVolume?: number;
  notes?: string;
}

export interface CatalogCsvParseResult {
  rows: CatalogCsvRow[];
  errors: string[];
}

const aliases: Record<string, string[]> = {
  sku: ['sku','code','product_code','productcode','item_code','itemcode'],
  barcode: ['barcode','ean','upc','gtin'],
  name: ['name','product','product_name','productname','item','item_name','itemname'],
  category: ['category','product_category','productcategory'],
  salePrice: ['sale_price','selling_price','sellingprice','saleprice','price','retail_price','retailprice'],
  costPrice: ['cost_price','costprice','unit_cost','unitcost','cost','purchase_price','purchaseprice'],
  quantity: ['quantity','qty','opening_quantity','openingquantity','stock_quantity','stockquantity'],
  baseUnit: ['base_unit','baseunit','unit','stock_unit','stockunit'],
  scanUnitQuantity: ['scan_unit_quantity','scanunitquantity','scan_qty','scanqty'],
  routeTo: ['route_to','routeto','route','station'],
  taxClassId: ['tax_class_id','taxclassid','tax_class','taxclass'],
  createProduct: ['create_product','createproduct','sellable','create_sellable','createsellable'],
  portionVolume: ['portion_volume','portionvolume','stock_per_sale','stockpersale'],
  notes: ['notes','note','comments','comment'],
};

const canonicalHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const parseTable = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter(values => values.some(value => value.trim() !== ''));
};

const numberValue = (
  raw: string | undefined,
  label: string,
  rowNumber: number,
): number | undefined => {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Row ${rowNumber}: ${label} must be a non-negative number.`);
  }
  return parsed;
};

const booleanValue = (raw: string | undefined, fallback: boolean) => {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1','true','yes','y','on'].includes(value)) return true;
  if (['0','false','no','n','off'].includes(value)) return false;
  throw new Error('create_product must be TRUE/FALSE, YES/NO or 1/0.');
};

export const parseCatalogCsv = (text: string): CatalogCsvParseResult => {
  let table: string[][];
  try {
    table = parseTable(text);
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (table.length < 2) {
    return { rows: [], errors: ['CSV must contain a header row and at least one data row.'] };
  }

  const rawHeaders = table[0].map(canonicalHeader);
  const positions: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) {
    const index = rawHeaders.findIndex(header => names.includes(header));
    if (index >= 0) positions[key] = index;
  }

  const missing = ['sku','name'].filter(key => positions[key] === undefined);
  if (missing.length) {
    return { rows: [], errors: [`Missing required CSV column(s): ${missing.join(', ')}.`] };
  }

  const rows: CatalogCsvRow[] = [];
  const errors: string[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  table.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const get = (key: string) =>
      positions[key] === undefined ? '' : (values[positions[key]] ?? '').trim();

    try {
      const sku = get('sku');
      const name = get('name');
      if (!sku) throw new Error(`Row ${rowNumber}: sku is required.`);
      if (!name) throw new Error(`Row ${rowNumber}: name is required.`);

      const skuKey = sku.toLowerCase();
      if (seenSku.has(skuKey)) {
        throw new Error(`Row ${rowNumber}: duplicate SKU ${sku} in this file.`);
      }
      seenSku.add(skuKey);

      const barcode = get('barcode') || undefined;
      if (barcode) {
        const barcodeKey = barcode.toLowerCase();
        if (seenBarcode.has(barcodeKey)) {
          throw new Error(`Row ${rowNumber}: duplicate barcode ${barcode} in this file.`);
        }
        seenBarcode.add(barcodeKey);
      }

      const salePrice = numberValue(get('salePrice'), 'sale_price', rowNumber);
      const costPrice = numberValue(get('costPrice'), 'cost_price', rowNumber);
      const quantity = numberValue(get('quantity'), 'quantity', rowNumber) ?? 0;
      const scanUnitQuantity =
        numberValue(get('scanUnitQuantity'), 'scan_unit_quantity', rowNumber) ?? 1;
      if (scanUnitQuantity <= 0) {
        throw new Error(`Row ${rowNumber}: scan_unit_quantity must be greater than zero.`);
      }

      const createProduct = booleanValue(get('createProduct'), salePrice !== undefined);
      if (createProduct && salePrice === undefined) {
        throw new Error(`Row ${rowNumber}: sale_price is required when create_product is TRUE.`);
      }

      const portionVolume = numberValue(get('portionVolume'), 'portion_volume', rowNumber);
      if (portionVolume !== undefined && portionVolume <= 0) {
        throw new Error(`Row ${rowNumber}: portion_volume must be greater than zero.`);
      }

      rows.push({
        rowNumber,
        sku,
        barcode,
        name,
        category: get('category') || 'OTHER',
        salePrice,
        costPrice,
        quantity,
        baseUnit: get('baseUnit') || 'unit',
        scanUnitQuantity,
        routeTo: (get('routeTo') || 'BAR').toUpperCase(),
        taxClassId: get('taxClassId') || 'A_STANDARD',
        createProduct,
        portionVolume,
        notes: get('notes') || undefined,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  });

  return { rows, errors };
};
