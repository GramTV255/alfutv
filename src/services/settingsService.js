'use strict';
const { query } = require('../database/pool');
const { encrypt, decrypt } = require('../utils/crypto');

async function getSetting(name) {
  const { rows } = await query('SELECT encrypted_value FROM admin_settings WHERE setting_name=$1', [name]);
  if (!rows[0]) return null;
  try {
    return decrypt(rows[0].encrypted_value);
  } catch (_) {
    return null; // wrong ENCRYPTION_KEY or corrupted value
  }
}

async function setSetting(name, value) {
  await query(
    `INSERT INTO admin_settings (setting_name, encrypted_value, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (setting_name) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value, updated_at=now()`,
    [name, encrypt(value)]
  );
}

async function deleteSetting(name) {
  await query('DELETE FROM admin_settings WHERE setting_name=$1', [name]);
}

async function settingExists(name) {
  const { rows } = await query('SELECT updated_at FROM admin_settings WHERE setting_name=$1', [name]);
  return rows[0] ? rows[0].updated_at : null;
}

module.exports = { getSetting, setSetting, deleteSetting, settingExists };
