const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { isStr, ah } = require('../utils/validation');

router.patch('/me', requireAuth, ah(async (req, res) => {
  const { name, current_password, new_password } = req.body || {};
  if (name !== undefined) {
    if (!isStr(name, 2, 80)) return res.status(400).json({ error: 'Jina si sahihi.' });
    await query('UPDATE users SET name=$2 WHERE id=$1', [req.user.id, name.trim()]);
  }
  if (new_password !== undefined) {
    if (typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 72)
      return res.status(400).json({ error: 'Password mpya iwe herufi 8 hadi 72.' });
    const r = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await bcrypt.compare(String(current_password || ''), r.rows[0].password_hash)))
      return res.status(400).json({ error: 'Password ya sasa si sahihi.' });
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await bcrypt.hash(new_password, 12)]);
  }
  res.json({ ok: true });
}));

module.exports = router;
