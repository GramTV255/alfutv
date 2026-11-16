// Takwimu za moja kwa moja: kwenye kumbukumbu tu (hakuna kuandika database kila mara)
// Nchi na mkoa: headers za CDN zikiwepo, vinginevyo jibu la GeoIP linahifadhiwa kwa mtu husika.
// IP haihifadhiwi popote: hutumika mara moja kuuliza eneo, kisha ni hash tu inayobaki.
const crypto = require('crypto');
const { query } = require('../config/database');

const STALE_MS = 60 * 1000;      // mtu hachukuliwi kuwa hai baada ya sekunde 60 bila ping
const CACHE_MS = 1000;            // muhtasari unahifadhiwa sekunde 1 (dashboard inasasishwa kila sekunde 1)
const MAX_ENTRIES = 50000;
const GEO_TTL = 30 * 60 * 1000;  // jibu la eneo linakaa dakika 30
const GEO_MAX_PER_MIN = 40;      // kikomo cha maombi ya GeoIP (ip-api ina 45/dakika)

const seen = new Map();          // key -> { ch, playing, country, region, hk, t }
const geoCache = new Map();      // hash -> { country, region, t }
const pending = new Set();
const queue = [];
let running = 0, budget = { at: Date.now(), n: 0 };
let cache = { at: 0, data: null };
let names = { at: 0, map: new Map() };
const countryNames = new Intl.DisplayNames(['sw', 'en'], { type: 'region' });

const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
function keyFor(req) { return hashOf((req.ip || '') + '|' + (req.headers['user-agent'] || '')); }

function headerGeo(req) {
  const h = req.headers;
  const c = String(h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] || '').toUpperCase();
  const r = String(h['cf-region'] || h['x-vercel-ip-country-region'] || '').trim();
  return { country: /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : '', region: r && r.length < 60 ? r : '' };
}

function isPrivate(ip) {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|::ffff:(127|10|192\.168))/i.test(ip);
}

function drain() {
  const now = Date.now();
  if (now - budget.at > 60000) budget = { at: now, n: 0 };
  while (running < 2 && queue.length && budget.n < GEO_MAX_PER_MIN) {
    const job = queue.shift();
    budget.n++; running++;
    lookup(job).finally(() => { running--; pending.delete(job.hk); drain(); });
  }
}
setInterval(drain, 5000).unref();

// Anauliza eneo mara moja; IP inatumika hapa tu, haihifadhiwi
async function lookup({ hk, ip }) {
  let out = { country: '', region: '', t: Date.now() };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=status,countryCode,regionName', { signal: ctrl.signal });
    clearTimeout(timer);
    const j = await r.json();
    if (j && j.status === 'success') out = { country: String(j.countryCode || '').toUpperCase(), region: String(j.regionName || ''), t: Date.now() };
  } catch (_) { /* jibu halikupatikana: mtu anabaki "hawajulikani" kwa sasa */ }
  if (geoCache.size > 20000) for (const [k, v] of geoCache) if (Date.now() - v.t > GEO_TTL) geoCache.delete(k);
  geoCache.set(hk, out);
}

function queueGeo(hk, ip) {
  if (isPrivate(ip) || pending.has(hk)) return;
  const c = geoCache.get(hk);
  if (c && Date.now() - c.t < GEO_TTL) return;
  if (queue.length > 300) return;
  pending.add(hk);
  queue.push({ hk, ip });
  drain();
}

function prune(now = Date.now()) {
  for (const [k, v] of seen) if (now - v.t > STALE_MS) seen.delete(k);
}

const revCache = new Map();
let lastRev = 0;
// Koordinati -> mkoa/nchi. Koordinati hazihifadhiwi: zinatumika kwenye ombi hili tu.
async function reverseGeo(lat, lon) {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const c = revCache.get(key);
  if (c && Date.now() - c.t < GEO_TTL) return c;
  if (Date.now() - lastRev < 1100) return null;   // Nominatim: maombi 1 kwa sekunde
  lastRev = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=sw&lat=' + lat + '&lon=' + lon,
      { signal: ctrl.signal, headers: { 'User-Agent': 'AlfuTV-live/1.0' } });
    clearTimeout(timer);
    const j = await r.json();
    const a = (j && j.address) || {};
    const out = { country: String(a.country_code || '').toUpperCase(), region: String(a.state || a.region || a.county || '').slice(0, 60), t: Date.now() };
    if (!/^[A-Z]{2}$/.test(out.country)) return null;
    if (revCache.size > 5000) revCache.clear();
    revCache.set(key, out);
    return out;
  } catch (_) { return null; }
}

async function ping(req, chId, playing, lat, lon) {
  if (!chId) return;
  if (seen.size >= MAX_ENTRIES) prune();
  const hk = keyFor(req);
  let g = headerGeo(req);
  const la = Number(lat), lo = Number(lon);
  if (Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
    const rg = await reverseGeo(la, lo);
    if (rg) g = { country: rg.country, region: rg.region };
  }
  seen.set(hk, { ch: chId, playing: !!playing, country: g.country, region: g.region, hk, t: Date.now() });
  if (!g.country) queueGeo(hk, req.ip);
}

async function channelNames(ids) {
  if (Date.now() - names.at > 10 * 60 * 1000) names = { at: Date.now(), map: new Map() };
  const need = ids.filter((id) => !names.map.has(id));
  if (need.length) {
    const r = await query('SELECT id, name FROM channels WHERE id = ANY($1::int[])', [need]);
    r.rows.forEach((x) => names.map.set(x.id, x.name));
    need.forEach((id) => { if (!names.map.has(id)) names.map.set(id, 'Channel #' + id); });
  }
  return names.map;
}

async function summary() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  prune(now);
  const byCountry = new Map(), byRegion = new Map(), byChannel = new Map();
  let total = 0, watching = 0, idle = 0, unknownGeo = 0;
  for (const v of seen.values()) {
    total++;
    if (v.playing) watching++; else idle++;
    const gc = geoCache.get(v.hk) || {};
    const country = v.country || gc.country || '';
    const region = v.region || gc.region || '';
    if (!country) unknownGeo++;
    else byCountry.set(country, (byCountry.get(country) || 0) + 1);
    if (country) {
      const rk = (region || '') + '|' + country;
      const r = byRegion.get(rk) || { total: 0, watching: 0 };
      r.total++; if (v.playing) r.watching++;
      byRegion.set(rk, r);
    }
    if (v.playing) byChannel.set(v.ch, (byChannel.get(v.ch) || 0) + 1);
  }
  const cn = await channelNames([...byChannel.keys()]);
  const countryName = (c) => { try { return countryNames.of(c) || c; } catch (_) { return c; } };
  const data = {
    total, watching, idle, viewers: watching,
    unknown_geo: unknownGeo,
    countries: [...byCountry].map(([code, count]) => ({ code, name: countryName(code), count })).sort((a, b) => b.count - a.count),
    regions: [...byRegion].map(([k, r]) => {
      const [region, code] = k.split('|');
      return { name: region || countryName(code), code, country: countryName(code), count: r.total, watching: r.watching, idle: r.total - r.watching };
    }).sort((a, b) => b.count - a.count).slice(0, 20),
    channels: [...byChannel].map(([id, count]) => ({ id, name: cn.get(id) || ('Channel #' + id), count })).sort((a, b) => b.count - a.count),
    updated_at: new Date(now).toISOString(),
  };
  cache = { at: now, data };
  return data;
}

module.exports = { ping, summary, reverseGeo };
