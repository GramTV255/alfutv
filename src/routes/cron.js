'use strict';
const express = require('express');
const { config } = require('../config');
const { safeEqual } = require('../utils/crypto');
const { expireDueSubscriptions } = require('../services/subscriptionService');
const { reconcilePending } = require('../services/paymentService');
const { markExpiredChannels, refreshDueSources } = require('../services/extractionService');
const logger = require('../utils/logger');

const router = express.Router();

// For hosts that stop idle instances (e.g. serverless/edge): call this every 1-3 minutes from any external cron
// (cron-job.org, GitHub Actions...) with header  x-cron-secret: <CRON_SECRET>.  Safe to run together with the built-in jobs.
let running = false;
router.all('/tick', (req, res) => {
  const sent = req.get('x-cron-secret') || '';
  if (!config.cronSecret || !safeEqual(sent, config.cronSecret)) return res.sendStatus(401);
  // Answer at once so the platform cron never holds a request slot while sources are being fetched; the work runs in the background.
  if (config.disableScheduler) return res.status(202).json({ ok: true, skipped: 'scheduler disabled' });
  if (running) return res.status(202).json({ ok: true, skipped: 'previous run still active' });
  running = true;
  res.status(202).json({ ok: true, started: true });
  (async () => {
    for (const [name, fn] of Object.entries({ expireDueSubscriptions, reconcilePending, markExpiredChannels, refreshDueSources })) {
      try { await fn(); } catch (e) { logger.error(`cron ${name}`, e); }
    }
  })().finally(() => { running = false; });
});

module.exports = router;
