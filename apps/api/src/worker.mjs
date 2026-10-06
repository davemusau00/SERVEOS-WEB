import {pathToFileURL} from 'node:url';

export async function claimJob(pool, workerId, handlers, now = new Date()) {
  const supported = [...handlers.keys()];
  if (!supported.length) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query(`
      SELECT id, job_type AS "jobType", payload, attempts, max_attempts AS "maxAttempts"
      FROM async_jobs
      WHERE job_type = ANY($1)
        AND ((state = 'PENDING' AND available_at <= $2)
          OR (state = 'PROCESSING' AND lease_expires_at <= $2))
      ORDER BY available_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `, [supported, now]);
    if (!rows.length) { await client.query('COMMIT'); return null; }
    const job = rows[0];
    const leaseUntil = new Date(now.getTime() + 60_000);
    const updated = await client.query(`
      UPDATE async_jobs
      SET state = 'PROCESSING', attempts = attempts + 1, lease_owner = $2,
          lease_expires_at = $3, started_at = $4
      WHERE id = $1
      RETURNING attempts
    `, [job.id, workerId, leaseUntil, now]);
    await client.query('COMMIT');
    return {...job, attempts: updated.rows[0].attempts, leaseOwner: workerId};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runWorker({pool, handlers, workerId, pollMs = 1000, signal}) {
  while (!signal?.aborted) {
    const job = await claimJob(pool, workerId, handlers);
    if (!job) {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      continue;
    }
    try {
      await handlers.get(job.jobType)(job.payload, {jobId: job.id, attempt: job.attempts});
      await pool.query(`
        UPDATE async_jobs SET state = 'SUCCEEDED', finished_at = now(), lease_owner = NULL, lease_expires_at = NULL
        WHERE id = $1 AND state = 'PROCESSING' AND lease_owner = $2
      `, [job.id, workerId]);
    } catch {
      const terminal = job.attempts >= job.maxAttempts;
      const delaySeconds = Math.min(3600, 5 * (2 ** Math.min(job.attempts - 1, 9)));
      await pool.query(`
        UPDATE async_jobs
        SET state = $3, available_at = CASE WHEN $3 = 'PENDING' THEN now() + ($4 * interval '1 second') ELSE available_at END,
            finished_at = CASE WHEN $3 = 'FAILED' THEN now() ELSE NULL END,
            last_error_code = 'HANDLER_FAILED', lease_owner = NULL, lease_expires_at = NULL
        WHERE id = $1 AND state = 'PROCESSING' AND lease_owner = $2
      `, [job.id, workerId, terminal ? 'FAILED' : 'PENDING', delaySeconds]);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const {Pool} = await import('pg');
  const pool = new Pool({connectionString: process.env.DATABASE_URL, max: Number(process.env.WORKER_DB_POOL_SIZE ?? 5)});
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const workerId = process.env.WORKER_ID || crypto.randomUUID();
  // Add typed handlers as their owning domain modules are implemented.
  const handlers = new Map();
  console.log(JSON.stringify({event: 'worker_started', workerId, supportedJobTypes: []}));
  try { await runWorker({pool, handlers, workerId, signal: controller.signal}); }
  finally { process.off('SIGTERM', stop); process.off('SIGINT', stop); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({event: 'worker_start_failed', message: error.message})); process.exit(1); });
}
