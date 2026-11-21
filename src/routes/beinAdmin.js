'use strict';
/**
 * beinProxy: the admin pastes ONE m3u8 link (any public http/https host, signed ?t=..&e=.. links included) and gets a proxy link
 * /p/<token>/stream.m3u8 to copy. Stored in proxy_channels with quick=true; the relay is the same as for normal proxy links.
 */
const express = require('express');
const { query } = require('../database/pool');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const { config } = require('../config');
const { requireAuth, csrfProtect, requireAdmin } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { encrypt, decrypt, hashApiKey, randomToken } = require('../utils/crypto');
const { validateSourceUrl } = require('../services/safeHttp');
const proxy = require('../services/proxyService');
const { parseHeaders } = require('../utils/headers');

const router = express.Router();
router.use(requireAuth, csrfProtect, requireAdmin);
const base = (req) => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
const UA = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' };

async function checkLink(raw) {
  const u = (await validateSourceUrl(String(raw || '').trim(), { allowHttp: true, anyHost: true })).toString();
  return u;
}
const autoName = (url) => { try { const m = new URL(url).pathname.match(/(\d{3,})/); return m ? `Bein ${m[1]}` : `Bein ${new URL(url).hostname}`; } catch (_) { return 'Bein'; } };
function view(r, req) {
  let link = null;
  try { link = `${base(req)}/p/${decrypt(r.token_enc)}/stream.m3u8`; } catch (_) { /* key changed */ }
  let host = null; try { host = new URL(r.source_url).hostname; } catch (_) { /* */ }
  let header_names = [];
  try { if (r.encrypted_headers) header_names = Object.keys(JSON.parse(decrypt(r.encrypted_headers))); } catch (_) { /* */ }
  return { id: r.id, name: r.name, status: r.status, link, header_names, source_host: host, source_url: r.source_url, hits: Number(r.hits), last_used_at: r.last_used_at, created_at: r.created_at };
}
const getQuick = async (id) => { const r = (await query('SELECT * FROM proxy_channels WHERE id=$1 AND quick=TRUE', [id])).rows[0]; if (!r) throw new HttpError(404, 'Channel haipo'); return r; };

router.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM proxy_channels WHERE quick=TRUE ORDER BY id DESC');
  res.json({ channels: rows.map((r) => view(r, req)) });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.confirmAuthorized !== true) throw v.bad('Thibitisha kuwa una idhini ya kutumia chanzo hiki.');
  const url = await checkLink(b.url);
  if (!/\.m3u8?(\?|$)/i.test(new URL(url).pathname + new URL(url).search) && !/m3u8/i.test(url)) throw v.bad('Weka link ya m3u8 (inayoishia .m3u8, hata ikiwa na ?t=...&e=...).');
  const name = b.name && String(b.name).trim() ? v.str(b.name, 'Jina', { min: 2, max: 100 }) : autoName(url);
  const headers = b.headers && String(b.headers).trim() ? parseHeaders(b.headers) : null;
  const token = randomToken(24);
  const { rows } = await query(
    `INSERT INTO proxy_channels (name, kind, source_url, encrypted_headers, token_hash, token_enc, status, authorized_by, authorized_at, quick)
     VALUES ($1,'M3U8',$2,$6,$3,$4,'ACTIVE',$5,now(),TRUE) RETURNING *`,
    [name, url, hashApiKey(token), encrypt(token), req.user.id, headers ? encrypt(JSON.stringify(headers)) : null]
  );
  await audit(req.user.id, 'BEIN_CREATE', 'proxy_channel', rows[0].id, { name, host: new URL(url).hostname, with_header: !!headers, authorization_confirmed: true }, req.ip);
  res.status(201).json({ ok: true, channel: view(rows[0], req) });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID'); const b = req.body || {};
  await getQuick(id);
  const f = {};
  if (b.name !== undefined) f.name = v.str(b.name, 'Jina', { min: 2, max: 100 });
  if (b.url !== undefined) f.source_url = await checkLink(b.url);
  if (b.headers !== undefined) { // empty = keep as is, '-' = remove
    const t = String(b.headers).trim();
    if (t === '-') f.encrypted_headers = null;
    else if (t) { const h = parseHeaders(b.headers); f.encrypted_headers = h ? encrypt(JSON.stringify(h)) : null; }
  }
  if (b.status !== undefined) f.status = v.oneOf(b.status, 'Status', ['ACTIVE', 'DISABLED']);
  const keys = Object.keys(f);
  if (!keys.length) throw v.bad('Hakuna mabadiliko');
  const { rows } = await query(`UPDATE proxy_channels SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')}, updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map((k) => f[k]), id]);
  await audit(req.user.id, 'BEIN_UPDATE', 'proxy_channel', id, { fields: keys.filter((k) => !['source_url', 'encrypted_headers'].includes(k)), headers_changed: keys.includes('encrypted_headers'), link_changed: keys.includes('source_url') }, req.ip);
  res.json({ ok: true, channel: view(rows[0], req) });
}));

router.post('/:id/regenerate', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID'); await getQuick(id);
  const token = randomToken(24);
  const { rows } = await query('UPDATE proxy_channels SET token_hash=$1, token_enc=$2, updated_at=now() WHERE id=$3 RETURNING *', [hashApiKey(token), encrypt(token), id]);
  await audit(req.user.id, 'BEIN_REGENERATE', 'proxy_channel', id, null, req.ip);
  res.json({ ok: true, channel: view(rows[0], req) });
}));

router.post('/:id/test', wrap(async (req, res) => {
  const r = await getQuick(v.int(req.params.id, 'ID'));
  let h = UA;
  try { if (r.encrypted_headers) { const x = JSON.parse(decrypt(r.encrypted_headers)); h = Object.keys(x).some((k) => k.toLowerCase() === 'user-agent') ? x : { ...UA, ...x }; } } catch (_) { /* */ }
  try { res.json({ ok: true, result: await proxy.probe(r.source_url, h, true) }); }
  catch (e) { res.json({ ok: false, error: e.expose ? e.message : 'Imeshindwa kufikia chanzo (link imeisha au imekataliwa?)' }); }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID'); await getQuick(id);
  await query('DELETE FROM proxy_channels WHERE id=$1', [id]);
  await audit(req.user.id, 'BEIN_DELETE', 'proxy_channel', id, null, req.ip);
  res.json({ ok: true });
}));

module.exports = router;
