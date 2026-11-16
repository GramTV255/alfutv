// Muonekano wa Store: banners, sehemu (tabs), maelezo ya app, maoni. Public na admin.
const express = require('express');
const { query } = require('../config/database');
const { ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const pay = require('../services/payment-service');
const PLAT = ['android', 'ios', 'windows', 'mac', 'other'];

const IMG = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };
const MAX_BANNER = 2 * 1024 * 1024;
const pub = express.Router();
const adm = express.Router();
const id_ = (v) => parseInt(v, 10) || 0;
const mimeOf = (req) => String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
const color = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : '#6aa86a');
const ratingOf = (v) => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 5 ? Math.round(n * 2) / 2 : null; };

async function ratingsMap() {
  const r = await query('SELECT release_id, round(avg(rating),1)::float AS avg, count(*)::int AS n FROM app_reviews GROUP BY release_id');
  const m = {}; r.rows.forEach((x) => (m[x.release_id] = x)); return m;
}

// ---------------- PUBLIC ----------------
pub.get('/', optionalAuth, ah(async (req, res) => {
  const [apps, banners, secs, items, rm] = await Promise.all([
    query(`SELECT id,title,platform,version,notes,file_name,size,download_count,created_at,developer,category,rating,
      (SELECT count(*)::int FROM app_screenshots s WHERE s.release_id=app_releases.id) AS shots, (logo_data IS NOT NULL) AS has_logo,
      price, EXISTS (SELECT 1 FROM app_purchases ap WHERE ap.release_id=app_releases.id AND ap.user_id=$1) AS owned
      FROM app_releases WHERE active ORDER BY created_at DESC`, [req.user ? req.user.id : 0]),
    query('SELECT id,title,subtitle,bg_color,release_id,(image_data IS NOT NULL) AS has_image FROM store_banners WHERE active ORDER BY position,id'),
    query('SELECT id,tab,title,kind FROM store_sections WHERE active ORDER BY position,id'),
    query('SELECT section_id, release_id FROM store_section_apps ORDER BY position, release_id'),
    ratingsMap(),
  ]);
  const list = apps.rows.map((a) => {
    const rv = rm[a.id];
    return { ...a, rating: a.rating != null ? Number(a.rating) : (rv ? rv.avg : null), reviews: rv ? rv.n : 0 };
  });
  const live = new Set(list.map((a) => a.id));
  const sections = secs.rows.map((s) => ({ ...s, apps: items.rows.filter((i) => i.section_id === s.id && live.has(i.release_id)).map((i) => i.release_id) }))
    .filter((s) => s.apps.length);
  const tabs = [...new Set(sections.map((s) => s.tab))];
  res.json({
    banners: banners.rows.filter((b) => b.release_id == null || live.has(b.release_id)),
    tabs, sections, apps: list,
    total_downloads: list.reduce((a, x) => a + Number(x.download_count || 0), 0),
  });
}));

// Kununua app: malipo yanaenda kwenye mfumo wa malipo wa sasa, bila kugusa vifurushi
pub.post('/apps/:id/buy', requireAuth, ah(async (req, res) => {
  const body = req.body || {};
  const r = await pay.createPayment(req.user, { appId: id_(req.params.id), phone: body.phone || req.user.phone });
  res.status(201).json(r);
}));

pub.get('/banners/:id/image', ah(async (req, res) => {
  const r = await query('SELECT image_mime, image_data FROM store_banners WHERE id=$1', [id_(req.params.id)]);
  const b = r.rows[0];
  if (!b || !b.image_data) throw httpErr(404, 'Picha haipo.');
  res.set({ 'Content-Type': b.image_mime, 'Cache-Control': 'public, max-age=86400' });
  res.end(b.image_data);
}));

