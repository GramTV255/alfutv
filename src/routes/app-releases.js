// Apps za kupakua: public (orodha, kupakua, picha za skrini) na admin (kupakia, kuhariri, kuzima, kufuta)
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { isStr, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const { optionalAuth } = require('../middleware/auth');

const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'other'];
const MIMES = { apk: 'application/vnd.android.package-archive', aab: 'application/octet-stream', ipa: 'application/octet-stream', exe: 'application/vnd.microsoft.portable-executable', msi: 'application/x-msi', zip: 'application/zip', dmg: 'application/x-apple-diskimage' };
// Aina zote za faili isipokuwa video na picha
const BLOCK = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|mpe?g|ts|jpe?g|png|gif|webp|bmp|svg|heic|heif|tiff?|ico)$/i;
const KINDS = ['app', 'document', 'archive', 'other'];
const SHOT_MIMES = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };
const MAX = 25 * 1024 * 1024, MAX_SHOT = 3 * 1024 * 1024, MAX_SHOTS = 8, MAX_LOGO = 1024 * 1024;
const dl = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

const publicRouter = express.Router();
const adminRouter = express.Router();
const safeName = (n) => String(n || 'app').replace(/[^\w.\-]+/g, '_').slice(0, 120);
const extOf = (n) => (String(n).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
const LIST_COLS = `id,title,platform,version,notes,file_name,size,download_count,created_at,developer,category,rating,price,file_kind,
  (SELECT count(*)::int FROM app_screenshots s WHERE s.release_id=app_releases.id) AS shots, (logo_data IS NOT NULL) AS has_logo`;

publicRouter.get('/', ah(async (req, res) => {
  const r = await query(`SELECT ${LIST_COLS} FROM app_releases WHERE active ORDER BY created_at DESC LIMIT 50`);
  const total = r.rows.reduce((a, x) => a + Number(x.download_count || 0), 0);
  res.json({ releases: r.rows, total_downloads: total });
}));

publicRouter.get('/:id/screenshots', ah(async (req, res) => {
  const r = await query('SELECT s.id FROM app_screenshots s JOIN app_releases a ON a.id=s.release_id WHERE s.release_id=$1 ORDER BY s.position, s.id',
    [parseInt(req.params.id, 10) || 0]);
  res.json({ shots: r.rows.map((x) => x.id) });
}));

publicRouter.get('/screenshots/:sid', ah(async (req, res) => {
  const r = await query('SELECT mime, data FROM app_screenshots WHERE id=$1', [parseInt(req.params.sid, 10) || 0]);
  const s = r.rows[0];
  if (!s) throw httpErr(404, 'Picha haipatikani.');
  res.set({ 'Content-Type': s.mime, 'Cache-Control': 'public, max-age=86400' });
  res.end(s.data);
}));

publicRouter.get('/:id/file', dl, optionalAuth, ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const m = (await query('SELECT id, price, active FROM app_releases WHERE id=$1', [id])).rows[0];
  if (!m) throw httpErr(404, 'Faili halipatikani.');   // app iliyofichwa inapatikana kwa link yenye ID yake
  if (m.price > 0) {
    const owned = req.user && (await query('SELECT 1 FROM app_purchases WHERE user_id=$1 AND release_id=$2', [req.user.id, id])).rowCount;
    if (!owned) throw httpErr(402, 'Lipia app hii ili kuipakua.');
  }
  // Upakuaji kwa vipande: faili haiwekwi kwenye kumbukumbu nzima (inaokoa RAM ya seva)
  const meta = (await query('UPDATE app_releases SET download_count=download_count+1 WHERE id=$1 RETURNING file_name,mime,size', [id])).rows[0];
  if (!meta) throw httpErr(404, 'Faili halipatikani.');
  res.set({ 'Content-Type': meta.mime, 'Content-Length': String(meta.size), 'Content-Disposition': `attachment; filename="${safeName(meta.file_name)}"`, 'Cache-Control': 'no-store' });
  const CH = 256 * 1024;
  let off = 1;
  while (off <= Number(meta.size) && !res.destroyed) {
    const c = (await query('SELECT substring(data FROM $2::int FOR $3::int) AS c FROM app_releases WHERE id=$1', [id, off, CH])).rows[0];
    if (!c || !c.c || !c.c.length) break;
    if (!res.write(c.c)) await new Promise((ok) => { res.once('drain', ok); res.once('close', ok); });
    off += c.c.length;
  }
  res.end();
}));

