'use strict';
const express = require('express');
const { query, tx } = require('../database/pool');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const { config } = require('../config');
const { requireAuth, csrfProtect, requireAdmin } = require('../middleware/auth');
const { audit } = require('../services/auditService');
const { activateSubscription, revokeSubscription } = require('../services/subscriptionService');
const { issueReset } = require('../services/authService');
const { overview } = require('../services/statsService');
const { setSetting, deleteSetting, getSetting, settingExists } = require('../services/settingsService');
const { encrypt, decrypt } = require('../utils/crypto');
const clickpesa = require('../services/clickpesaService');
const extraction = require('../services/extractionService');
const { validateSourceUrl, allowedHosts, isDirectMpd, addAllowedHost } = require('../services/safeHttp');

// Source link: a direct .mpd link is accepted from any public host (and http). Any other source page is contacted by this server,
// so its host goes on the allowlist: automatically, because saving it needs the authorisation checkbox.
async function checkSourceUrl(raw, authorized, req) {
  if (isDirectMpd(raw)) return (await validateSourceUrl(raw, { allowHttp: true, anyHost: true })).toString();
  let host = null; try { host = new URL(raw).hostname; } catch (_) { /* validate below */ }
  if (host && authorized && (await addAllowedHost(host))) await audit(req.user.id, 'ALLOWED_HOSTS_AUTO', 'settings', 'source_allowed_hosts', { host }, req.ip);
  return (await validateSourceUrl(raw)).toString();
}
const { parseHeaders } = require('../utils/headers');

const router = express.Router();
router.use(requireAuth, csrfProtect, requireAdmin);

const pageOf = (req, def = 25) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || def, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
};
const like = (s) => `%${String(s).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

// ---------- Dashboard ----------
router.get('/stats', wrap(async (_req, res) => res.json(await overview())));

// ---------- Users ----------
router.get('/users', wrap(async (req, res) => {
  const { limit, offset, page } = pageOf(req);
  const params = [];
  let where = `u.role='USER'`;
  if (req.query.search) {
    params.push(like(req.query.search));
    where += ` AND (u.phone_number ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`;
  }
  const total = (await query(`SELECT count(*) FROM users u WHERE ${where}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.phone_number, u.account_status, u.created_at,
            k.key_prefix, k.status AS key_status,
            s.status AS sub_status, s.expires_at AS sub_expires_at, s.starts_at AS sub_starts_at, p.name AS package_name, p.duration_days AS package_days
       FROM users u
       LEFT JOIN LATERAL (SELECT key_prefix, status FROM api_keys WHERE user_id=u.id AND status<>'REVOKED' ORDER BY created_at DESC LIMIT 1) k ON TRUE
       LEFT JOIN LATERAL (SELECT status, expires_at, starts_at, package_id FROM subscriptions WHERE user_id=u.id AND status='ACTIVE' ORDER BY expires_at DESC LIMIT 1) s ON TRUE
       LEFT JOIN packages p ON p.id = s.package_id
      WHERE ${where} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ total, page, limit, users: rows });
}));

async function setStatus(req, res, status) {
  const id = v.uuid(req.params.id);
  const target = (await query('SELECT id, role FROM users WHERE id=$1', [id])).rows[0];
  if (!target) throw new HttpError(404, 'Mtumiaji hapatikani');
  if (target.role === 'ADMIN') throw new HttpError(400, 'Akaunti ya admin haiwezi kusimamishwa hapa');
  // token_version bump logs the user out everywhere immediately
  await query(`UPDATE users SET account_status=$2, token_version=token_version+1, updated_at=now() WHERE id=$1`, [id, status]);
  await audit(req.user.id, status === 'SUSPENDED' ? 'USER_SUSPEND' : 'USER_RESTORE', 'user', id, null, req.ip);
  res.json({ ok: true, status });
}
router.post('/users/:id/suspend', wrap((req, res) => setStatus(req, res, 'SUSPENDED')));
router.post('/users/:id/restore', wrap((req, res) => setStatus(req, res, 'ACTIVE')));

