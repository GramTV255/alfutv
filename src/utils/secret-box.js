// Usimbaji wa siri za malipo (AES-256-GCM). Ufunguo unatokana na SETTINGS_ENCRYPTION_KEY au SESSION_SECRET.
const crypto = require('crypto');
const encKey = () => crypto.createHash('sha256')
  .update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.SESSION_SECRET || '').digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(s) {
  const [iv, tag, enc] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
module.exports = { encrypt, decrypt };