adminRouter.get('/', ah(async (req, res) => {
  const r = await query(`SELECT ${LIST_COLS}, active FROM app_releases ORDER BY created_at DESC`);
  res.json({ releases: r.rows });
}));

// Kupakia app: raw body; maelezo kwenye query string; jina la faili kwenye X-File-Name
adminRouter.post('/', express.raw({ type: '*/*', limit: MAX + 1024 }), ah(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(400, 'Chagua faili la kupakia.');
  if (buf.length > MAX) throw httpErr(413, 'Faili ni kubwa kuliko 25MB.');
  const title = String(req.query.title || '').trim().slice(0, 80);
  if (!isStr(title, 1, 80)) throw httpErr(400, 'Jina la app linahitajika.');
  const platform = PLATFORMS.includes(req.query.platform) ? req.query.platform : 'other';
  const version = String(req.query.version || '').trim().slice(0, 30);
  const notes = String(req.query.notes || '').trim().slice(0, 500);
  let fname = 'app.apk';
  try { fname = decodeURIComponent(String(req.headers['x-file-name'] || fname)); } catch (_) {}
  if (BLOCK.test(fname)) throw httpErr(400, 'Video na picha haziruhusiwi kwenye upload hii.');
  const mime = MIMES[extOf(fname)] || 'application/octet-stream';
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : 'app';
  const r = await query(
    'INSERT INTO app_releases(title,platform,version,notes,file_name,mime,size,data,file_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [title, platform, version, notes, safeName(fname), mime, buf.length, buf, kind]);
  await audit(req, 'app.upload', 'app_release', r.rows[0].id, { title, platform, version, size: buf.length });
  res.status(201).json({ id: r.rows[0].id });
}));

adminRouter.patch('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0, b = req.body || {};
  const r = await query(
    `UPDATE app_releases SET title=COALESCE($2,title), platform=COALESCE($3,platform), version=COALESCE($4,version),
       notes=COALESCE($5,notes), active=COALESCE($6,active) WHERE id=$1 RETURNING id`,
    [id, b.title ? String(b.title).trim().slice(0, 80) : null, PLATFORMS.includes(b.platform) ? b.platform : null,
     b.version != null ? String(b.version).slice(0, 30) : null, b.notes != null ? String(b.notes).slice(0, 500) : null,
     typeof b.active === 'boolean' ? b.active : null]);
  if (!r.rowCount) throw httpErr(404, 'App haipatikani.');
  await audit(req, 'app.update', 'app_release', id, { active: b.active });
  res.json({ ok: true });
}));

adminRouter.delete('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const r = await query('DELETE FROM app_releases WHERE id=$1 RETURNING title', [id]);
  if (!r.rowCount) throw httpErr(404, 'App haipatikani.');
  await audit(req, 'app.delete', 'app_release', id, { title: r.rows[0].title });
  res.json({ ok: true });
}));

// Picha za skrini: kupakia (PNG/JPG/WEBP, hadi 3MB, hadi 8 kwa app)
adminRouter.post('/:id/screenshots', express.raw({ type: '*/*', limit: MAX_SHOT + 1024 }), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!SHOT_MIMES[mime]) throw httpErr(400, 'Picha lazima iwe PNG, JPG au WEBP.');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(400, 'Chagua picha.');
  if (buf.length > MAX_SHOT) throw httpErr(413, 'Picha ni kubwa kuliko 3MB.');
  if (!(await query('SELECT 1 FROM app_releases WHERE id=$1', [id])).rowCount) throw httpErr(404, 'App haipatikani.');
  const c = (await query('SELECT count(*)::int n FROM app_screenshots WHERE release_id=$1', [id])).rows[0].n;
  if (c >= MAX_SHOTS) throw httpErr(400, 'Umefikia kiwango cha picha 8 kwa app hii.');
  const r = await query('INSERT INTO app_screenshots(release_id,mime,size,data,position) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [id, mime, buf.length, buf, c + 1]);
  await audit(req, 'app.screenshot_add', 'app_release', id, { shot: r.rows[0].id, size: buf.length });
  res.status(201).json({ id: r.rows[0].id });
}));

