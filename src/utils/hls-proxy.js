// HLS proxy: stream ya http:// inachezwa kwenye tovuti ya https://. Token inabeba channel + mtumiaji.
const crypto = require('crypto');

const sigOf = (id, uid, exp) => crypto.createHmac('sha256', (process.env.SESSION_SECRET || 'x') + '|hls')
  .update(`${id}.${uid}.${exp}`).digest('base64url');

function mint(id, uid) {
  const u = uid || 0, exp = Math.floor(Date.now() / 1000) + 7200;
  return `${id}.${u}.${exp}.${sigOf(id, u, exp)}`;
}
// Inarudisha { uid } kama token ni halali kwa channel hii, vinginevyo null
function parse(t, id) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(t || ''));
  if (!m || Number(m[1]) !== Number(id) || Number(m[3]) < Math.floor(Date.now() / 1000)) return null;
  const want = Buffer.from(sigOf(m[1], m[2], m[3])), got = Buffer.from(m[4]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return { uid: Number(m[2]) };
}

function rewrite(text, base, id, t) {
  const px = (u) => `/hls/${id}/s?t=${encodeURIComponent(t)}&u=${Buffer.from(new URL(u, base).href).toString('base64url')}`;
  return String(text).split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${px(u)}"`);
    return px(line.trim());
  }).join('\n');
}

module.exports = { mint, parse, rewrite };
