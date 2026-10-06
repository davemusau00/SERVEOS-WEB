export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  let databaseUrl;
  try { databaseUrl = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('DATABASE_URL must use the postgres protocol.');
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'staging', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV must be development, test, staging, or production.');
  const webOrigin = env.WEB_ORIGIN ?? (nodeEnv === 'development' ? 'http://localhost:3000' : '');
  let parsedOrigin;
  try { parsedOrigin = new URL(webOrigin); }
  catch { throw new Error('WEB_ORIGIN must be set to the exact PWA origin.'); }
  if (parsedOrigin.origin !== webOrigin || !['https:', 'http:'].includes(parsedOrigin.protocol)
    || (parsedOrigin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsedOrigin.hostname))) {
    throw new Error('WEB_ORIGIN must be an HTTPS origin (HTTP is allowed only for localhost).');
  }
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['fatal', 'error', 'warn', 'info', 'debug'].includes(logLevel)) throw new Error('LOG_LEVEL is invalid.');
  const poolMax = Number(env.DB_POOL_SIZE ?? 10);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50) throw new Error('DB_POOL_SIZE must be an integer from 1 to 50.');
  return {port, databaseUrl: env.DATABASE_URL, nodeEnv, webOrigin, logLevel, poolMax, host: env.HOST ?? '0.0.0.0'};
}
