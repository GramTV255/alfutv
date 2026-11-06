'use strict';
const { query } = require('../database/pool');
const { verifySession } = require('../services/authService');
const { HttpError } = require('../utils/errors');
const { safeEqual } = require('../utils/crypto');
const { config } = require('../config');

const COOKIE = 'sid';

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  });
}
const clearSessionCookie = (res) => res.clearCookie(COOKIE, { path: '/' });

// Loads the session, re-reads the user from the DB (role/status/token_version are never trusted from the token alone).
async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) throw new HttpError(401, 'Tafadhali ingia kwanza', 'NO_SESSION');
    let claims;
    try { claims = verifySession(token); } catch (_) { throw new HttpError(401, 'Session imeisha. Ingia tena.', 'BAD_SESSION'); }
    const { rows } = await query('SELECT id, full_name, phone_number, role, account_status, token_version, created_at FROM users WHERE id=$1', [claims.sub]);
    const u = rows[0];
    if (!u || u.token_version !== claims.tv) throw new HttpError(401, 'Session imeisha. Ingia tena.', 'BAD_SESSION');
    if (u.account_status !== 'ACTIVE') throw new HttpError(403, 'Akaunti yako imesimamishwa', 'ACCOUNT_SUSPENDED');
    req.user = u;
    req.csrf = claims.csrf;
    next();
  } catch (e) { next(e); }
}

// CSRF: the cookie is SameSite=Strict AND every state-changing request must echo the per-session token in a header.
function csrfProtect(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token');
  if (!sent || !req.csrf || !safeEqual(sent, req.csrf)) return next(new HttpError(403, 'CSRF token si sahihi. Pakia ukurasa upya.', 'BAD_CSRF'));
  next();
}

const adminIpAllowed = (ip) => !config.adminAllowedIps.length || config.adminAllowedIps.includes(String(ip || '').replace(/^::ffff:/, ''));

function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return next(new HttpError(403, 'Huna ruhusa ya kufanya hili', 'FORBIDDEN'));
  if (!adminIpAllowed(req.ip)) return next(new HttpError(403, 'Huna ruhusa ya kufanya hili', 'FORBIDDEN'));
  next();
}

function requireUserRole(req, _res, next) {
  if (!req.user || req.user.role !== 'USER') return next(new HttpError(403, 'Eneo hili ni la watumiaji pekee', 'FORBIDDEN'));
  next();
}

module.exports = { adminIpAllowed, requireAuth, csrfProtect, requireAdmin, requireUserRole, setSessionCookie, clearSessionCookie };
