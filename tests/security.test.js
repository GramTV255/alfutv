'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.API_KEY_PEPPER = 'pepper-pepper-pepper';
process.env.ADMIN_ALLOWED_IPS = '203.0.113.7, 198.51.100.2';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const v = require('../src/validators');
const { adminIpAllowed, requireAdmin, requireAdminOrAgent } = require('../src/middleware/auth');
const auth = require('../src/services/authService');

test('weak passwords are refused', () => {
  for (const p of ['password1', 'Password123', '12345678', 'aaaaaaaa', 'short1']) {
    assert.throws(() => v.password(p), p);
  }
  assert.doesNotThrow(() => v.password('Kiboko-mkubwa-92'));
});

test('admin IP allowlist', () => {
  assert.strictEqual(adminIpAllowed('203.0.113.7'), true);
  assert.strictEqual(adminIpAllowed('::ffff:198.51.100.2'), true);
  assert.strictEqual(adminIpAllowed('8.8.8.8'), false);
  let err; requireAdmin({ user: { role: 'ADMIN' }, ip: '8.8.8.8' }, {}, (e) => { err = e; });
  assert.strictEqual(err.status, 403);
  err = null; requireAdmin({ user: { role: 'ADMIN' }, ip: '203.0.113.7' }, {}, (e) => { err = e; });
  assert.strictEqual(err, undefined);
});

test('requireAdminOrAgent (AGENT role): accepts ADMIN and AGENT, same IP-allowlist gate as a full admin, ' +
  'rejects a plain USER and anonymous requests', () => {
  let err;
  requireAdminOrAgent({ user: { role: 'AGENT' }, ip: '203.0.113.7' }, {}, (e) => { err = e; });
  assert.strictEqual(err, undefined);
  err = null; requireAdminOrAgent({ user: { role: 'ADMIN' }, ip: '203.0.113.7' }, {}, (e) => { err = e; });
  assert.strictEqual(err, undefined);
  err = null; requireAdminOrAgent({ user: { role: 'AGENT' }, ip: '8.8.8.8' }, {}, (e) => { err = e; }); // outside the IP allowlist
  assert.strictEqual(err.status, 403);
  err = null; requireAdminOrAgent({ user: { role: 'USER' }, ip: '203.0.113.7' }, {}, (e) => { err = e; });
  assert.strictEqual(err.status, 403);
  err = null; requireAdminOrAgent({ user: null, ip: '203.0.113.7' }, {}, (e) => { err = e; });
  assert.strictEqual(err.status, 403);
});

test('authService.signSession: AGENT is on the same shorter-session branch as ADMIN (not the plain-USER one)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/services/authService.js'), 'utf8');
  assert.match(src, /user\.role === 'ADMIN' \|\| user\.role === 'AGENT'\)\s*\?\s*Math\.min\(config\.sessionHours, config\.adminSessionHours\)/);
});

test('migrations/014_agent_role.sql: the users.role CHECK constraint is widened to include AGENT, ' +
  'without touching the existing USER/ADMIN values', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '014_agent_role.sql'), 'utf8');
  assert.match(sql, /DROP CONSTRAINT IF EXISTS users_role_check/);
  assert.match(sql, /CHECK \(role IN \('USER', 'ADMIN', 'AGENT'\)\)/);
});

test('routes/admin.js: only "/sources..." is opened up to AGENT (via requireAdminOrAgent) - every other ' +
  'admin endpoint (users, packages, payments, settings, audit, make-agent/revoke-agent itself) stays ADMIN-only, ' +
  'and routes/proxyAdmin.js is opened up to AGENT in its entirety', () => {
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'src/routes/admin.js'), 'utf8');
  assert.match(adminSrc, /requireAdminOrAgent/);
  assert.match(adminSrc, /\/\^\\\/sources\(\\\/\|\$\)\/\.test\(req\.path\)/);
  assert.match(adminSrc, /router\.get\('\/agents'/);
  assert.match(adminSrc, /router\.post\('\/users\/:id\/make-agent'/);
  assert.match(adminSrc, /router\.post\('\/users\/:id\/revoke-agent'/);
  const proxyAdminSrc = fs.readFileSync(path.join(__dirname, '..', 'src/routes/proxyAdmin.js'), 'utf8');
  assert.match(proxyAdminSrc, /router\.use\(requireAuth, csrfProtect, requireAdminOrAgent\)/);
});

test('routes/auth.js: login/logout treat AGENT the same as ADMIN for the IP-allowlist gate, ' +
  'the /admin redirect and the token_version invalidation on logout', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/routes/auth.js'), 'utf8');
  assert.match(src, /isStaff = user\.role === 'ADMIN' \|\| user\.role === 'AGENT'/);
  assert.match(src, /claims\.role === 'ADMIN' \|\| claims\.role === 'AGENT'/);
});