// Issues a one-time reset code. The admin never sees or sets the user's password.
router.post('/users/:id/reset-password', wrap(async (req, res) => {
  const id = v.uuid(req.params.id);
  const u = (await query('SELECT id, phone_number, role FROM users WHERE id=$1', [id])).rows[0];
  if (!u) throw new HttpError(404, 'Mtumiaji hapatikani');
  if (u.role === 'ADMIN') throw new HttpError(400, 'Admin hawezi kureset hapa');
  const r = await issueReset(id, req.user.id);
  await audit(req.user.id, 'PASSWORD_RESET_ISSUED', 'user', id, null, req.ip);
  res.json({ ok: true, phone: u.phone_number, code: r.code, expires_in_minutes: r.expiresInMinutes, message: 'Mpe mtumiaji code hii kwa njia salama (mfano simu). Inaonyeshwa mara moja tu.' });
}));

router.get('/password-resets', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT r.id, u.id AS user_id, u.full_name, u.phone_number, r.created_at FROM password_resets r
       JOIN users u ON u.id=r.user_id WHERE r.status='REQUESTED' AND r.created_at > now() - interval '7 days' ORDER BY r.created_at DESC LIMIT 50`
  );
  res.json({ requests: rows });
}));

// ---------- Packages ----------
function parsePackage(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) out.name = v.str(b.name, 'Jina la kifurushi', { min: 2, max: 80 });
  if (!partial || b.price !== undefined) out.price = v.int(b.price, 'Bei (TZS)', { min: 1, max: 100000000 });
  if (!partial || b.duration_days !== undefined) out.duration_days = v.int(b.duration_days, 'Muda (siku)', { min: 1, max: 3650 });
  if (b.status !== undefined) out.status = v.oneOf(b.status, 'Hali', ['ACTIVE', 'DISABLED']);
  return out;
}

router.get('/packages', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, (SELECT count(*) FROM subscriptions s WHERE s.package_id=p.id) AS subscriptions,
            (SELECT count(*) FROM payments y WHERE y.package_id=p.id) AS payments
       FROM packages p ORDER BY p.price ASC, p.id ASC`
  );
  res.json({ packages: rows });
}));

router.post('/packages', wrap(async (req, res) => {
  const p = parsePackage(req.body || {});
  const { rows } = await query(`INSERT INTO packages (name, price, duration_days, status) VALUES ($1,$2,$3,$4) RETURNING *`, [p.name, p.price, p.duration_days, p.status || 'ACTIVE']);
  await audit(req.user.id, 'PACKAGE_CREATE', 'package', rows[0].id, p, req.ip);
  res.status(201).json({ ok: true, package: rows[0] });
}));

