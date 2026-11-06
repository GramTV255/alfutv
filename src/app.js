'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { config } = require('./config');
const { globalLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { fastStatic } = require('./middleware/fastStatic');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  // Extra hardening headers. Sensitive API answers are never cached; panels are kept out of search engines.
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    res.set('X-Permitted-Cross-Domain-Policies', 'none');
    if (/^\/api\/(auth|user|admin)\b/.test(req.path)) res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    if (/^\/(admin|dashboard)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // HTTPS is enforced in production (behind a proxy, TRUST_PROXY must be set so req.secure is correct).
  if (config.isProd) {
    app.use((req, res, next) => {
      if (req.secure || req.path === '/healthz') return next();
      res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
    });
  }

  // Proxy links (streams): own rate limit, no 30s cutoff, mounted before the global limiter.
  app.use('/p', require('./routes/proxy'));

  // A request that takes too long is cut off so it cannot keep a slot busy (hosts answer "server capacity reached" when slots run out).
  app.use((req, res, next) => {
    res.setTimeout(30000, () => { if (!res.headersSent) res.status(503).type('text/plain').send('Service Unavailable (timeout)'); });
    next();
  });
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: '50kb' }));

  // Light by default (no database call) so frequent platform health checks cost nothing; /healthz?deep=1 also checks the database.
  app.get('/healthz', async (req, res) => {
    if (!req.query.deep) return res.json({ ok: true });
    try {
      await require('./database/pool').query('SELECT 1');
      res.json({ ok: true, db: true });
    } catch (_) {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/user', require('./routes/user'));
  app.use('/api/admin/amiri', require('./routes/amiriAdmin'));
  app.use('/api/admin/proxy', require('./routes/proxyAdmin'));
  app.use('/api/admin/bein', require('./routes/beinAdmin'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/webhooks', require('./routes/webhooks'));
  app.use('/api/v1', require('./routes/public'));
  app.use('/api/public/contact', require('./routes/contact'));
  app.use('/api/cron', require('./routes/cron'));
  app.use('/api', (req, res) => notFound(req, res));

  // Each section has its own URL: /dashboard/pay, /admin/users ... (same page shell, the section comes from the path)
  const pub = path.join(__dirname, '..', 'public');
  const fast = fastStatic(pub, { maxAge: config.isProd ? 3600 : 0 });
  app.get(['/dashboard', '/dashboard/*'], fast.page('dashboard'));
  app.get(['/admin', '/admin/*'], fast.page('admin'));
  app.use(fast);
  // Clean URLs: /login.html -> /login (static serves the .html file for the extension-less path)
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && /^\/[a-z0-9-]+\.html$/i.test(req.path)) {
      const name = req.path.slice(1, -5);
      if (name === '404') return notFound(req, res);
      const qs = req.originalUrl.slice(req.path.length);
      return res.redirect(301, (name === 'index' ? '/' : `/${name}`) + qs);
    }
    next();
  });
  app.get('/user', (_req, res) => res.redirect('/dashboard'));
  app.get('/token', (_req, res) => res.redirect('/dashboard'));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: config.isProd ? '1h' : 0, index: 'index.html' }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
