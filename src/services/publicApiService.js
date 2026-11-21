'use strict';
const { query } = require('../database/pool');
const { findByPlainKey } = require('./apiKeyService');
const { refreshIfAllowed } = require('./extractionService');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const SELECT = `SELECT s.id AS source_id, s.slug, COALESCE(c.channel_name, s.source_name) AS channel_name,
       c.extracted_value, c.mpd_url_enc, c.clearkey_enc, c.token_expires_at, c.status AS ch_status
  FROM channel_sources s LEFT JOIN channels c ON c.source_id = s.id`;

const valid = (r) => r && r.mpd_url_enc && r.extracted_value;

// Builds the answer sent to the customer: MPD link (with its token) + ClearKey(s). Values are decrypted only here.
function buildPayload(r) {
  const keys = r.clearkey_enc ? decrypt(r.clearkey_enc).split(',').filter(Boolean) : [];
  const map = {};
  for (const k of keys) { const [kid, key] = k.split(':'); if (kid && key) map[kid] = key; }
  return {
    channel: r.channel_name,
    id: r.source_id,
    slug: r.slug,
    mpd_url: decrypt(r.mpd_url_enc),
    token: r.extracted_value,
    clearkey: keys[0] || null, // "kid:key"
    clearkeys: map, // { kid: key } (format used by Shaka / ExoPlayer ClearKey)
    expires_at: null,
  };
}

// Key / account / subscription checks shared by every endpoint. Returns { ctx } or { status, message, ctx }.
async function authorize(plainKey) {
  const k = await findByPlainKey(plainKey);
  if (!k) return { status: 401, message: 'Unauthorized' };
  const ctx = { userId: k.user_id, keyId: k.key_id };
  if (k.key_status === 'REVOKED') return { status: 401, message: 'Unauthorized', ctx };
  if (k.account_status !== 'ACTIVE') return { status: 403, message: 'Forbidden: account suspended', ctx };
  // Subscription is validated against the clock on EVERY request (the scheduler is only a safety net).
  const subOk = k.sub_id && k.sub_status === 'ACTIVE' && new Date(k.sub_expires_at) > new Date();
  const keyOk = k.key_status === 'ACTIVE' && (!k.key_expires_at || new Date(k.key_expires_at) > new Date());
  if (!subOk || !keyOk) return { status: 403, message: 'Forbidden: no active subscription', ctx };
  return { ctx };
}

// Result: { status, body, message, ctx }.
// 401 invalid/revoked key | 403 suspended / no or expired subscription | 404 unknown channel | 503 source unavailable
async function resolveChannel(plainKey, ref) {
  const auth = await authorize(plainKey);
  if (!auth.ctx || auth.status) return auth;
  const ctx = auth.ctx;

  const params = [];
  let where = `s.status='ACTIVE'`;
  const channelId = ref !== undefined && ref !== null && ref !== '';
  if (channelId) {
    params.push(/^\d+$/.test(String(ref)) ? Number(ref) : String(ref).toLowerCase());
    where += typeof params[0] === 'number' ? ` AND s.id=$1` : ` AND s.slug=$1`;
  }
  const row = (await query(`${SELECT} WHERE ${where} ORDER BY s.id ASC LIMIT 1`, params)).rows[0];
  if (!row) return { status: channelId ? 404 : 503, message: channelId ? 'Channel not found' : 'Service Unavailable', ctx };
  if (valid(row)) return { status: 200, body: buildPayload(row), ctx };

  // Value missing/expired: re-extract from the authorized source (shared + rate limited), never serve a stale value.
  await refreshIfAllowed(row.source_id);
  const again = (await query(`${SELECT} WHERE s.id=$1`, [row.source_id])).rows[0];
  if (valid(again)) return { status: 200, body: buildPayload(again), ctx };
  return { status: 503, message: 'Service Unavailable', ctx };
}

// Every ACTIVE source the admin added, in one answer. Sources whose value cannot be obtained right now are listed under `unavailable`.
async function resolveAll(plainKey) {
  const auth = await authorize(plainKey);
  if (!auth.ctx || auth.status) return auth;
  const ctx = auth.ctx;
  const rows = (await query(`${SELECT} WHERE s.status='ACTIVE' ORDER BY s.id ASC`)).rows;
  if (!rows.length) return { status: 503, message: 'Service Unavailable', ctx };
  const channels = [], unavailable = [];
  await Promise.all(rows.map(async (row) => {
    let r = row;
    if (!valid(r)) {
      try { await refreshIfAllowed(r.source_id); r = (await query(`${SELECT} WHERE s.id=$1`, [r.source_id])).rows[0]; } catch (_) { /* reported below */ }
    }
    if (valid(r)) channels.push(buildPayload(r));
    else unavailable.push({ id: row.source_id, slug: row.slug, channel: row.channel_name });
  }));
  if (!channels.length) return { status: 503, message: 'Service Unavailable', ctx };
  channels.sort((a, b) => a.id - b.id);
  return { status: 200, body: { count: channels.length, channels, unavailable }, ctx };
}

// Active sources with their own endpoint names (no secrets).
async function listSources() {
  return (await query(`SELECT id, slug, source_name AS name FROM channel_sources WHERE status='ACTIVE' ORDER BY id ASC`)).rows;
}

async function logUsage(ctx, endpoint, status) {
  if (!ctx) return;
  try {
    await query(`INSERT INTO api_usage_logs (user_id, api_key_id, endpoint, response_status) VALUES ($1,$2,$3,$4)`, [ctx.userId, ctx.keyId, endpoint, status]);
  } catch (e) { logger.error('usage log failed', e); }
}

module.exports = { authorize, resolveAll, listSources, resolveChannel, logUsage, buildPayload };
