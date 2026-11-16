// Inachukua link ya stream (+ ClearKey) kutoka kwenye "API Endpoint" inayorudisha HTML au JSON.
const net = require('net');

const isHex32 = (v) => /^[0-9a-f]{32}$/i.test(String(v || ''));

function parseClearKeys(input) {
  const out = {};
  const add = (k, v) => {
    k = String(k || '').replace(/-/g, '').trim().toLowerCase(); v = String(v || '').replace(/-/g, '').trim().toLowerCase();
    if (isHex32(k) && isHex32(v)) out[k] = v;
  };
  if (!input) return out;
  if (typeof input === 'object') {
    if (Array.isArray(input)) input.forEach((x) => { if (x && typeof x === 'object') add(x.kid || x.keyId || x.k, x.key || x.v); });
    else Object.entries(input).forEach(([k, v]) => add(k, v));
    return out;
  }
  String(input).split(/[\n,;|]+/).forEach((x) => { const [k, v] = x.trim().split(':'); add(k, v); });
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
function decide(url, typ) {
  const s = String(typ || '').toLowerCase();
  if (/mpd|dash/.test(s)) return 'dash';
  if (/m3u8|hls/.test(s)) return 'hls';
  return /\.mpd(\?|$)/i.test(url || '') ? 'dash' : 'hls';
}

function fromJson(j) {
  const f = {};
  (function walk(o, d) {
    if (!o || typeof o !== 'object' || d > 3) return;
    for (const [k, v] of Object.entries(o)) {
      const kk = k.toLowerCase();
      if (typeof v === 'string') {
        if (!f.url && /^(url|stream_?url|link|source|src|manifest|hls|dash|mpd|m3u8|file)$/.test(kk) && /^https?:\/\//.test(v)) f.url = v;
        else if (!f.ck && /^(ck|clear_?keys?|key|keys|license)$/.test(kk)) f.ck = v;
        else if (!f.type && /^(type|stream_?type)$/.test(kk)) f.type = v;
      } else if (v && typeof v === 'object') {
        if (!f.ck && /^(ck|clear_?keys?|keys)$/.test(kk)) f.ck = v; else walk(v, d + 1);
      }
    }
  })(j, 0);
  return { url: f.url || null, type: decide(f.url, f.type), clearkeys: parseClearKeys(f.ck) };
}

// Inasoma jibu la HTML (mfano: var streamUrl = "..."; var ck = "kid:key";) au JSON
function extract(raw) {
  const t = String(raw).trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { const r = fromJson(JSON.parse(t)); if (r.url) return r; } catch (_) { /* si JSON */ } }
  const text = decode(String(raw));
  const pick = (re) => { const m = re.exec(text); return m ? m[2] : null; };
  let url = pick(/(?:var|let|const)\s+streamUrl\s*=\s*(["'`])([^"'`]+)\1/);
  const typ = pick(/(?:var|let|const)\s+streamType\s*=\s*(["'`])([^"'`]*)\1/i);
  const ckRaw = pick(/(?:var|let|const)\s+(?:ck|clearKeys?|clearkey)\s*=\s*(["'`])([^"'`]*)\1/);
  if (!url) { const m = /https?:\/\/[^\s"'`<>\\]+?\.(?:m3u8|mpd)(?:\?[^\s"'`<>\\]*)?/i.exec(text); if (m) url = m[0]; }
  if (!url) { const m = /<source[^>]+src=["']([^"']+)["']/i.exec(text); if (m) url = m[1]; }
  let keys = parseClearKeys(ckRaw);
  const type = decide(url, typ);
  if (type === 'dash' && !Object.keys(keys).length) {
    const re = /["']?([0-9a-f]{32})["']?\s*[:=]\s*["']([0-9a-f]{32})["']/gi; let m;
    while ((m = re.exec(text))) keys = { ...keys, ...parseClearKeys(m[1] + ':' + m[2]) };
  }
  return { url: url || null, type, clearkeys: keys };
}

function isPrivateHost(h) {
  h = String(h).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v = net.isIP(h);
  if (v === 4) { const [a, b] = h.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31); }
  if (v === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}

function assertPublicUrl(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Endpoint iwe http(s).');
  if (isPrivateHost(u.hostname)) throw new Error('Endpoint ya mtandao wa ndani hairuhusiwi.');
}

async function fetchText(url, headers) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Endpoint iwe http(s).');
  if (isPrivateHost(u.hostname)) throw new Error('Endpoint ya mtandao wa ndani hairuhusiwi.');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', Accept: '*/*', ...(headers || {}) }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error('Endpoint imejibu HTTP ' + res.status);
    return (await res.text()).slice(0, 2000000);
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Endpoint imechelewa kujibu.' : e.message); }
  finally { clearTimeout(timer); }
}

async function resolveUncached(url, headers) {
  const r = extract(await fetchText(url, headers));
  if (!r.url) throw new Error('Hakuna link ya stream kwenye jibu la endpoint.');
  return r;
}

const cache = new Map();          // ufunguo: channel + URL + headers
const lastGood = new Map();       // link ya mwisho iliyofanya kazi
const inflight = new Map();       // ombi moja linalosubiriwa (watazamaji wengi wanashiriki)
const cooldown = new Map();       // endpoint imejibu 429: tusiiite tena kwa muda
const TTL = Number(process.env.API_STREAM_CACHE_SECONDS || 60) * 1000;
const STALE_MAX = 60 * 60 * 1000; // nakala ya mwisho inatumika hadi saa 1
const COOL_MS = 60 * 1000;        // baada ya 429: subiri dakika 1
const keyOf = (id, url, headers) => id + '|' + url + '|' + JSON.stringify(headers || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveApiStream(id, url, headers) {
  const k = keyOf(id, url, headers);
  const c = cache.get(k);
  if (c && Date.now() - c.t < TTL) return c.r;
  if (inflight.has(k)) return inflight.get(k);

  const fallback = () => {
    const g = lastGood.get(k);
    return g && Date.now() - g.t < STALE_MAX ? g.r : null;
  };
  if (Date.now() < (cooldown.get(k) || 0)) {
    const f = fallback();
    if (f) return f;
    throw new Error('Endpoint imezidiwa maombi (HTTP 429). Jaribu baada ya dakika moja.');
  }

  const p = (async () => {
    try {
      let r;
      try {
        r = await resolveUncached(url, headers);
      } catch (e) {
        if (/HTTP 429/.test(e.message)) {          // usirudie ombi baada ya 429
          cooldown.set(k, Date.now() + COOL_MS);
          throw e;
        }
        await sleep(800);                          // jaribio la pili kwa makosa mengine tu
        r = await resolveUncached(url, headers);
      }
      cache.set(k, { t: Date.now(), r });
      lastGood.set(k, { t: Date.now(), r });
      cooldown.delete(k);
      return r;
    } catch (e) {
      const f = fallback();
      if (f) return f;
      throw e;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, p);
  return p;
}

module.exports = { parseClearKeys, extract, resolveUncached, resolveApiStream, assertPublicUrl };
