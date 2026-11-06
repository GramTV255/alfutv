'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.API_KEY_PEPPER = 'pepper-pepper-pepper';
process.env.ADMIN_ALLOWED_IPS = '203.0.113.7, 198.51.100.2';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/validators');
const { adminIpAllowed, requireAdmin } = require('../src/middleware/auth');
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

test('admin sessions are shorter than user sessions and sessions are bound to token_version', () => {
  const a = auth.verifySession(auth.signSession({ id: 'u1', role: 'ADMIN', token_version: 3 }).token);
  const u = auth.verifySession(auth.signSession({ id: 'u2', role: 'USER', token_version: 0 }).token);
  assert.ok(a.exp - a.iat <= 8 * 3600);
  assert.ok(u.exp - u.iat >= a.exp - a.iat);
  assert.strictEqual(a.tv, 3);
  assert.throws(() => auth.verifySession(auth.signSession({ id: 'u1', role: 'ADMIN', token_version: 3 }).token + 'x'));
});
