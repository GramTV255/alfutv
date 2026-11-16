const router = require('express').Router();
const { query, tx } = require('../config/database');
const { isStr, isInt, isUrl, normalizePhone, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const { resolveUncached } = require('../utils/stream-resolver');

const id = (req) => { const n = parseInt(req.params.id, 10); if (!n) throw httpErr(400, 'ID si sahihi.'); return n; };
const lim = (req) => ({ limit: Math.min(parseInt(req.query.limit, 10) || 50, 200), offset: Math.max(parseInt(req.query.offset, 10) || 0, 0) });

// ---------- Dashboard (kila mfumo wa malipo una mapato yake) ----------
router.get('/dashboard', ah(async (req, res) => {
  const pv = await require('../config/provider').getActive();
  const [u, s, p, rev, po] = await Promise.all([
    query(`SELECT count(*)::int total, count(*) FILTER (WHERE status='ACTIVE')::int active, count(*) FILTER (WHERE status='SUSPENDED')::int suspended FROM users`),
    query(`SELECT count(*) FILTER (WHERE status='ACTIVE' AND end_date>now())::int active, count(*) FILTER (WHERE status='EXPIRED' OR end_date<=now())::int expired FROM subscriptions`),
    query(`SELECT count(*) FILTER (WHERE status='COMPLETED')::int successful, count(*) FILTER (WHERE status='PENDING')::int pending, count(*) FILTER (WHERE status IN ('FAILED','VOIDED','EXPIRED','REVIEW'))::int failed FROM payments WHERE provider=$1`, [pv]),
    query(`SELECT COALESCE(sum(amount) FILTER (WHERE completed_at>=date_trunc('day',now())),0)::bigint daily,
                  COALESCE(sum(amount) FILTER (WHERE completed_at>=date_trunc('week',now())),0)::bigint weekly,
                  COALESCE(sum(amount) FILTER (WHERE completed_at>=date_trunc('month',now())),0)::bigint monthly,
                  COALESCE(sum(amount) FILTER (WHERE completed_at>=date_trunc('year',now())),0)::bigint yearly
           FROM payments WHERE status='COMPLETED' AND provider=$1`, [pv]),
    query('SELECT id,recipient_name,amount,fee,status,created_at FROM payouts WHERE provider=$1 ORDER BY created_at DESC LIMIT 5', [pv]),
  ]);
  res.json({ provider: pv, users: u.rows[0], subscriptions: s.rows[0], payments: p.rows[0], revenue: rev.rows[0], recent_payouts: po.rows });
}));

// Mapato kwa grafu: siku 14 / wiki 12 / miezi 12 / miaka 5 (saa za Dar es Salaam)
const PER = { day: { t: 'day', back: 13 }, week: { t: 'week', back: 11 }, month: { t: 'month', back: 11 }, year: { t: 'year', back: 4 } };
router.get('/dashboard/revenue', ah(async (req, res) => {
  const period = PER[req.query.period] ? req.query.period : 'day', p = PER[period], tz = 'Africa/Dar_es_Salaam';
  const pv = await require('../config/provider').getActive();
  const r = await query(`WITH g AS (SELECT generate_series(date_trunc('${p.t}', now() AT TIME ZONE $1) - interval '${p.back} ${p.t}', date_trunc('${p.t}', now() AT TIME ZONE $1), interval '1 ${p.t}') AS t)
    SELECT to_char(g.t,'YYYY-MM-DD') AS t, COALESCE(SUM(pay.amount),0)::bigint AS amount, COUNT(pay.id)::int AS count
    FROM g LEFT JOIN payments pay ON pay.status='COMPLETED' AND pay.provider=$2 AND date_trunc('${p.t}', pay.completed_at AT TIME ZONE $1) = g.t
    GROUP BY g.t ORDER BY g.t`, [tz, pv]);
  res.json({ period, provider: pv, points: r.rows, total: r.rows.reduce((a, x) => a + Number(x.amount), 0) });
}));

// ---------- Users ----------
router.get('/users', ah(async (req, res) => {
  const { limit, offset } = lim(req); const q = `%${String(req.query.q || '').trim()}%`;
  const r = await query(`SELECT u.id,u.name,u.phone,u.status,r.name AS role,u.created_at,
      s.package_name,s.end_date AS subscription_end
    FROM users u JOIN roles r ON r.id=u.role_id
    LEFT JOIN LATERAL (SELECT p.name AS package_name, s.end_date FROM subscriptions s JOIN packages p ON p.id=s.package_id
        WHERE s.user_id=u.id AND s.status='ACTIVE' AND s.end_date>now() ORDER BY s.end_date DESC LIMIT 1) s ON TRUE
    WHERE u.name ILIKE $1 OR u.phone ILIKE $1 ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
  res.json({ users: r.rows });
}));
router.get('/users/:id', ah(async (req, res) => {
  const uid = id(req);
  const u = (await query('SELECT u.id,u.name,u.phone,u.status,r.name AS role,u.created_at FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1', [uid])).rows[0];
  if (!u) throw httpErr(404, 'Mtumiaji hapatikani.');
  const ST = (t) => `CASE WHEN ${t}.status='ACTIVE' AND ${t}.end_date<=now() THEN 'EXPIRED' ELSE ${t}.status END AS status`;
  const [subs, cps, pays, tot] = await Promise.all([
    query(`SELECT s.id,p.name AS package_name,s.start_date,s.end_date,${ST('s')} FROM subscriptions s JOIN packages p ON p.id=s.package_id WHERE s.user_id=$1 ORDER BY s.end_date DESC`, [uid]),
    query(`SELECT cp.id,c.name AS channel_name,cp.start_date,cp.end_date,${ST('cp')} FROM channel_purchases cp JOIN channels c ON c.id=cp.channel_id WHERE cp.user_id=$1 ORDER BY cp.end_date DESC`, [uid]),
    query(`SELECT p.id,p.order_id,p.provider_reference AS reference,COALESCE(k.name, 'Channel: ' || ch.name, 'Mechi #' || p.match_id, 'Programu #' || p.app_release_id) AS item,p.amount,p.currency,p.status,p.failure_reason,p.created_at,p.completed_at
           FROM payments p LEFT JOIN packages k ON k.id=p.package_id LEFT JOIN channels ch ON ch.id=p.channel_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 200`, [uid]),
    query("SELECT COALESCE(sum(amount) FILTER (WHERE status='COMPLETED'),0)::bigint paid, count(*) FILTER (WHERE status='COMPLETED')::int ok, count(*)::int total FROM payments WHERE user_id=$1", [uid]),
  ]);
  res.json({ user: u, subscriptions: subs.rows, channel_purchases: cps.rows, payments: pays.rows, totals: tot.rows[0] });
}));
router.get('/users/:id/payments', ah(async (req, res) => {
  const r = await query(`SELECT p.id,p.order_id,p.provider_reference AS reference,k.name AS package_name,p.amount,p.status,p.created_at
    FROM payments p LEFT JOIN packages k ON k.id=p.package_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [id(req)]);
  res.json({ payments: r.rows });
}));
router.patch('/users/:id', ah(async (req, res) => {
  const uid = id(req); const { status } = req.body || {};
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) throw httpErr(400, 'Status si sahihi.');
  if (uid === req.user.id) throw httpErr(400, 'Huwezi kubadilisha akaunti yako mwenyewe.');
  const r = await query('UPDATE users SET status=$2 WHERE id=$1 RETURNING id', [uid, status]);
  if (!r.rowCount) throw httpErr(404, 'Mtumiaji hapatikani.');
  if (status === 'SUSPENDED') await query('DELETE FROM sessions WHERE user_id=$1', [uid]);
  await audit(req, 'user.status', 'user', uid, { status });
  res.json({ ok: true });
}));

