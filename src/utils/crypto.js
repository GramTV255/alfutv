'use strict';
const crypto = require('crypto');
const { config } = require('../config');

const key = () => Buffer.from(config.encryptionKey, 'hex');

// AES-256-GCM. Output format: v1:<iv>:<tag>:<ciphertext> (all base64)
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
  const [v, iv, tag, data] = String(payload).split(':');
  if (v !== 'v1') throw new Error('Unsupported ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// API keys are high-entropy random strings, so a keyed fast hash is appropriate (and allows indexed lookup).
const hashApiKey = (apiKey) => crypto.createHmac('sha256', config.apiKeyPepper).update(apiKey).digest('hex');

function generateApiKey() {
  const secret = crypto.randomBytes(32).toString('base64url');
  const apiKey = `chk_${secret}`;
  return { apiKey, keyHash: hashApiKey(apiKey), keyPrefix: apiKey.slice(0, 10) };
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { encrypt, decrypt, sha256, hashApiKey, generateApiKey, randomToken, safeEqual };