router.put('/packages/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const p = parsePackage(req.body || {}, true);
  const keys = Object.keys(p);
  if (!keys.length) throw v.bad('Hakuna cha kubadilisha');
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const { rows } = await query(`UPDATE packages SET ${sets} WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => p[k])]);
  if (!rows[0]) throw new HttpError(404, 'Kifurushi hakipatikani');
  await audit(req.user.id, 'PACKAGE_UPDATE', 'package', id, p, req.ip);
  res.json({ ok: true, package: rows[0] });
}));

router.delete('/packages/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const used = (await query(`SELECT (SELECT count(*) FROM subscriptions WHERE package_id=$1) + (SELECT count(*) FROM payments WHERE package_id=$1) AS n`, [id])).rows[0].n;
  if (used > 0) throw new HttpError(409, 'Kifurushi hiki kimeshatumika (malipo/subscriptions). Kizime badala ya kukifuta.', 'IN_USE');
  const r = await query('DELETE FROM packages WHERE id=$1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Kifurushi hakipatikani');
  await audit(req.user.id, 'PACKAGE_DELETE', 'package', id, null, req.ip);
  res.json({ ok: true });
}));

// ---------- WhatsApp contact (button shown to users) ----------
function whatsappNumber(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const tz = require('../utils/phone').normalizePhone(t);
  if (tz) return tz;
  const d = t.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (!/^[1-9]\d{7,14}$/.test(d)) throw v.bad('Namba ya WhatsApp si sahihi. Tumia muundo wa kimataifa, mfano 255712345678.');
  return d;
}
router.get('/contact', wrap(async (_req, res) => {
  res.json({ whatsapp: (await getSetting('whatsapp_number')) || '', message: (await getSetting('whatsapp_message')) || '' });
}));
router.put('/contact', wrap(async (req, res) => {
  const b = req.body || {};
  const number = whatsappNumber(b.whatsapp);
  const message = b.message ? v.str(b.message, 'Ujumbe', { max: 300 }) : '';
  if (number) await setSetting('whatsapp_number', number); else await deleteSetting('whatsapp_number');
  if (b.message !== undefined) { if (message) await setSetting('whatsapp_message', message); else await deleteSetting('whatsapp_message'); }
  await audit(req.user.id, 'CONTACT_UPDATE', 'settings', 'whatsapp', { set: !!number }, req.ip);
  res.json({ ok: true, whatsapp: number, message });
}));

// ---------- Channel sources ----------
function parseRules(r) {
  if (r === undefined || r === null || r === '') return {};
  let obj = r;
  if (typeof r === 'string') {
    try { obj = JSON.parse(r); } catch (_) { throw v.bad('Extraction rules si JSON sahihi'); }
  }
  return extraction.validateRules(obj);
}

// Admin gives a user a package for free (or for a custom number of days). Extends a running subscription.
router.post('/users/:id/grant', wrap(async (req, res) => {
  const id = v.uuid(req.params.id);
  const b = req.body || {};
  const packageId = v.int(b.packageId, 'Kifurushi');
  const days = b.days === undefined || b.days === '' || b.days === null ? null : v.int(b.days, 'Siku');
  if (days !== null && (days < 1 || days > 3650)) throw v.bad('Siku ziwe kati ya 1 na 3650');
  const target = (await query('SELECT id, role, account_status FROM users WHERE id=$1', [id])).rows[0];
  if (!target || target.role !== 'USER') throw new HttpError(404, 'Mtumiaji hapatikani');
  if (!(await query('SELECT 1 FROM packages WHERE id=$1', [packageId])).rowCount) throw new HttpError(404, 'Kifurushi hakipo');
  const r = await tx((c) => activateSubscription(c, { userId: id, packageId, paymentId: null, durationDays: days, grantedBy: req.user.id, replace: b.mode === 'replace' }));
  await audit(req.user.id, 'SUBSCRIPTION_GRANT', 'user', id, { packageId, days, mode: b.mode === 'replace' ? 'replace' : 'extend' }, req.ip);
  res.json({ ok: true, expires_at: r.subscription.expires_at, key_activated: r.keyActivated });
}));

router.post('/users/:id/revoke-subscription', wrap(async (req, res) => {
  const id = v.uuid(req.params.id);
  const n = await tx((c) => revokeSubscription(c, id));
  await audit(req.user.id, 'SUBSCRIPTION_REVOKE', 'user', id, { count: n }, req.ip);
  res.json({ ok: true, revoked: n });
}));

const sourceRow = (s) => {
  let headerNames = [];
  try { if (s.encrypted_headers) headerNames = Object.keys(JSON.parse(decrypt(s.encrypted_headers))); } catch (_) { /* ignore */ }
  let tokenTypes = [];
  try { if (s.tokens_enc) tokenTypes = [...new Set(JSON.parse(decrypt(s.tokens_enc)).map((t) => t.type))]; } catch (_) { /* ignore */ }
  const { encrypted_headers, tokens_enc, ...rest } = s;
  return { ...rest, header_names: headerNames, token_types: tokenTypes }; // header VALUES never leave the server
};

const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'source';
const parseSlug = (x) => {
  const t = String(x).trim().toLowerCase();
  if (t === 'all') throw v.bad('Slug "all" imehifadhiwa kwa endpoint ya source zote');
  if (!/^[a-z0-9][a-z0-9-]{0,78}$/.test(t) || /^\d+$/.test(t)) throw v.bad('Slug: herufi ndogo, namba na "-" pekee (si namba peke yake), hadi herufi 80');
  return t;
};
async function uniqueSlug(base, exceptId) {
  let slug = base, n = 2;
  for (;;) {
    const r = await query('SELECT 1 FROM channel_sources WHERE slug=$1 AND id <> $2', [slug, exceptId || 0]);
    if (!r.rowCount && !/^\d+$/.test(slug) && slug !== 'all') return slug;
    slug = `${base}-${n++}`;
  }
}
const parseInterval = (x) => {
  if (x === undefined || x === null || x === '') return 3;
  const n = Number(x);
  if (!Number.isInteger(n) || n < 1 || n > 60) throw v.bad('Muda wa kuangalia source uwe dakika 1 hadi 60');
  return n;
};

router.get('/sources', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT s.*, c.channel_name, c.status AS channel_status, c.tokens_enc, c.extracted_at, c.token_expires_at, (c.mpd_url_enc IS NOT NULL) AS has_mpd, (c.clearkey_enc IS NOT NULL) AS has_clearkey,
            CASE WHEN c.extracted_value IS NULL THEN NULL ELSE left(c.extracted_value,4) || '…' END AS value_preview
       FROM channel_sources s LEFT JOIN channels c ON c.source_id=s.id ORDER BY s.id ASC`
  );
  res.json({ sources: rows.map(sourceRow), allowed_hosts: await allowedHosts() });
}));

