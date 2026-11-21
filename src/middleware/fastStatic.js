'use strict';
/**
 * Fast static files with no extra dependency: every file in /public is read once at start-up, compressed once
 * (brotli + gzip) and then served from memory with ETag (304 when unchanged) and cache headers.
 * Pages (.html) are served at clean URLs (/login) and always revalidated; JS/CSS are cached for an hour.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = `${base}/${name}`;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push([rel, full]);
  }
  return out;
}

function fastStatic(dir, { maxAge = 3600 } = {}) {
  const files = new Map(); // url path -> entry
  for (const [rel, full] of walk(dir)) {
    const ext = path.extname(rel).toLowerCase();
    if (!TYPES[ext]) continue;
    const raw = fs.readFileSync(full);
    const entry = {
      type: TYPES[ext], raw, etag: `"${crypto.createHash('sha1').update(raw).digest('base64').slice(0, 20)}"`,
      html: ext === '.html',
      br: COMPRESSIBLE.has(ext) && raw.length > 512 ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : null,
      gz: COMPRESSIBLE.has(ext) && raw.length > 512 ? zlib.gzipSync(raw, { level: 9 }) : null,
    };
    if (entry.html) {
      const name = rel.slice(1, -5);
      if (name === '404') continue; // used only for 404 responses
      files.set(name === 'index' ? '/' : `/${name}`, entry);
    } else files.set(rel, entry);
  }

  function send(req, res, entry) {
    res.set('Content-Type', entry.type);
    res.set('Vary', 'Accept-Encoding');
    res.set('ETag', entry.etag);
    // html, js and css are revalidated every time (cheap 304 through the ETag) so a new upload is seen at once; other files are cached.
    const live = entry.html || /^(application\/javascript|text\/css)/.test(entry.type);
    res.set('Cache-Control', live ? 'no-cache' : `public, max-age=${maxAge}`);
    if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
    const ae = String(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    if (entry.br && /\bbr\b/.test(ae)) { res.set('Content-Encoding', 'br'); body = entry.br; }
    else if (entry.gz && /\bgzip\b/.test(ae)) { res.set('Content-Encoding', 'gzip'); body = entry.gz; }
    res.set('Content-Length', String(body.length));
    return req.method === 'HEAD' ? res.end() : res.end(body);
  }

  const middleware = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
    const entry = files.get(p);
    return entry ? send(req, res, entry) : next();
  };
  middleware.page = (name) => (req, res) => send(req, res, files.get(name === 'index' ? '/' : `/${name}`));
  return middleware;
}

module.exports = { fastStatic };
