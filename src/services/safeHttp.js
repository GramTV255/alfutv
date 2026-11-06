'use strict';
/**
 * Outbound HTTP for channel sources with SSRF protection:
 *  - https only, standard ports, no credentials in the URL
 *  - hostname must match the allowlist (env ALLOWED_SOURCE_HOSTS + admin setting "source_allowed_hosts")
 *  - DNS is resolved once, every address must be public, and the connection is pinned to the checked IP
 *  - redirects are NOT followed, hard timeout, hard response-size limit
 */
const https = require('https');
const dns = require('dns');
const zlib = require('zlib');
const net = require('net');
const { config } = require('../config');
const { getSetting, setSetting } = require('./settingsService');
const { HttpError } = require('../utils/errors');

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([a, p]) => blocked.addSubnet(a, p, 'ipv4'));
[['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]].forEach(([a, p]) =>
  blocked.addSubnet(a, p, 'ipv6')
);

function isBlockedIp(ip) {
  const fam = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
  if (fam === 'ipv6') {
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (m) return blocked.check(m[1], 'ipv4');
  }
  return blocked.check(ip, fam);
}

function hostMatches(host, pattern) {
  host = host.toLowerCase();
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return host === pattern;
}

async function allowedHosts() {
  const extra = ((await getSetting('source_allowed_hosts')) || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...config.allowedSourceHosts, ...extra])];
}

async function isHostAllowed(host) {
  const list = await allowedHosts();
  return list.some((p) => hostMatches(host, p));
}

// Validates a URL against the rules above (without connecting).
// A link that is only STORED and handed out (an MPD link, never fetched by this server) may point to any public host.
// Still refused: credentials in the URL, localhost / internal names, private or reserved IP addresses.
function isAcceptableLinkHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return !isBlockedIp(h);
  return /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(h) && !/\.(local|internal|localhost|lan|home|corp)$/.test(h);
}

// Adds a host to the admin allowlist (used when the admin confirms authorisation for a source that this server will contact).
async function addAllowedHost(host) {
  const h = String(host || '').toLowerCase();
  if (net.isIP(h) || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) return false;
  const list = await allowedHosts();
  if (list.some((p) => hostMatches(h, p))) return false;
  const extra = ((await getSetting('source_allowed_hosts')) || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  await setSetting('source_allowed_hosts', [...extra, h].join(','));
  return true;
}

const isDirectMpd = (raw) => { try { return /\.mpd$/i.test(new URL(raw).pathname); } catch (_) { return false; } };

// opts.allowHttp: http:// too. opts.anyHost: stored-only link (never fetched): any public host and port.
async function validateSourceUrl(raw, opts = {}) {
  let u;
  try { u = new URL(raw); } catch (_) { throw new HttpError(400, 'URL si sahihi', 'BAD_URL'); }
  if (u.protocol !== 'https:' && !(opts.allowHttp && u.protocol === 'http:')) throw new HttpError(400, 'Inaruhusiwa https:// pekee', 'BAD_URL');
  if (u.username || u.password) throw new HttpError(400, 'URL isiwe na username/password', 'BAD_URL');
  if (opts.anyHost) {
    if (raw.length > 2048) throw new HttpError(400, 'URL ni ndefu mno', 'BAD_URL');
    if (!isAcceptableLinkHost(u.hostname)) throw new HttpError(400, 'Anwani ya link hairuhusiwi (localhost, mtandao wa ndani au IP binafsi)', 'BAD_URL');
    return u;
  }
  const okPorts = u.protocol === 'http:' ? ['80', '8080', '8000', '8008', '8081', '8888'] : ['443', '8443'];
  if (u.port && !okPorts.includes(u.port)) throw new HttpError(400, 'Port hairuhusiwi', 'BAD_URL');
  if (net.isIP(u.hostname)) throw new HttpError(400, 'IP address moja kwa moja hairuhusiwi; tumia domain', 'BAD_URL');
  if (raw.length > 2048) throw new HttpError(400, 'URL ni ndefu mno', 'BAD_URL');
  if (!(await isHostAllowed(u.hostname))) {
    throw new HttpError(400, `Domain "${u.hostname}" haipo kwenye allowlist. Iongeze kwenye Admin → Channels → Allowed hosts.`, 'HOST_NOT_ALLOWED');
  }
  return u;
}

// accept-encoding is allowed: it is reduced to the encodings this server can decode (gzip, deflate, br).
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'proxy-authorization']);
// accept-encoding from the admin's headers: by default the request asks for "identity" (no compression) because it is the
// most robust on small hosts. Set SOURCE_ALLOW_COMPRESSION=true to ask for gzip/deflate (decoded in memory with a size cap).
// br/zstd are never requested.
function negotiateEncoding(v) {
  if (!config.sourceCompression) return 'identity';
  const wanted = String(v).split(',').map((x) => x.split(';')[0].trim().toLowerCase());
  const ok = ['gzip', 'deflate'].filter((e) => wanted.includes(e));
  return ok.length ? ok.join(', ') : 'identity';
}

