'use strict';
/**
 * Server-side extraction for AUTHORIZED channel sources only.
 *
 * extraction_rules (JSON, set by the admin):
 *   mpdUrlRegex     optional  regex to pick the right MPD URL when the response contains several
 *   tokenRegex      optional  regex run on the MPD URL; group 1 (or the whole match) is stored. Default: /(tok_[A-Za-z0-9._~\-]+=*)/
 *   tokenParam      optional  name of the query parameter of the MPD link whose VALUE alone is the token (default: cdntoken, then tok_...)
 *   tokenTtlSeconds optional  lifetime to assume for the value (default 3600)
 *   expiryParam     optional  name of a query parameter in the MPD URL that holds an epoch-seconds expiry
 *   valueType       optional  "token" (default) or "url"
 *   channelName     optional  display name (defaults to the source name)
 *   clearKeyPath    optional  dotted path to the ClearKey in a JSON response (string "kid:key", {kid:key}, or [{kid,k}])
 *   clearKeyRegex   optional  regex on the raw response; 2 groups = kid,key (or 1 group = "kid:key")
 *   requireClearKey optional  true = fail the extraction when no ClearKey is found
 * Without clearKeyPath/clearKeyRegex, a hex pair kid:key (32:32 hex) in the response is detected automatically.
 *
 * Only the extracted value is stored. The full HTML/response is never saved.
 * The MPD URL must belong to the host allowlist; nothing here bypasses authentication or licensing.
 */
const cheerio = require('cheerio');
const { query } = require('../database/pool');
const { decrypt, encrypt } = require('../utils/crypto');
const { safeRequest, isAcceptableLinkHost, isDirectMpd } = require('./safeHttp');
const { HttpError } = require('../utils/errors');
const logger = require('../utils/logger');

const DEFAULT_TOKEN_REGEX = '(tok_[A-Za-z0-9._~\\-]+=*)';
const inflight = new Map(); // source_id -> Promise (prevents request stampedes)
const lastRun = new Map(); // source_id -> timestamp (on-demand cooldown)

function compileRegex(src, name) {
  if (typeof src !== 'string' || !src || src.length > 300) throw new HttpError(400, `${name} si sahihi (regex ndefu mno au tupu)`);
  try { return new RegExp(src); } catch (_) { throw new HttpError(400, `${name} si regex sahihi`); }
}

// The form used to pre-fill tokenRegex with the old default "tok_..." pattern. That value is NOT a custom rule: it is dropped so the
// automatic detection (cdntoken, tok_, JWT parameters) works for sources saved earlier too.
function normalizeRules(rules) {
  const r = { ...(rules || {}) };
  if (r.tokenRegex === DEFAULT_TOKEN_REGEX || r.tokenRegex === '(tok_[A-Za-z0-9._~\\-]+)') delete r.tokenRegex;
  return r;
}

function validateRules(rules) {
  if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) throw new HttpError(400, 'Extraction rules ziwe JSON object');
  const out = {};
  if (rules.mpdUrlRegex) { compileRegex(rules.mpdUrlRegex, 'mpdUrlRegex'); out.mpdUrlRegex = rules.mpdUrlRegex; }
  if (rules.tokenRegex) { compileRegex(rules.tokenRegex, 'tokenRegex'); out.tokenRegex = rules.tokenRegex; }
  if (rules.tokenTtlSeconds !== undefined) {
    const n = Number(rules.tokenTtlSeconds);
    if (!Number.isInteger(n) || n < 30 || n > 7 * 86400) throw new HttpError(400, 'tokenTtlSeconds iwe kati ya 30 na 604800');
    out.tokenTtlSeconds = n;
  }
  if (rules.expiryParam) {
    if (!/^[A-Za-z0-9_\-]{1,40}$/.test(rules.expiryParam)) throw new HttpError(400, 'expiryParam si sahihi');
    out.expiryParam = rules.expiryParam;
  }
  if (rules.valueType) {
    if (!['token', 'url'].includes(rules.valueType)) throw new HttpError(400, 'valueType ni "token" au "url"');
    out.valueType = rules.valueType;
  }
  if (rules.channelName) out.channelName = String(rules.channelName).slice(0, 100);
  if (rules.clearKeyRegex) { compileRegex(rules.clearKeyRegex, 'clearKeyRegex'); out.clearKeyRegex = rules.clearKeyRegex; }
  if (rules.clearKeyPath) {
    if (!/^[A-Za-z0-9_.\-]{1,120}$/.test(rules.clearKeyPath)) throw new HttpError(400, 'clearKeyPath si sahihi');
    out.clearKeyPath = rules.clearKeyPath;
  }
  if (rules.tokenParam) {
    if (!/^[A-Za-z0-9_\-]{1,40}$/.test(rules.tokenParam)) throw new HttpError(400, 'tokenParam si sahihi');
    out.tokenParam = rules.tokenParam;
  }
  if (rules.requireClearKey !== undefined) out.requireClearKey = !!rules.requireClearKey;
  return out;
}

