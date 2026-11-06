'use strict';
/**
 * amiriChannel: the admin pastes a full MPD link; the part that is the token is found and replaced by the token
 * the server stores from the chosen source (refreshed by the normal 3-minute extraction). ClearKey is added by the admin.
 */
const { query } = require('../database/pool');
const { HttpError } = require('../utils/errors');
const { decrypt } = require('../utils/crypto');
const { runExtraction } = require('./extractionService');
const { config } = require('../config');

const MARK = '{token}';
// {token}      = put the token exactly as stored. Detected links get a style that follows the example the admin pasted:
// {token:tok}  = the link has "tok_<...>" there (usually in the middle of the path) -> "tok_" is always present
// {token:bare} = the link has a bare value there (e.g. at the end: ?cdntoken=<JWT>)  -> any "tok_" prefix is removed
const MARK_RE = /\{token(?::(?:tok|bare))?\}/g;
const styled = (found) => (String(found).startsWith('tok_') ? '{token:tok}' : '{token:bare}');

// Finds the token inside `link`. Order: {token} marker, current stored token, source tokenRegex.
function makeTemplate(link, currentToken, tokenRegex) {
  const typed = link.match(MARK_RE);
  if (typed) {
    if (typed.length > 1) throw new HttpError(400, 'Weka {token} mara moja tu', 'VALIDATION_ERROR');
    return { template: link, method: 'marker' };
  }
  const bad = (m) => new HttpError(400, m, 'VALIDATION_ERROR');
  if (currentToken && currentToken.length >= 6 && link.includes(currentToken)) {
    const n = link.split(currentToken).length - 1;
    if (n > 1) throw bad('Token inaonekana mara ' + n + ' kwenye link. Weka {token} mahali pamoja unapotaka.');
    return { template: link.replace(currentToken, styled(currentToken)), method: 'current-token' };
  }
  if (tokenRegex) {
    let re;
    try { re = new RegExp(tokenRegex, 'g'); } catch (_) { re = null; }
    if (re) {
      const hits = [];
      let m;
      while ((m = re.exec(link)) && hits.length < 5) { hits.push(m[1] !== undefined ? m[1] : m[0]); if (m[0] === '') re.lastIndex++; }
      const uniq = [...new Set(hits.filter(Boolean))];
      if (uniq.length === 1 && link.split(uniq[0]).length === 2) return { template: link.replace(uniq[0], styled(uniq[0])), method: 'regex' };
      if (uniq.length > 1) throw bad('Sehemu nyingi zinafanana na token. Weka {token} mahali panapohusika.');
    }
  }
  if (!tokenRegex) { // only two styles: tok_... (tok_<..> or tok_=<..>) and ?cdntoken=<JWT>
    const cands = [];
    for (const re of [/tok_=([A-Za-z0-9._~\-]+=*)/g, /(tok_[A-Za-z0-9._~\-]+=*)/g, /[?&]cdntoken=([^&#\s]+)/gi]) {
      for (const m of link.matchAll(re)) cands.push(m[1]);
      if (cands.length) break;
    }
    const uniq = [...new Set(cands)];
    if (uniq.length === 1 && link.split(uniq[0]).length === 2) return { template: link.replace(uniq[0], styled(uniq[0])), method: 'default-pattern' };
    if (uniq.length > 1) throw bad('Sehemu nyingi zinafanana na token. Weka {token} mahali panapohusika.');
  }
  throw bad('Token haikupatikana kwenye link. Weka {token} mahali token inapokaa, mfano https://host/live/{token}/index.mpd');
}

// A stored token can never bring its own label into the link: "tok_", "tok_=", "cdntoken=", "token=" in front of the value are removed,
// so the result is exactly  ...mpd?cdntoken=<JWT>  or  .../tok_=<JWT>/...  with nothing added.
const cleanToken = (t) => String(t).trim().replace(/^(?:(?:cdntoken|token|tok_?)=+|tok_)+/i, '');
const fill = (template, token) => template.replace(MARK_RE, (m, offset) => {
  if (m === '{token:tok}') return token.startsWith('tok_') ? token : `tok_${token}`;
  const before = template.slice(Math.max(0, offset - 12), offset);
  if (m === '{token:bare}' || /(?:cdntoken|token|tok_)=$/i.test(before)) return cleanToken(token); // label already in the link
  return token;
});
const sample = (template) => template.replace(MARK_RE, 'x'); // a harmless value for URL checks
const maskToken = (t) => (t && t.length > 8 ? `${t.slice(0, 4)}••••${t.slice(-2)}` : '••••');

const SELECT = `SELECT a.*, s.source_name, s.extraction_rules, c.extracted_value, c.tokens_enc, c.token_expires_at, c.status AS ch_status
  FROM amiri_channels a JOIN channel_sources s ON s.id=a.source_id LEFT JOIN channels c ON c.source_id=a.source_id`;
const tokenOk = (r) => !!(r && r.extracted_value); // a stored token never expires; only a newly requested one replaces it

// The token put into the link: the cdntoken found at the source goes into the tok_ place of the link (tok_<..> or tok_=<..>);
// when the source has no cdntoken, the next best stored token is used (a tok_ token for a tok_ link, else any JWT), then the primary.
function tokenFor(r, template) {
  let list = [];
  try { if (r.tokens_enc) list = JSON.parse(decrypt(r.tokens_enc)); } catch (_) { list = []; }
  const style = (String(template || '').match(/\{token:(tok|bare)\}/) || [])[1];
  if (!style) return r.extracted_value; // a typed {token}: the primary token as it is
  const pick = (type) => list.find((x) => x.type === type);
  const t = pick('cdntoken') || (style === 'tok' ? pick('tok') : null) || pick('tok_=') || pick('jwt') || (style === 'bare' ? list.find((x) => x.type !== 'tok') : null);
  return t ? t.value : r.extracted_value;
}

function payload(r) {
  const keys = r.clearkey_enc ? decrypt(r.clearkey_enc).split(',').filter(Boolean) : [];
  const map = {};
  for (const k of keys) { const [kid, key] = k.split(':'); if (kid && key) map[kid] = key; }
  const template = decrypt(r.template_enc);
  const token = tokenFor(r, template);
  return { channel: r.name, id: r.id, slug: r.slug, mpd_url: fill(template, token), token, clearkey: keys[0] || null, clearkeys: map, expires_at: null };
}

// Every request makes the channel's source look for a new token before answering. Only requests that arrive while a fetch is
// already running share it (and, if AMIRI_MIN_REFRESH_SECONDS > 0, those within that many seconds after it).
const fresh = new Map(); // source_id -> { at, promise }
function freshToken(sourceId) {
  const e = fresh.get(sourceId);
  if (e && (!e.done || Date.now() - e.at < config.amiriMinRefreshSeconds * 1000)) return e.promise;
  const rec = { at: Date.now(), done: false };
  rec.promise = runExtraction(sourceId, 'AMIRI').then(() => true, () => false).finally(() => { rec.done = true; rec.at = Date.now(); });
  fresh.set(sourceId, rec);
  return rec.promise;
}

// Rows -> payloads. If the fresh fetch fails the channel is "unavailable" (503), unless AMIRI_ALLOW_STALE=true.
async function resolveRows(rows) {
  const out = [], unavailable = [];
  const okBySource = new Map();
  await Promise.all([...new Set(rows.map((r) => r.source_id))].map(async (id) => okBySource.set(id, await freshToken(id))));
  const ids = rows.map((r) => r.id);
  const now = (await query(`${SELECT} WHERE a.id = ANY($1::int[])`, [ids])).rows;
  const byId = new Map(now.map((r) => [r.id, r]));
  for (const row of rows) {
    const r = byId.get(row.id) || row;
    // Unless AMIRI_ALLOW_STALE=false, an unexpired stored token is served when the fresh fetch fails; otherwise the answer is only given when the source just produced a new token for this request.
    if (tokenOk(r) && (okBySource.get(row.source_id) || config.amiriAllowStale)) out.push(payload(r));
    else {
      const why = !okBySource.get(row.source_id) ? 'source imeshindwa kutoa token mpya' : 'hakuna token iliyohifadhiwa';
      console.warn(`[amiri] ${row.slug}: 503 - ${why}${tokenOk(r) ? '' : ' (hakuna token halali iliyohifadhiwa)'}`);
      unavailable.push({ id: row.id, slug: row.slug, channel: row.name });
    }
  }
  out.sort((a, b) => a.id - b.id);
  return { channels: out, unavailable };
}

async function resolveOne(ref) {
  const row = (await query(`${SELECT} WHERE a.status='ACTIVE' AND a.slug=$1`, [String(ref).toLowerCase()])).rows[0];
  if (!row) return { status: 404, message: 'Channel not found' };
  const { channels } = await resolveRows([row]);
  return channels.length ? { status: 200, body: channels[0] } : { status: 503, message: 'Service Unavailable' };
}

module.exports = { tokenFor, sample, MARK_RE, makeTemplate, fill, maskToken, SELECT, tokenOk, resolveOne, MARK };
