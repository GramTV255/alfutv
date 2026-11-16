const express = require('express');
const { query } = require('../config/database');
const { isInt, httpErr, ah } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const publicRouter = express.Router();
const adminRouter = express.Router();

const COLS = 'id,title,subtitle,link_url,channel_id,button_text,image_url,sort_order,active,updated_at,(image_data IS NOT NULL) AS has_image';
const shape = (r) => ({
  id: r.id, title: r.title, subtitle: r.subtitle, link_url: r.link_url, channel_id: r.channel_id, button_text: r.button_text, sort_order: r.sort_order, active: r.active,
  image: r.has_image ? `/media/slider/${r.id}?v=${new Date(r.updated_at).getTime()}` : r.image_url,
});

// ---- Public ----
publicRouter.get('/slides', ah(async (req, res) => {
  const r = await query(`SELECT ${COLS} FROM sliders WHERE active ORDER BY sort_order,id`);
  res.json({ slides: r.rows.map(shape).filter((s) => s.image) });
}));

async function media(req, res, next) {
  try {
    const r = await query('SELECT image_data,image_type FROM sliders WHERE id=$1 AND active', [parseInt(req.params.id, 10) || 0]);
    const row = r.rows[0];
    if (!row || !row.image_data) return res.status(404).end();
    res.set({ 'Content-Type': row.image_type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(row.image_data);
  } catch (e) { next(e); }
}

// ---- Admin ----
function parseImage(v) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(v || '');
  if (!m) throw httpErr(400, 'Picha si sahihi (JPG/PNG/WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw httpErr(400, 'Picha ni kubwa mno (max 3MB).');
  return { type: m[1], buf };
}
function fields(b) {
  const t = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const link = t(b.link_url, 500);
  if (link && !(/^\/(?!\/)/.test(link) || /^https?:\/\//.test(link))) throw httpErr(400, 'Link si sahihi.');
  return { button: t(b.button_text, 24) || 'TAZAMA SASA', channel: Number.isInteger(b.channel_id) && b.channel_id > 0 ? b.channel_id : null, title: t(b.title, 80), subtitle: t(b.subtitle, 160), link, sort: isInt(b.sort_order, 0, 9999) ? b.sort_order : 0, active: b.active !== false };
}
function imageInput(b) {
  if (b.image_data) { const { type, buf } = parseImage(b.image_data); return { replace: true, url: null, data: buf, type }; }
  if (b.image_url) {
    if (!/^https:\/\/\S{1,480}$/.test(b.image_url) || /['"<>]/.test(b.image_url)) throw httpErr(400, 'Image URL si sahihi (https).');
    return { replace: true, url: b.image_url, data: null, type: null };
  }
  return { replace: false };
}

adminRouter.get('/', ah(async (req, res) => {
  res.json({ slides: (await query(`SELECT ${COLS} FROM sliders ORDER BY sort_order,id`)).rows.map(shape) });
}));
adminRouter.post('/', ah(async (req, res) => {
  const f = fields(req.body || {}), im = imageInput(req.body || {});
  if (f.channel && !(await query('SELECT 1 FROM channels WHERE id=$1', [f.channel])).rowCount) throw httpErr(400, 'Channel haipo.');
  if (!im.replace) throw httpErr(400, 'Weka picha au Image URL.');
  const r = await query(`INSERT INTO sliders(title,subtitle,link_url,sort_order,active,image_url,image_data,image_type,channel_id,button_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [f.title, f.subtitle, f.link, f.sort, f.active, im.url, im.data, im.type, f.channel, f.button]);
  await audit(req, 'slider.create', 'slider', r.rows[0].id); res.status(201).json({ id: r.rows[0].id });
}));
adminRouter.patch('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10), f = fields(req.body || {}), im = imageInput(req.body || {});
  const r = await query(`UPDATE sliders SET title=$2,subtitle=$3,link_url=$4,sort_order=$5,active=$6,
      image_url = CASE WHEN $7::boolean THEN $8::text ELSE image_url END,
      image_data = CASE WHEN $7::boolean THEN $9::bytea ELSE image_data END,
      image_type = CASE WHEN $7::boolean THEN $10::text ELSE image_type END, channel_id=$11, button_text=$12, updated_at=now() WHERE id=$1 RETURNING id`,
    [id, f.title, f.subtitle, f.link, f.sort, f.active, im.replace, im.url || null, im.data || null, im.type || null, f.channel, f.button]);
  if (!r.rowCount) throw httpErr(404, 'Slider haipatikani.');
  await audit(req, 'slider.update', 'slider', id); res.json({ ok: true });
}));
adminRouter.delete('/:id', ah(async (req, res) => {
  await query('DELETE FROM sliders WHERE id=$1', [parseInt(req.params.id, 10) || 0]);
  await audit(req, 'slider.delete', 'slider', req.params.id); res.json({ ok: true });
}));

module.exports = { publicRouter, adminRouter, media };
