'use strict';
const { HttpError } = require('../utils/errors');
const { normalizePhone } = require('../utils/phone');

const bad = (msg) => new HttpError(400, msg, 'VALIDATION_ERROR');

function str(v, name, { min = 1, max = 255, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw bad(`${name} inahitajika`);
  }
  if (typeof v !== 'string') throw bad(`${name} si sahihi`);
  const t = v.trim();
  if (t.length < min) throw bad(`${name} ni fupi mno (angalau herufi ${min})`);
  if (t.length > max) throw bad(`${name} ni ndefu mno (herufi ${max} juu kabisa)`);
  return t;
}

function phone(v, name = 'Namba ya simu') {
  const p = normalizePhone(typeof v === 'string' ? v : '');
  if (!p) throw bad(`${name} si sahihi. Tumia mfano 0712345678 au 255712345678`);
  return p;
}

const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop1', 'abcd1234', 'abc12345', 'abcd12345', 'iloveyou1', 'welcome1', 'welcome123', 'admin123', 'admin1234', 'letmein123', 'asdf1234', 'asdfghjkl1', '12345678a', 'a1234567', 'a12345678', 'tanzania1', 'tanzania123', 'simba1234', 'nakupenda1', 'karibu123']);
function password(v, name = 'Password') {
  if (typeof v !== 'string' || !v) throw bad(`${name} inahitajika`);
  if (v.length < 8) throw bad(`${name} iwe na angalau herufi 8`);
  if (Buffer.byteLength(v, 'utf8') > 72) throw bad(`${name} ni ndefu mno (juu kabisa herufi 72)`);
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) throw bad(`${name} iwe na herufi na namba`);
  if (COMMON.has(v.toLowerCase()) || /^(.)\1+$/.test(v) || /^\d+$/.test(v)) throw bad(`${name} ni rahisi kubahatisha. Tumia nyingine ngumu zaidi.`);
  return v;
}

function int(v, name, { min = 1, max = 1e9 } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} si sahihi`);
  return n;
}

function oneOf(v, name, list, optional = false) {
  if ((v === undefined || v === null || v === '') && optional) return undefined;
  if (!list.includes(v)) throw bad(`${name} si sahihi`);
  return v;
}

function uuid(v, name = 'ID') {
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw bad(`${name} si sahihi`);
  return v.toLowerCase();
}

module.exports = { str, phone, password, int, oneOf, uuid, bad };
