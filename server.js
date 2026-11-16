require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const db = require('./src/config/database');
const { csrfGuard } = require('./src/middleware/auth');
const { requireAdmin } = require('./src/middleware/admin');
const { apiLimiter, adminLimiter, liveLimiter } = require('./src/middleware/rate-limit');
const webhook = require('./src/services/webhook-service');
const settings = require('./src/routes/settings');
const sliders = require('./src/routes/sliders');
const subs = require('./src/services/subscription-service');
const pay = require('./src/services/payment-service');
const { normalizePhone } = require('./src/utils/validation');

const prod = process.env.NODE_ENV === 'production';
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],       // streams za HLS/DASH zinatoka hosts mbalimbali
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: prod ? [] : null,
    },
  },
}));

// Webhook: raw body kwanza (signature inahitaji bytes halisi)

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});
app.use(cookieParser());
// Slider: auth + CSRF kwanza, kisha JSON kubwa (picha) - kabla ya parser ya kawaida
app.use('/api/admin/sliders', adminLimiter, csrfGuard, requireAdmin, express.json({ limit: '6mb' }), sliders.adminRouter);
app.post('/webhooks/fastlipa', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => webhook.handleFastlipa(req, res).catch(next));
app.post('/webhooks/sonicpesa', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => webhook.handleSonic(req, res).catch(next));
app.use(express.json({ limit: '1mb' }));
app.get('/media/slider/:id', sliders.media);

app.post('/webhooks/clickpesa', (req, res, next) => webhook.handleClickpesa(req, res).catch(next));

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok', db: 'up', time: new Date().toISOString() }); }
  catch (_) { res.status(503).json({ status: 'degraded', db: 'down' }); }
});

app.use('/api', apiLimiter, csrfGuard);
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/site', settings.publicRouter);
app.use('/api', sliders.publicRouter);
app.use('/api', require('./src/routes/channels'));
app.use('/api/packages', require('./src/routes/packages'));
app.use('/api/subscriptions', require('./src/routes/subscriptions'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/matches', require('./src/routes/matches').publicRouter);
app.use('/api/app-releases', require('./src/routes/app-releases').publicRouter);
app.use('/api/app-store', require('./src/routes/app-store').pub);
app.use('/api/promo', require('./src/routes/promo').pub);
app.use('/api/live', require('./src/routes/live').pub);

app.use('/api/admin/settings', adminLimiter, requireAdmin, settings.router);
app.use('/api/admin', adminLimiter, requireAdmin, require('./src/routes/proxy-admin'));
app.use('/api/admin', adminLimiter, requireAdmin, require('./src/routes/providers'));
app.use('/api/admin/notifications', adminLimiter, requireAdmin, require('./src/routes/admin-notifications'));
app.use('/api/admin/app-releases', adminLimiter, requireAdmin, require('./src/routes/app-releases').adminRouter);
app.use('/api/admin/store', adminLimiter, requireAdmin, require('./src/routes/app-store').adm);
app.use('/api/admin/promo', adminLimiter, requireAdmin, require('./src/routes/promo').adm);
app.use('/api/admin/resets', adminLimiter, requireAdmin, require('./src/routes/resets'));
app.use('/api/admin/live', liveLimiter, requireAdmin, require('./src/routes/live').adm);
app.use('/api/admin/matches', adminLimiter, requireAdmin, require('./src/routes/matches').adminRouter);
app.use('/api/admin', adminLimiter, requireAdmin, require('./src/routes/payouts'));
app.use('/api/admin', adminLimiter, requireAdmin, require('./src/routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Haipo.' }));

app.get('/download', (req, res) => res.redirect(301, '/store'));

// ---- App Links: Android (assetlinks.json) na iOS (apple-app-site-association) ----
// Zinawashwa kwa env vars tu: ANDROID_SHA256, IOS_APP_ID (TEAMID.bundleid). Bila hizo, hazitolewi.
app.get('/.well-known/assetlinks.json', (req, res) => {
  const sha = process.env.ANDROID_SHA256;
  if (!sha) return res.status(404).end();
  res.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'com.alfutv.pro', sha256_cert_fingerprints: [String(sha).trim().toUpperCase()] } }]);
});
app.get(['/.well-known/apple-app-site-association', '/apple-app-site-association'], (req, res) => {
  const id = process.env.IOS_APP_ID;
  if (!id) return res.status(404).end();
  res.type('application/json').json({ applinks: { apps: [], details: [{ appID: id, paths: ['*'] }] } });
});
// Kitufe cha "Fungua kwenye app" kwenye browser: kinajua package na link ya iOS
app.get('/api/app-links', (req, res) => {
  res.json({ android_package: process.env.ANDROID_PACKAGE || 'com.alfutv.pro', ios_app_url: process.env.IOS_APP_URL || '' });
});
// Kuingia kuna ukurasa mmoja: /login. Admin anapelekwa kwenye dashboard baada ya kuingia
app.get(['/admin', '/admin/', '/admin/index.html'], (req, res) => res.redirect(302, '/login?next=/admin/dashboard'));
// Admin aliyeingia akifungua kurasa za user, anapelekwa moja kwa moja kwenye admin panel (upande wa seva)
app.get(['/', '/index.html', '/profile', '/profile.html', '/packages', '/packages.html', '/live-tv', '/live-tv.html', '/login', '/login.html', '/register', '/register.html'],
  require('./src/middleware/auth').optionalAuth,
  (req, res, next) => (req.user && req.user.role === 'admin' ? res.redirect(302, '/admin/dashboard') : next()));   // link za zamani
