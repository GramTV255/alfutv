'use strict';
const express = require('express');
const { wrap } = require('../utils/errors');
const { getSetting } = require('../services/settingsService');

const router = express.Router();

// Public, no secrets: only the support WhatsApp number and the greeting the admin chose.
let cache = null;
router.get('/', wrap(async (_req, res) => {
  if (!cache || Date.now() - cache.at > 30000) {
    const [number, message] = await Promise.all([getSetting('whatsapp_number'), getSetting('whatsapp_message')]);
    cache = { at: Date.now(), body: { whatsapp: number || null, message: message || 'Habari, nahitaji msaada.' } };
  }
  res.set('Cache-Control', 'public, max-age=60');
  res.json(cache.body);
}));

module.exports = router;
