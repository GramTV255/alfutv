'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, tx } = require('../database/pool');
const { config } = require('../config');
const { HttpError } = require('../utils/errors');
const { randomToken, sha256 } = require('../utils/crypto');
const { createKeyForUser } = require('./apiKeyService');
const { audit } = require('./auditService');

const BCRYPT_COST = Math.min(Math.max(parseInt(process.env.BCRYPT_COST, 10) || 10, 8), 14); // 10 keeps login fast on small servers; existing hashes keep working
// Used to keep login timing similar when the phone number does not exist.
let dummyHash = null;
const getDummyHash = async () => dummyHash || (dummyHash = await bcrypt.hash('dummy-password-for-timing', BCRYPT_COST));

const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);

async function register({ fullName, phone, password }) {
  const hash = await hashPassword(password);
  try {
    return await tx(async (c) => {
      // Role is ALWAYS 'USER' here. Admins are created only with `npm run create-admin`.
      const { rows } = await c.query(
        `INSERT INTO users (full_name, phone_number, password_hash, role)
         VALUES ($1,$2,$3,'USER') RETURNING id, full_name, phone_number, created_at`,
        [fullName, phone, hash]
      );
      const user = rows[0];
      await createKeyForUser(c, user.id, { active: false }); // INACTIVE until payment is confirmed
      return user;
    });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Namba hii ya simu tayari imesajiliwa', 'PHONE_EXISTS');
    throw e;
  }
}

async function login({ phone, password, ip }) {
  const { rows } = await query('SELECT * FROM users WHERE phone_number=$1', [phone]);
  const user = rows[0];
  const locked = !!(user && user.locked_until && new Date(user.locked_until) > new Date());
  // A locked account is not even checked (the same bcrypt work is done so timing does not reveal it) and answers like a wrong password.
  const ok = await bcrypt.compare(password, user && !locked ? user.password_hash : await getDummyHash());
  if (!user || locked || !ok) {
    if (user && !locked) {
      const r = await query(
        `UPDATE users SET
                failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
                locked_until  = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 * interval '1 minute') ELSE locked_until END
          WHERE id=$1 RETURNING locked_until`, [user.id, config.loginMaxFailures, config.loginLockMinutes]);
      const justLocked = r.rows[0] && r.rows[0].locked_until && new Date(r.rows[0].locked_until) > new Date();
      await audit(user.id, justLocked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', 'user', user.id, { role: user.role }, ip);
    }
    throw new HttpError(401, 'Namba ya simu au password si sahihi', 'BAD_CREDENTIALS');
  }
  if (user.failed_logins) await query('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1', [user.id]);
  if (user.account_status === 'SUSPENDED') throw new HttpError(403, 'Akaunti yako imesimamishwa. Wasiliana na msimamizi.', 'ACCOUNT_SUSPENDED');
  return user;
}

function signSession(user) {
  const csrf = randomToken(24);
  const hours = user.role === 'ADMIN' ? Math.min(config.sessionHours, config.adminSessionHours) : config.sessionHours; // admin sessions are shorter
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.token_version, csrf }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${hours}h`,
  });
  return { token, csrf };
}

function verifySession(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id=$1', [userId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Password ya sasa si sahihi', 'BAD_CURRENT_PASSWORD');
  }
  const hash = await hashPassword(newPassword);
  const r = await query(
    `UPDATE users SET password_hash=$2, token_version=token_version+1, updated_at=now() WHERE id=$1 RETURNING id, role, token_version`,
    [userId, hash]
  );
  return r.rows[0]; // caller re-issues the session cookie
}

// ---- Password reset (ownership is confirmed by an admin-issued one-time code) ----
// 1) user asks (always answers generically)  2) admin verifies the person and issues a code
// 3) user sets a new password with phone + code. Plug an SMS provider into issueReset() if you want it automatic.

async function requestReset(phone, ip) {
  const { rows } = await query('SELECT id FROM users WHERE phone_number=$1', [phone]);
  const user = rows[0];
  if (!user) return;
  await query(`UPDATE password_resets SET status='CANCELLED' WHERE user_id=$1 AND status='REQUESTED'`, [user.id]);
  await query(`INSERT INTO password_resets (user_id, status, requested_ip) VALUES ($1,'REQUESTED',$2)`, [user.id, ip || null]);
}

function newResetCode() {
  // 10 chars from an unambiguous alphabet (~50 bits)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = require('crypto').randomBytes(10);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

// Admin issues a one-time code (valid 30 minutes). The admin never sees any password.
async function issueReset(userId, adminId) {
  const code = newResetCode();
  await tx(async (c) => {
    await c.query(`UPDATE password_resets SET status='CANCELLED' WHERE user_id=$1 AND status IN ('REQUESTED','ISSUED')`, [userId]);
    await c.query(
      `INSERT INTO password_resets (user_id, token_hash, status, issued_by, expires_at)
       VALUES ($1,$2,'ISSUED',$3, now() + interval '30 minutes')`,
      [userId, sha256(code), adminId]
    );
  });
  return { code, expiresInMinutes: 30 };
}

async function completeReset({ phone, code, newPassword }) {
  const hash = await hashPassword(newPassword);
  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT r.id, r.user_id FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE u.phone_number=$1 AND r.token_hash=$2 AND r.status='ISSUED' AND r.expires_at > now()
        FOR UPDATE OF r`,
      [phone, sha256(String(code).trim().toUpperCase())]
    );
    if (!rows[0]) throw new HttpError(400, 'Code si sahihi au imeisha muda', 'BAD_RESET_CODE');
    await c.query(`UPDATE password_resets SET status='USED', used_at=now() WHERE id=$1`, [rows[0].id]);
    await c.query(`UPDATE users SET password_hash=$2, token_version=token_version+1, failed_logins=0, locked_until=NULL, updated_at=now() WHERE id=$1`, [rows[0].user_id, hash]);
    return true;
  });
}

module.exports = { register, login, signSession, verifySession, changePassword, requestReset, issueReset, completeReset, hashPassword };
