const { query } = require('../config/database');
async function audit(req, action, entity, entityId, details) {
  try {
    await query('INSERT INTO audit_logs(user_id,action,entity,entity_id,details,ip) VALUES($1,$2,$3,$4,$5,$6)',
      [req && req.user ? req.user.id : null, action, entity || null, entityId == null ? null : String(entityId), details || {}, req ? req.ip : null]);
  } catch (e) { console.error('audit failed:', e.message); }
}
module.exports = { audit };