app.use('/hls', require('./src/routes/hls'));
app.use('/proxy', require('./src/routes/proxy'));

// URL safi: /admin/dashboard badala ya /admin/dashboard.html (zile za zamani zinaelekezwa kwenye URL safi)
app.get(/\.html$/, (req, res) => {
  let p = req.path.replace(/\.html$/, '');
  if (p === '/index' || p.endsWith('/index')) p = p.slice(0, -5);
  const qi = req.originalUrl.indexOf('?');
  res.redirect(302, (p || '/') + (qi >= 0 ? req.originalUrl.slice(qi) : ''));
});
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html', extensions: ['html'] }));
// Kubana CSS/JS (gzip) kwa kasi: faili zinasomwa mara moja na kuhifadhiwa kwenye kumbukumbu
app.use((req, res, next) => {
  if (!/\.(css|js)$/.test(req.path) || !/gzip/.test(req.headers['accept-encoding'] || '')) return next();
  const zlib = require('zlib');
  const base = path.join(__dirname, 'public');
  const fp = path.join(base, path.normalize(req.path).replace(/^([/\\])+/, ''));
  if (!fp.startsWith(base + path.sep)) return next();
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) return next();
    const key = fp + ':' + st.mtimeMs;
    const send = (buf) => {
      // ETag: faili ikiwa haijabadilika, browser inapata 304 (jibu fupi) badala ya kupakua tena
      const etag = '"' + require('crypto').createHash('sha1').update(buf).digest('hex') + '"';
      res.set({ 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Cache-Control': 'no-cache', ETag: etag });
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.type(path.extname(fp));
      res.end(buf);
    };
    if (!gzCache.has(key)) gzCache.set(key, null);
    if (gzCache.get(key)) return send(gzCache.get(key));
    fs.readFile(fp, (e2, data) => {
      if (e2) return next();
      const buf = zlib.gzipSync(data, { level: 9 });
      gzCache.set(key, buf); send(buf);
    });
  });
});
const gzCache = new Map();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {   // eslint-disable-line
  const status = err.status && err.expose ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Hitilafu ya seva. Jaribu tena.' : err.message });
});

async function bootstrap() {
  if (String(process.env.AUTO_MIGRATE).toLowerCase() !== 'false') {
    // Kila amri ya schema inatekelezwa peke yake: kosa moja halizimi seva nzima, linaandikwa kwenye logs
    const stmts = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8')
      .replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
    for (const st of stmts) {
      try { await db.query(st); }
      catch (e) { console.error('Schema statement imeshindikana:', e.message, '|', st.slice(0, 120)); }
    }
  }
  const adm = await db.query("SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1");
  const phone = normalizePhone(process.env.ADMIN_PHONE);
  if (!adm.rowCount && phone && process.env.ADMIN_PASSWORD) {
    await db.query("INSERT INTO users(name,phone,password_hash,role_id) VALUES($1,$2,$3,(SELECT id FROM roles WHERE name='admin')) ON CONFLICT (phone) DO UPDATE SET role_id=EXCLUDED.role_id",
      [process.env.ADMIN_NAME || 'Admin', phone, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)]);
    console.log('Admin wa kwanza ameundwa. Badilisha ADMIN_PASSWORD baada ya kuingia.');
  }
}

const PORT = Number(process.env.PORT || 8080);
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) console.warn('ONYO: SESSION_SECRET haijawekwa vizuri.');

bootstrap().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log('alfutvpromax inasikiliza port ' + PORT));
  const tick = () => Promise.all([subs.expireOld(), pay.expireStalePending(), require('./src/services/payout-service').syncOpen()]).catch((e) => console.error('job:', e.message));
  tick(); setInterval(tick, 5 * 60 * 1000);
}).catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
