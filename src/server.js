'use strict';
const { config, validate } = require('./config');
const logger = require('./utils/logger');

// If the app cannot start, serve a small diagnostic page instead of a blank host 500 (so the cause is visible).
function diagnosticServer(lines) {
  const http = require('http');
  const body = `Channel API: haiwezi kuanza\n\n${lines.join('\n')}\n`;
  http.createServer((_q, r) => { r.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); r.end(body); })
    .listen(config.port, () => console.error(`Diagnostic page on :${config.port}`));
}

const problems = validate();
if (problems.length) {
  console.error('\nConfiguration problems:\n - ' + problems.join('\n - ') + '\n');
  diagnosticServer(['Configuration problems:', ...problems.map((p) => ` - ${p}`)]); // names only, never secret values
  return;
}

const { pool } = require('./database/pool');
const { migrate } = require('../scripts/migrate');
const { createApp } = require('./app');
const { startJobs } = require('./jobs');

// Hosts without a shell (e.g. Wasmer): create the FIRST admin from ADMIN_PHONE / ADMIN_PASSWORD / ADMIN_NAME,
// only when no admin exists yet. After the first login, delete ADMIN_PASSWORD from the environment.
async function bootstrapAdmin() {
  const { ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_PHONE || !ADMIN_PASSWORD) return;
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE role='ADMIN' LIMIT 1`);
  if (rows.length) return;
  const { normalizePhone } = require('./utils/phone');
  const phone = normalizePhone(ADMIN_PHONE);
  if (!phone || ADMIN_PASSWORD.length < 10 || Buffer.byteLength(ADMIN_PASSWORD) > 72 || !/[A-Za-z]/.test(ADMIN_PASSWORD) || !/\d/.test(ADMIN_PASSWORD)) {
    logger.warn('ADMIN_* ignored: invalid phone, or password is not 10-72 chars with letters and numbers');
    return;
  }
  const { hashPassword } = require('./services/authService');
  const hash = await hashPassword(ADMIN_PASSWORD);
  await pool.query(
    `INSERT INTO users (full_name, phone_number, password_hash, role) VALUES ($1,$2,$3,'ADMIN')
     ON CONFLICT (phone_number) DO UPDATE SET role='ADMIN', password_hash=EXCLUDED.password_hash, token_version=users.token_version+1`,
    [(ADMIN_NAME || 'Administrator').slice(0, 120), phone, hash]
  );
  await pool.query(`INSERT INTO audit_logs (action, target_type, target_id) VALUES ('ADMIN_BOOTSTRAP','user',$1)`, [phone]);
  logger.info('First admin created from environment variables. Remove ADMIN_PASSWORD from the environment now.');
}

// Production settings that weaken security when forgotten.
function securityWarnings() {
  const { config } = require('./config');
  if (!config.isProd) return;
  if (!config.publicBaseUrl) logger.warn('SECURITY: set PUBLIC_BASE_URL (your https site address) so links never depend on the Host header.');
  if (!config.trustProxy) logger.warn('SECURITY: TRUST_PROXY is not set. Behind a host/proxy (Wasmer, Render ...) set TRUST_PROXY=1 so rate limits and lockouts see real client IPs.');
  if (process.env.ADMIN_PASSWORD) logger.warn('SECURITY: remove ADMIN_PASSWORD from the environment now that the admin exists.');
}

async function main() {
  securityWarnings();
  await pool.query('SELECT 1'); // fail fast if the database is unreachable
  await migrate({ quiet: false }); // safe: advisory-locked, transactional, applied once
  await bootstrapAdmin();
  const app = createApp();
  const server = app.listen(config.port, () => logger.info(`Channel API System listening on :${config.port} (${config.env})`));
  server.keepAliveTimeout = 65000; server.headersTimeout = 70000; server.requestTimeout = 40000;
  startJobs();

  const shutdown = (sig) => {
    logger.info(`${sig} received, shutting down`);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (e) => logger.error('unhandledRejection', e));
main().catch((e) => {
  logger.error('Startup failed', e);
  // Details (may include the DB host) are shown on the page only when STARTUP_DIAGNOSTICS=true
  diagnosticServer(['Startup failed.', process.env.STARTUP_DIAGNOSTICS === 'true' ? `${e.code || ''} ${e.message}` : 'Set STARTUP_DIAGNOSTICS=true to see the reason here, or read the logs.']);
});