function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'accept-encoding') { out[k] = negotiateEncoding(v); continue; }
    if (!/^[A-Za-z0-9\-_]+$/.test(k) || /[\r\n]/.test(String(v))) continue;
    out[k] = String(v);
  }
  return out;
}

async function safeRequest({ url, method = 'GET', headers = {}, body, captureRedirect = false, timeoutMs = config.sourceTimeoutMs, maxBytes = config.sourceMaxBytes }) {
  const u = await validateSourceUrl(url);
  const addrs = await dns.promises.lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new HttpError(503, 'Domain haipatikani (DNS)', 'DNS_FAILED');
  if (addrs.some((a) => isBlockedIp(a.address))) throw new HttpError(400, 'Anwani ya seva hairuhusiwi (SSRF protection)', 'SSRF_BLOCKED');
  const pinned = addrs[0];

  return new Promise((resolve, reject) => {
    const clean = cleanHeaders(headers);
    const hasAE = Object.keys(clean).some((k) => k.toLowerCase() === 'accept-encoding');
    const hdrs = { ...(hasAE ? {} : { 'Accept-Encoding': 'identity' }), ...clean };
    if (body) hdrs['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(
      {
        protocol: 'https:', hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers: hdrs,
        servername: u.hostname,
        // pin the connection to the IP that was just checked (defeats DNS rebinding)
        lookup: (_h, opts, cb) => {
          if (opts && opts.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
          else cb(null, pinned.address, pinned.family);
        },
        timeout: timeoutMs,
      },
      (res) => {
        const interesting = () => Object.fromEntries(['location', 'link', 'content-location', 'refresh', 'x-redirect-url'].filter((k) => res.headers[k]).map((k) => [k, String(res.headers[k]).slice(0, 4096)]));
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          // The redirect is NOT followed; with captureRedirect its Location header is returned so a link in it can still be read.
          if (captureRedirect) return resolve({ status: res.statusCode, contentType: '', body: '', headers: interesting() });
          return reject(new HttpError(502, `Chanzo kimejibu redirect (${res.statusCode}); redirects haziruhusiwi`, 'REDIRECT_BLOCKED'));
        }
        const chunks = [];
        let size = 0;
        const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
        res.on('data', (d) => {
          size += d.length;
          if (size > maxBytes) {
            req.destroy();
            return reject(new HttpError(502, 'Response ya chanzo ni kubwa kuliko limit', 'TOO_LARGE'));
          }
          chunks.push(d);
        });
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          try {
            if (enc === 'gzip') buf = zlib.gunzipSync(buf, { maxOutputLength: maxBytes });
            else if (enc === 'deflate') buf = zlib.inflateSync(buf, { maxOutputLength: maxBytes });
            else if (enc && enc !== 'identity') return reject(new HttpError(502, `Chanzo kimetumia encoding isiyoungwa mkono (${enc})`, 'ENCODING_UNSUPPORTED'));
          } catch (_) { return reject(new HttpError(502, 'Imeshindwa kufungua response iliyobanwa (au ni kubwa mno)', 'DECODE_FAILED')); }
          resolve({ status: res.statusCode, contentType: String(res.headers['content-type'] || '').toLowerCase(), body: buf.toString('utf8'), headers: interesting() });
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new HttpError(504, 'Chanzo hakikujibu kwa wakati', 'TIMEOUT')); });
    req.on('error', (e) => reject(e instanceof HttpError ? e : new HttpError(502, 'Imeshindwa kuunganisha na chanzo', 'SOURCE_UNREACHABLE')));
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { isAcceptableLinkHost, addAllowedHost, isDirectMpd, cleanHeaders, safeRequest, validateSourceUrl, isHostAllowed, isBlockedIp, hostMatches, allowedHosts };
