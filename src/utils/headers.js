'use strict';
const v = require('../validators');

// Accepts a JSON object OR raw lines copied from the browser / curl:  "name: value" (one per line).
// Chrome DevTools "name<TAB>value" and curl "-H 'name: value'" are understood too. HTTP/2 pseudo-headers (:authority ...) are skipped.
function headersFromText(text) {
  const out = {};
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].replace(/^(curl\s+.*?)?(-H|--header)\s+/i, '').replace(/\s*\\$/, '').replace(/^(['"])(.*)\1$/, '$2');
    if (l.startsWith(':')) continue;
    let name, value;
    const tab = l.indexOf('\t');
    const colon = l.indexOf(':');
    if (tab > 0 && (colon < 0 || tab < colon)) { name = l.slice(0, tab); value = l.slice(tab + 1); }
    else if (colon > 0) { name = l.slice(0, colon); value = l.slice(colon + 1); }
    else if (/^[A-Za-z0-9\-_]+$/.test(l) && lines[i + 1] !== undefined) { name = l; value = lines[++i]; } // name on one line, value on the next
    else throw v.bad(`Mstari huu si header sahihi: "${l.slice(0, 40)}"`);
    out[name.trim()] = value.trim();
  }
  return out;
}

function parseHeaders(h) {
  if (h === undefined || h === null || h === '') return undefined;
  let obj = h;
  if (typeof h === 'string') {
    const t = h.trim();
    if (!t) return undefined;
    if (t.startsWith('{')) { try { obj = JSON.parse(t); } catch (_) { throw v.bad('JSON Headers si sahihi'); } }
    else obj = headersFromText(t);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw v.bad('Headers ziwe JSON object au mistari ya "name: value"');
  const entries = Object.entries(obj);
  if (entries.length > 40) throw v.bad('Headers nyingi mno (juu ni 40)');
  const clean = {};
  for (const [k, val] of entries) {
    if (!/^[A-Za-z0-9\-_]{1,60}$/.test(k)) throw v.bad(`Header name "${k}" si sahihi`);
    if (typeof val !== 'string' || val.length > 8000 || /[\r\n]/.test(val)) throw v.bad(`Header value ya "${k}" si sahihi (juu ni herufi 8000, mstari mmoja)`);
    clean[k.toLowerCase()] = val;
  }
  return clean;
}


module.exports = { parseHeaders, headersFromText };
