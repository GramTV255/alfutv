// Proxy Link ya umma: /proxy/{id}/{token}/index.m3u8 (token inalinda kila link)
const router = require('express').Router();
const crypto = require('crypto');
const { Readable } = require('stream');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { resolveApiStream } = require('../utils/stream-resolver');
const { assertPublicUrl } = require('../utils/stream-resolver');
// Maombi ya stream yanakataa anwani za ndani (SSRF). Hutumika badala ya fetch ya moja kwa moja.
const guardedFetch = (url, opts) => { assertPublicUrl(url); return fetch(url, opts); };

const limiter = rateLimit({ windowMs: 60 * 1000, max: 1500, standardHeaders: true, legacyHeaders: false });
const UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function load(req, res) {
  const id = parseInt(req.params.id, 10) || 0;
  const r = await query('SELECT id, source_type, source_url, headers, token, active FROM proxy_links WHERE id=$1', [id]);
  const row = r.rows[0];
  if (!row || !row.active || !same(req.params.token, row.token)) { res.status(404).end(); return null; }
  if (row.source_type.startsWith('MPD')) { res.status(415).type('text/plain').send('Chanzo ni MPD. Proxy inasaidia m3u8 pekee.'); return null; }
  return row;
}

// URL halisi ya m3u8: moja kwa moja, au kutoka kwenye endpoint ya API
async function sourceOf(row) {
  if (row.source_type === 'API') {
    const r = await resolveApiStream('proxy:' + row.id, row.source_url, row.headers);
    return { url: r.url, headers: row.headers || {} };
  }
  return { url: row.source_url, headers: row.headers || {} };
}

function rewrite(text, base, id, token) {
  const px = (u) => `/proxy/${id}/${token}/s?u=${Buffer.from(new URL(u, base).href).toString('base64url')}`;
  return String(text).split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${px(u)}"`);
    return px(line.trim());
  }).join('\n');
}
const fetchSrc = (url, headers) => guardedFetch(url, {
  headers: { 'User-Agent': UA, Accept: '*/*', ...(headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(20000),
});
const fail = (res, e) => res.status(502).type('text/plain').send('Imeshindikana: ' + e.message);

router.get('/:id/:token/index.m3u8', limiter, async (req, res) => {
  try {
    const row = await load(req, res); if (!row) return;
    const src = await sourceOf(row);
    const r = await fetchSrc(src.url, src.headers);
    if (!r.ok) return res.status(502).end();
    const text = await r.text();
    if (!text.includes('#EXTM3U')) return res.status(415).type('text/plain').send('Chanzo si playlist ya m3u8.');
    res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
    res.send(rewrite(text, r.url || src.url, row.id, row.token));
  } catch (e) { fail(res, e); }
});

router.get('/:id/:token/s', limiter, async (req, res) => {
  try {
    const row = await load(req, res); if (!row) return;
    let target;
    try { target = new URL(Buffer.from(String(req.query.u || ''), 'base64url').toString('utf8')); }
    catch (_) { return res.status(400).end(); }
    const src = await sourceOf(row);
    if (target.origin !== new URL(src.url).origin) return res.status(403).end();
    const r = await fetchSrc(target.href, src.headers);
    if (!r.ok || !r.body) return res.status(502).end();
    const type = r.headers.get('content-type') || '';
    if (/mpegurl|m3u/i.test(type) || /\.m3u8(\?|$)/i.test(target.pathname)) {
      const text = await r.text();
      res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      return res.send(rewrite(text, r.url || target.href, row.id, row.token));
    }
    res.status(r.status);
    res.set({ 'Content-Type': type || 'video/mp2t', 'Cache-Control': 'no-store' });
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { fail(res, e); }
});

module.exports = router;
