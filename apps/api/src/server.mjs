import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {ApiProblem, executeCommand, normalizeActor} from './command-kernel.mjs';
import {PostgresStore} from './postgres-store.mjs';

const json = (res, status, value) => {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(value));
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 256 * 1024) throw new ApiProblem(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size.');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new ApiProblem(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.'); }
}

function actorFromRequest(req) {
  const businessId = req.headers['x-serveos-business-id'];
  const staffId = req.headers['x-serveos-staff-id'];
  const deviceId = req.headers['x-serveos-device-id'];
  const permissions = String(req.headers['x-serveos-permissions'] ?? '').split(',').filter(Boolean);
  return normalizeActor({businessId, staffId, deviceId, permissions});
}

export function createApiServer({store, registry = new Map(), authenticate = actorFromRequest, origin = process.env.WEB_ORIGIN}) {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        if (!origin || req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
        res.writeHead(204, {'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-credentials': 'true', vary: 'Origin'});
        return res.end();
      }
      if (req.headers.origin && origin && req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
      if (req.headers.origin && origin) res.setHeader('access-control-allow-origin', origin), res.setHeader('access-control-allow-credentials', 'true'), res.setHeader('vary', 'Origin');

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health/live') return json(res, 200, {status: 'ok'});
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        await store.pool.query('SELECT 1');
        return json(res, 200, {status: 'ready'});
      }
      if (req.method === 'POST' && url.pathname === '/v1/commands') {
        const actor = await authenticate(req);
        const outcome = await executeCommand({db: store, command: await readJson(req), actor, registry});
        return json(res, 200, outcome);
      }
      const match = req.method === 'GET' && url.pathname.match(/^\/v1\/commands\/([0-9a-f-]{36})$/i);
      if (match) {
        const actor = await authenticate(req);
        const outcome = await store.commandStatus(actor.businessId, match[1]);
        return outcome ? json(res, 200, outcome) : json(res, 404, {error: {code: 'COMMAND_NOT_FOUND', message: 'No committed result exists for this command.'}});
      }
      return json(res, 404, {error: {code: 'NOT_FOUND', message: 'Route not found.'}});
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      const code = error.code ?? 'INTERNAL_ERROR';
      if (status >= 500) console.error(JSON.stringify({event: 'request_error', code, message: error.message}));
      return json(res, status, {error: {code, message: status >= 500 ? 'The request could not be completed.' : error.message}});
    }
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const {Pool} = await import('pg');
  const pool = new Pool({connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE ?? 10)});
  const {rows} = await pool.query('SELECT 1');
  if (!rows.length) throw new Error('Database readiness check returned no row.');
  const server = createApiServer({store: new PostgresStore(pool)});
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(JSON.stringify({event: 'api_started', port})));
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({event: 'startup_failed', message: error.message})); process.exit(1); });
}