adminRouter.delete('/screenshots/:sid', ah(async (req, res) => {
  const sid = parseInt(req.params.sid, 10) || 0;
  const r = await query('DELETE FROM app_screenshots WHERE id=$1 RETURNING release_id', [sid]);
  if (!r.rowCount) throw httpErr(404, 'Picha haipatikani.');
  await audit(req, 'app.screenshot_delete', 'app_release', r.rows[0].release_id, { shot: sid });
  res.json({ ok: true });
}));

// Logo ya app: public kuiona, admin kuweka/kuondoa
publicRouter.get('/:id/logo', ah(async (req, res) => {
  const r = await query('SELECT logo_mime, logo_data FROM app_releases WHERE id=$1', [parseInt(req.params.id, 10) || 0]);
  const x = r.rows[0];
  if (!x || !x.logo_data) throw httpErr(404, 'Logo haipo.');
  res.set({ 'Content-Type': x.logo_mime, 'Cache-Control': 'public, max-age=86400' });
  res.end(x.logo_data);
}));

adminRouter.post('/:id/logo', express.raw({ type: '*/*', limit: MAX_LOGO + 1024 }), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!SHOT_MIMES[mime]) throw httpErr(400, 'Logo lazima iwe PNG, JPG au WEBP.');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(400, 'Chagua picha ya logo.');
  if (buf.length > MAX_LOGO) throw httpErr(413, 'Logo ni kubwa kuliko 1MB.');
  const r = await query('UPDATE app_releases SET logo_mime=$2, logo_data=$3 WHERE id=$1 RETURNING id', [id, mime, buf]);
  if (!r.rowCount) throw httpErr(404, 'App haipatikani.');
  await audit(req, 'app.logo_set', 'app_release', id, { size: buf.length });
  res.status(201).json({ ok: true });
}));

adminRouter.delete('/:id/logo', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const r = await query('UPDATE app_releases SET logo_mime=NULL, logo_data=NULL WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) throw httpErr(404, 'App haipatikani.');
  await audit(req, 'app.logo_remove', 'app_release', id, {});
  res.json({ ok: true });
}));

// Kubadilisha faili ya app/hati: faili mpya inachukua nafasi ya ile ya zamani (viungo vinabaki)
adminRouter.post('/:id/file', express.raw({ type: '*/*', limit: MAX + 1024 }), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(400, 'Chagua faili jipya.');
  if (buf.length > MAX) throw httpErr(413, 'Faili ni kubwa kuliko 25MB.');
  let fname = 'app.apk';
  try { fname = decodeURIComponent(String(req.headers['x-file-name'] || fname)); } catch (_) {}
  if (BLOCK.test(fname)) throw httpErr(400, 'Video na picha haziruhusiwi kwenye upload hii.');
  const mime = MIMES[extOf(fname)] || 'application/octet-stream';
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
  const r = await query(
    'UPDATE app_releases SET file_name=$2, mime=$3, size=$4, data=$5, file_kind=COALESCE($6, file_kind) WHERE id=$1 RETURNING id',
    [id, safeName(fname), mime, buf.length, buf, kind]);
  if (!r.rowCount) throw httpErr(404, 'App haipatikani.');
  await audit(req, 'app.file_replace', 'app_release', id, { file: safeName(fname), size: buf.length });
  res.json({ ok: true, size: buf.length });
}));

module.exports = { publicRouter, adminRouter };
