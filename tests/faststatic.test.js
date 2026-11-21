'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const zlib = require('zlib');
const { fastStatic } = require('../src/middleware/fastStatic');

function run(mw, url, headers = {}) {
  return new Promise((resolve) => {
    const h = {}; let body = Buffer.alloc(0); let status = 200;
    const res = { set(k, v) { h[k.toLowerCase()] = v; return res; }, status(c) { status = c; return res; }, end(b) { if (b) body = b; resolve({ status, h, body, next: false }); } };
    mw({ method: 'GET', path: url, headers }, res, () => resolve({ next: true }));
  });
}

test('fastStatic: clean urls, brotli, gzip, etag and fallthrough', async () => {
  const mw = fastStatic(path.join(__dirname, '..', 'public'));
  const page = await run(mw, '/login', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(page.h['content-encoding'], 'br');
  assert.match(zlib.brotliDecompressSync(page.body).toString(), /<html/);
  const js = await run(mw, '/js/app.js', { 'accept-encoding': 'gzip' });
  assert.equal(js.h['content-encoding'], 'gzip');
  const again = await run(mw, '/js/app.js', { 'if-none-match': js.h.etag });
  assert.equal(again.status, 304);
  assert.equal((await run(mw, '/nope')).next, true);
  assert.equal((await run(mw, '/login.html')).next, true);
  assert.equal((await run(mw, '/404')).next, true);
  assert.ok((await run(mw, '/')).h['content-type'].startsWith('text/html'));
});
