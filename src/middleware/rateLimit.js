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
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.apiRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const k = req.get('x-api-key');
    return k ? `k:${hashApiKey(k).slice(0, 24)}` : `ip:${req.ip}`;
  },
  handler: (_req, res) => res.status(429).type('text/plain').send('Too Many Requests'),
});

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

// Wrong / unknown API keys and proxy tokens: an IP that keeps guessing is blocked for a while. Only failures count.
const badKeyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).type('text/plain').send('Too Many Requests'),
});

module.exports = { ipLoginLimiter, badKeyLimiter, globalLimiter, authLimiter, paymentLimiter, publicApiLimiter, sensitiveLimiter };