// App moja kwa ID: inapatikana kwa link hata kama imefichwa (haionekani kwenye orodha)
pub.get('/apps/:id', optionalAuth, ah(async (req, res) => {
  const id = id_(req.params.id);
  const r = await query(`SELECT id,title,platform,version,notes,file_name,size,download_count,created_at,developer,category,
      COALESCE(rating, (SELECT round(avg(x.rating),1)::float FROM app_reviews x WHERE x.release_id=app_releases.id)) AS rating,
      (SELECT count(*)::int FROM app_reviews x WHERE x.release_id=app_releases.id) AS reviews,
      (SELECT count(*)::int FROM app_screenshots s WHERE s.release_id=app_releases.id) AS shots,
      (logo_data IS NOT NULL) AS has_logo, price, active,
      EXISTS (SELECT 1 FROM app_purchases ap WHERE ap.release_id=app_releases.id AND ap.user_id=$2) AS owned
    FROM app_releases WHERE id=$1`, [id, req.user ? req.user.id : 0]);
  if (!r.rows[0]) throw httpErr(404, 'App haipatikani.');
  res.json({ app: r.rows[0] });
}));

pub.get('/apps/:id/reviews', ah(async (req, res) => {
  const r = await query('SELECT id,author,rating,body,created_at FROM app_reviews WHERE release_id=$1 ORDER BY created_at DESC LIMIT 100', [id_(req.params.id)]);
  res.json({ reviews: r.rows });
}));

// ---------------- ADMIN ----------------
// Admin: app yoyote, hata kama imefichwa (kwa kuona kama imefichwa)
adm.get('/apps/:id', ah(async (req, res) => {
  const r = await query(`SELECT id,title,platform,version,notes,file_name,size,download_count,created_at,developer,category,rating,price,active,
    (logo_data IS NOT NULL) AS has_logo, (SELECT count(*)::int FROM app_screenshots s WHERE s.release_id=app_releases.id) AS shots
    FROM app_releases WHERE id=$1`, [id_(req.params.id)]);
  if (!r.rows[0]) throw httpErr(404, 'App haipo.');
  res.json({ app: r.rows[0] });
}));

