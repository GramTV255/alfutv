'use strict';
const express = require('express');
const { query } = require('../database/pool');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const { config } = require('../config');
const { requireAuth, csrfProtect, requireAdmin } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { encrypt, decrypt } = require('../utils/crypto');
const { validateSourceUrl } = require('../services/safeHttp');
const { parseClearKeys } = require('../services/proxyService');
const A = require('../services/amiriService');

const router = express.Router();
router.use(requireAuth, csrfProtect, requireAdmin);

const base = (req) => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
const keysText = (list) => list.map((k) => `${k.kid}:${k.key}`).join(',');
const slugOf = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'channel';
async function uniqueSlug(s, exceptId = 0) {
  let slug = ['all', 'list'].includes(s) ? `${s}-1` : s;
  for (let i = 2; ; i++) {
    const r = await query('SELECT 1 FROM amiri_channels WHERE slug=$1 AND id<>$2', [slug, exceptId]);
    if (!r.rows.length) return slug;
    slug = `${s}-${i}`;
  }
}

function view(r, req) {
  let template = ''; try { template = decrypt(r.template_enc); } catch (_) { /* */ }
  const ok = A.tokenOk(r);
  let keys = []; try { if (r.clearkey_enc) keys = decrypt(r.clearkey_enc).split(',').filter(Boolean); } catch (_) { /* */ }
  let host = null; try { host = new URL(A.sample(template)).hostname; } catch (_) { /* */ }
  let types = []; try { if (r.tokens_enc) types = [...new Set(JSON.parse(decrypt(r.tokens_enc)).map((t) => t.type))]; } catch (_) { /* */ }
  const wantsCdn = /cdntoken=\{token|tok_=\{token/i.test(template);
  const token_note = !ok ? null : (wantsCdn && !types.includes('cdntoken') && !types.includes('tok_=') && !types.includes('jwt') ? 'Source haina cdntoken (ina: ' + (types.join(', ') || 'hakuna') + '). Link inatumia token nyingine.' : null);
  return { token_types: types, token_note, id: r.id, name: r.name, slug: r.slug, source_id: r.source_id, source_name: r.source_name, status: r.status, host,
    token_state: ok ? 'VALID' : (r.ch_status || 'EMPTY'), token_expires_at: null,
    template, preview: ok ? A.fill(template, A.maskToken(A.tokenFor(r, template))) : template,
    link: ok ? A.fill(template, A.tokenFor(r, template)) : null, clearkeys: keys,
    endpoint: `${base(req)}/api/v1/amiri/${r.slug}`, created_at: r.created_at };
}
const getRow = async (id) => (await query(`${A.SELECT} WHERE a.id=$1`, [id])).rows[0];
const sourceInfo = async (sourceId) => {
  const s = (await query(`SELECT s.id, s.extraction_rules, c.extracted_value FROM channel_sources s LEFT JOIN channels c ON c.source_id=s.id WHERE s.id=$1`, [sourceId])).rows[0];
  if (!s) throw v.bad('Source haipo');
  return s;
};
const parseLink = async (raw, src) => {
  const link = v.str(raw, 'Link', { max: 2048 }).trim();
  // the host is checked on the real link (marker replaced by a harmless placeholder)
  await validateSourceUrl(A.sample(link), { allowHttp: true, anyHost: true }); // stored link, never fetched: any public host
  const rules = typeof src.extraction_rules === 'string' ? JSON.parse(src.extraction_rules) : (src.extraction_rules || {});
  return A.makeTemplate(link, src.extracted_value, rules.tokenRegex);
};

router.get('/', wrap(async (req, res) => {
  const rows = (await query(`${A.SELECT} ORDER BY a.id DESC`)).rows;
  const sources = (await query('SELECT id, source_name FROM channel_sources ORDER BY id')).rows;
  const ids = [...new Set(rows.map((r) => r.source_id))];
  res.json({ channels: rows.map((r) => view(r, req)), sources, common_source_id: ids.length === 1 ? ids[0] : null });
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.confirmAuthorized !== true) throw v.bad('Thibitisha kuwa una idhini ya kutumia link hii (authorization checkbox).');
  const name = v.str(b.name, 'Jina', { min: 2, max: 100 });
  const sourceId = v.int(b.source_id, 'Source');
  const src = await sourceInfo(sourceId);
  const t = await parseLink(b.link, src);
  const keys = parseClearKeys(b.clearkey);
  const slug = await uniqueSlug(b.slug ? slugOf(b.slug) : slugOf(name));
  const { rows } = await query(
    `INSERT INTO amiri_channels (name, slug, source_id, template_enc, clearkey_enc, status, authorized_by, authorized_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id`,
    [name, slug, sourceId, encrypt(t.template), keys.length ? encrypt(keysText(keys)) : null, v.oneOf(b.status || 'ACTIVE', 'Status', ['ACTIVE', 'DISABLED']), req.user.id]);
  await audit(req.user.id, 'AMIRI_CREATE', 'amiri_channel', rows[0].id, { name, source_id: sourceId, detected: t.method, authorization_confirmed: true }, req.ip);
  res.status(201).json({ ok: true, detected: t.method, channel: view(await getRow(rows[0].id), req) });
}));

// One switch for every channel: all amiri channels take their token from this source.
router.put('/source-all', wrap(async (req, res) => {
  const sourceId = v.int((req.body || {}).source_id, 'Source');
  await sourceInfo(sourceId);
  const r = await query('UPDATE amiri_channels SET source_id=$1, updated_at=now() WHERE source_id<>$1', [sourceId]);
  await audit(req.user.id, 'AMIRI_SOURCE_ALL', 'amiri_channel', null, { source_id: sourceId, changed: r.rowCount }, req.ip);
  res.json({ ok: true, changed: r.rowCount });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const b = req.body || {};
  const cur = await getRow(id);
  if (!cur) throw new HttpError(404, 'Channel haipo');
  const f = {};
  let detected = null;
  if (b.name !== undefined) f.name = v.str(b.name, 'Jina', { min: 2, max: 100 });
  if (b.slug) f.slug = await uniqueSlug(slugOf(b.slug), id);
  const sourceId = b.source_id !== undefined ? v.int(b.source_id, 'Source') : cur.source_id;
  if (b.source_id !== undefined) f.source_id = sourceId;
  if (b.link !== undefined && String(b.link).trim() !== '') { const t = await parseLink(b.link, await sourceInfo(sourceId)); f.template_enc = encrypt(t.template); detected = t.method; }
  if (b.clearkey !== undefined) { const k = parseClearKeys(b.clearkey === '-' ? '' : b.clearkey); f.clearkey_enc = k.length ? encrypt(keysText(k)) : null; }
  if (b.status !== undefined) f.status = v.oneOf(b.status, 'Status', ['ACTIVE', 'DISABLED']);
  const ks = Object.keys(f);
  if (!ks.length) throw v.bad('Hakuna mabadiliko');
  await query(`UPDATE amiri_channels SET ${ks.map((k, i) => `${k}=$${i + 1}`).join(', ')}, updated_at=now() WHERE id=$${ks.length + 1}`, [...ks.map((k) => f[k]), id]);
  await audit(req.user.id, 'AMIRI_UPDATE', 'amiri_channel', id, { fields: ks.filter((k) => !['template_enc', 'clearkey_enc'].includes(k)), link_changed: ks.includes('template_enc'), clearkey_changed: ks.includes('clearkey_enc') }, req.ip);
  res.json({ ok: true, detected, channel: view(await getRow(id), req) });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const { rowCount } = await query('DELETE FROM amiri_channels WHERE id=$1', [id]);
  if (!rowCount) throw new HttpError(404, 'Channel haipo');
  await audit(req.user.id, 'AMIRI_DELETE', 'amiri_channel', id, null, req.ip);
  res.json({ ok: true });
}));

module.exports = router;