router.post('/sources', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.confirmAuthorized !== true) throw v.bad('Thibitisha kuwa una idhini ya kutumia chanzo hiki (authorization checkbox).');
  const name = v.str(b.source_name, 'Source Name', { min: 2, max: 100 });
  const url = await checkSourceUrl(v.str(b.source_url, 'Source URL', { max: 2048 }), true, req);
  const method = v.oneOf((b.http_method || 'GET').toUpperCase(), 'HTTP Method', ['GET', 'POST']);
  const headers = parseHeaders(b.headers);
  const rules = parseRules(b.extraction_rules);
  const status = v.oneOf(b.status || 'DISABLED', 'Source Status', ['ACTIVE', 'DISABLED']);
  const interval = parseInterval(b.interval_minutes);
  const slug = b.slug ? await uniqueSlug(parseSlug(b.slug)) : await uniqueSlug(slugify(name));
  const { rows } = await query(
    `INSERT INTO channel_sources (source_name, source_url, http_method, content_type, request_body, encrypted_headers, extraction_rules, status, authorized_by, authorized_at, interval_minutes, slug)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11) RETURNING *`,
    [name, url, method, b.content_type ? v.str(b.content_type, 'Content Type', { max: 100 }) : null, b.request_body ? v.str(b.request_body, 'Body', { max: 5000 }) : null,
      headers ? encrypt(JSON.stringify(headers)) : null, JSON.stringify(rules), status, req.user.id, interval, slug]
  );
  await audit(req.user.id, 'SOURCE_CREATE', 'channel_source', rows[0].id, { name, host: new URL(url).hostname, authorization_confirmed: true }, req.ip);
  if (status === 'ACTIVE') extraction.runExtraction(rows[0].id, 'ADMIN').catch(() => {}); // first fetch right away; then every interval
  res.status(201).json({ ok: true, source: sourceRow(rows[0]) });
}));

