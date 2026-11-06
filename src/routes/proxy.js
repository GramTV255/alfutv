'use strict';
/**
 * Public relay for admin-created proxy links:  /p/<token>/stream.m3u8 | stream.mpd
 * The token is the only credential (a secret link). The real source URL and headers are never revealed.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../database/pool');
const { decrypt, hashApiKey } = require('../utils/crypto');
const { config } = require('../config');
const { HttpError } = require('../utils/errors');
const logger = require('../utils/logger');
const proxy = require('../services/proxyService');

const { badKeyLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(badKeyLimiter); // IPs that keep guessing tokens are blocked

router.use(rateLimit({ windowMs: 60 * 1000, limit: 1500, standardHeaders: false, legacyHeaders: false, handler: (_q, r) => r.status(429).type('text/plain').send('Too Many Requests') }));
router.use((req, res, next) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range, Content-Type', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Robots-Tag': 'noindex' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && /\/clearkey$/.test(req.path))) return res.status(405).type('text/plain').send('Method Not Allowed');
  next();
});

const REASONS = {
  HOST_NOT_ALLOWED: 'Domain ya source haipo kwenye Allowed hosts (admin: Channels > Allowed hosts)',
  UPSTREAM_STATUS: 'Source imekataa ombi (angalia headers/cookie/referer, au link imeisha)',
  SOURCE_UNREACHABLE: 'Seva haiwezi kufikia source (DNS/mtandao/TLS)',
  DNS_FAILED: 'Domain ya source haipatikani (DNS)',
  TIMEOUT: 'Source haikujibu kwa wakati',
  SSRF_BLOCKED: 'Anwani ya source hairuhusiwi',
  BAD_URL: 'URL ya source si sahihi au port hairuhusiwi',
  TOO_LARGE: 'Playlist ni kubwa mno',
  BUSY: 'Seva ina shughuli nyingi',
};
const wrapP = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  const status = e && e.status ? e.status : 502;
  if (!(e && e.code && REASONS[e.code])) logger.error(`proxy ${req.path}`, e);
  else logger.warn && logger.warn(`proxy ${e.code} ${req.path.split('/').slice(2).join('/')}`);
  if (res.headersSent) return res.destroy();
  if (status === 404) return res.status(404).type('text/plain').send('Not found');
  const why = e && REASONS[e.code] ? `${REASONS[e.code]} [${e.code}]` : 'Hitilafu isiyojulikana';
  res.status(status >= 400 && status < 600 && status !== 400 ? status : 502).type('text/plain').send(`Bad gateway: ${why}`);
});

async function load(req) {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) throw new HttpError(404, 'Not found');
  const { rows } = await query('SELECT id, source_url, encrypted_headers, clearkey_enc, status, quick FROM proxy_channels WHERE token_hash=$1', [hashApiKey(token)]);
  const ch = rows[0];
  if (!ch || ch.status !== 'ACTIVE') throw new HttpError(404, 'Not found');
  let headers = {};
  try { if (ch.encrypted_headers) headers = JSON.parse(decrypt(ch.encrypted_headers)); } catch (_) { headers = {}; }
  if (ch.quick && !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  let clearKeys = [];
  try { if (ch.clearkey_enc) clearKeys = JSON.parse(decrypt(ch.clearkey_enc)); } catch (_) { clearKeys = []; }
  const origin = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return { channel: ch, headers, clearKeys, origin, token, anyHost: !!ch.quick, carryQuery: !!ch.quick };
}

router.get(['/:token/stream.m3u8', '/:token/stream.mpd'], wrapP(async (req, res) => {
  const ctx = await load(req);
  query('UPDATE proxy_channels SET hits=hits+1, last_used_at=now() WHERE id=$1', [ctx.channel.id]).catch(() => {});
  await proxy.relay(req, res, ctx.channel.source_url, ctx);
}));

// ClearKey license (W3C EME format): players call this when the MPD points to it.
router.get('/:token/clearkey', wrapP(async (req, res) => {
  const ctx = await load(req);
  if (!ctx.clearKeys.length) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'no-store').json(proxy.clearKeyLicense(ctx.clearKeys));
}));

router.post('/:token/clearkey', wrapP(async (req, res) => {
  const ctx = await load(req);
  if (!ctx.clearKeys.length) throw new HttpError(404, 'Not found');
  res.set('Cache-Control', 'no-store').json(proxy.clearKeyLicense(ctx.clearKeys));
}));

router.get('/:token/x/:file', wrapP(async (req, res) => {
  const ctx = await load(req);
  const blob = String(req.params.file).replace(/\.[A-Za-z0-9]{1,5}$/, '');
  await proxy.relay(req, res, proxy.unseal(blob, ctx.channel.id), ctx);
}));

router.get('/:token/d/:blob/*', wrapP(async (req, res) => {
  const ctx = await load(req);
  const dir = proxy.unseal(req.params.blob, ctx.channel.id);
  const rel = String(req.params[0] || '');
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = new URL(rel.replace(/^\/+/, '') + qs, dir);
  if (target.hostname !== new URL(dir).hostname) throw new HttpError(404, 'Not found');
  await proxy.relay(req, res, target.toString(), ctx);
}));

module.exports = router;
