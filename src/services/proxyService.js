'use strict';
/**
 * Proxy links for HLS (m3u8) and DASH/fMP4 (m4s) streams.
 *  - The admin stores a source URL (+ optional headers, encrypted). Clients only ever see /p/<token>/... links.
 *  - Manifests are fetched server-side and rewritten so every segment/key/sub-playlist also goes through the proxy;
 *    the real URLs are sealed (AES-256-GCM) inside the link and are never shown to the client.
 *  - Same safety rules as channel sources: https only, host allowlist (every hop, every resource), DNS pinned to a
 *    checked public IP, redirects re-validated, timeouts and size caps. Streams are relayed unchanged: nothing about
 *    DRM or licensing is altered.
 */
const https = require('https');
const http = require('http');
const dns = require('dns');
const crypto = require('crypto');
const { config } = require('../config');
const { HttpError } = require('../utils/errors');
const { validateSourceUrl, isBlockedIp, cleanHeaders } = require('./safeHttp');

const MAX_MANIFEST = 2 * 1024 * 1024; // 2 MB of playlist text
const MAX_BODY = 60 * 1024 * 1024; // 60 MB per relayed resource
const MAX_REDIRECTS = 3;
const IDLE_MS = 20000;
const MAX_ACTIVE = 80;
let active = 0;

