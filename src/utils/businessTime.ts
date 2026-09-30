/** Business-wall-clock helpers. Persisted instants remain UTC; inputs are interpreted in the property's IANA timezone. */
const partsAt = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])) as Record<string, number>;
};

const validTimeZone = (timeZone: string) => {
  try { new Intl.DateTimeFormat('en', { timeZone }).format(0); return timeZone; }
  catch { throw new RangeError(`Unknown business timezone: ${timeZone}`); }
};

export function businessDateTimeInput(instant?: string | number | Date | null, timeZone = 'Africa/Nairobi') {
  if (instant == null || instant === '') return '';
  validTimeZone(timeZone);
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return '';
  const p = partsAt(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Convert a datetime-local wall time to UTC, rejecting nonexistent or ambiguous DST times. */
export function businessDateTimeToUtc(local: string, timeZone = 'Africa/Nairobi') {
  validTimeZone(timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new RangeError('Enter a valid business date and time.');
  const [, ys, mos, ds, hs, mis, ss = '0'] = match;
  const wanted = { year: Number(ys), month: Number(mos), day: Number(ds), hour: Number(hs), minute: Number(mis), second: Number(ss) };
  const wall = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== wanted.year || check.getUTCMonth() + 1 !== wanted.month || check.getUTCDate() !== wanted.day || wanted.hour > 23 || wanted.minute > 59 || wanted.second > 59) throw new RangeError('Enter a valid business date and time.');
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const p = partsAt(new Date(wall + delta * 60 * 60 * 1000), timeZone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    offsets.add(represented - (wall + delta * 60 * 60 * 1000));
  }
  const candidates = [...offsets].map(offset => new Date(wall - offset)).filter(candidate => {
    const p = partsAt(candidate, timeZone);
    return Object.keys(wanted).every(key => p[key] === wanted[key as keyof typeof wanted]);
  });
  if (candidates.length !== 1) throw new RangeError(candidates.length ? 'This business time occurs twice because of a clock change. Choose another time.' : 'This business time does not exist because of a clock change. Choose another time.');
  return candidates[0].toISOString();
}

export function businessDate(instant: string | number | Date, timeZone = 'Africa/Nairobi') {
  validTimeZone(timeZone);
  const p = partsAt(instant instanceof Date ? instant : new Date(instant), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
