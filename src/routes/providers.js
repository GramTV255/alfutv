// Mfumo wa malipo: ClickPesa pekee. Funguo zinasimbwa, hazirudishwi.
const router = require('express').Router();
const { query } = require('../config/database');
const cp = require('../config/clickpesa');
const { encrypt } = require('../utils/secret-box');
const { ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');

const sp = require('../config/sonicpesa');
const fl = require('../config/fastlipa');
const provider = require('../config/provider');

// Kila mfumo unakaguliwa peke yake: hitilafu ya mfumo mmoja haizuii orodha nzima
const safe = async (fn) => { try { return await fn(); } catch (e) { console.error('payment-provider check:', e.message); return { error: e.message }; } };
router.get('/payment-provider', async (req, res) => {
  try {
    const active = await provider.getActive();
    const c = await safe(() => cp.configured()), s2 = await safe(() => sp.configured());
    const err = (v) => (v && typeof v === 'object' ? v.error : null);
    const f3 = await safe(() => fl.configured());
    const okC = c === true, okS = s2 === true, okF = f3 === true;
    res.json({ active, providers: [
      { id: 'clickpesa', name: 'ClickPesa', ready: okC, configured: okC, error: err(c) },
      { id: 'sonicpesa', name: 'SonicPesa', ready: okS, configured: okS, error: err(s2) },
      { id: 'fastlipa', name: 'FastLipa', ready: okF, configured: okF, error: err(f3) },
    ] });
  } catch (e) {
    console.error('payment-provider:', e);
    res.status(500).json({ error: 'Kosa la database: ' + String(e.message).slice(0, 200) });
  }
});
router.put('/payment-provider', ah(async (req, res) => {
  const p = req.body && req.body.provider;
  if (!provider.PROVIDERS[p]) throw httpErr(400, 'Mfumo wa malipo si sahihi.');
  if (!(await provider.isReady(p))) throw httpErr(400, provider.PROVIDERS[p].name + ' haijasanidiwa. Weka funguo kwanza.');
  await provider.setActive(p);
  await audit(req, 'payment_provider.switch', 'site_settings', 'payment_provider', { provider: p });
  res.json({ ok: true, active: p });
}));

// ---- SonicPesa: API Key (malipo) + API Secret (payouts/webhook) ----
// ---- FastLipa: Secret Token (Bearer) + Webhook Signing Secret ----
async function flStatus() {
  const r = (await query("SELECT last_test_at,last_test_ok,last_error FROM payment_provider_settings WHERE provider='fastlipa'")).rows[0] || {};
  const c = await fl.getCreds();
  const hint = (v) => (v ? '••••' + v.slice(-4) : null);
  const raw = (await query("SELECT api_key_enc, webhook_secret_enc FROM payment_provider_settings WHERE provider='fastlipa'")).rows[0] || {};
  const broken = (!!raw.api_key_enc && !c.token) || (!!raw.webhook_secret_enc && !c.signing);
  return { broken, ready: !!c.token, api_key_set: !!c.token, api_key_hint: hint(c.token), secret_set: !!c.signing, secret_hint: hint(c.signing),
    last_test_at: r.last_test_at || null, connected: r.last_test_ok ?? null, last_error: r.last_error || null,
    webhook_url: (process.env.BASE_URL || 'https://YOUR-DOMAIN').replace(/\/+$/, '') + '/webhooks/fastlipa' };
}
router.get('/fastlipa/settings', ah(async (req, res) => res.json(await flStatus())));
router.put('/fastlipa/settings', ah(async (req, res) => {
  const { api_key, api_secret } = req.body || {};
  const ok = (v) => v === undefined || v === '' || (typeof v === 'string' && v.length >= 8 && v.length <= 400 && !/\s/.test(v));
  if (!ok(api_key) || !ok(api_secret)) throw httpErr(400, 'Thamani si sahihi.');
  await query("INSERT INTO payment_provider_settings(provider) VALUES('fastlipa') ON CONFLICT DO NOTHING");
  if (api_key) await query("UPDATE payment_provider_settings SET api_key_enc=$1, updated_at=now() WHERE provider='fastlipa'", [encrypt(api_key)]);
  if (api_secret) await query("UPDATE payment_provider_settings SET webhook_secret_enc=$1, updated_at=now() WHERE provider='fastlipa'", [encrypt(api_secret)]);
  await audit(req, 'fastlipa.settings', 'payment_provider_settings', 'fastlipa', { api_key: !!api_key, api_secret: !!api_secret });
  res.json(await flStatus());
}));
router.post('/fastlipa/test-connection', ah(async (req, res) => {
  let ok = true, err = null;
  try { await fl.webhookSecretShow(); }
  catch (e) { ok = false; err = e.status === 401 ? 'Secret token si sahihi au haina ruhusa.' : e.message; }
  await query("INSERT INTO payment_provider_settings(provider) VALUES('fastlipa') ON CONFLICT DO NOTHING");
  await query("UPDATE payment_provider_settings SET last_test_at=now(), last_test_ok=$1, last_error=$2 WHERE provider='fastlipa'", [ok, err]);
  res.json(await flStatus());
}));

async function spStatus() {
  const r = (await query("SELECT last_test_at,last_test_ok,last_error FROM payment_provider_settings WHERE provider='sonicpesa'")).rows[0] || {};
  const c = await sp.getCreds();
  const hint = (v) => (v ? '••••' + v.slice(-4) : null);
  return { ready: !!(c.apiKey && c.apiSecret), api_key_set: !!c.apiKey, api_key_hint: hint(c.apiKey), secret_set: !!c.apiSecret, secret_hint: hint(c.apiSecret),
    last_test_at: r.last_test_at || null, connected: r.last_test_ok ?? null, last_error: r.last_error || null,
    webhook_url: (process.env.BASE_URL || 'https://YOUR-DOMAIN').replace(/\/+$/, '') + '/webhooks/sonicpesa' };
}
router.get('/sonicpesa/settings', ah(async (req, res) => res.json(await spStatus())));
router.put('/sonicpesa/settings', ah(async (req, res) => {
  const { api_key, api_secret } = req.body || {};
  const ok = (v) => v === undefined || v === '' || (typeof v === 'string' && v.length >= 8 && v.length <= 400 && !/\s/.test(v));
  if (!ok(api_key) || !ok(api_secret)) throw httpErr(400, 'Thamani si sahihi.');
  await query("INSERT INTO payment_provider_settings(provider) VALUES('sonicpesa') ON CONFLICT DO NOTHING");
  if (api_key) await query("UPDATE payment_provider_settings SET api_key_enc=$1, updated_at=now() WHERE provider='sonicpesa'", [encrypt(api_key)]);
  if (api_secret) await query("UPDATE payment_provider_settings SET webhook_secret_enc=$1, updated_at=now() WHERE provider='sonicpesa'", [encrypt(api_secret)]);
  await audit(req, 'sonicpesa.settings', 'payment_provider_settings', 'sonicpesa', { api_key: !!api_key, api_secret: !!api_secret });
  res.json(await spStatus());
}));
router.post('/sonicpesa/test-connection', ah(async (req, res) => {
  let ok = true, err = null;
  try { await sp.orderStatus('CONNTEST'); }
  catch (e) {
    // 404/400 = funguo imekubaliwa (agizo halipo tu). 401/403 au kushindwa kuunganisha = tatizo.
    if (e.status === 401 || e.status === 403) { ok = false; err = 'API Key si sahihi au haina ruhusa.'; }
    else if (e.status === 404 || e.status === 400) ok = true;
    else { ok = false; err = e.message; }
  }
  await query("INSERT INTO payment_provider_settings(provider) VALUES('sonicpesa') ON CONFLICT DO NOTHING");
  await query("UPDATE payment_provider_settings SET last_test_at=now(), last_test_ok=$1, last_error=$2 WHERE provider='sonicpesa'", [ok, err]);
  res.json(await spStatus());
}));

async function cpStatus() {
  const r = (await query("SELECT last_test_at,last_test_ok,last_error FROM payment_provider_settings WHERE provider='clickpesa'")).rows[0] || {};
  const c = await cp.getCreds();
  const hint = (v) => (v ? '••••' + v.slice(-4) : null);
  return {
    ready: !!(c.clientId && c.apiKey && c.checksumKey),
    client_id_set: !!c.clientId, client_id_hint: hint(c.clientId),
    api_key_set: !!c.apiKey, api_key_hint: hint(c.apiKey),
    checksum_set: !!c.checksumKey,
    last_test_at: r.last_test_at || null, connected: r.last_test_ok ?? null, last_error: r.last_error || null,
    webhook_url: (process.env.BASE_URL || 'https://YOUR-DOMAIN').replace(/\/+$/, '') + '/webhooks/clickpesa',
  };
}
router.get('/clickpesa/settings', ah(async (req, res) => res.json(await cpStatus())));
router.put('/clickpesa/settings', ah(async (req, res) => {
  const { client_id, api_key, checksum_key } = req.body || {};
  const ok = (v) => v === undefined || v === '' || (typeof v === 'string' && v.length >= 8 && v.length <= 400 && !/\s/.test(v));
  if (!ok(client_id) || !ok(api_key) || !ok(checksum_key)) throw httpErr(400, 'Thamani si sahihi.');
  await query("INSERT INTO payment_provider_settings(provider) VALUES('clickpesa') ON CONFLICT DO NOTHING");
  if (client_id) await query("UPDATE payment_provider_settings SET client_id_enc=$1, updated_at=now() WHERE provider='clickpesa'", [encrypt(client_id)]);
  if (api_key) await query("UPDATE payment_provider_settings SET api_key_enc=$1, updated_at=now() WHERE provider='clickpesa'", [encrypt(api_key)]);
  if (checksum_key) await query("UPDATE payment_provider_settings SET webhook_secret_enc=$1, updated_at=now() WHERE provider='clickpesa'", [encrypt(checksum_key)]);
  cp.resetToken();
  await audit(req, 'clickpesa.settings', 'payment_provider_settings', 'clickpesa', { client_id: !!client_id, api_key: !!api_key, checksum_key: !!checksum_key });
  res.json(await cpStatus());
}));
router.post('/clickpesa/test-connection', ah(async (req, res) => {
  let ok = true, err = null;
  try { cp.resetToken(); await cp.token(true); } catch (e) { ok = false; err = e.message; }
  await query("INSERT INTO payment_provider_settings(provider) VALUES('clickpesa') ON CONFLICT DO NOTHING");
  await query("UPDATE payment_provider_settings SET last_test_at=now(), last_test_ok=$1, last_error=$2 WHERE provider='clickpesa'", [ok, err]);
  res.json(await cpStatus());
}));

module.exports = router;
