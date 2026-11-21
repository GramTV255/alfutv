'use strict';
const cron = require('node-cron');
const { query } = require('../database/pool');
const { config } = require('../config');
const logger = require('../utils/logger');
const { expireDueSubscriptions } = require('../services/subscriptionService');
const { reconcilePending } = require('../services/paymentService');
const { markExpiredChannels, refreshDueSources } = require('../services/extractionService');

const safe = (name, fn) => async () => {
  try { await fn(); } catch (e) { logger.error(`job ${name} failed`, e); }
};

function startJobs() {
  if (config.disableScheduler) { logger.warn('DISABLE_SCHEDULER is set: background jobs are OFF'); return; }
  // Every minute: expire subscriptions and switch their API keys off.
  cron.schedule('* * * * *', safe('expire-subscriptions', expireDueSubscriptions));
  // Every minute: confirm unfinished payments with ClickPesa (missed webhooks etc.).
  cron.schedule('* * * * *', safe('reconcile-payments', reconcilePending));
  // Every minute: mark expired channel values, and request every source whose interval (default 3 min) has elapsed.
  cron.schedule('* * * * *', safe('channel-expiry', markExpiredChannels));
  cron.schedule('* * * * *', safe('channel-refresh', refreshDueSources));
  // Daily 03:15: retention policy.
  cron.schedule('15 3 * * *', safe('log-retention', async () => {
    const r = config.retention;
    await query(`DELETE FROM api_usage_logs WHERE created_at < now() - ($1 || ' days')::interval`, [String(r.usageDays)]);
    await query(`DELETE FROM extraction_logs WHERE created_at < now() - ($1 || ' days')::interval`, [String(r.extractionDays)]);
    await query(`DELETE FROM audit_logs WHERE created_at < now() - ($1 || ' days')::interval`, [String(r.auditDays)]);
    await query(`DELETE FROM webhook_events WHERE created_at < now() - interval '60 days'`);
    await query(`UPDATE password_resets SET status='EXPIRED' WHERE status IN ('REQUESTED','ISSUED') AND created_at < now() - interval '7 days'`);
    logger.info('Log retention cleanup done');
  }));
  // Instance just woke up (e.g. by the platform cron): do any overdue source request right away.
  setTimeout(safe('channel-refresh-boot', refreshDueSources), 20000);
  logger.info('Scheduled jobs started');
}

module.exports = { startJobs };
