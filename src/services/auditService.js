'use strict';
const { query } = require('../database/pool');
const logger = require('../utils/logger');

async function audit(adminId, action, targetType, targetId, details, ip, client) {
  try {
    const q = client ? client.query.bind(client) : query;
    await q(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [adminId || null, action, targetType || null, targetId != null ? String(targetId) : null, details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (e) {
    logger.error('audit log failed', e);
  }
}

module.exports = { audit };
