'use strict';
/**
 * Creates (or promotes) the FIRST admin account safely.
 *   npm run create-admin                       -> asks for phone + password (password is typed hidden)
 *   ADMIN_PHONE=0712345678 ADMIN_PASSWORD='...' ADMIN_NAME='Jina' npm run create-admin   (non-interactive)
 * The password is hashed with bcrypt; it is never printed or stored in plain text.
 */
require('dotenv').config();
const readline = require('readline');
const { config, validate } = require('../src/config');
const { normalizePhone } = require('../src/utils/phone');
const { pool } = require('../src/database/pool');
const { hashPassword } = require('../src/services/authService');
const { migrate } = require('./migrate');

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const problems = validate();
  if (problems.length) { console.error('Config problems:\n - ' + problems.join('\n - ')); process.exit(1); }
  await migrate({ quiet: true });

  const phone = normalizePhone(process.env.ADMIN_PHONE || (await ask('Admin phone number (e.g. 0712345678): ')));
  if (!phone) { console.error('Invalid phone number.'); process.exit(1); }
  const name = (process.env.ADMIN_NAME || (await ask('Admin full name: '))).trim() || 'Administrator';
  const pw = process.env.ADMIN_PASSWORD || (await ask('Password (min 10 chars, letters+numbers): ', true));
  if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) || Buffer.byteLength(pw) > 72) {
    console.error('Password must be 10-72 characters and contain letters and numbers.'); process.exit(1);
  }
  if (!process.env.ADMIN_PASSWORD) {
    const again = await ask('Repeat password: ', true);
    if (again !== pw) { console.error('Passwords do not match.'); process.exit(1); }
  }

  const hash = await hashPassword(pw);
  const existing = (await pool.query('SELECT id, role FROM users WHERE phone_number=$1', [phone])).rows[0];
  if (existing) {
    await pool.query(`UPDATE users SET role='ADMIN', password_hash=$2, full_name=$3, account_status='ACTIVE', token_version=token_version+1, updated_at=now() WHERE id=$1`, [existing.id, hash, name]);
    console.log(`Existing account ${phone} promoted to ADMIN and password updated.`);
  } else {
    await pool.query(`INSERT INTO users (full_name, phone_number, password_hash, role) VALUES ($1,$2,$3,'ADMIN')`, [name, phone, hash]);
    console.log(`Admin ${phone} created.`);
  }
  await pool.query(`INSERT INTO audit_logs (action, target_type, target_id, details) VALUES ('ADMIN_CREATED_CLI','user',$1,$2)`, [phone, JSON.stringify({ via: 'cli' })]);
  console.log('Log in at /login.html with this phone number and password.');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
