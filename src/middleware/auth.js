const crypto = require('crypto');
const { query } = require('../config/database');

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  // Vifaa vitatu vikiwa tayari, kuingia kwenye cha nne kunatoa vifaa vyote vingine (kinabaki kimoja tu)
  await query('DELETE FROM sessions WHERE user_id=$1 AND (SELECT COUNT(*) FROM sessions WHERE user_id=$1) >= 3', [userId]);
  await query("INSERT INTO sessions(token_hash,user_id,expires_at,ip,user_agent) VALUES($1,$2,now() + ($3 || ' days')::interval,$4,$5)",
    [hash(token), userId, String(SESSION_DAYS), req.ip, (req.get('user-agent') || '').slice(0, 200)]);
  res.cookie('sid', token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 864e5,
  });
}

async function destroySession(req, res) {
  const t = req.cookies && req.cookies.sid;
  if (t) {
    // Logout kwenye kifaa kimoja inatoa vifaa vyote vya mtumiaji huyo
    const r = await query('SELECT user_id FROM sessions WHERE token_hash=$1', [hash(t)]);
    const uid = r.rows[0] && r.rows[0].user_id;
    if (uid) await query('DELETE FROM sessions WHERE user_id=$1', [uid]);
    else await query('DELETE FROM sessions WHERE token_hash=$1', [hash(t)]);
  }
  res.clearCookie('sid', { path: '/' });
}

async function loadUser(req) {
  const t = req.cookies && req.cookies.sid;
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const r = await query(`SELECT u.id,u.name,u.phone,u.status,r.name AS role, s.created_at AS session_at
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(t)]);
  const u = r.rows[0];
  if (!u || u.status !== 'ACTIVE') return null;
  // Admin: kikao kinaisha baada ya saa 12 tangu kuingia, hata kama kina muda mrefu zaidi
  if (u.role === 'admin' && Date.now() - new Date(u.session_at).getTime() > 12 * 3600e3) return null;
  return u;
}

const optionalAuth = async (req, res, next) => { try { req.user = await loadUser(req); next(); } catch (e) { next(e); } };
const requireAuth = async (req, res, next) => {
  try {
    const u = await loadUser(req);
    if (!u) return res.status(401).json({ error: 'Tafadhali ingia kwanza.' });
    req.user = u; next();
  } catch (e) { next(e); }
};

// CSRF: cookie ni SameSite=Lax + header maalumu inahitajika kwa mabadiliko (cross-site haiwezi kuiweka bila CORS)
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Ombi limekataliwa.' });
  next();
}

module.exports = { createSession, destroySession, optionalAuth, requireAuth, csrfGuard };
