import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(here, '../migrations');

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(migrationDirectory)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['serveos:api:migrations']);
      const applied = await client.query('SELECT 1 FROM api_schema_migrations WHERE name = $1', [name]);
      if (!applied.rows.length) {
        await client.query(await readFile(path.join(migrationDirectory, name), 'utf8'));
        await client.query('INSERT INTO api_schema_migrations (name) VALUES ($1)', [name]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const {Pool} = await import('pg');
  const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 1});
  try {
    await migrate(pool);
    console.log(JSON.stringify({event: 'migrations_complete'}));
  } finally {
    await pool.end();
  }
}
