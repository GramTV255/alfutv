const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { createSession, destroySession, requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rate-limit');
const { normalizePhone, isStr, ah } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const DUMMY = bcrypt.hashSync('dummy-password', 10);
const pub = (u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role });

router.post('/register', authLimiter, ah(async (req, res) => {
  const { name, phone, password, confirm_password } = req.body || {};
  if (!isStr(name, 2, 80)) return res.status(400).json({ error: 'Jina si sahihi.' });
  const p = normalizePhone(phone);
  if (!p) return res.status(400).json({ error: 'Namba ya simu si sahihi (mfano 0712345678).' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Password iwe herufi 8 hadi 72.' });
  if (password !== confirm_password) return res.status(400).json({ error: 'Password hazilingani.' });
  let promoId = null;
  let trialCodeId = null;   // code ya majaribio: haiunganishwi na kamisheni
  let trialCode = false;
  const pc = String(req.body.promo_code || '').trim().toUpperCase();
  if (pc) {
    let pr = null;
    try { pr = (await query('SELECT id, active, expires_at, kind FROM promo_codes WHERE code=$1', [pc])).rows[0]; }
    catch (e) { console.error('promo lookup:', e.message); return res.status(400).json({ error: 'Promo code haiwezi kuthibitishwa sasa. Jaribu tena.' }); }
    if (!pr || !pr.active || new Date(pr.expires_at) <= new Date()) return res.status(400).json({ error: 'Promo code si sahihi au imeisha.' });
    if (pr.kind === 'TRIAL') trialCodeId = pr.id; else promoId = pr.id;
    trialCode = pr.kind === 'TRIAL';
  }
  const hash = await bcrypt.hash(password, 10);   // gharama 10: salama na nyepesi kwa seva
  try {
    const r = await query("INSERT INTO users(name,phone,password_hash,role_id,promo_code_id) VALUES($1,$2,$3,(SELECT id FROM roles WHERE name='user'),$4) RETURNING id,name,phone",
      [name.trim(), p, hash, promoId]);
    const u = { ...r.rows[0], role: 'user' };
    // Majaribio: kifaa kimoja kinapata siku 1 mara moja tu (bila kujali namba ya simu)
    let trialGiven = false;
    if (trialCode) {
      let dvid = req.cookies && req.cookies.dvid;
      if (!dvid) {
        dvid = require('crypto').randomBytes(16).toString('hex');
        res.cookie('dvid', dvid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 365 * 24 * 3600 * 1000 });
      }
      const dh = require('crypto').createHash('sha256').update(dvid).digest('hex');
      const claim = await query('INSERT INTO trial_claims(device_hash,ip,user_id,code_id) VALUES($1,$2,$3,$4) ON CONFLICT (device_hash) DO NOTHING RETURNING device_hash', [dh, String(req.ip || ''), u.id, trialCodeId]);
      if (claim.rowCount) {
        await query("INSERT INTO subscriptions(user_id,package_id,start_date,end_date,status) SELECT $1,id,now(),now()+interval '1 day','ACTIVE' FROM packages WHERE name='Majaribio ya siku 1' LIMIT 1", [u.id]);
        trialGiven = true;
      }
    }
    await createSession(req, res, u.id);
    res.status(201).json({ user: pub(u), trial: trialGiven });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Namba hii tayari imesajiliwa.' });
    throw e;
  }
}));

router.post('/login', authLimiter, ah(async (req, res) => {
  const { phone, password } = req.body || {};
  const p = normalizePhone(phone);
  const r = p ? await query(`SELECT u.id,u.name,u.phone,u.status,u.password_hash,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.phone=$1`, [p]) : { rows: [] };
  const u = r.rows[0];
  const ok = await bcrypt.compare(typeof password === 'string' ? password : '', u ? u.password_hash : DUMMY);
  // Password za zamani (gharama 12) zinapunguzwa hadi 10 baada ya kuingia kwa mafanikio, mara moja tu
  if (ok && u && bcrypt.getRounds(u.password_hash) > 10) {
    try { await query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, await bcrypt.hash(password, 10)]); } catch (_) {}
  }
  if (!u || !ok) return res.status(401).json({ error: 'Namba au password si sahihi.' });
  if (u.status !== 'ACTIVE') return res.status(403).json({ error: 'Akaunti imesimamishwa. Wasiliana na msimamizi.' });
  await createSession(req, res, u.id);
  req.user = u; await audit(req, 'auth.login', 'user', u.id);
  res.json({ user: pub(u) });
}));

router.post('/logout', ah(async (req, res) => { await destroySession(req, res); res.json({ ok: true }); }));
router.get('/me', requireAuth, (req, res) => res.json({ user: pub(req.user) }));

// ---- Kubadilisha password kwa code ya admin ----
const resetCrypto = require('crypto');
const RESET_MIN = 6;

router.post('/reset/request', authLimiter, ah(async (req, res) => {
  const p = normalizePhone((req.body || {}).phone);
  if (p) {
    const u = (await query('SELECT id FROM users WHERE phone=$1', [p])).rows[0];
    if (u) {
      const pend = await query("SELECT 1 FROM password_resets WHERE user_id=$1 AND status='PENDING' AND requested_at > now() - interval '30 minutes'", [u.id]);
      if (!pend.rowCount) await query("INSERT INTO password_resets(user_id,status) VALUES($1,'PENDING')", [u.id]);
    }
  }
  // Jibu ni lile lile hata namba isipokuwepo (usiruhusu kujua nani amesajiliwa)
  res.json({ ok: true, message: 'Ombi limetumwa kwa admin. Mwombe admin akupe code.' });
}));

router.post('/reset/confirm', authLimiter, ah(async (req, res) => {
  const b = req.body || {};
  const p = normalizePhone(b.phone);
  const code = String(b.code || '').trim().toUpperCase();
  const pw = String(b.password || '');
  if (!p || !code || pw.length < RESET_MIN || pw.length > 200) {
    const e = new Error('Jaza namba, code, na password (angalau herufi 6).'); e.status = 400; e.expose = true; throw e;
  }
  const bad = () => { const e = new Error('Code si sahihi au imeisha.'); e.status = 400; e.expose = true; return e; };
  const u = (await query('SELECT id FROM users WHERE phone=$1', [p])).rows[0];
  if (!u) throw bad();
  const r = (await query("SELECT id, code_hash, expires_at, attempts FROM password_resets WHERE user_id=$1 AND status='APPROVED' ORDER BY approved_at DESC LIMIT 1", [u.id])).rows[0];
  if (!r) throw bad();
  if (new Date(r.expires_at) <= new Date() || r.attempts >= 5) {
    await query("UPDATE password_resets SET status='EXPIRED' WHERE id=$1", [r.id]);
    throw bad();
  }
  const h = resetCrypto.createHash('sha256').update(code).digest('hex');
  if (h !== r.code_hash) {
    await query('UPDATE password_resets SET attempts=attempts+1 WHERE id=$1', [r.id]);
    throw bad();
  }
  const hash = await bcrypt.hash(pw, 10);
  await query("UPDATE password_resets SET status='USED', used_at=now() WHERE id=$1", [r.id]);
  await query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, hash]);
  // Vikao vyote vya akaunti vinatoka; kifaa hiki pekee kinaingia tena
  await query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
  await createSession(req, res, u.id);
  res.json({ ok: true });
}));

module.exports = router;
