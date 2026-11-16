// Maombi ya kubadilisha password: admin anaidhinisha na anapata code ya mara moja
const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/database');
const { ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const adm = express.Router();
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // bila O/0 na I/1 zinazochanganya
const genCode = () => { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return s; };
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

adm.get('/', ah(async (req, res) => {
  const r = await query(`SELECT r.id, r.status, r.requested_at, r.approved_at, r.expires_at, r.attempts, u.name, u.phone
    FROM password_resets r JOIN users u ON u.id=r.user_id
    WHERE r.status IN ('PENDING','APPROVED') OR r.requested_at > now() - interval '7 days'
    ORDER BY r.requested_at DESC LIMIT 100`);
  res.json({ requests: r.rows });
}));

adm.post('/:id/approve', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const code = genCode();
  const r = await query(`UPDATE password_resets SET status='APPROVED', code_hash=$2, expires_at=now()+interval '30 minutes',
      approved_at=now(), approved_by=$3, attempts=0 WHERE id=$1 AND status='PENDING' RETURNING id`, [id, sha(code), req.user.id]);
  if (!r.rowCount) throw httpErr(400, 'Ombi hili haliwezi kuidhinishwa.');
  await audit(req, 'password.reset_approve', 'password_reset', id, {});
  res.json({ code, expires_in_minutes: 30 });   // code inaonekana mara moja tu
}));

adm.post('/:id/reject', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const r = await query("UPDATE password_resets SET status='REJECTED' WHERE id=$1 AND status='PENDING' RETURNING id", [id]);
  if (!r.rowCount) throw httpErr(400, 'Ombi hili haliwezi kukataliwa.');
  await audit(req, 'password.reset_reject', 'password_reset', id, {});
  res.json({ ok: true });
}));

module.exports = adm;
