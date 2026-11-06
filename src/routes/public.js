'use strict';
const express = require('express');
const { wrap } = require('../utils/errors');
const { publicApiLimiter, badKeyLimiter } = require('../middleware/rateLimit');
const { logUsage, authorize } = require('../services/publicApiService');
const amiri = require('../services/amiriService');

const router = express.Router();

const { config } = require('../config');
const base = (req) => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;

// Public endpoints (sources themselves are never exposed; users only see amiri channels):
// GET /api/v1/amiri/:name -> one channel by its name (slug): { channel, id, slug, mpd_url, token, clearkey, clearkeys, expires_at }
// There is no endpoint that returns every channel at once.
async function amiriHandle(req, res, ref) {
  res.set('Cache-Control', 'no-store');
  const key = req.get('x-api-key');
  if (!key) return res.status(401).type('text/plain').send('Unauthorized');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(String(ref))) return res.status(400).type('text/plain').send('Bad Request');
  const auth = await authorize(key);
  if (!auth.ctx || auth.status) { await logUsage(auth.ctx, '/api/v1/amiri', auth.status); return res.status(auth.status).type('text/plain').send(auth.message); }
  const r = await amiri.resolveOne(ref);
  await logUsage(auth.ctx, `/api/v1/amiri/${ref}`, r.status);
  if (r.status !== 200) return res.status(r.status).type('text/plain').send(r.message);
  if (req.query.format === 'text') {
    const list = [r.body];
    return res.type('text/plain').send(list.map((b) => `[${b.slug}]\nmpd_url=${b.mpd_url}\ntoken=${b.token}\nclearkey=${b.clearkey || ''}`).join('\n\n'));
  }
  return res.json(r.body);
}
router.get('/amiri/:ref', badKeyLimiter, publicApiLimiter, wrap((req, res) => amiriHandle(req, res, req.params.ref)));

module.exports = router;