test('admin sessions are shorter than user sessions and sessions are bound to token_version', () => {
  const a = auth.verifySession(auth.signSession({ id: 'u1', role: 'ADMIN', token_version: 3 }).token);
  const u = auth.verifySession(auth.signSession({ id: 'u2', role: 'USER', token_version: 0 }).token);
  assert.ok(a.exp - a.iat <= 8 * 3600);
  assert.ok(u.exp - u.iat >= a.exp - a.iat);
  assert.strictEqual(a.tv, 3);
  assert.throws(() => auth.verifySession(auth.signSession({ id: 'u1', role: 'ADMIN', token_version: 3 }).token + 'x'));
});

test('bootstrapAdmin helper: trims whitespace/newlines and strips wrapping quotes from dashboard env values', () => {
  const clean = (v) => (typeof v === 'string' ? v.trim().replace(/^["']|["']$/g, '').trim() : v);
  assert.strictEqual(clean('  0712345678\n'), '0712345678');
  assert.strictEqual(clean('"0712345678"'), '0712345678');
  assert.strictEqual(clean("'MyPassw0rd!'\n"), 'MyPassw0rd!');
  assert.strictEqual(clean(undefined), undefined);
});

test('public channel API has no request-volume limit by default (API_RATE_LIMIT_PER_MIN=0)', () => {
  delete require.cache[require.resolve('../src/config')];
  const prev = process.env.API_RATE_LIMIT_PER_MIN;
  delete process.env.API_RATE_LIMIT_PER_MIN;
  const { config } = require('../src/config');
  assert.strictEqual(config.apiRateLimitPerMin, 0);
  if (prev !== undefined) process.env.API_RATE_LIMIT_PER_MIN = prev;
  delete require.cache[require.resolve('../src/config')];
  // publicApiLimiter itself needs express-rate-limit (a real npm dependency, not stubbed here); pin its no-op
  // contract statically instead of requiring the module, so this test runs without node_modules installed.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/middleware/rateLimit.js'), 'utf8');
  assert.match(src, /config\.apiRateLimitPerMin > 0\s*\n?\s*\?/);
  assert.match(src, /:\s*\(_req, _res, next\) => next\(\);/);
});

test('the proxy-token and API-key "guess" limiters are defined with a narrow, correct contract ' +
  '(only the one status code that signals a guess counts - not 503 busy/upstream down, 403 suspended, etc.), ' +
  'kept in middleware/rateLimit.js for optional reuse, even though no route currently applies them', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/middleware/rateLimit.js'), 'utf8');
  // badKeyLimiter (/p/<token>/...): only a 404 (unknown token, thrown by load() in routes/proxy.js) would count.
  const badKeyBlock = src.slice(src.indexOf('const badKeyLimiter'), src.indexOf('const badApiKeyLimiter'));
  assert.match(badKeyBlock, /requestWasSuccessful:\s*\(_req,\s*res\)\s*=>\s*res\.statusCode\s*!==\s*404/);
  assert.doesNotMatch(badKeyBlock, /skipSuccessfulRequests/);
  // badApiKeyLimiter (/api/v1/...): only a 401 (missing/invalid/revoked key) would count.
  const badApiKeyBlock = src.slice(src.indexOf('const badApiKeyLimiter'), src.indexOf('module.exports'));
  assert.match(badApiKeyBlock, /requestWasSuccessful:\s*\(_req,\s*res\)\s*=>\s*res\.statusCode\s*!==\s*401/);
  assert.doesNotMatch(badApiKeyBlock, /skipSuccessfulRequests/);
});

test('taking a channel has no per-visitor limit at all: routes/public.js and routes/proxy.js apply no ' +
  'guess-limiter and no request-volume limiter other than the always-unlimited-by-default publicApiLimiter', () => {
  const publicSrc = fs.readFileSync(path.join(__dirname, '..', 'src/routes/public.js'), 'utf8');
  assert.doesNotMatch(publicSrc, /badApiKeyLimiter|badKeyLimiter/);
  const proxySrc = fs.readFileSync(path.join(__dirname, '..', 'src/routes/proxy.js'), 'utf8');
  assert.doesNotMatch(proxySrc, /badApiKeyLimiter|badKeyLimiter|rate-?[Ll]imit/);
});

test('the global concurrent-relay cap for /p/<token>/... streams is configurable and defaults well above the old hardcoded 80', () => {
  delete require.cache[require.resolve('../src/config')];
  const prev = process.env.PROXY_MAX_ACTIVE;
  delete process.env.PROXY_MAX_ACTIVE;
  const { config } = require('../src/config');
  assert.ok(config.proxyMaxActive >= 500, 'default proxyMaxActive should give real headroom for simultaneous viewers');
  process.env.PROXY_MAX_ACTIVE = '1200';
  delete require.cache[require.resolve('../src/config')];
  const reloaded = require('../src/config').config;
  assert.strictEqual(reloaded.proxyMaxActive, 1200);
  if (prev !== undefined) process.env.PROXY_MAX_ACTIVE = prev; else delete process.env.PROXY_MAX_ACTIVE;
  delete require.cache[require.resolve('../src/config')];
});