// ---------- Categories ----------
router.get('/categories', ah(async (req, res) => res.json({ categories: (await query('SELECT * FROM channel_categories ORDER BY sort_order,name')).rows })));
function catBody(b) {
  if (!isStr(b.name, 1, 60)) throw httpErr(400, 'Jina la category linahitajika.');
  return [b.name.trim(), isInt(b.sort_order, 0, 9999) ? b.sort_order : 0, b.active !== false];
}
router.post('/categories', ah(async (req, res) => {
  try {
    const r = await query('INSERT INTO channel_categories(name,sort_order,active) VALUES($1,$2,$3) RETURNING *', catBody(req.body || {}));
    await audit(req, 'category.create', 'category', r.rows[0].id); res.status(201).json({ category: r.rows[0] });
  } catch (e) { if (e.code === '23505') throw httpErr(409, 'Category tayari ipo.'); throw e; }
}));
router.patch('/categories/:id', ah(async (req, res) => {
  const r = await query('UPDATE channel_categories SET name=$2,sort_order=$3,active=$4 WHERE id=$1 RETURNING *', [id(req), ...catBody(req.body || {})]);
  if (!r.rowCount) throw httpErr(404, 'Haipatikani.'); await audit(req, 'category.update', 'category', req.params.id); res.json({ category: r.rows[0] });
}));
router.delete('/categories/:id', ah(async (req, res) => { await query('DELETE FROM channel_categories WHERE id=$1', [id(req)]); await audit(req, 'category.delete', 'category', req.params.id); res.json({ ok: true }); }));

