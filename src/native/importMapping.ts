export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  if (text.length > 5_000_000) throw new Error('Use a file smaller than 5 MB.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === delimiter || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== delimiter) { if (row.some(value => value.length)) rows.push(row); row = []; if (char === '\r' && source[i + 1] === '\n') i++; }
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error('Unexpected quote or text after a quoted cell. Export a standard CSV and try again.'); cell += char; }
  }
  if (quoted) throw new Error('The last quoted cell is incomplete.');
  row.push(cell); if (row.some(value => value.length)) rows.push(row);
  if (rows.length < 2) throw new Error('Include a header row and at least one data row.');
  if (rows.length > 5001) throw new Error('Split the source into batches of at most 5,000 rows.');
  if (rows.some(row => row.length !== rows[0].length)) throw new Error('Every row must have the same number of columns as the header.');
  const headers = rows[0].map(header => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('Give every source column a unique, nonempty heading.');
  if (headers.some(header => /(^|_)(password|passwd|pin|token|secret|credential|pin_hash|password_hash)(_|$)/.test(header) && header !== 'kra_pin')) throw new Error('Remove credential columns from the source. Passwords, staff PINs and tokens cannot be imported.');
  return rows;
}

const aliases: Record<string, string[]> = { external_id: ['id', 'external id', 'reference'], name: ['item', 'product', 'product name', 'asset name'], code: ['sku', 'item code'], selling_price: ['price', 'selling price'], room_number: ['room', 'room number'], asset_tag: ['tag', 'permanent tag'], stock_item_name: ['stock name', 'item name'], base_unit: ['unit', 'units'], opening_quantity: ['quantity', 'opening stock'], average_unit_cost: ['cost', 'unit cost'] };
export function suggestMapping(headers: string[], targets: string[]): Record<string, number> {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return Object.fromEntries(targets.map(target => {
    const matches = headers.map((header, index) => ({ header: normalize(header), index })).filter(({ header }) => header === normalize(target) || aliases[target]?.includes(header));
    return [target, matches.length === 1 ? matches[0].index : -1];
  }));
}
export function mappedCsv(rows: string[][], targets: string[], mapping: Record<string, number>) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [targets, ...rows.slice(1).map(row => targets.map(target => mapping[target] >= 0 ? row[mapping[target]] : ''))].map(row => row.map(escape).join(',')).join('\r\n');
}
