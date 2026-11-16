// Admin: kutuma arifa kwa wote, mtumiaji mmoja, wenye vifurushi hai, au wasio na vifurushi
const router = require('express').Router();
const { query } = require('../config/database');
const { normalizePhone, isStr, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const crypto = require('crypto');

const ACTIVE_SUB = "EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=u.id AND s.status='ACTIVE' AND s.end_date>now())";
const WHERE = {
  all: "u.status='ACTIVE'",
  active: `u.status='ACTIVE' AND ${ACTIVE_SUB}`,
  inactive: `u.status='ACTIVE' AND NOT ${ACTIVE_SUB}`,
};

router.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (!isStr(b.title, 1, 80)) throw httpErr(400, 'Kichwa kinahitajika (hadi herufi 80).');
  if (!isStr(b.body, 1, 500)) throw httpErr(400, 'Ujumbe unahitajika (hadi herufi 500).');
  const batch = crypto.randomBytes(8).toString('hex');
  const params = [b.title.trim(), b.body.trim(), batch];
  let where;
  if (b.audience === 'user') {
    const p = normalizePhone(b.phone);
    if (!p) throw httpErr(400, 'Namba ya simu si sahihi.');
    where = 'u.phone=$3'; params.push(p);
  } else if (WHERE[b.audience]) where = WHERE[b.audience];
  else throw httpErr(400, 'Chagua walengwa.');
  const r = await query(`INSERT INTO notifications(user_id,title,body,batch_id)
    SELECT u.id, $1, $2, $3 FROM users u JOIN roles ro ON ro.id=u.role_id WHERE ro.name='user' AND ${where}`, params);
  if (!r.rowCount && b.audience === 'user') throw httpErr(404, 'Hakuna mtumiaji mwenye namba hii.');
  await audit(req, 'notification.send', 'notification', b.audience, { count: r.rowCount, title: b.title.trim() });
  res.status(201).json({ sent: r.rowCount, batch });
}));

// Historia ya arifa zilizotumwa, pamoja na idadi ya waliosoma
router.get('/history', ah(async (req, res) => {
  const r = await query(`SELECT batch_id, MIN(title) AS title, MIN(body) AS body, MIN(created_at) AS created_at,
      COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_read)::int AS read_count
    FROM notifications WHERE batch_id IS NOT NULL GROUP BY batch_id ORDER BY MIN(created_at) DESC LIMIT 50`);
  res.json({ items: r.rows });
}));

// Wasomaji na wasiosoma kwa kikundi kimoja
router.get('/history/:batch', ah(async (req, res) => {
  const r = await query(`SELECT n.id, n.is_read, n.read_at, n.created_at, u.name, u.phone
    FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.batch_id=$1
    ORDER BY n.is_read DESC, n.read_at DESC NULLS LAST, u.name LIMIT 2000`, [String(req.params.batch).slice(0, 40)]);
  res.json({ recipients: r.rows });
}));

module.exports = router;
