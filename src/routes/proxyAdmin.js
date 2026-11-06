'use strict';
const express = require('express');
const { query } = require('../database/pool');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const { config } = require('../config');
const { requireAuth, csrfProtect, requireAdmin } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { encrypt, decrypt, hashApiKey, randomToken } = require('../utils/crypto');
const { validateSourceUrl, addAllowedHost } = require('../services/safeHttp');
// The proxy contacts this host, so it goes on the allowlist automatically once the admin confirmed authorisation.
async function checkUrl(raw, authorized) {
  try { if (authorized) await addAllowedHost(new URL(raw).hostname); } catch (_) { /* validated below */ }
  return (await validateSourceUrl(raw, { allowHttp: true })).toString();
}
const { parseHeaders } = require('../utils/headers');
const proxy = require('../services/proxyService');

const router = express.Router();
router.use(requireAuth, csrfProtect, requireAdmin);

const base = (req) => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
const hasHeaders = (r) => !!r.encrypted_headers;
const label = (r) => `${r.kind.toLowerCase()}${hasHeaders(r) ? ' + header' : ''}`;
function view(r, req) {
  let link = null;
  try { link = `${base(req)}/p/${decrypt(r.token_enc)}/stream.${r.kind === 'M3U8' ? 'm3u8' : 'mpd'}`; } catch (_) { /* key changed */ }
  let host = null; try { host = new URL(r.source_url).hostname; } catch (_) { /* */ }
  let headerNames = [];
  try { if (r.encrypted_headers) headerNames = Object.keys(JSON.parse(decrypt(r.encrypted_headers))); } catch (_) { /* */ }
  let clearkeys = [];
  try { if (r.clearkey_enc) clearkeys = JSON.parse(decrypt(r.clearkey_enc)); } catch (_) { /* */ }
  const clearkey_link = clearkeys.length && link ? link.replace(/stream\.(m3u8|mpd)$/, 'clearkey') : null;
  return { clearkeys: clearkeys.map((k) => `${k.kid}:${k.key}`), clearkey_link, id: r.id, name: r.name, kind: r.kind, type: label(r), with_header: hasHeaders(r), header_names: headerNames, source_host: host, source_url: r.source_url,
    status: r.status, link, hits: Number(r.hits), last_used_at: r.last_used_at, created_at: r.created_at };
}
const kindOf = (x) => v.oneOf(String(x || '').toUpperCase(), 'Aina', ['M3U8', 'M4S']);

router.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM proxy_channels WHERE quick=FALSE ORDER BY id DESC');
  res.json({ channels: rows.map((r) => view(r, req)) });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.confirmAuthorized !== true) throw v.bad('Thibitisha kuwa una idhini ya kutumia chanzo hiki (authorization checkbox).');
  const name = v.str(b.name, 'Jina', { min: 2, max: 100 });
  const kind = kindOf(b.kind);
  const url = await checkUrl(v.str(b.source_url, 'Source URL', { max: 2048 }), true);
  const headers = b.with_header === false ? null : parseHeaders(b.headers);
  const keys = kind === 'M4S' ? proxy.parseClearKeys(b.clearkey) : [];
  const token = randomToken(24);
  const { rows } = await query(
    `INSERT INTO proxy_channels (name, kind, source_url, encrypted_headers, clearkey_enc, token_hash, token_enc, status, authorized_by, authorized_at)
     VALUES ($1,$2,$3,$4,$9,$5,$6,$7,$8,now()) RETURNING *`,
    [name, kind, url, headers ? encrypt(JSON.stringify(headers)) : null, hashApiKey(token), encrypt(token), v.oneOf(b.status || 'ACTIVE', 'Status', ['ACTIVE', 'DISABLED']), req.user.id, keys.length ? encrypt(JSON.stringify(keys)) : null]
  );
  await audit(req.user.id, 'PROXY_CREATE', 'proxy_channel', rows[0].id, { name, kind, host: new URL(url).hostname, with_header: !!headers, authorization_confirmed: true }, req.ip);
  res.status(201).json({ ok: true, channel: view(rows[0], req) });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const b = req.body || {};
  const cur = (await query('SELECT * FROM proxy_channels WHERE id=$1', [id])).rows[0];
  if (!cur) throw new HttpError(404, 'Channel haipo');
  const f = {};
  if (b.name !== undefined) f.name = v.str(b.name, 'Jina', { min: 2, max: 100 });
  if (b.kind !== undefined) f.kind = kindOf(b.kind);
  if (b.source_url !== undefined) f.source_url = await checkUrl(v.str(b.source_url, 'Source URL', { max: 2048 }), b.confirmAuthorized === true || !!cur.authorized_at);
  if (b.with_header === false) f.encrypted_headers = null;
  else if (b.headers !== undefined && String(b.headers).trim() !== '') { const h = parseHeaders(b.headers); f.encrypted_headers = h ? encrypt(JSON.stringify(h)) : null; }
  if (b.clearkey !== undefined) { const k = proxy.parseClearKeys(b.clearkey); f.clearkey_enc = k.length ? encrypt(JSON.stringify(k)) : null; }
  if (b.status !== undefined) f.status = v.oneOf(b.status, 'Status', ['ACTIVE', 'DISABLED']);
  const keys = Object.keys(f);
  if (!keys.length) throw v.bad('Hakuna mabadiliko');
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  const { rows } = await query(`UPDATE proxy_channels SET ${sets}, updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map((k) => f[k]), id]);
  await audit(req.user.id, 'PROXY_UPDATE', 'proxy_channel', id, { fields: keys.filter((k) => !['encrypted_headers', 'clearkey_enc'].includes(k)), headers_changed: keys.includes('encrypted_headers'), clearkey_changed: keys.includes('clearkey_enc') }, req.ip);
  res.json({ ok: true, channel: view(rows[0], req) });
}));

// New secret link; the old one stops working immediately.
router.post('/:id/regenerate', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const token = randomToken(24);
  const { rows } = await query('UPDATE proxy_channels SET token_hash=$1, token_enc=$2, updated_at=now() WHERE id=$3 RETURNING *', [hashApiKey(token), encrypt(token), id]);
  if (!rows[0]) throw new HttpError(404, 'Channel haipo');
  await audit(req.user.id, 'PROXY_REGENERATE', 'proxy_channel', id, null, req.ip);
  res.json({ ok: true, channel: view(rows[0], req) });
}));

router.post('/:id/test', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const r = (await query('SELECT * FROM proxy_channels WHERE id=$1', [id])).rows[0];
  if (!r) throw new HttpError(404, 'Channel haipo');
  let headers = {};
  try { if (r.encrypted_headers) headers = JSON.parse(decrypt(r.encrypted_headers)); } catch (_) { /* */ }
  try { res.json({ ok: true, result: await proxy.probe(r.source_url, headers) }); }
  catch (e) { res.json({ ok: false, error: e.expose ? e.message : 'Imeshindwa kufikia chanzo' }); }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const { rowCount } = await query('DELETE FROM proxy_channels WHERE id=$1', [id]);
  if (!rowCount) throw new HttpError(404, 'Channel haipo');
  await audit(req.user.id, 'PROXY_DELETE', 'proxy_channel', id, null, req.ip);
  res.json({ ok: true });
}));

module.exports = router;
