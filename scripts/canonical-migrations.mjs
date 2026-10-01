/**
 * Canonical migration inventory shared by the test runner and the release evidence scripts.
 *
 * The reviewed expansion chain is applied in this exact order. `expansion` is the historic source
 * filename; `canonical` is the timestamped `supabase/migrations/` file that replaced it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export const MIGRATION_DIR = 'supabase/migrations';

/** Files applied before the expansion chain (existing terminal-replica migrations). */
export const BASE_MIGRATIONS = [
  '202609240001_terminal_replica.sql',
  '202609240002_remote_requests.sql',
  '202609240003_request_validation.sql',
  '202609270001_reconciliation_manifest.sql',
];

/** Resolve `001_protocol.sql` (or its canonical name) to the timestamped canonical file. */
export function canonicalNameFor(expansionFile) {
  const match = /^(\d{3})_(.+)\.sql$/.exec(expansionFile);
  if (!match) throw new Error(`Unrecognised expansion filename: ${expansionFile}`);
  // 001 -> 20261001001_<name>.sql, preserving the reviewed order after the 20260927 base migrations.
  return `20261001${match[1].padStart(3, '0')}_${match[2]}.sql`;
}

/** Every migration this installation applies, in order. */
export function canonicalMigrations() {
  const available = new Set(readdirSync(MIGRATION_DIR).filter(file => file.endsWith('.sql')).sort());
  const missing = [];
  const ordered = [];
  for (const file of BASE_MIGRATIONS) {
    if (!available.has(file)) missing.push(`${MIGRATION_DIR}/${file}`);
    ordered.push(file);
  }
  for (const file of expansionChain()) {
    const canonical = canonicalNameFor(file);
    if (!available.has(canonical)) missing.push(`${MIGRATION_DIR}/${canonical}`);
    ordered.push(canonical);
  }
  if (missing.length) throw new Error(`Missing canonical migrations:\n  ${missing.join('\n  ')}`);
  return ordered;
}

/** Historic expansion filenames, read from the reviewed source chain. */
export function expansionChain() {
  return readFileSync('scripts/expansion-order.txt', 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export function migrationPath(file) {
  return `${MIGRATION_DIR}/${file}`;
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  try {
    const list = canonicalMigrations();
    console.log(`Canonical migration set: ${list.length} files`);
    for (const file of list) console.log(`  ${file}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
