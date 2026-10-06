import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {ApiProblem, executeCommand, normalizeActor} from './command-kernel.mjs';
import {PostgresStore} from './postgres-store.mjs';
import {createHash} from 'node:crypto';
import {catalogCommandRegistry} from './catalog-commands.mjs';
import {readConfig} from './config.mjs';

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

export async function authenticateSession(req, store, now = new Date()) {
  const authorization = req.headers.authorization;
  const deviceId = req.headers['x-serveos-device-id'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || typeof deviceId !== 'string' || !uuid.test(deviceId)) {
    throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session and enrolled device are required.');
  }
  const token = authorization.slice(7);
  if (token.length < 32 || token.length > 4096) throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session and enrolled device are required.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return normalizeActor(await store.authenticateSession(tokenHash, deviceId, now));
}

export function createApiServer({store, registry = new Map(), authenticate, origin = process.env.WEB_ORIGIN}) {
  if (typeof authenticate !== 'function') throw new Error('An explicit session authenticator is required.');
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        if (!origin || req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
        res.writeHead(204, {'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-serveos-device-id', 'access-control-allow-credentials': 'true', vary: 'Origin'});
        return res.end();
      }
      if (req.headers.origin && origin && req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
      if (req.headers.origin && origin) res.setHeader('access-control-allow-origin', origin), res.setHeader('access-control-allow-credentials', 'true'), res.setHeader('vary', 'Origin');

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health/live') return json(res, 200, {status: 'ok'});
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        const {rows} = await store.pool.query("SELECT to_regclass('public.api_schema_migrations') IS NOT NULL AS ready");
        if (!rows[0]?.ready) return json(res, 503, {status: 'not_ready', reason: 'database_migrations_pending'});
        return json(res, 200, {status: 'ready'});
      }
      if (req.method === 'GET' && url.pathname === '/v1/sync/changes') {
        const actor = await authenticate(req);
        const afterRaw = url.searchParams.get('after') ?? '0';
        const limitRaw = url.searchParams.get('limit') ?? '200';
        if (!/^\d+$/.test(afterRaw) || !/^\d+$/.test(limitRaw)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'after and limit must be whole numbers.');
        const after = Number(afterRaw);
        const limit = Number(limitRaw);
        if (!Number.isSafeInteger(after) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
          throw new ApiProblem(400, 'VALIDATION_FAILED', 'Cursor must be non-negative and limit must be between 1 and 500.');
        }
        const page = await store.changesAfter(actor.businessId, after, limit);
        if (after > page.highWater) throw new ApiProblem(409, 'CURSOR_AHEAD', 'The requested cursor is ahead of this business change feed.');
        return json(res, 200, {protocolVersion: 1, ...page});
      }
      if (req.method === 'GET' && url.pathname === '/v1/sync/stream') {
        const actor = await authenticate(req);
        const afterRaw = url.searchParams.get('after') ?? '0';
        if (!/^\d+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) throw new ApiProblem(400, 'VALIDATION_FAILED', 'after must be a non-negative whole number.');
        let cursor = Number(afterRaw);
        const initial = await store.changesAfter(actor.businessId, cursor, 1);
        if (cursor > initial.highWater) throw new ApiProblem(409, 'CURSOR_AHEAD', 'The requested cursor is ahead of this business change feed.');
        res.writeHead(200, {'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', ...(req.headers.origin && origin ? {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin'} : {})});
        res.write(': connected\n\n');
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20_000);
        const poll = setInterval(async () => {
          try {
            const page = await store.changesAfter(actor.businessId, cursor, 100);
            if (page.changes.length) {
              cursor = page.toCursor;
              res.write(`event: changes\ndata: ${JSON.stringify({cursor})}\n\n`);
            }
          } catch {
            res.write('event: unavailable\ndata: {}\n\n');
            res.end();
          }
        }, 2_000);
        res.on('close', () => { clearInterval(heartbeat); clearInterval(poll); });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/catalog/items') {
        const actor = await authenticate(req);
        if (!actor.permissions?.includes('catalog.view') && !actor.permissions?.includes('catalog.manage')) {
          throw new ApiProblem(403, 'PERMISSION_DENIED', 'You are not allowed to view the catalog.');
        }
        const search = (url.searchParams.get('search') ?? '').trim();
        if (search.length > 100) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Search text is too long.');
        return json(res, 200, {items: await store.listCatalogItems(actor.businessId, search)});
      }
      if (req.method === 'POST' && url.pathname === '/v1/commands') {
        const actor = await authenticate(req);
        const outcome = await executeCommand({db: store, command: await readJson(req), actor, registry});
        return json(res, 200, outcome);
      }
      const match = req.method === 'GET' && url.pathname.match(/^\/v1\/commands\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
      if (match) {
        const actor = await authenticate(req);
        const outcome = await store.commandStatus(actor.businessId, match[1]);
        return outcome ? json(res, 200, outcome) : json(res, 404, {error: {code: 'COMMAND_NOT_FOUND', message: 'No committed result exists for this command.'}});
      }
      return json(res, 404, {error: {code: 'NOT_FOUND', message: 'Route not found.'}});
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      const code = error.code ?? 'INTERNAL_ERROR';
      if (status >= 500) console.error(JSON.stringify({event: 'request_error', code, errorType: error.constructor?.name ?? 'Error'}));
      return json(res, status, {error: {code, message: status >= 500 ? 'The request could not be completed.' : error.message, ...(error.details ? {details: error.details} : {})}});
    }
  });
}

async function main() {
  const config = readConfig();
  const {Pool} = await import('pg');
  const pool = new Pool({connectionString: config.databaseUrl, max: config.poolMax});
  const {rows} = await pool.query('SELECT 1');
  if (!rows.length) throw new Error('Database readiness check returned no row.');
  const store = new PostgresStore(pool);
  const server = createApiServer({store, registry: catalogCommandRegistry, authenticate: req => authenticateSession(req, store), origin: config.webOrigin});
  server.listen(config.port, config.host, () => console.log(JSON.stringify({event: 'api_started', port: config.port, environment: config.nodeEnv, logLevel: config.logLevel})));
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({event: 'startup_failed', errorType: error.constructor?.name ?? 'Error'})); process.exit(1); });
}