// ---------- sealed URLs ----------
const sealKey = () => crypto.createHmac('sha256', Buffer.from(config.encryptionKey, 'hex')).update('proxy-url-v1').digest();
function seal(url, channelId) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sealKey(), iv);
  c.setAAD(Buffer.from(String(channelId)));
  const ct = Buffer.concat([c.update(String(url), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function unseal(blob, channelId) {
  try {
    const raw = Buffer.from(String(blob), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', sealKey(), raw.subarray(0, 12));
    d.setAAD(Buffer.from(String(channelId)));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (_) {
    throw new HttpError(404, 'Not found', 'BAD_LINK');
  }
}

const extOf = (u) => { try { const m = new URL(u).pathname.match(/\.([A-Za-z0-9]{1,5})$/); return m ? `.${m[1].toLowerCase()}` : ''; } catch (_) { return ''; } };
const dirOf = (u) => { const x = new URL(u); x.search = ''; x.hash = ''; x.pathname = x.pathname.replace(/[^/]*$/, ''); return x.toString(); };

// A segment URL without its own query inherits the playlist's query when both are on the same host.
function carryQuery(abs, playlistUrl) {
  try { const x = new URL(abs); const p = new URL(playlistUrl); if (!x.search && x.hostname === p.hostname && p.search) x.search = p.search; return x.toString(); } catch (_) { return abs; }
}

// ---------- manifest rewriting (pure functions) ----------
// HLS: every URI line and URI="..." attribute is replaced by a proxy link.
function rewriteHls(text, baseUrl, toProxy) {
  const fix = (u) => {
    if (/^(data:|skd:|urn:)/i.test(u)) return null;
    try { const abs = new URL(u, baseUrl); return /^https?:$/.test(abs.protocol) ? toProxy(abs.toString()) : null; } catch (_) { return null; }
  };
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]*)"/g, (m, u) => { const r = fix(u); return r ? `URI="${r}"` : m; });
    return fix(line.trim()) || line;
  }).join('\n');
}

// DASH: the MPD-level BaseURL (added when missing) points at the proxy, so relative segment paths are resolved by the proxy.
// Absolute BaseURLs deeper in the file are proxied too. Absolute media=/initialization= templates are not supported.
function rewriteMpd(xml, baseUrl, prefixFor) {
  const periodAt = xml.search(/<Period\b/);
  const head = periodAt === -1 ? xml : xml.slice(0, periodAt);
  const tail = periodAt === -1 ? '' : xml.slice(periodAt);
  let seen = false;
  const asDir = (abs) => (abs.endsWith('/') ? abs : dirOf(abs));
  const baseRe = /<BaseURL([^>]*)>([^<]*)<\/BaseURL>/g;
  let h = head.replace(baseRe, (m, attrs, val) => {
    seen = true;
    try { return `<BaseURL${attrs}>${prefixFor(asDir(new URL(val.trim(), baseUrl).toString()))}</BaseURL>`; } catch (_) { return m; }
  });
  if (!seen) h = h.replace(/(<MPD\b[^>]*>)/, `$1<BaseURL>${prefixFor(dirOf(baseUrl))}</BaseURL>`);
  const t = tail.replace(baseRe, (m, attrs, val) => {
    if (!/^https?:\/\//i.test(val.trim())) return m; // relative: resolves against the proxied parent
    try { return `<BaseURL${attrs}>${prefixFor(asDir(val.trim()))}</BaseURL>`; } catch (_) { return m; }
  });
  return h + t;
}

// ---------- ClearKey ----------
// Input: lines "kid:key" (32 hex each). Returns [{kid,key}] hex lowercase, or throws HttpError.
function parseClearKeys(text) {
  const out = [];
  for (const line of String(text || '').split(/[\r\n,;]+/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^([0-9a-fA-F]{32})\s*[:=\s]\s*([0-9a-fA-F]{32})$/);
    if (!m) throw new HttpError(400, 'ClearKey si sahihi. Tumia kila mstari: kid:key (herufi 32 za hex kila moja).', 'VALIDATION_ERROR');
    out.push({ kid: m[1].toLowerCase(), key: m[2].toLowerCase() });
  }
  if (out.length > 20) throw new HttpError(400, 'Keys nyingi mno (max 20)', 'VALIDATION_ERROR');
  return out;
}
const b64u = (hex) => Buffer.from(hex, 'hex').toString('base64url');
const clearKeyLicense = (keys) => ({ keys: keys.map((k) => ({ kty: 'oct', kid: b64u(k.kid), k: b64u(k.key) })), type: 'temporary' });
const CK_SCHEME = 'urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e';
// Adds <clearkey:Laurl> (license URL on this proxy) to the MPD so players (Shaka, dash.js, ExoPlayer) get the keys by themselves.
function injectClearKey(xml, laurl) {
  const tag = `<ContentProtection schemeIdUri="${CK_SCHEME}" value="ClearKey1.0"><clearkey:Laurl Lic_type="EME-1.0">${laurl}</clearkey:Laurl></ContentProtection>`;
  let out = xml;
  if (!/xmlns:clearkey=/.test(out)) out = out.replace(/<MPD\b/, '<MPD xmlns:clearkey="http://dashif.org/guidelines/clearKey"');
  // drop any ClearKey protection element already there, then add ours to every AdaptationSet
  out = out.replace(new RegExp(`<ContentProtection[^>]*${CK_SCHEME}[^>]*?(?:/>|>[\\s\\S]*?</ContentProtection>)`, 'gi'), '');
  return out.replace(/(<AdaptationSet\b[^>]*[^/]>)/g, `$1${tag}`);
}

// ---------- upstream ----------
async function pinnedHop(urlStr, headers, range, signalSocket, anyHost) {
  const u = await validateSourceUrl(urlStr, { allowHttp: true, anyHost: !!anyHost }); // http or https, allowlist, no credentials, standard ports
  const isHttp = u.protocol === 'http:';
  const addrs = await dns.promises.lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new HttpError(502, 'Domain haipatikani (DNS)', 'DNS_FAILED');
  if (addrs.some((a) => isBlockedIp(a.address))) throw new HttpError(400, 'Anwani ya seva hairuhusiwi (SSRF protection)', 'SSRF_BLOCKED');
  const pinned = addrs[0];
  return new Promise((resolve, reject) => {
    const hdrs = { 'Accept-Encoding': 'identity', ...headers };
    if (range) hdrs.Range = range;
    const req = (isHttp ? http : https).request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (isHttp ? 80 : 443), path: u.pathname + u.search, method: 'GET', headers: hdrs, servername: u.hostname, timeout: IDLE_MS,
      lookup: (_h, opts, cb) => { if (opts && opts.all) cb(null, [{ address: pinned.address, family: pinned.family }]); else cb(null, pinned.address, pinned.family); },
    }, (res) => resolve({ res, req, url: u.toString() }));
    req.on('timeout', () => { req.destroy(); reject(new HttpError(504, 'Chanzo hakikujibu kwa wakati', 'TIMEOUT')); });
    req.on('error', (e) => reject(e instanceof HttpError ? e : new HttpError(502, 'Imeshindwa kuunganisha na chanzo (' + (e && e.code || 'error') + ')', 'SOURCE_UNREACHABLE')));
    if (signalSocket) signalSocket(req);
    req.end();
  });
}

// Opens the upstream response (headers only). Redirects are followed manually; every hop is validated again.
async function openUpstream(url, headers, range, onReq, anyHost) {
  let cur = url;
  let hdrs = cleanHeaders(headers || {});
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await pinnedHop(cur, hdrs, range, onReq, anyHost);
    const st = r.res.statusCode;
    if (st >= 300 && st < 400 && r.res.headers.location) {
      r.res.resume();
      const next = new URL(r.res.headers.location, cur).toString();
      if (new URL(next).hostname !== new URL(cur).hostname) { // never carry credentials to another host
        hdrs = Object.fromEntries(Object.entries(hdrs).filter(([k]) => !['cookie', 'authorization'].includes(k.toLowerCase())));
      }
      cur = next;
      continue;
    }
    return r;
  }
  throw new HttpError(502, 'Redirects nyingi mno', 'TOO_MANY_REDIRECTS');
}