// ---- Finding the MPD link anywhere in the response ----
// The response is read in several forms so a link is found however it is written: plain, JSON/HTML-escaped (\/ \u002F &amp; &#x2F;),
// percent-encoded (https%3A%2F%2F...), inside base64 / JWT parts, in attributes and scripts, relative to the source URL, and in
// the Location / Link headers of a redirect.
const unescapeText = (t) => t
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\\//g, '/')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");

function candidateStrings(body, contentType, extra = '') {
  const text = `${extra}\n${body}`;
  const un = unescapeText(text); // the unescaped form already contains every plain link, so the raw text is not scanned again
  const out = [un];
  // percent-encoded links
  const enc = un.match(/https?(?::|%3A)(?:\/\/|%2F%2F)[^\s"'<>\\]*%2F[^\s"'<>\\]*/gi) || [];
  for (const e of enc.slice(0, 50)) { try { out.push(decodeURIComponent(e)); } catch (_) { /* partial escape */ } }
  // base64 / base64url blobs (also each part of a JWT)
  const blobs = un.match(/[A-Za-z0-9+/_-]{40,}={0,2}/g) || [];
  for (const b of blobs.slice(0, 40)) {
    try {
      const d = Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      if (d.length > 10 && d.length < 20000 && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(d) && /(mpd|https?:)/i.test(d)) out.push(unescapeText(d));
    } catch (_) { /* not base64 */ }
  }
  if (contentType.includes('html') || /<\s*html|<\s*body|<\s*script/i.test(body.slice(0, 2000))) {
    const $ = cheerio.load(body);
    $('*').each((_, el) => {
      for (const v of Object.values(el.attribs || {})) if (typeof v === 'string' && /mpd/i.test(v)) out.push(unescapeText(v));
    });
    $('script').each((_, el) => { const t = $(el).html(); if (t && /mpd/i.test(t)) out.push(unescapeText(t)); });
  }
  return out;
}

const TAIL = String.raw`[^\s"'<>\\\x60)\],;|]`;
// lookahead => overlapping starts are all seen, so a link nested inside another URL is found on its own
const ABS_MPD = new RegExp(String.raw`(?=(https?:\/\/${TAIL}*?\.mpd(?![A-Za-z0-9_])${TAIL}*))`, 'gi');
const PROTO_MPD = new RegExp(String.raw`(?<=["'(=\s]|^)(\/\/${TAIL}*?\.mpd(?![A-Za-z0-9_])${TAIL}*)`, 'gi');
const REL_MPD = /(?<=["'(=:\s])(?!https?:|\/\/)([A-Za-z0-9_.~%\/-]*?\.mpd)(?![A-Za-z0-9_])((?:[^\s"'<>\\`)\],;|])*)?/gi;

// Every distinct MPD URL in the response (absolute, protocol-relative or relative to `baseUrl`), in order of appearance.
async function collectMpdUrls(body, contentType, rules, baseUrl, extra = '') {
  const filter = rules.mpdUrlRegex ? new RegExp(rules.mpdUrlRegex) : null;
  const seen = new Set();
  const found = [];
  const accept = (raw) => {
    let u;
    try { u = new URL(raw, baseUrl); } catch (_) { return; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return;
    if (!isAcceptableLinkHost(u.hostname)) return; // the link is only stored, never fetched: any public host is fine
    const s = u.toString();
    if (/https?(:|%3A)(\/\/|%2F%2F)/i.test(u.pathname + u.search + raw.slice(8))) return; // a URL carrying another URL (redirector): its inner link is found separately
    if (s.length > 2048 || seen.has(s)) return;
    if (filter && !filter.test(s)) return;
    seen.add(s); found.push(u);
  };
  for (const text of candidateStrings(body, contentType, extra)) {
    for (const m of text.matchAll(ABS_MPD)) accept(m[1]);
    for (const m of text.matchAll(PROTO_MPD)) accept(m[1]);
    for (const m of text.matchAll(REL_MPD)) accept(m[1] + (m[2] || ''));
    if (found.length >= 60) break;
  }
  return found;
}

// Kept for callers/tests: the first MPD URL (or null).
async function findMpdUrl(body, contentType, rules, baseUrl = 'https://invalid.example/') {
  return (await collectMpdUrls(body, contentType, rules, baseUrl))[0] || null;
}

const KEY_PAIR = /^[A-Za-z0-9_\-+/=]{16,64}:[A-Za-z0-9_\-+/=]{16,64}$/;
const HEX_PAIR = /\b([0-9a-fA-F]{32}):([0-9a-fA-F]{32})\b/g;

function pathGet(obj, p) { return p.split('.').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), obj); }

// Turns the value found at clearKeyPath into a list of "kid:key" strings.
function normalizeKeys(v) {
  if (v == null) return [];
  if (typeof v === 'string') return v.split(/[,\n;]/).map((x) => x.trim());
  if (Array.isArray(v)) return v.flatMap(normalizeKeys);
  if (typeof v === 'object') {
    const k = v.k || v.key;
    if (v.kid && k) return [`${v.kid}:${k}`];
    return Object.entries(v).filter(([, val]) => typeof val === 'string').map(([kid, val]) => `${kid}:${val}`);
  }
  return [];
}

function findClearKeys(body, rules) {
  let out = [];
  if (rules.clearKeyPath) { try { out = normalizeKeys(pathGet(JSON.parse(body), rules.clearKeyPath)); } catch (_) { /* not JSON */ } }
  if (!out.length && rules.clearKeyRegex) {
    for (const m of body.matchAll(new RegExp(rules.clearKeyRegex, 'g'))) out.push(m[2] ? `${m[1]}:${m[2]}` : (m[1] || m[0]));
  }
  if (!out.length) for (const m of body.matchAll(HEX_PAIR)) out.push(`${m[1]}:${m[2]}`);
  return [...new Set(out.map((x) => String(x).trim()).filter((x) => KEY_PAIR.test(x)))].slice(0, 8);
}

function extractValue(mpdUrl, rules) {
  if (rules.valueType === 'url') return mpdUrl.toString();
  const re = new RegExp(rules.tokenRegex || DEFAULT_TOKEN_REGEX);
  const raw = mpdUrl.pathname + mpdUrl.search;
  let m = raw.match(re);
  if (!m) { try { m = decodeURIComponent(raw).match(re); } catch (_) { m = null; } } // token written percent-encoded
  if (!m) return null;
  return m[1] || m[0];
}

// Token from an MPD link. Both common styles are understood without any setup:
//   1) tok_<...>            (in the path or query; JWT-style tok_eyJ... included)
//   2) ?cdntoken=<JWT>      (also token, hdnts, hdntl, auth, access_token, sig, signature, st ... and any other parameter holding a JWT)
// A custom tokenRegex / valueType in the rules always wins.
const TOKEN_PARAMS = ['cdntoken']; // only two kinds of token are read: tok_ (tok_<..> / tok_=<..>) and cdntoken
const JWT_LIKE = /^eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*=*$/;
function tokenFromMpd(mpdUrl, rules) {
  if (rules.valueType === 'url') return extractValue(mpdUrl, rules);
  if (rules.tokenRegex) { const own = extractValue(mpdUrl, rules); if (own) return own; } // your own rule wins; if it finds nothing, automatic detection still tries
  // The value of the cdntoken parameter (or the parameter named in the rules) is taken ALONE, not the rest of the link.
  for (const n of [rules.tokenParam, 'cdntoken'].filter(Boolean)) { const q = mpdUrl.searchParams.get(n); if (q) return q; }
  const eq = (mpdUrl.pathname + mpdUrl.search).match(/tok_=([A-Za-z0-9._~\-]+=*)/); // https://host/tok_=<JWT>/live/...mpd
  if (eq) return eq[1];
  const v = extractValue(mpdUrl, { ...rules, tokenRegex: undefined }); // tok_...
  if (v) return v;
  return null;
}

// A JWT-style token (header.payload.signature) carries its own expiry in the payload ("exp", epoch seconds). Only the exp number is read.
function jwtExpiry(value) {
  const m = String(value || '').match(/(?:^|[^A-Za-z0-9_-])(?:tok_)?(eyJ[A-Za-z0-9_-]{5,}\.([A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]*=*)/);
  if (!m) return null;
  try {
    const exp = Number(JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8')).exp);
    return Number.isFinite(exp) && exp > 1e9 && exp < 4e9 ? new Date(exp * 1000) : null;
  } catch (_) { return null; }
}

// Token placed in the response itself (JSON / HTML / text), not in the MPD link.
function extractFromBody(body, rules) {
  if (rules.valueType === 'url') return null;
  const text = body.replace(/\\\//g, '/');
  let m = text.match(/cdntoken["']?\s*[=:]\s*["']?(eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*=*)/i);
  if (rules.tokenRegex) { const own = text.match(new RegExp(rules.tokenRegex)); if (own) m = own; } // your rule first
  if (!m) m = text.match(new RegExp(DEFAULT_TOKEN_REGEX));
  const v = m && (m[1] || m[0]);
  return v && v.length <= 4096 ? v : null;
}

function computeExpiry(mpdUrl, rules, value) {
  const fromJwt = rules.expiryParam ? null : jwtExpiry(value);
  if (fromJwt) return fromJwt;
  if (mpdUrl && rules.expiryParam) {
    const v = Number(mpdUrl.searchParams.get(rules.expiryParam));
    if (Number.isFinite(v) && v > 1e9) return new Date((v > 1e12 ? v : v * 1000));
  }
  return new Date(Date.now() + (rules.tokenTtlSeconds || 3600) * 1000);
}

async function log(sourceId, success, message, httpStatus, durationMs, triggeredBy) {
  try {
    await query(
      `INSERT INTO extraction_logs (source_id, success, message, http_status, duration_ms, triggered_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [sourceId, success, String(message).slice(0, 480), httpStatus || null, durationMs || null, triggeredBy]
    );
  } catch (e) { logger.error('extraction log failed', e); }
}

// ---- All tokens in a response ----
// Types: "tok" (tok_...), a parameter name such as "cdntoken", "jwt" (any other JWT), "custom" (your tokenRegex).
const typeOfValue = (v) => (String(v).startsWith('tok_') ? 'tok' : JWT_LIKE.test(v) ? 'jwt' : 'token');
function tokensFromUrl(u, rules) {
  const out = [];
  if (rules.valueType === 'url') return [{ type: 'url', value: u.toString() }];
  if (rules.tokenRegex) { const v = extractValue(u, rules); if (v) return [{ type: 'custom', value: v }]; } // else: automatic detection below
  const raw = u.pathname + u.search;
  let dec = raw; try { dec = decodeURIComponent(raw); } catch (_) { /* keep raw */ }
  for (const n of [...new Set([rules.tokenParam, ...TOKEN_PARAMS].filter(Boolean))]) { const q = u.searchParams.get(n); if (q) out.push({ type: n, value: q }); }
  for (const m of dec.matchAll(/tok_=([A-Za-z0-9._~\-]+=*)/g)) out.push({ type: 'tok_=', value: m[1] });
  for (const m of dec.matchAll(/(tok_[A-Za-z0-9._~\-]+=*)/g)) out.push({ type: 'tok', value: m[1] });
  return out;
}
function tokensFromBody(body, rules) {
  const text = body.replace(/\\\//g, '/');
  const out = [];
  if (rules.valueType === 'url') return [];
  if (rules.tokenRegex) { const v = extractFromBody(body, rules); if (v) return [{ type: 'custom', value: v }]; }
  for (const m of text.matchAll(/tok_=([A-Za-z0-9._~\-]+=*)/g)) out.push({ type: 'tok_=', value: m[1] });
  for (const m of text.matchAll(/(tok_[A-Za-z0-9._~\-]+=*)/g)) out.push({ type: 'tok', value: m[1] });
  for (const m of text.matchAll(/cdntoken["']?\s*[=:]\s*["']?(eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*=*)/gi)) out.push({ type: 'cdntoken', value: m[1] });
  return out;
}
// distinct values, links first; each token gets its own expiry (JWT exp, else the rules' TTL)
function gatherTokens(urls, body, rules) {
  const seen = new Set(); const list = [];
  const add = (t, url) => {
    if (!t.value || t.value.length > 4096 || seen.has(t.value)) return;
    seen.add(t.value);
    list.push({ type: t.type, value: t.value, exp: computeExpiry(url || null, rules, t.value).toISOString() });
  };
  for (const u of urls) for (const t of tokensFromUrl(u, rules)) add(t, u);
  for (const t of tokensFromBody(body || '', rules)) add(t, null);
  return list.slice(0, 20);
}

// The source IS an MPD link (any public host): nothing is fetched. The token comes from the link itself; the expiry is fixed when the
// link is first stored (expiryParam, else tokenTtlSeconds), so the value goes EXPIRED on time and the admin pastes a new link.
async function storeDirectMpd(src, rules, sourceId, t0, triggeredBy) {
  const mpd = new URL(src.source_url);
  let value = tokenFromMpd(mpd, rules);
  if (!value && !rules.tokenRegex && mpd.search.length > 1) value = mpd.search.slice(1); // direct link with no known token pattern: the whole query string
  if (!value) throw new HttpError(400, 'Token haikupatikana kwenye link ya MPD. Weka tokenRegex (au valueType "url").', 'TOKEN_NOT_FOUND');
  const prev = (await query('SELECT mpd_url_enc, extracted_at, token_expires_at FROM channels WHERE source_id=$1', [sourceId])).rows[0];
  let same = false;
  try { same = !!(prev && prev.mpd_url_enc && decrypt(prev.mpd_url_enc) === mpd.toString()); } catch (_) { same = false; }
  const expiresAt = same && !rules.expiryParam && prev.token_expires_at ? new Date(prev.token_expires_at) : computeExpiry(mpd, rules, value);
  const status = 'VALID'; // tokens never expire on their own; they are only replaced when a new one is requested
  const tokens = gatherTokens([mpd], '', rules);
  await query(
    `INSERT INTO channels (source_id, channel_name, extracted_value, extracted_at, token_expires_at, status, mpd_url_enc, tokens_enc)
     VALUES ($1,$2,$3,now(),$4,$5,$6,$8)
     ON CONFLICT (source_id) DO UPDATE SET channel_name=EXCLUDED.channel_name, extracted_value=EXCLUDED.extracted_value,
       extracted_at=CASE WHEN $7 THEN channels.extracted_at ELSE now() END, token_expires_at=EXCLUDED.token_expires_at, status=EXCLUDED.status, mpd_url_enc=EXCLUDED.mpd_url_enc, tokens_enc=EXCLUDED.tokens_enc`,
    [sourceId, rules.channelName || src.source_name, value, expiresAt, status, encrypt(mpd.toString()), same, tokens.length ? encrypt(JSON.stringify(tokens)) : null]
  );
  if (!same) await log(sourceId, true, `Link ya MPD imehifadhiwa moja kwa moja (host ${mpd.hostname}, inaisha ${expiresAt.toISOString()})`, null, Date.now() - t0, triggeredBy);
  return { ok: true, host: mpd.hostname, valuePreview: mask(value), valueLength: value.length, clearKeys: 0, expiresAt, direct: true };
}

async function doExtraction(sourceId, triggeredBy) {
  const t0 = Date.now();
  const src = (await query('SELECT * FROM channel_sources WHERE id=$1', [sourceId])).rows[0];
  if (!src) throw new HttpError(404, 'Source haipo');
  if (src.status !== 'ACTIVE') throw new HttpError(409, 'Source imezimwa');
  await query('UPDATE channel_sources SET last_fetch_at=now() WHERE id=$1', [sourceId]); // drives the every-N-minutes schedule
  const rules = normalizeRules(src.extraction_rules);
  let httpStatus = null;
  try {
    let headers = {};
    if (src.encrypted_headers) headers = JSON.parse(decrypt(src.encrypted_headers));
    if (src.content_type) headers['Content-Type'] = src.content_type;
    if (isDirectMpd(src.source_url)) return await storeDirectMpd(src, rules, sourceId, t0, triggeredBy);
    const res = await safeRequest({ url: src.source_url, method: src.http_method, headers, body: src.http_method === 'POST' ? src.request_body || undefined : undefined, captureRedirect: true });
    httpStatus = res.status;
    const redirected = res.status >= 300 && res.status < 400;
    if (!redirected && (res.status < 200 || res.status >= 300)) throw new HttpError(502, `Chanzo kimejibu HTTP ${res.status}`, 'SOURCE_BAD_STATUS');
    const ct = res.contentType;
    if (!redirected && !/(html|json|text|xml|dash|javascript)/.test(ct) && ct) throw new HttpError(502, `Aina ya response haitegemewi (${ct.split(';')[0]})`, 'BAD_CONTENT_TYPE');

    // Search the whole response (body + Location/Link headers) for MPD links, then read the token out of the link.
    const extra = Object.values(res.headers || {}).join('\n');
    const urls = await collectMpdUrls(res.body, ct, rules, src.source_url, extra);
    if (!urls.length && /<MPD[\s>]/.test(res.body)) urls.push(new URL(src.source_url)); // the source itself answered with the MPD
    let mpd = null, value = null;
    for (const u of urls) { const t = tokenFromMpd(u, rules); if (t) { mpd = u; value = t; break; } } // first link that carries a token
    if (!mpd && urls.length) mpd = urls[0];
    if (!value) value = extractFromBody(res.body, rules); // token may sit elsewhere in the response
    if (!mpd && !value) throw new HttpError(502, redirected ? `Chanzo kimejibu redirect (${res.status}) isiyo na link ya MPD` : 'Wala MPD URL wala token haikupatikana kwenye response nzima', 'MPD_NOT_FOUND');
    if (!value) throw new HttpError(502, `MPD imepatikana (${urls.length}) lakini token haikupatikana kwa tokenRegex`, 'TOKEN_NOT_FOUND');
    const tokens = gatherTokens(urls, res.body, rules); // every token of every kind in the response, stored by type
    if (!tokens.some((t) => t.value === value)) tokens.unshift({ type: typeOfValue(value), value, exp: computeExpiry(mpd, rules, value).toISOString() });
    // the channel is valid until the FIRST of its tokens expires
    const expiresAt = new Date(Math.min(...tokens.map((t) => new Date(t.exp).getTime())));
    const keys = findClearKeys(res.body, rules);
    if (rules.requireClearKey && !keys.length) throw new HttpError(502, 'ClearKey haikupatikana kwenye response', 'CLEARKEY_NOT_FOUND');

    await query(
      `INSERT INTO channels (source_id, channel_name, extracted_value, extracted_at, token_expires_at, status, mpd_url_enc, clearkey_enc, tokens_enc)
       VALUES ($1,$2,$3,now(),$4,'VALID',$5,$6,$7)
       ON CONFLICT (source_id) DO UPDATE SET channel_name=EXCLUDED.channel_name, extracted_value=EXCLUDED.extracted_value,
         extracted_at=now(), token_expires_at=EXCLUDED.token_expires_at, status='VALID',
         mpd_url_enc=EXCLUDED.mpd_url_enc, clearkey_enc=EXCLUDED.clearkey_enc, tokens_enc=EXCLUDED.tokens_enc`,
      [sourceId, rules.channelName || src.source_name, value, expiresAt, mpd ? encrypt(mpd.toString()) : null, keys.length ? encrypt(keys.join(',')) : null, encrypt(JSON.stringify(tokens))]
    );
    await log(sourceId, true, `Extraction imefanikiwa (${mpd ? 'host ' + mpd.hostname : 'token pekee, bila MPD'}, tokens ${tokens.length} (${[...new Set(tokens.map((t) => t.type))].join(', ')}), ClearKey ${keys.length}, inaisha ${expiresAt.toISOString()})`, httpStatus, Date.now() - t0, triggeredBy);
    return { ok: true, host: mpd ? mpd.hostname : '(token pekee)', valuePreview: mask(value), valueLength: value.length, clearKeys: keys.length, expiresAt };
  } catch (e) {
    await log(sourceId, false, e.message, httpStatus, Date.now() - t0, triggeredBy);
    await query(
      `INSERT INTO channels (source_id, channel_name, status) VALUES ($1,$2,'FAILED')
       ON CONFLICT (source_id) DO UPDATE SET status = CASE WHEN channels.extracted_value IS NOT NULL THEN channels.status ELSE 'FAILED' END`,
      [sourceId, src.source_name]
    );
    throw e;
  }
}

const mask = (v) => (v.length <= 8 ? '****' : `${v.slice(0, 4)}…${v.slice(-2)}`);

// One extraction at a time per source; concurrent callers share the same promise.
function runExtraction(sourceId, triggeredBy = 'SYSTEM') {
  if (inflight.has(sourceId)) return inflight.get(sourceId);
  const p = doExtraction(sourceId, triggeredBy).finally(() => {
    inflight.delete(sourceId);
    lastRun.set(sourceId, Date.now());
  });
  inflight.set(sourceId, p);
  return p;
}

// Used by the public API when the stored value is missing/expired. Cooldown protects the source from hammering.
async function refreshIfAllowed(sourceId) {
  const last = lastRun.get(sourceId) || 0;
  if (Date.now() - last < 15000 && !inflight.has(sourceId)) return null;
  try { return await runExtraction(sourceId, 'ON_DEMAND'); } catch (_) { return null; }
}

async function markExpiredChannels() {
  return 0; // tokens never expire: the last one is kept until a new one is requested successfully
}

// Every source is requested again every `interval_minutes` (default 3). The scheduler ticks each minute; the 20s
// tolerance makes a 3-minute interval fire at 3:00, not 4:00. A running extraction is never started twice.
async function refreshDueSources() {
  const { rows } = await query(
    `SELECT id FROM channel_sources
      WHERE status='ACTIVE'
        AND (last_fetch_at IS NULL OR last_fetch_at <= now() - (interval_minutes * interval '1 minute') + interval '20 seconds')`
  );
  // at most 3 sources at a time (keeps memory and sockets small on a tiny host)
  const queue = rows.map((r) => r.id);
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try { await runExtraction(id, 'SCHEDULER'); } catch (e) { logger.warn('scheduled extraction failed', { source: id, error: e.message }); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return rows.length;
}

module.exports = { runExtraction, refreshIfAllowed, markExpiredChannels, refreshDueSources, refreshExpiring: refreshDueSources, validateRules, normalizeRules, gatherTokens, tokensFromUrl, extractValue, tokenFromMpd, collectMpdUrls, findMpdUrl, computeExpiry, findClearKeys, normalizeKeys };
