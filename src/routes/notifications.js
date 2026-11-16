// User: arifa zake
const router = require('express').Router();
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { ah } = require('../utils/validation');

router.get('/', requireAuth, ah(async (req, res) => {
  const r = await query('SELECT id,title,body,is_read,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  const u = await query('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND NOT is_read', [req.user.id]);
  res.json({ items: r.rows, unread: u.rows[0].n });
}));
router.post('/read-all', requireAuth, ah(async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE, read_at=COALESCE(read_at, now()) WHERE user_id=$1 AND NOT is_read', [req.user.id]);
  res.json({ ok: true });
}));
router.post('/:id/read', requireAuth, ah(async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE, read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2', [parseInt(req.params.id, 10) || 0, req.user.id]);
  res.json({ ok: true });
}));
module.exports = router;
