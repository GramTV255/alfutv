'use strict';
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { hashApiKey } = require('../utils/crypto');

const json = (message, code) => (_req, res) => res.status(429).json({ error: message, code });

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Maombi mengi mno. Jaribu tena baadaye.', 'RATE_LIMITED'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Majaribio mengi mno. Jaribu tena baada ya dakika chache.', 'RATE_LIMITED'),
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user.id : req.ip),
  handler: json('Maombi mengi ya malipo. Subiri kidogo.', 'RATE_LIMITED'),
});

// Per API key (falls back to IP when no key is sent) - plain-text 429 for API clients.
// API_RATE_LIMIT_PER_MIN=0 (the default) means NO limit: a valid, successful request is never throttled here.
// A positive value re-enables a per-key-per-minute cap, e.g. API_RATE_LIMIT_PER_MIN=120.
const publicApiLimiter = config.apiRateLimitPerMin > 0
  ? rateLimit({
    windowMs: 60 * 1000,
    limit: config.apiRateLimitPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const k = req.get('x-api-key');
      return k ? `k:${hashApiKey(k).slice(0, 24)}` : `ip:${req.ip}`;
    },
    handler: (_req, res) => res.status(429).type('text/plain').send('Too Many Requests'),
  })
  : (_req, _res, next) => next();

// Brute-force protection for endpoints that take a guessable secret (login, reset code)
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // only failures count
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String((req.body && req.body.phone) || '').slice(0, 20)}`,
  handler: json('Majaribio mengi mno kwa namba hii. Subiri dakika 15.', 'RATE_LIMITED'),
});

// Per IP across ALL phone numbers: stops one machine from trying many accounts. Only failed attempts count.
const ipLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json('Majaribio mengi mno kutoka kwenye mtandao huu. Subiri dakika 15.', 'RATE_LIMITED'),
});

// Wrong / unknown proxy tokens (/p/<token>/...): only an actual "token not found" (404, thrown by load() in
// routes/proxy.js) counts as a guess. Upstream/service failures (502/503/504 relay errors - e.g. source is
// slow, down, or the server is at capacity) must NOT count here: those happen to a perfectly valid token, and
// must never lock out other channels or other viewers, since this limiter is keyed per-IP, not per-token.
const badKeyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: false,
  legacyHeaders: false,
  requestWasSuccessful: (_req, res) => res.statusCode !== 404,
  handler: (_req, res) => res.status(429).type('text/plain').send('Too Many Requests'),
});

// Wrong / unknown API keys (/api/v1/...): only a missing/invalid/revoked key (401) counts as a guess.
// A suspended account or inactive subscription (403), an unknown channel name (404), or a service/upstream
// failure (503) must NOT count - those are legitimate, authenticated requests that happen to fail for another
// reason, and must not exhaust the same IP-wide "wrong key" budget that every other user's key shares.
const badApiKeyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: false,
  legacyHeaders: false,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  handler: (_req, res) => res.status(429).type('text/plain').send('Too Many Requests'),
});

module.exports = { ipLoginLimiter, badKeyLimiter, badApiKeyLimiter, globalLimiter, authLimiter, paymentLimiter, publicApiLimiter, sensitiveLimiter };
