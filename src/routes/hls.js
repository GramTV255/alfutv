const router = require('express').Router();
const { Readable } = require('stream');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { parse, rewrite } = require('../utils/hls-proxy');
const access = require('../services/access');
const { assertPublicUrl } = require('../utils/stream-resolver');
// Maombi ya stream yanakataa anwani za ndani (SSRF). Hutumika badala ya fetch ya moja kwa moja.
const guardedFetch = (url, opts) => { assertPublicUrl(url); return fetch(url, opts); };

const limiter = rateLimit({ windowMs: 60 * 1000, max: 1200, standardHeaders: true, legacyHeaders: false });
const UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

async function loadChannel(req, res) {
  const id = parseInt(req.params.id, 10);
  const claim = parse(req.query.t, id);
  if (!claim || !(await access.allowed(claim.uid, id))) { res.status(403).end(); return null; }
  const r = await query("SELECT stream_url, headers FROM channels WHERE id=$1 AND stream_type IN ('M3U8','M3U8_HEADERS')", [id]);
  if (!r.rows[0]) { res.status(404).end(); return null; }
  return { id, stream_url: r.rows[0].stream_url, headers: r.rows[0].headers || {} };
}
const upstream = (url, headers) => guardedFetch(url, {
  headers: { 'User-Agent': UA, Accept: '*/*', ...(headers || {}) },
  redirect: 'follow', signal: AbortSignal.timeout(20000),
});

// Playlist kuu
router.get('/:id/p', limiter, async (req, res, next) => {
  try {
    const ch = await loadChannel(req, res); if (!ch) return;
    const r = await upstream(ch.stream_url, ch.headers);
    if (!r.ok) return res.status(502).end();
    const text = await r.text();
    res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
    res.send(rewrite(text, r.url || ch.stream_url, ch.id, req.query.t));
  } catch (e) { next(e); }
});

// Segments, variant playlists na keys: origin lazima iwe ile ya channel
router.get('/:id/s', limiter, async (req, res, next) => {
  try {
    const ch = await loadChannel(req, res); if (!ch) return;
    let target;
    try { target = new URL(Buffer.from(String(req.query.u || ''), 'base64url').toString('utf8')); }
    catch (_) { return res.status(400).end(); }
    if (target.origin !== new URL(ch.stream_url).origin) return res.status(403).end();
    const r = await upstream(target.href, ch.headers);
    if (!r.ok || !r.body) return res.status(502).end();
    const type = r.headers.get('content-type') || '';
    if (/mpegurl|m3u/i.test(type) || /\.m3u8(\?|$)/i.test(target.pathname)) {
      const text = await r.text();
      res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      return res.send(rewrite(text, r.url || target.href, ch.id, req.query.t));
    }
    res.status(r.status);
    res.set({ 'Content-Type': type || 'video/mp2t', 'Cache-Control': 'no-store' });
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { next(e); }
});

module.exports = router;