router.put('/sources/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const b = req.body || {};
  const cur = (await query('SELECT * FROM channel_sources WHERE id=$1', [id])).rows[0];
  if (!cur) throw new HttpError(404, 'Source haipo');
  const f = {};
  if (b.source_name !== undefined) f.source_name = v.str(b.source_name, 'Source Name', { min: 2, max: 100 });
  if (b.source_url !== undefined) f.source_url = await checkSourceUrl(v.str(b.source_url, 'Source URL', { max: 2048 }), b.confirmAuthorized === true || !!cur.authorized_at, req);
  if (b.http_method !== undefined) f.http_method = v.oneOf(String(b.http_method).toUpperCase(), 'HTTP Method', ['GET', 'POST']);
  if (b.content_type !== undefined) f.content_type = b.content_type ? v.str(b.content_type, 'Content Type', { max: 100 }) : null;
  if (b.request_body !== undefined) f.request_body = b.request_body ? v.str(b.request_body, 'Body', { max: 5000 }) : null;
  if (b.headers !== undefined) { const h = parseHeaders(b.headers); f.encrypted_headers = h ? encrypt(JSON.stringify(h)) : null; }
  if (b.slug !== undefined && b.slug !== '') {
    const sl = parseSlug(b.slug);
    if (sl !== cur.slug) {
      if ((await query('SELECT 1 FROM channel_sources WHERE slug=$1 AND id<>$2', [sl, id])).rowCount) throw v.bad('Slug hii tayari inatumika na source nyingine');
      f.slug = sl;
    }
  }
  if (b.interval_minutes !== undefined) f.interval_minutes = parseInterval(b.interval_minutes);
  if (b.extraction_rules !== undefined) f.extraction_rules = JSON.stringify(parseRules(b.extraction_rules));
  if (b.status !== undefined) {
    f.status = v.oneOf(b.status, 'Source Status', ['ACTIVE', 'DISABLED']);
    if (f.status === 'ACTIVE' && !cur.authorized_at && b.confirmAuthorized !== true) throw v.bad('Thibitisha idhini ya kutumia chanzo kabla ya kukiwasha.');
    if (f.status === 'ACTIVE' && b.confirmAuthorized === true) { f.authorized_by = req.user.id; f.authorized_at = new Date(); }
  }
  const keys = Object.keys(f);
  if (!keys.length) throw v.bad('Hakuna cha kubadilisha');
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const { rows } = await query(`UPDATE channel_sources SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => f[k])]);
  if (f.source_url || f.encrypted_headers !== undefined || f.extraction_rules) {
    // old extracted value may no longer match the new settings
    // the stored token is kept (tokens never expire); the new settings are run right away below and replace it
  }
  if (rows[0].status === 'ACTIVE' && (f.status === 'ACTIVE' || f.source_url || f.encrypted_headers !== undefined || f.extraction_rules)) {
    extraction.runExtraction(id, 'ADMIN').catch(() => {});
  }
  await audit(req.user.id, 'SOURCE_UPDATE', 'channel_source', id, { fields: keys.filter((k) => k !== 'encrypted_headers') , headers_changed: keys.includes('encrypted_headers') }, req.ip);
  res.json({ ok: true, source: sourceRow(rows[0]) });
}));

router.delete('/sources/:id', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const r = await query('DELETE FROM channel_sources WHERE id=$1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Source haipo');
  await audit(req.user.id, 'SOURCE_DELETE', 'channel_source', id, null, req.ip);
  res.json({ ok: true });
}));

// Runs one real extraction against the authorized source. Only a masked preview is returned.
router.post('/sources/:id/extract', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  try {
    const r = await extraction.runExtraction(id, 'ADMIN');
    await audit(req.user.id, 'SOURCE_EXTRACT', 'channel_source', id, { ok: true }, req.ip);
    res.json({ ok: true, result: { host: r.host, value_preview: r.valuePreview, value_length: r.valueLength, expires_at: r.expiresAt } });
  } catch (e) {
    await audit(req.user.id, 'SOURCE_EXTRACT', 'channel_source', id, { ok: false }, req.ip);
    res.status(e.status && e.status < 500 ? e.status : 502).json({ ok: false, error: e.message, code: e.code || 'EXTRACTION_FAILED' });
  }
}));

router.get('/sources/:id/logs', wrap(async (req, res) => {
  const id = v.int(req.params.id, 'ID');
  const { rows } = await query(`SELECT success, message, http_status, duration_ms, triggered_by, created_at FROM extraction_logs WHERE source_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]);
  res.json({ logs: rows });
}));

router.put('/allowed-hosts', wrap(async (req, res) => {
  const raw = v.str((req.body || {}).hosts, 'Hosts', { optional: true, max: 2000 }) || '';
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const h of list) if (!/^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) throw v.bad(`Host "${h}" si sahihi (tumia mfano example.com au *.example.com)`);
  if (list.length) await setSetting('source_allowed_hosts', list.join(',')); else await deleteSetting('source_allowed_hosts');
  await audit(req.user.id, 'ALLOWED_HOSTS_UPDATE', 'settings', 'source_allowed_hosts', { count: list.length }, req.ip);
  res.json({ ok: true, allowed_hosts: await allowedHosts() });
}));

