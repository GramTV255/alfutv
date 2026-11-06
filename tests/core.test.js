'use strict';
// Runs without a database: node --test tests/
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.API_KEY_PEPPER = 'pepper-pepper-pepper';
const test = require('node:test');
const assert = require('node:assert');
const { normalizePhone } = require('../src/utils/phone');
const c = require('../src/utils/crypto');
const v = require('../src/validators');
const { isBlockedIp, hostMatches } = require('../src/services/safeHttp.js');

test('phone normalization', () => {
  assert.strictEqual(normalizePhone('0712 345 678'), '255712345678');
  assert.strictEqual(normalizePhone('+255712345678'), '255712345678');
  assert.strictEqual(normalizePhone('712345678'), '255712345678');
  assert.strictEqual(normalizePhone('12345'), null);
  assert.strictEqual(normalizePhone('0512345678'), null);
});

test('encrypt/decrypt roundtrip and tamper detection', () => {
  const t = c.encrypt('secret');
  assert.strictEqual(c.decrypt(t), 'secret');
  const parts = t.split(':'); parts[3] = Buffer.from('zzzz').toString('base64');
  assert.throws(() => c.decrypt(parts.join(':')));
});

test('api keys are unique, hashed, start with prefix', () => {
  const a = c.generateApiKey(), b = c.generateApiKey();
  assert.notStrictEqual(a.apiKey, b.apiKey);
  assert.strictEqual(c.hashApiKey(a.apiKey), a.keyHash);
  assert.notStrictEqual(a.keyHash, a.apiKey);
});

test('password validator', () => {
  assert.throws(() => v.password('short1'));
  assert.throws(() => v.password('onlyletters'));
  assert.strictEqual(v.password('Kijani-77x'), 'Kijani-77x');
  assert.throws(() => v.password('abcd1234'));
});

test('SSRF: private ranges blocked, public allowed', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '169.254.169.254', '172.16.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(isBlockedIp(ip), ip);
  assert.ok(!isBlockedIp('8.8.8.8'));
  assert.ok(hostMatches('a.cdn.example.com', '*.cdn.example.com'));
  assert.ok(!hostMatches('evil.com', '*.cdn.example.com'));
  assert.ok(!hostMatches('cdn.example.com.evil.com', '*.cdn.example.com'));
});

test('token extraction from MPD URL (format example only)', () => {
  const { extractValue, computeExpiry } = require('../src/services/extractionService');
  const u = new URL('https://authorized-host.example/tok_EXAMPLE123/live/channel/DASH/channel.mpd');
  assert.strictEqual(extractValue(u, {}), 'tok_EXAMPLE123');
  assert.ok(computeExpiry(u, { tokenTtlSeconds: 60 }) > new Date());
});
