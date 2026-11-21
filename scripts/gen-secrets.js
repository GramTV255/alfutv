'use strict';
const crypto = require('crypto');
console.log('# Paste these into your .env (keep them secret, and do not change ENCRYPTION_KEY after saving credentials)');
console.log(`JWT_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`);
console.log(`API_KEY_PEPPER=${crypto.randomBytes(32).toString('base64url')}`);