adm.get('/banners', ah(async (req, res) => {
  const r = await query(`SELECT b.id,b.title,b.subtitle,b.bg_color,b.release_id,b.position,b.active,(b.image_data IS NOT NULL) AS has_image,
    a.title AS release_title FROM store_banners b LEFT JOIN app_releases a ON a.id=b.release_id ORDER BY b.position,b.id`);
  res.json({ banners: r.rows });
}));
adm.post('/banners', ah(async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 80);
  if (!title) throw httpErr(400, 'Kichwa cha banner kinahitajika.');
  const r = await query('INSERT INTO store_banners(title,subtitle,bg_color,release_id,position,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [title, String(b.subtitle || '').slice(0, 120), color(b.bg_color), id_(b.release_id) || null, parseInt(b.position, 10) || 0, b.active !== false]);
  await audit(req, 'store.banner_create', 'store_banner', r.rows[0].id, { title });
  res.status(201).json({ id: r.rows[0].id });
}));
adm.patch('/banners/:id', ah(async (req, res) => {
  const id = id_(req.params.id), b = req.body || {};
  const r = await query(`UPDATE store_banners SET title=COALESCE($2,title), subtitle=COALESCE($3,subtitle), bg_color=COALESCE($4,bg_color),
    release_id=$5, position=COALESCE($6,position), active=COALESCE($7,active) WHERE id=$1 RETURNING id`,
    [id, b.title ? String(b.title).slice(0, 80) : null, b.subtitle != null ? String(b.subtitle).slice(0, 120) : null, b.bg_color ? color(b.bg_color) : null,
     b.release_id === undefined ? null : (id_(b.release_id) || null), Number.isInteger(b.position) ? b.position : null, typeof b.active === 'boolean' ? b.active : null]);
  if (!r.rowCount) throw httpErr(404, 'Banner haipo.');
  await audit(req, 'store.banner_update', 'store_banner', id, {});
  res.json({ ok: true });
}));
adm.delete('/banners/:id', ah(async (req, res) => {
  const id = id_(req.params.id);
  const r = await query('DELETE FROM store_banners WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) throw httpErr(404, 'Banner haipo.');
  await audit(req, 'store.banner_delete', 'store_banner', id, {});
  res.json({ ok: true });
}));
adm.post('/banners/:id/image', express.raw({ type: '*/*', limit: MAX_BANNER + 1024 }), ah(async (req, res) => {
  const mime = mimeOf(req), buf = req.body;
  if (!IMG[mime]) throw httpErr(400, 'Picha lazima iwe PNG, JPG au WEBP.');
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(400, 'Chagua picha.');
  if (buf.length > MAX_BANNER) throw httpErr(413, 'Picha ni kubwa kuliko 2MB.');
  const r = await query('UPDATE store_banners SET image_mime=$2, image_data=$3 WHERE id=$1 RETURNING id', [id_(req.params.id), mime, buf]);
  if (!r.rowCount) throw httpErr(404, 'Banner haipo.');
  await audit(req, 'store.banner_image', 'store_banner', id_(req.params.id), { size: buf.length });
  res.status(201).json({ ok: true });
}));
adm.delete('/banners/:id/image', ah(async (req, res) => {
  await query('UPDATE store_banners SET image_mime=NULL, image_data=NULL WHERE id=$1', [id_(req.params.id)]);
  res.json({ ok: true });
}));

adm.get('/sections', ah(async (req, res) => {
  const [s, it] = await Promise.all([
    query('SELECT id,tab,title,kind,position,active FROM store_sections ORDER BY position,id'),
    query('SELECT section_id, release_id FROM store_section_apps ORDER BY position, release_id'),
  ]);
  res.json({ sections: s.rows.map((x) => ({ ...x, apps: it.rows.filter((i) => i.section_id === x.id).map((i) => i.release_id) })) });
}));
adm.post('/sections', ah(async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 80), tab = String(b.tab || 'Featured').trim().slice(0, 40) || 'Featured';
  if (!title) throw httpErr(400, 'Jina la sehemu linahitajika.');
  const kind = b.kind === 'list' ? 'list' : 'row';
  const r = await query('INSERT INTO store_sections(tab,title,kind,position,active) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [tab, title, kind, parseInt(b.position, 10) || 0, b.active !== false]);
  await audit(req, 'store.section_create', 'store_section', r.rows[0].id, { title, tab });
  res.status(201).json({ id: r.rows[0].id });
}));
adm.patch('/sections/:id', ah(async (req, res) => {
  const id = id_(req.params.id), b = req.body || {};
  const r = await query(`UPDATE store_sections SET tab=COALESCE($2,tab), title=COALESCE($3,title), kind=COALESCE($4,kind),
    position=COALESCE($5,position), active=COALESCE($6,active) WHERE id=$1 RETURNING id`,
    [id, b.tab ? String(b.tab).slice(0, 40) : null, b.title ? String(b.title).slice(0, 80) : null, b.kind === 'list' || b.kind === 'row' ? b.kind : null,
     Number.isInteger(b.position) ? b.position : null, typeof b.active === 'boolean' ? b.active : null]);
  if (!r.rowCount) throw httpErr(404, 'Sehemu haipo.');
  await audit(req, 'store.section_update', 'store_section', id, {});
  res.json({ ok: true });
}));
adm.delete('/sections/:id', ah(async (req, res) => {
  const id = id_(req.params.id);
  const r = await query('DELETE FROM store_sections WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) throw httpErr(404, 'Sehemu haipo.');
  await audit(req, 'store.section_delete', 'store_section', id, {});
  res.json({ ok: true });
}));
// Apps zilizo kwenye sehemu: orodha kamili inabadilishwa kwa mpangilio wa `ids`
adm.put('/sections/:id/apps', ah(async (req, res) => {
  const id = id_(req.params.id);
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(id_).filter(Boolean) : null;
  if (!ids) throw httpErr(400, 'Orodha ya apps si sahihi.');
  if (!(await query('SELECT 1 FROM store_sections WHERE id=$1', [id])).rowCount) throw httpErr(404, 'Sehemu haipo.');
  await query('DELETE FROM store_section_apps WHERE section_id=$1', [id]);
  for (let i = 0; i < ids.length; i++) {
    await query('INSERT INTO store_section_apps(section_id,release_id,position) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, ids[i], i]);
  }
  await audit(req, 'store.section_apps', 'store_section', id, { count: ids.length });
  res.json({ ok: true });
}));

// Maelezo ya app kwa Store: msanidi, kategoria, ukadiriaji wa mkono (null = wastani wa maoni), maelezo
// Maelezo yote ya app kwa admin: jina, toleo, mfumo, bei, hali (imefichwa/inapatikana), msanidi, kategoria, ukadiriaji, maelezo
adm.patch('/apps/:id', ah(async (req, res) => {
  const id = id_(req.params.id), b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!(await query('SELECT 1 FROM app_releases WHERE id=$1', [id])).rowCount) throw httpErr(404, 'App haipo.');
  const price = has('price') ? Math.max(0, Math.min(100000000, parseInt(b.price, 10) || 0)) : null;
  if (price && price < 500) throw httpErr(400, 'Bei ya app iwe angalau 500 TZS (au 0 kwa bure).');
  await query(`UPDATE app_releases SET title=COALESCE($2,title), platform=COALESCE($3,platform), version=COALESCE($4,version),
      notes=COALESCE($5,notes), active=COALESCE($6,active), developer=COALESCE($7,developer), category=COALESCE($8,category),
      rating=CASE WHEN $9 THEN $10 ELSE rating END, price=COALESCE($11,price) WHERE id=$1`,
    [id, has('title') && b.title ? String(b.title).trim().slice(0, 80) : null, PLAT.includes(b.platform) ? b.platform : null,
     has('version') ? String(b.version).slice(0, 30) : null, has('notes') ? String(b.notes).slice(0, 2000) : null,
     typeof b.active === 'boolean' ? b.active : null, has('developer') ? String(b.developer).slice(0, 80) : null,
     has('category') ? String(b.category).slice(0, 40) : null, has('rating'), has('rating') ? ratingOf(b.rating) : null, price]);
  if (has('file_kind') && ['app', 'document', 'archive', 'other'].includes(b.file_kind)) {
    await query('UPDATE app_releases SET file_kind=$2 WHERE id=$1', [id, b.file_kind]);
  }
  await audit(req, 'store.app_update', 'app_release', id, { active: b.active, price });
  res.json({ ok: true });
}));

adm.post('/reviews', ah(async (req, res) => {
  const b = req.body || {};
  const author = String(b.author || '').trim().slice(0, 60), rating = ratingOf(b.rating);
  if (!author) throw httpErr(400, 'Jina la mtoa maoni linahitajika.');
  if (rating === null || rating < 1) throw httpErr(400, 'Ukadiriaji uwe kati ya 1 na 5.');
  const r = await query('INSERT INTO app_reviews(release_id,author,rating,body) VALUES($1,$2,$3,$4) RETURNING id',
    [id_(b.release_id), author, rating, String(b.body || '').slice(0, 600)]);
  await audit(req, 'store.review_add', 'app_review', r.rows[0].id, { release: b.release_id });
  res.status(201).json({ id: r.rows[0].id });
}));
adm.delete('/reviews/:id', ah(async (req, res) => {
  const r = await query('DELETE FROM app_reviews WHERE id=$1 RETURNING id', [id_(req.params.id)]);
  if (!r.rowCount) throw httpErr(404, 'Maoni hayapo.');
  await audit(req, 'store.review_delete', 'app_review', id_(req.params.id), {});
  res.json({ ok: true });
}));

module.exports = { pub, adm };
