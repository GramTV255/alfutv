'use strict';
try { require('dotenv').config(); } catch (_) { /* dotenv optional: env may come from the host */ }

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const env = process.env.NODE_ENV || 'development';
const E = process.env;

// Accepts DATABASE_URL, or the separate DB_HOST / DB_PORT / DB_NAME / DB_USERNAME / DB_PASSWORD variables.
function buildDatabaseUrl() {
  if (E.DATABASE_URL) return E.DATABASE_URL;
  const host = E.DB_HOST || E.PGHOST;
  const name = E.DB_NAME || E.PGDATABASE;
  if (!host || !name) return '';
  const user = encodeURIComponent(E.DB_USERNAME || E.DB_USER || E.PGUSER || 'postgres');
  const pass = encodeURIComponent(E.DB_PASSWORD || E.PGPASSWORD || '');
  return `postgres://${user}:${pass}@${host}:${E.DB_PORT || E.PGPORT || 5432}/${name}`;
}
const truthy = (v) => ['true', '1', 'yes', 'require'].includes(String(v || '').toLowerCase());
// If API_KEY_PEPPER is not set, derive a stable one from JWT_SECRET (so only JWT_SECRET must stay constant).
const pepper = E.API_KEY_PEPPER || (E.JWT_SECRET ? require('crypto').createHmac('sha256', E.JWT_SECRET).update('api-key-pepper-v1').digest('hex') : '');

const config = {
  env,
  isProd: env === 'production',
  port: int(process.env.PORT, env === 'production' ? 80 : 3000), // Wasmer Edge expects port 80
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.APP_URL || '').replace(/\/$/, ''),
  trustProxy: process.env.TRUST_PROXY ? int(process.env.TRUST_PROXY, 1) : 0,
  databaseUrl: buildDatabaseUrl(),
  // Managed DBs given as separate DB_* variables (e.g. Wasmer) require TLS: on by default, set DB_SSL=false to disable.
  databaseSsl: E.DATABASE_URL ? truthy(E.DATABASE_SSL) : (E.DB_SSL === undefined ? !!E.DB_HOST : truthy(E.DB_SSL)),
  cronSecret: E.CRON_SECRET || '',
  // Own PostgreSQL schema, so this app never collides with tables that already exist in the database.
  dbSchema: /^[a-z_][a-z0-9_]{0,40}$/.test(E.DB_SCHEMA || '') ? E.DB_SCHEMA : 'channel_api',
  jwtSecret: process.env.JWT_SECRET || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  apiKeyPepper: pepper,
  // Optional: only these IPs may use the admin API / log in as admin (comma separated). Empty = no restriction.
  adminAllowedIps: (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((x) => x.trim()).filter(Boolean),
  adminSessionHours: Math.max(1, parseInt(process.env.ADMIN_SESSION_HOURS || '8', 10) || 8),
  loginMaxFailures: Math.max(3, parseInt(process.env.LOGIN_MAX_FAILURES || '5', 10) || 5),
  loginLockMinutes: Math.max(1, parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10) || 15),
  sessionHours: int(process.env.SESSION_HOURS, 12),
  apiRateLimitPerMin: int(process.env.API_RATE_LIMIT_PER_MIN, 30),
  authRateLimitMax: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
  allowedSourceHosts: (process.env.ALLOWED_SOURCE_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // amiriChannel asks its source for a fresh token on every request; requests within this many seconds share one fetch.
  amiriMinRefreshSeconds: Math.max(0, parseInt(process.env.AMIRI_MIN_REFRESH_SECONDS || '0', 10) || 0),
  // Default true: if the source cannot give a fresh token right now, a stored token that has NOT expired is still served instead of a 503.
  // Set AMIRI_ALLOW_STALE=false for the strict mode (503 whenever the fresh fetch fails).
  amiriAllowStale: !['false', '0', 'no'].includes(String(process.env.AMIRI_ALLOW_STALE || '').toLowerCase()),
  sourceCompression: truthy(process.env.SOURCE_ALLOW_COMPRESSION),
  disableScheduler: truthy(process.env.DISABLE_SCHEDULER), // emergency switch: app starts without background jobs
  sourceTimeoutMs: int(process.env.SOURCE_TIMEOUT_MS, 10000),
  sourceMaxBytes: int(process.env.SOURCE_MAX_BYTES, 1048576),
  retention: {
    usageDays: int(process.env.USAGE_LOG_RETENTION_DAYS, 90),
    extractionDays: int(process.env.EXTRACTION_LOG_RETENTION_DAYS, 30),
    auditDays: int(process.env.AUDIT_LOG_RETENTION_DAYS, 365),
  },
  clickpesa: {
    baseUrl: 'https://api.clickpesa.com/third-parties',
  },
};

function validate() {
  const problems = [];
  if (!config.databaseUrl) problems.push('Database is not set: use DATABASE_URL or DB_HOST + DB_NAME + DB_USERNAME + DB_PASSWORD');
  if (config.jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) problems.push('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  if (config.apiKeyPepper.length < 16) problems.push('API_KEY_PEPPER must be at least 16 characters');
  return problems;
}

module.exports = { config, validate };
