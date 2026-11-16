// Proxy Link: usimamizi wa admin (CRUD, jaribio, badilisha link)
const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../config/database');
const { isStr, isUrl, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const { resolveUncached } = require('../utils/stream-resolver');
const { assertPublicUrl } = require('../utils/stream-resolver');
// Maombi ya stream yanakataa anwani za ndani (SSRF). Hutumika badala ya fetch ya moja kwa moja.
const guardedFetch = (url, opts) => { assertPublicUrl(url); return fetch(url, opts); };

const TYPES = ['M3U8', 'M3U8_HEADERS', 'MPD', 'MPD_HEADERS', 'API'];
const base = () => (process.env.BASE_URL || '').replace(/\/+$/, '');
// Admin: makosa ya database yanaonyeshwa wazi ili yaweze kurekebishwa
const ah2 = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  if (e.status) return res.status(e.status).json({ error: e.message });
  console.error('proxy-admin:', e);
  res.status(500).json({ error: 'Kosa la database: ' + String(e.message).slice(0, 240) });
});
const shape = (r) => ({ ...r, link: `${base()}/proxy/${r.id}/${r.token}/index.m3u8`, m3u8: !String(r.source_type).startsWith('MPD') });

function parseHeaders(v) {
  let h = v || {};
  if (typeof h === 'string') { try { h = h.trim() ? JSON.parse(h) : {}; } catch (_) { throw httpErr(400, 'Headers ziwe JSON sahihi.'); } }
  if (typeof h !== 'object' || Array.isArray(h) || Object.entries(h).some(([k, x]) => !/^[\w-]{1,60}$/.test(k) || typeof x !== 'string' || x.length > 800))
    throw httpErr(400, 'Headers si sahihi.');
  return h;
}
function clean(b) {
  if (!isStr(b.name, 1, 80)) throw httpErr(400, 'Jina linahitajika.');
  if (!TYPES.includes(b.source_type)) throw httpErr(400, 'Aina ya chanzo si sahihi.');
  if (!isUrl(b.source_url)) throw httpErr(400, 'Source URL si sahihi.');
  return { name: b.name.trim(), source_type: b.source_type, source_url: b.source_url.trim(), headers: parseHeaders(b.headers), logo_url: b.logo_url || null, active: b.active !== false };
}

router.get('/proxy-links', ah2(async (req, res) => {
  const r = await query('SELECT * FROM proxy_links ORDER BY created_at DESC');
  res.json({ links: r.rows.map(shape) });
}));

// Jaribio: kabla ya kuhifadhi
router.post('/proxy-links/test', ah2(async (req, res) => {
  const v = clean({ name: 'test', ...(req.body || {}) });
  try {
    let src;
    if (v.source_type === 'API') src = await resolveUncached(v.source_url, v.headers);
    else {
      // Tembelea chanzo kweli: lazima kifikike na kiwe playlist ya m3u8
      const s = await guardedFetch(v.source_url, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', Accept: '*/*', ...v.headers }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!s.ok) throw new Error('Chanzo kilijibu HTTP ' + s.status);
      const text = (await s.text()).slice(0, 4000);
      if (!text.includes('#EXTM3U')) throw new Error(/<MPD/i.test(text) ? 'Chanzo ni MPD, si m3u8' : 'Chanzo si playlist ya m3u8');
      src = { url: v.source_url, type: 'hls' };
    }
    res.json({ ok: true, type: src.type, m3u8: src.type === 'hls', host: new URL(src.url).host });
  } catch (e) { throw httpErr(400, 'Jaribio limeshindwa: ' + e.message); }
}));

router.post('/proxy-links', ah2(async (req, res) => {
  const v = clean(req.body || {});
  const tok = crypto.randomBytes(18).toString('base64url');
  const r = await query(`INSERT INTO proxy_links(name,source_type,source_url,headers,logo_url,active,token) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [v.name, v.source_type, v.source_url, v.headers, v.logo_url, v.active, tok]);
  await audit(req, 'proxy.create', 'proxy_link', r.rows[0].id);
  res.status(201).json({ link: shape(r.rows[0]) });
}));

router.patch('/proxy-links/:id', ah2(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const cur = (await query('SELECT * FROM proxy_links WHERE id=$1', [id])).rows[0];
  if (!cur) throw httpErr(404, 'Proxy haipatikani.');
  const v = clean({ ...cur, ...(req.body || {}), headers: (req.body && req.body.headers !== undefined) ? req.body.headers : cur.headers });
  const r = await query(`UPDATE proxy_links SET name=$2,source_type=$3,source_url=$4,headers=$5,logo_url=$6,active=$7,updated_at=now() WHERE id=$1 RETURNING *`,
    [id, v.name, v.source_type, v.source_url, v.headers, v.logo_url, v.active]);
  await audit(req, 'proxy.update', 'proxy_link', id);
  res.json({ link: shape(r.rows[0]) });
}));

// Badilisha link (token mpya): link ya zamani inaacha kufanya kazi
router.post('/proxy-links/:id/token', ah2(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const r = await query('UPDATE proxy_links SET token=$2, updated_at=now() WHERE id=$1 RETURNING *', [id, crypto.randomBytes(18).toString('base64url')]);
  if (!r.rowCount) throw httpErr(404, 'Proxy haipatikani.');
  await audit(req, 'proxy.token', 'proxy_link', id);
  res.json({ link: shape(r.rows[0]) });
}));

router.delete('/proxy-links/:id', ah2(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  await query('DELETE FROM proxy_links WHERE id=$1', [id]);
  await audit(req, 'proxy.delete', 'proxy_link', id);
  res.json({ ok: true });
}));

module.exports = router;
