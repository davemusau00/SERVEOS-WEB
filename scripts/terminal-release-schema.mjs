import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalMigrations, migrationPath } from './canonical-migrations.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const nativeFiles = readdirSync('src-tauri/migrations').filter(file => file.endsWith('.sql')).sort();
const schemaVersions = nativeFiles.map(file => {
  const match = readFileSync(`src-tauri/migrations/${file}`, 'utf8').match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
  if (!match) throw new Error(`Native migration has no schema version: ${file}`);
  return Number(match[1]);
});
const migrations = canonicalMigrations().map(file => ({
  file, sha256: sha256(readFileSync(migrationPath(file), 'utf8').replaceAll('\r\n', '\n')),
}));
export const terminalReleaseSchema = {
  sqliteSchema: Math.max(...schemaVersions),
  nativeMigrations: nativeFiles,
  nativeMigrationHashes: nativeFiles.map(file=>({file,sha256:sha256(readFileSync(`src-tauri/migrations/${file}`,'utf8').replaceAll('\r\n','\n'))})),
  migrations,
  migrationSetSha256: sha256(JSON.stringify(migrations)),
  hashEncoding: 'UTF-8 with LF line endings',
};
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/terminal-release-schema.mjs')) {
  console.log(JSON.stringify(terminalReleaseSchema));
}