// ---------- Payments ----------
router.get('/payments', wrap(async (req, res) => {
  const { limit, offset, page } = pageOf(req);
  const params = [];
  const where = ['1=1'];
  if (req.query.status) {
    const st = v.oneOf(String(req.query.status).toUpperCase(), 'Status', ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED']);
    if (st === 'PENDING') where.push(`p.payment_status IN ('PENDING','PROCESSING')`);
    else { params.push(st); where.push(`p.payment_status=$${params.length}`); }
  }
  if (req.query.search) {
    params.push(like(req.query.search));
    where.push(`(p.transaction_id ILIKE $${params.length} OR u.phone_number ILIKE $${params.length} OR p.provider_reference ILIKE $${params.length})`);
  }
  const total = (await query(`SELECT count(*) FROM payments p JOIN users u ON u.id=p.user_id WHERE ${where.join(' AND ')}`, params)).rows[0].count;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT p.id, p.transaction_id, p.amount, p.currency, p.payment_status, p.provider_status, p.provider_reference, p.failure_message, p.payment_phone,
            p.created_at, p.confirmed_at, u.full_name, u.phone_number, k.name AS package_name
       FROM payments p JOIN users u ON u.id=p.user_id JOIN packages k ON k.id=p.package_id
      WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ total, page, limit, payments: rows });
}));

// Re-checks one payment with ClickPesa's query API.
router.post('/payments/:ref/verify', wrap(async (req, res) => {
  const ref = req.params.ref;
  if (!/^[A-Za-z0-9]{1,20}$/.test(ref)) throw v.bad('Reference si sahihi');
  const { verifyPayment } = require('../services/paymentService');
  const r = await verifyPayment(ref);
  await audit(req.user.id, 'PAYMENT_VERIFY', 'payment', ref, { result: r.status }, req.ip);
  res.json({ ok: true, result: r.status });
}));

// ---------- ClickPesa settings ----------
router.get('/clickpesa', wrap(async (req, res) => {
  const [cid, key, chk, net] = await Promise.all([
    settingExists('clickpesa_client_id'), settingExists('clickpesa_api_key'), settingExists('clickpesa_checksum_key'), getSetting('clickpesa_accept_net_amount'),
  ]);
  const clientId = await getSetting('clickpesa_client_id');
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  const events = (await query(`SELECT event, order_ref, verified, outcome, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 15`)).rows;
  res.json({
    configured: !!(cid && key),
    client_id_masked: clientId ? `${clientId.slice(0, 4)}…${clientId.slice(-3)}` : null,
    api_key_set: !!key,
    checksum_key_set: !!chk,
    accept_net_amount: net === '1',
    webhook_url: `${base}/api/webhooks/clickpesa`,
    webhook_events: ['PAYMENT RECEIVED', 'PAYMENT FAILED'],
    recent_webhooks: events,
  });
}));

router.put('/clickpesa', wrap(async (req, res) => {
  const b = req.body || {};
  const changed = [];
  if (b.client_id) { await setSetting('clickpesa_client_id', v.str(b.client_id, 'Client ID', { max: 120 })); changed.push('client_id'); }
  if (b.api_key) { await setSetting('clickpesa_api_key', v.str(b.api_key, 'API Key', { max: 300 })); changed.push('api_key'); }
  if (b.checksum_key) { await setSetting('clickpesa_checksum_key', v.str(b.checksum_key, 'Checksum Key', { max: 300 })); changed.push('checksum_key'); }
  if (b.clear_checksum_key === true) { await deleteSetting('clickpesa_checksum_key'); changed.push('checksum_key_removed'); }
  if (typeof b.accept_net_amount === 'boolean') { await setSetting('clickpesa_accept_net_amount', b.accept_net_amount ? '1' : '0'); changed.push('accept_net_amount'); }
  clickpesa.resetTokenCache(); // ClickPesa: tokens must be regenerated after credential/checksum changes
  await audit(req.user.id, 'CLICKPESA_SETTINGS_UPDATE', 'settings', 'clickpesa', { changed }, req.ip);
  res.json({ ok: true, changed });
}));

router.post('/clickpesa/test', wrap(async (req, res) => {
  const r = await clickpesa.testConnection();
  await audit(req.user.id, 'CLICKPESA_TEST', 'settings', 'clickpesa', { ok: r.ok }, req.ip);
  res.json(r);
}));

// ---------- Audit ----------
router.get('/audit', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.ip, a.created_at, u.phone_number AS admin_phone
       FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json({ logs: rows });
}));

module.exports = router;