// ---------- Channels ----------
const TYPES = ['M3U8', 'MPD', 'M3U8_HEADERS', 'MPD_HEADERS', 'API'];
function parseClearKeys(v) {
  if (v == null || v === '') return {};
  let pairs;
  if (typeof v === 'object' && !Array.isArray(v)) pairs = Object.entries(v);
  else {
    const t = String(v).trim();
    if (!t) return {};
    if (t.startsWith('{')) { try { pairs = Object.entries(JSON.parse(t)); } catch (_) { throw httpErr(400, 'ClearKey JSON si sahihi.'); } }
    else pairs = t.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => x.split(':'));
  }
  if (pairs.length > 8) throw httpErr(400, 'ClearKey nyingi mno (max 8).');
  const out = {};
  for (const [a, b] of pairs) {
    const kid = String(a || '').replace(/-/g, '').trim().toLowerCase(), key = String(b || '').replace(/-/g, '').trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(kid) || !/^[0-9a-f]{32}$/.test(key)) throw httpErr(400, 'ClearKey: kid na key ziwe hex ya herufi 32 kila moja (kid:key).');
    out[kid] = key;
  }
  return out;
}
function chBody(b) {
  if (!isStr(b.name, 1, 80)) throw httpErr(400, 'Jina la channel linahitajika.');
  if (!isUrl(b.stream_url)) throw httpErr(400, 'Stream URL si sahihi.');
  if (!TYPES.includes(b.stream_type)) throw httpErr(400, 'Aina ya stream si sahihi.');
  if (!['FREE', 'PAID'].includes(b.access_type)) throw httpErr(400, 'FREE au PAID.');
  if (b.logo_url && !isUrl(b.logo_url) && !/^data:image\//.test(b.logo_url)) throw httpErr(400, 'Logo URL si sahihi.');
  let headers = b.headers || {};
  if (typeof headers === 'string') { try { headers = headers.trim() ? JSON.parse(headers) : {}; } catch (_) { throw httpErr(400, 'Headers ziwe JSON sahihi.'); } }
  if (typeof headers !== 'object' || Array.isArray(headers) || Object.entries(headers).some(([k, v]) => !/^[\w-]{1,60}$/.test(k) || typeof v !== 'string' || v.length > 500))
    throw httpErr(400, 'Headers si sahihi.');
  const price = b.access_type === 'PAID' ? (parseInt(b.price, 10) || 0) : 0;
  if (price && (price < 500 || price > 100000000)) throw httpErr(400, 'Bei ya channel iwe angalau 500 TZS (au 0).');
  const pm = parseInt(b.price_minutes, 10);
  const priceMinutes = Number.isInteger(pm) && pm > 0 ? pm : null;
  const priceDays = Math.max(1, Math.ceil((priceMinutes || (parseInt(b.price_days, 10) || 30) * 1440) / 1440));
  if (priceDays < 1 || priceDays > 3650) throw httpErr(400, 'Muda wa channel (siku) si sahihi.');
  const sortOrder = parseInt(b.sort_order, 10) || 0;
  const cat = b.category_id ? parseInt(b.category_id, 10) : null;
  return [b.name.trim(), b.logo_url || null, cat, b.stream_url, b.stream_type, headers, b.access_type, b.active !== false, b.popular === true,
    b.stream_type.startsWith('MPD') ? parseClearKeys(b.clearkey) : {}, price, priceDays, sortOrder, priceMinutes];
}
async function setPkgLinks(c, channelId, pkgIds) {
  if (!Array.isArray(pkgIds)) return;
  await c.query('DELETE FROM package_channels WHERE channel_id=$1', [channelId]);
  for (const p of pkgIds.filter(Number.isInteger)) await c.query('INSERT INTO package_channels(package_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [p, channelId]);
}
router.get('/channels', ah(async (req, res) => {
  const r = await query(`SELECT c.*, COALESCE((SELECT json_agg(package_id) FROM package_channels WHERE channel_id=c.id),'[]') AS package_ids FROM channels c WHERE c.match_only=FALSE ORDER BY c.sort_order, c.name`);
  res.json({ channels: r.rows });
}));
router.post('/channels', ah(async (req, res) => {
  const vals = chBody(req.body || {});
  const ch = await tx(async (c) => {
    const r = await c.query(`INSERT INTO channels(name,logo_url,category_id,stream_url,stream_type,headers,access_type,active,popular,clearkey,price,price_days,sort_order,price_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, vals);
    await setPkgLinks(c, r.rows[0].id, req.body.package_ids); return r.rows[0];
  });
  if (req.body && req.body.match_only === true) { await query('UPDATE channels SET match_only=TRUE WHERE id=$1', [ch.id]); ch.match_only = true; }
  await audit(req, 'channel.create', 'channel', ch.id, { name: ch.name }); res.status(201).json({ channel: ch });
}));
router.patch('/channels/:id', ah(async (req, res) => {
  const cid = id(req), vals = chBody(req.body || {});
  const ch = await tx(async (c) => {
    const r = await c.query(`UPDATE channels SET name=$2,logo_url=$3,category_id=$4,stream_url=$5,stream_type=$6,headers=$7,access_type=$8,active=$9,popular=$10,clearkey=$11,price=$12,price_days=$13,sort_order=$14,price_minutes=$15 WHERE id=$1 RETURNING *`, [cid, ...vals]);
    if (!r.rowCount) throw httpErr(404, 'Channel haipatikani.');
    await setPkgLinks(c, cid, req.body.package_ids); return r.rows[0];
  });
  await audit(req, 'channel.update', 'channel', cid, { name: ch.name }); res.json({ channel: ch });
}));
router.post('/channels/test-endpoint', ah(async (req, res) => {   // jaribu endpoint kabla ya kuhifadhi
  const { url, headers } = req.body || {};
  if (!isUrl(url)) throw httpErr(400, 'Endpoint URL si sahihi.');
  let h = headers || {};
  if (typeof h === 'string') { try { h = h.trim() ? JSON.parse(h) : {}; } catch (_) { throw httpErr(400, 'Headers ziwe JSON sahihi.'); } }
  if (typeof h !== 'object' || Array.isArray(h) || Object.entries(h).some(([k, v]) => !/^[\w-]{1,60}$/.test(k) || typeof v !== 'string' || v.length > 800)) throw httpErr(400, 'Headers si sahihi.');
  try {
    const r = await resolveUncached(url, h), u = new URL(r.url);
    res.json({ ok: true, type: r.type, keys: Object.keys(r.clearkeys).length, host: u.host, tail: u.pathname.slice(-30) });
  } catch (e) { throw httpErr(400, 'Jaribio limeshindwa: ' + e.message); }
}));
router.post('/channels/:id/visibility', ah(async (req, res) => {   // ficha / onyesha channel kwa muda
  const cid = id(req), active = req.body && req.body.active === true;
  const r = await query('UPDATE channels SET active=$2 WHERE id=$1 RETURNING id', [cid, active]);
  if (!r.rowCount) throw httpErr(404, 'Channel haipatikani.');
  await audit(req, active ? 'channel.show' : 'channel.hide', 'channel', cid); res.json({ ok: true, active });
}));
router.delete('/channels/:id', ah(async (req, res) => { await query('DELETE FROM channels WHERE id=$1', [id(req)]); await audit(req, 'channel.delete', 'channel', req.params.id); res.json({ ok: true }); }));

// ---------- Packages ----------
function pkMinutes(b) {
  if (Number.isInteger(b.duration_minutes)) return b.duration_minutes;
  if (isInt(b.duration_days, 1, 3650)) return b.duration_days * 1440;
  return null;
}
const fmtMin = (m) => (m >= 1440 && m % 1440 === 0 ? (m / 1440) + ' siku' : m + ' dakika');
function pkBody(b) {
  if (!isStr(b.name, 1, 80)) throw httpErr(400, 'Jina la kifurushi linahitajika.');
  if (!isInt(b.price, 500, 100000000)) throw httpErr(400, 'Bei ni namba kamili (angalau 500 TZS).');
  const mins = pkMinutes(b);
  if (!isInt(mins, 1, 3650 * 1440)) throw httpErr(400, 'Muda si sahihi (dakika 1 hadi siku 3650).');
  return [b.name.trim(), (b.description || '').slice(0, 500), b.price, Math.max(1, Math.ceil(mins / 1440)), mins, b.active !== false];
}
async function setPkgChannels(c, pid, ids) {
  if (!Array.isArray(ids)) return;
  await c.query('DELETE FROM package_channels WHERE package_id=$1', [pid]);
  for (const ch of ids.filter(Number.isInteger)) await c.query('INSERT INTO package_channels(package_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [pid, ch]);
}
router.get('/packages', ah(async (req, res) => {
  const r = await query(`SELECT p.*, COALESCE((SELECT json_agg(channel_id) FROM package_channels WHERE package_id=p.id),'[]') AS channel_ids FROM packages p ORDER BY p.price`);
  res.json({ packages: r.rows });
}));
router.post('/packages', ah(async (req, res) => {
  const vals = pkBody(req.body || {});
  const pk = await tx(async (c) => {
    const r = await c.query('INSERT INTO packages(name,description,price,duration_days,duration_minutes,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', vals);
    await setPkgChannels(c, r.rows[0].id, req.body.channel_ids); return r.rows[0];
  });
  await audit(req, 'package.create', 'package', pk.id, { price: pk.price }); res.status(201).json({ package: pk });
}));
router.patch('/packages/:id', ah(async (req, res) => {
  const pid = id(req), vals = pkBody(req.body || {});
  const pk = await tx(async (c) => {
    const r = await c.query('UPDATE packages SET name=$2,description=$3,price=$4,duration_days=$5,duration_minutes=$6,active=$7 WHERE id=$1 RETURNING *', [pid, ...vals]);
    if (!r.rowCount) throw httpErr(404, 'Kifurushi hakipatikani.');
    await setPkgChannels(c, pid, req.body.channel_ids); return r.rows[0];
  });
  await audit(req, 'package.update', 'package', pid, { price: pk.price }); res.json({ package: pk });
}));

// ---------- Subscriptions (kwa namba ya simu) ----------
const STATUS = (t) => `CASE WHEN ${t}.status='ACTIVE' AND ${t}.end_date<=now() THEN 'EXPIRED' ELSE ${t}.status END AS status`;
router.get('/subscriptions', ah(async (req, res) => {
  const { limit, offset } = lim(req);
  const [a, b] = await Promise.all([
    query(`SELECT s.id,s.user_id,u.name AS user_name,u.phone,p.name AS package_name,s.start_date,s.end_date,s.payment_id,${STATUS('s')}
      FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN packages p ON p.id=s.package_id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    query(`SELECT cp.id,cp.user_id,u.name AS user_name,u.phone,c.name AS channel_name,cp.start_date,cp.end_date,cp.payment_id,${STATUS('cp')}
      FROM channel_purchases cp JOIN users u ON u.id=cp.user_id JOIN channels c ON c.id=cp.channel_id ORDER BY cp.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
  ]);
  const mp = await query(`SELECT mp.id, mp.user_id, u.name AS user_name, u.phone, (m.home_team || ' vs ' || m.away_team) AS match_title,
      mp.start_date, mp.end_date FROM match_purchases mp JOIN users u ON u.id=mp.user_id JOIN matches m ON m.id=mp.match_id
      ORDER BY mp.created_at DESC LIMIT 100`);
  res.json({ subscriptions: a.rows, channel_purchases: b.rows, match_purchases: mp.rows });
}));
router.post('/subscriptions', ah(async (req, res) => {   // ruhusa maalumu: namba ya simu + kifurushi/channel/mechi + muda (siku au dakika)
  const { phone, target, days, minutes } = req.body || {};
  const msisdn = normalizePhone(phone);
  if (!msisdn) throw httpErr(400, 'Namba ya simu si sahihi (mfano 0712345678).');
  const u = (await query('SELECT id,name FROM users WHERE phone=$1', [msisdn])).rows[0];
  if (!u) throw httpErr(404, 'Hakuna mtumiaji mwenye namba hii.');
  const m = /^([pcm]):(\d+)$/.exec(String(target || ''));
  if (!m) throw httpErr(400, 'Chagua kifurushi, channel au mechi.');
  const tid = parseInt(m[2], 10);
  const customMin = Number.isInteger(minutes) && minutes > 0 && minutes <= 3650 * 1440 ? minutes
    : (Number.isInteger(days) && days > 0 && days <= 3650 ? days * 1440 : null);
  let rid, mins, label;
  if (m[1] === 'm') {
    const mt = (await query('SELECT id FROM matches WHERE id=$1', [tid])).rows[0];
    if (!mt) throw httpErr(404, 'Mechi haipatikani.');
    if (customMin) rid = (await query(`INSERT INTO match_purchases(user_id,match_id,start_date,end_date) VALUES($1,$2,now(),now()+($3||' minutes')::interval) RETURNING id`, [u.id, tid, String(customMin)])).rows[0].id;
    else rid = (await query(`INSERT INTO match_purchases(user_id,match_id,start_date,end_date) VALUES($1,$2,now(),(SELECT kickoff_at + interval '150 minutes' FROM matches WHERE id=$2)) RETURNING id`, [u.id, tid])).rows[0].id;
    label = customMin ? fmtMin(customMin) : 'hadi dakika 150 baada ya kuanza';
    await audit(req, 'subscription.manual_create', 'match_purchase', rid, { phone: msisdn, target, minutes: customMin });
  } else if (m[1] === 'p') {
    const pk = (await query('SELECT COALESCE(duration_minutes, duration_days*1440) AS mins FROM packages WHERE id=$1', [tid])).rows[0];
    if (!pk) throw httpErr(404, 'Kifurushi hakipatikani.');
    mins = customMin || pk.mins;
    rid = (await query(`INSERT INTO subscriptions(user_id,package_id,start_date,end_date,status) VALUES($1,$2,now(),now()+($3||' minutes')::interval,'ACTIVE') RETURNING id`, [u.id, tid, String(mins)])).rows[0].id;
    label = fmtMin(mins);
    await audit(req, 'subscription.manual_create', 'subscription', rid, { phone: msisdn, target, minutes: mins });
  } else {
    const ch = (await query('SELECT COALESCE(price_minutes, price_days*1440) AS mins FROM channels WHERE id=$1', [tid])).rows[0];
    if (!ch) throw httpErr(404, 'Channel haipatikani.');
    mins = customMin || ch.mins;
    rid = (await query(`INSERT INTO channel_purchases(user_id,channel_id,start_date,end_date,status) VALUES($1,$2,now(),now()+($3||' minutes')::interval,'ACTIVE') RETURNING id`, [u.id, tid, String(mins)])).rows[0].id;
    label = fmtMin(mins);
    await audit(req, 'subscription.manual_create', 'channel_purchase', rid, { phone: msisdn, target, minutes: mins });
  }
  res.status(201).json({ id: rid, user: u.name, label });
}));
const patchSub = (table, entity) => ah(async (req, res) => {
  const sid = id(req), { status, extend_days } = req.body || {};
  if (status !== undefined) {
    if (!['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(status)) throw httpErr(400, 'Status si sahihi.');
    await query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [sid, status]);
  }
  if (extend_days !== undefined) {
    if (!isInt(extend_days, 1, 3650)) throw httpErr(400, 'Siku si sahihi.');
    await query(`UPDATE ${table} SET end_date=GREATEST(end_date,now())+($2||' days')::interval, status='ACTIVE' WHERE id=$1`, [sid, String(extend_days)]);
  }
  await audit(req, entity + '.update', entity, sid, { status, extend_days }); res.json({ ok: true });
});
router.patch('/subscriptions/:id', patchSub('subscriptions', 'subscription'));
router.patch('/channel-purchases/:id', patchSub('channel_purchases', 'channel_purchase'));
router.patch('/match-purchases/:id', ah(async (req, res) => {
  const mid = id(req), n = (req.body || {}).extend_days;
  if (!isInt(n, 1, 3650)) throw httpErr(400, 'Siku si sahihi.');
  await query("UPDATE match_purchases SET end_date=GREATEST(end_date,now())+($2||' days')::interval WHERE id=$1", [mid, String(n)]);
  await audit(req, 'match_purchase.update', 'match_purchase', mid, { extend_days: n }); res.json({ ok: true });
}));

// ---------- Payments (ndani) ----------
router.get('/payments', ah(async (req, res) => {
  const { limit, offset } = lim(req), q = req.query, w = [], v = [];
  const add = (sql, val) => { v.push(val); w.push(sql.replaceAll('?', '$' + v.length)); };
  if (q.from) add('p.created_at >= ?', q.from);
  if (q.to) add("p.created_at < (?::date + 1)", q.to);
  if (q.status) add('p.status = ?', String(q.status).toUpperCase());
  if (q.phone) add('(u.phone ILIKE ? OR p.phone ILIKE ?)', `%${q.phone}%`);
  if (q.reference) add('(p.provider_reference ILIKE ? OR p.order_id ILIKE ?)', `%${q.reference}%`);
  if (q.package_id) add('p.package_id = ?', parseInt(q.package_id, 10));
  v.push(limit, offset);
  const r = await query(`SELECT p.id,p.order_id,p.provider_reference AS reference,u.name AS user_name,u.phone,COALESCE(k.name, 'Channel: ' || ch.name, 'Mechi #' || p.match_id, 'Programu #' || p.app_release_id) AS package_name,p.amount,p.currency,p.status,p.fee_amount,p.net_amount,p.failure_reason,p.created_at,p.completed_at
    FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN packages k ON k.id=p.package_id LEFT JOIN channels ch ON ch.id=p.channel_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.created_at DESC LIMIT $${v.length - 1} OFFSET $${v.length}`, v);
  res.json({ payments: r.rows });
}));

// ---------- Reports ----------
router.get('/reports/revenue', ah(async (req, res) => {
  const group = req.query.group === 'month' ? 'month' : 'day';
  const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const pv = await require('../config/provider').getActive();
  const [series, byPkg, tot, po] = await Promise.all([
    query(`SELECT date_trunc('${group}',completed_at)::date AS period, count(*)::int payments, sum(amount)::bigint gross, COALESCE(sum(fee_amount),0)::bigint fees, COALESCE(sum(net_amount),0)::bigint net
           FROM payments WHERE status='COMPLETED' AND provider=$3 AND completed_at>=$1::date AND completed_at<$2::date+1 GROUP BY 1 ORDER BY 1 DESC`, [from, to, pv]),
    query(`SELECT COALESCE(k.name, 'Channel: ' || ch.name, 'Mechi #' || p.match_id, 'Programu #' || p.app_release_id) AS package_name, count(*)::int payments, sum(p.amount)::bigint gross FROM payments p LEFT JOIN packages k ON k.id=p.package_id LEFT JOIN channels ch ON ch.id=p.channel_id
           WHERE p.status='COMPLETED' AND p.provider=$3 AND p.completed_at>=$1::date AND p.completed_at<$2::date+1 GROUP BY 1 ORDER BY gross DESC`, [from, to, pv]),
    query(`SELECT COALESCE(sum(amount),0)::bigint gross, COALESCE(sum(fee_amount),0)::bigint fees, COALESCE(sum(net_amount),0)::bigint net, count(*)::int payments
           FROM payments WHERE status='COMPLETED' AND provider=$3 AND completed_at>=$1::date AND completed_at<$2::date+1`, [from, to, pv]),
    query(`SELECT COALESCE(sum(amount+fee),0)::bigint total_out FROM payouts WHERE status='COMPLETED' AND provider=$3 AND created_at>=$1::date AND created_at<$2::date+1`, [from, to, pv]),
  ]);
  res.json({ from, to, group, provider: pv, totals: tot.rows[0], payouts_completed_total: po.rows[0].total_out, series: series.rows, by_package: byPkg.rows });
}));

// ---------- Audit ----------
router.get('/audit-logs', ah(async (req, res) => {
  const { limit, offset } = lim(req);
  const r = await query(`SELECT a.id,a.action,a.entity,a.entity_id,a.details,a.ip,a.created_at,u.name AS user_name
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  res.json({ logs: r.rows });
}));

module.exports = router;
