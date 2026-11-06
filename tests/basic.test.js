'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.API_KEY_PEPPER = 'pepper-pepper-pepper';
const test = require('node:test');
const assert = require('node:assert');
const { normalizePhone } = require('../src/utils/phone');
const c = require('../src/utils/crypto');

test('phone normalisation', () => {
  assert.strictEqual(normalizePhone('0712 345 678'), '255712345678');
  assert.strictEqual(normalizePhone('+255712345678'), '255712345678');
  assert.strictEqual(normalizePhone('712345678'), '255712345678');
  assert.strictEqual(normalizePhone('0512345678'), null);
  assert.strictEqual(normalizePhone('abc'), null);
});

test('encrypt/decrypt roundtrip and tamper detection', () => {
  const e = c.encrypt('secret-value');
  assert.strictEqual(c.decrypt(e), 'secret-value');
  const parts = e.split(':'); parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => c.decrypt(parts.join(':')));
});

test('api keys are unique, prefixed and hashed', () => {
  const a = c.generateApiKey(), b = c.generateApiKey();
  assert.notStrictEqual(a.apiKey, b.apiKey);
  assert.ok(a.apiKey.startsWith('chk_'));
  assert.strictEqual(a.keyHash, c.hashApiKey(a.apiKey));
  assert.strictEqual(a.keyHash.length, 64);
});

test('buildPayload returns mpd url, token and clearkey map', () => {
  const { encrypt } = require('../src/utils/crypto');
  const { buildPayload } = require('../src/services/publicApiService');
  const p = buildPayload({ channel_name: 'X', source_id: 1, extracted_value: 'T', mpd_url_enc: encrypt('https://h.example/a.mpd'), clearkey_enc: encrypt('aa11:bb22,cc33:dd44'), token_expires_at: new Date() });
  assert.equal(p.mpd_url, 'https://h.example/a.mpd');
  assert.equal(p.clearkey, 'aa11:bb22');
  assert.deepEqual(p.clearkeys, { aa11: 'bb22', cc33: 'dd44' });
});
