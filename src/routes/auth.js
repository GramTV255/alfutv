'use strict';
const express = require('express');
const { wrap, HttpError } = require('../utils/errors');
const v = require('../validators');
const auth = require('../services/authService');
const { requireAuth, csrfProtect, setSessionCookie, clearSessionCookie, adminIpAllowed } = require('../middleware/auth');
const { authLimiter, sensitiveLimiter, ipLoginLimiter } = require('../middleware/rateLimit');
const { query } = require('../database/pool');
const { verifySession } = require('../services/authService');
const { audit } = require('../services/auditService');

const router = express.Router();

router.post('/register', authLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const fullName = v.str(b.fullName, 'Jina kamili', { min: 3, max: 120 });
  const phone = v.phone(b.phone);
  const password = v.password(b.password);
  if (b.confirmPassword !== password) throw v.bad('Password na Confirm Password hazifanani');
  // Any "role" sent by the client is ignored on purpose.
  const user = await auth.register({ fullName, phone, password });
  // Replace any session already in this browser (e.g. an admin's) with the NEW user's own session, then send them to their dashboard.
  clearSessionCookie(res);
  const { token, csrf } = auth.signSession({ id: user.id, role: 'USER', token_version: 0 });
  setSessionCookie(res, token);
  res.status(201).json({ ok: true, role: 'USER', csrf, redirect: '/dashboard', message: 'Usajili umefanikiwa.', user: { id: user.id, full_name: user.full_name, phone_number: user.phone_number } });
}));

router.post('/login', ipLoginLimiter, sensitiveLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const phone = v.phone(b.phone);
  if (typeof b.password !== 'string' || !b.password || b.password.length > 200) throw v.bad('Password inahitajika');
  const user = await auth.login({ phone, password: b.password, ip: req.ip });
  if (user.role === 'ADMIN' && !adminIpAllowed(req.ip)) {
    await audit(user.id, 'ADMIN_LOGIN_BLOCKED_IP', 'user', user.id, null, req.ip);
    throw new HttpError(401, 'Namba ya simu au password si sahihi', 'BAD_CREDENTIALS');
  }
  const { token, csrf } = auth.signSession(user);
  setSessionCookie(res, token);
  if (user.role === 'ADMIN') await audit(user.id, 'ADMIN_LOGIN', 'user', user.id, null, req.ip);
  // Role comes from the database; the client only follows this redirect hint.
  res.json({ ok: true, role: user.role, csrf, redirect: user.role === 'ADMIN' ? '/admin' : '/dashboard' });
}));

// Logging out as admin also invalidates every admin session of that account (a copied cookie stops working at once).
router.post('/logout', wrap(async (req, res) => {
  try {
    const claims = verifySession(req.cookies && req.cookies.sid);
    if (claims.role === 'ADMIN') await query(`UPDATE users SET token_version=token_version+1 WHERE id=$1 AND role='ADMIN' AND token_version=$2`, [claims.sub, claims.tv]);
  } catch (_) { /* no / bad session: just clear the cookie */ }
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, full_name: u.full_name, phone_number: u.phone_number, role: u.role, account_status: u.account_status, created_at: u.created_at, csrf: req.csrf });
});

router.post('/change-password', requireAuth, csrfProtect, sensitiveLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.currentPassword !== 'string' || !b.currentPassword) throw v.bad('Password ya sasa inahitajika');
  const next = v.password(b.newPassword, 'Password mpya');
  if (b.confirmPassword !== next) throw v.bad('Password mpya na Confirm hazifanani');
  const updated = await auth.changePassword(req.user.id, b.currentPassword, next);
  // other sessions are now invalid; keep this one alive
  const { token, csrf } = auth.signSession({ id: updated.id, role: updated.role, token_version: updated.token_version });
  setSessionCookie(res, token);
  res.json({ ok: true, csrf, message: 'Password imebadilishwa' });
}));

// Always the same answer, whether or not the phone is registered (no account enumeration).
router.post('/forgot-password', authLimiter, wrap(async (req, res) => {
  const phone = v.phone((req.body || {}).phone);
  await auth.requestReset(phone, req.ip);
  res.json({ ok: true, message: 'Ombi lako limepokelewa. Msimamizi atakuthibitisha na kukupa code ya kuweka password mpya.' });
}));

router.post('/reset-password', sensitiveLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const phone = v.phone(b.phone);
  const code = v.str(b.code, 'Code', { min: 6, max: 20 });
  const pw = v.password(b.newPassword, 'Password mpya');
  if (b.confirmPassword !== pw) throw v.bad('Password mpya na Confirm hazifanani');
  await auth.completeReset({ phone, code, newPassword: pw });
  res.json({ ok: true, message: 'Password mpya imewekwa. Ingia sasa.' });
}));

module.exports = router;
