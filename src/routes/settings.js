const router = require('express').Router();
const { query } = require('../config/database');
const { isStr, isHex, isInt, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const DEFAULTS = {
  identity: { site_name: 'AlfuTV Pro Max', tagline: 'Tazama TV popote', description: '', logo: '', favicon: '', banner: '' },
  theme: { mode: 'dark', primary: '#e50914', secondary: '#1f1f2e', accent: '#f5a623', background: '#0e0e14', text: '#f2f2f2', header: '#15151f', navigation: '#15151f', button: '#e50914', button_text: '#ffffff' },
  appearance: { logo_size: 40, columns: 4, card_style: 'rounded', packages_layout: 'grid', login_banner: true, slider_seconds: 5, channels_layout: 'grid' },
  homepage: { sections: [
    { id: 'hero', label: 'Slider / Hero', visible: true }, { id: 'categories', label: 'Categories', visible: true },
    { id: 'popular', label: 'Popular Channels', visible: true }, { id: 'recent', label: 'Recently Added', visible: true },
    { id: 'all', label: 'Channels Zote', visible: true } ] },
  footer: { copyright: '', contact: '', privacy_url: '', terms_url: '', links: [] },
  general: { currency_label: 'TZS', support_phone: '', whatsapp_number: '', whatsapp_message: 'Habari, nahitaji msaada.' },
};
const SECTION_IDS = DEFAULTS.homepage.sections.map((s) => s.id);
const img = (v) => v === '' || (typeof v === 'string' && v.length < 400000 && (/^data:image\/(png|jpeg|webp|gif|x-icon|svg\+xml);base64,/.test(v) || /^https?:\/\//.test(v)));
const url = (v) => v === '' || (typeof v === 'string' && v.length < 500 && /^https?:\/\//.test(v));
const waNorm = (v) => { let p = String(v || '').replace(/[\s+\-()]/g, ''); if (/^0\d{9}$/.test(p)) p = '255' + p.slice(1); return /^\d{9,15}$/.test(p) ? p : null; };
const txt = (max) => (v) => typeof v === 'string' && v.length <= max;

const SCHEMA = {
  identity: { site_name: (v) => isStr(v, 1, 60), tagline: txt(120), description: txt(500), logo: img, favicon: img, banner: img },
  theme: { mode: (v) => ['light', 'dark', 'custom'].includes(v), primary: isHex, secondary: isHex, accent: isHex, background: isHex, text: isHex, header: isHex, navigation: isHex, button: isHex, button_text: isHex },
  appearance: { logo_size: (v) => isInt(v, 20, 120), columns: (v) => isInt(v, 1, 6), card_style: (v) => ['rounded', 'square', 'glass'].includes(v), packages_layout: (v) => ['grid', 'list'].includes(v), login_banner: (v) => typeof v === 'boolean', slider_seconds: (v) => isInt(v, 2, 30), channels_layout: (v) => ['grid', 'rail', 'list'].includes(v) },
  homepage: { sections: (v) => Array.isArray(v) && v.length <= 10 && v.every((s) => SECTION_IDS.includes(s.id) && typeof s.visible === 'boolean') },
  footer: { copyright: txt(200), contact: txt(300), privacy_url: url, terms_url: url,
    links: (v) => Array.isArray(v) && v.length <= 10 && v.every((l) => isStr(l.label, 1, 40) && url(l.url) && l.url) },
  general: { currency_label: txt(5), support_phone: txt(30), whatsapp_number: (v) => v === '' || !!waNorm(v), whatsapp_message: txt(200) },
};

async function readAll() {
  const r = await query('SELECT key,value FROM site_settings');
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const row of r.rows) if (out[row.key]) out[row.key] = { ...out[row.key], ...row.value };
  const defs = DEFAULTS.homepage.sections;
  const order = (out.homepage.sections || []).filter((x) => defs.some((d) => d.id === x.id));
  const have = new Set(order.map((x) => x.id));
  defs.forEach((d) => { if (!have.has(d.id)) order.push({ ...d }); });
  out.homepage.sections = order.map((x) => ({ id: x.id, visible: x.visible !== false, label: defs.find((d) => d.id === x.id).label }));
  return out;
}

const publicRouter = require('express').Router();
publicRouter.get('/settings', ah(async (req, res) => { res.set('Cache-Control', 'no-cache'); res.json(await readAll()); }));

router.patch('/:group', ah(async (req, res) => {
  const g = req.params.group, schema = SCHEMA[g];
  if (!schema) throw httpErr(404, 'Group haipo.');
  const body = req.body || {}, clean = {};
  for (const k of Object.keys(body)) {
    if (!schema[k]) continue;
    if (!schema[k](body[k])) throw httpErr(400, `Thamani ya "${k}" si sahihi.`);
    clean[k] = k === 'sections' ? body[k].map((s) => ({ id: s.id, visible: s.visible })) : (k === 'whatsapp_number' ? (waNorm(body[k]) || '') : body[k]);
  }
  const cur = (await readAll())[g];
  await query(`INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2,now())
               ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`, [g, { ...cur, ...clean }]);
  await audit(req, 'settings.update', 'site_settings', g, { keys: Object.keys(clean) });
  res.json({ ok: true, settings: (await readAll())[g] });
}));

module.exports = { router, publicRouter, readAll, DEFAULTS };