function readText(res, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    res.on('data', (d) => { size += d.length; if (size > max) { res.destroy(); return reject(new HttpError(502, 'Manifest ni kubwa mno', 'TOO_LARGE')); } chunks.push(d); });
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.on('error', () => reject(new HttpError(502, 'Chanzo kimekatika', 'SOURCE_ABORTED')));
  });
}

// Relays one upstream resource to the client (rewriting manifests, streaming everything else).
// ctx: { channel, headers (decoded), origin, token }
async function relay(req, res, url, ctx) {
  if (active >= MAX_ACTIVE) throw new HttpError(503, 'Seva ina shughuli nyingi. Jaribu tena.', 'BUSY');
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  try {
    const range = req.headers.range && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined;
    let upReq = null;
    res.on('close', () => { if (upReq && !res.writableEnded) upReq.destroy(); release(); });
    const { res: up, url: finalUrl } = await openUpstream(url, ctx.headers, range, (r) => { upReq = r; }, ctx.anyHost);
    const st = up.statusCode;
    if (st !== 200 && st !== 206) { up.resume(); throw new HttpError(st === 404 ? 404 : 502, `Chanzo kimejibu ${st}`, 'UPSTREAM_STATUS'); }
    const ct = String(up.headers['content-type'] || '').toLowerCase();
    const ext = extOf(finalUrl);
    // beinProxy: signed playlists (?t=..&e=..) usually need the same query on their segments; a relative segment without a query inherits it.
    const toProxy = (abs) => { const a = ctx.carryQuery ? carryQuery(abs, finalUrl) : abs; return `${ctx.origin}/p/${ctx.token}/x/${seal(a, ctx.channel.id)}${extOf(a)}`; };
    const prefixFor = (dirAbs) => `${ctx.origin}/p/${ctx.token}/d/${seal(dirAbs, ctx.channel.id)}/`;

    const looksHls = ext === '.m3u8' || ext === '.m3u' || ct.includes('mpegurl');
    const looksMpd = ext === '.mpd' || ct.includes('dash+xml');
    if ((looksHls || looksMpd) && !range) {
      const text = await readText(up, MAX_MANIFEST);
      res.set('Cache-Control', 'no-store');
      if (text.trimStart().startsWith('#EXTM3U')) return res.status(200).type('application/vnd.apple.mpegurl').send(rewriteHls(text, finalUrl, toProxy));
      if (/<MPD\b/.test(text)) { let mpd = rewriteMpd(text, finalUrl, prefixFor); if (ctx.clearKeys && ctx.clearKeys.length) mpd = injectClearKey(mpd, `${ctx.origin}/p/${ctx.token}/clearkey`); return res.status(200).type('application/dash+xml').send(mpd); }
      return res.status(200).type(ct || 'text/plain').send(text);
    }

    res.status(st);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) if (up.headers[h]) res.set(h, up.headers[h]);
    res.set('Cache-Control', 'no-store');
    let size = 0;
    up.on('data', (d) => { size += d.length; if (size > MAX_BODY) { up.destroy(); res.destroy(); } });
    up.on('error', () => res.destroy());
    up.pipe(res);
    res.on('finish', release);
  } catch (e) {
    release();
    throw e;
  }
}

// Used by the admin "test" button: fetches the manifest and reports what it found (no content is returned).
async function probe(url, headers, anyHost) {
  const { res: up, url: finalUrl } = await openUpstream(url, headers, undefined, undefined, anyHost);
  if (up.statusCode !== 200) { up.resume(); throw new HttpError(502, `Chanzo kimejibu ${up.statusCode}`, 'UPSTREAM_STATUS'); }
  const text = await readText(up, MAX_MANIFEST);
  const host = new URL(finalUrl).hostname;
  if (text.trimStart().startsWith('#EXTM3U')) {
    const lines = text.split(/\r?\n/);
    return { ok: true, type: 'HLS (m3u8)', host, variants: lines.filter((l) => l.startsWith('#EXT-X-STREAM-INF')).length, segments: lines.filter((l) => l.startsWith('#EXTINF')).length, encrypted: /#EXT-X-KEY:(?!METHOD=NONE)/.test(text) };
  }
  if (/<MPD\b/.test(text)) return { ok: true, type: 'DASH (mpd/m4s)', host, representations: (text.match(/<Representation\b/g) || []).length, drm: /<ContentProtection\b/.test(text) };
  return { ok: false, type: 'Haijulikani', host, message: 'Jibu si playlist ya m3u8 wala MPD.' };
}

module.exports = { carryQuery, parseClearKeys, clearKeyLicense, injectClearKey, seal, unseal, rewriteHls, rewriteMpd, relay, probe, extOf, dirOf };
