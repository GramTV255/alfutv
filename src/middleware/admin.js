const { requireAuth } = require('./auth');
function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Huna ruhusa.' });
    next();
  });
}
module.exports = { requireAdmin };
