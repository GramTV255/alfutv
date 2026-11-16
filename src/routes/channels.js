const router = require('express').Router();
const { resolveApiStream } = require('../utils/stream-resolver');
const { query } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const subs = require('../services/subscription-service');
const { ah } = require('../utils/validation');

router.get('/channel-categories', ah(async (req, res) => {
  const r = await query('SELECT id,name FROM channel_categories WHERE active ORDER BY sort_order,name');
  res.json({ categories: r.rows });
}));

const offerOf = (c) => (c.price > 0 ? { price: c.price, days: c.price_days, minutes: c.price_minutes || c.price_days * 1440 } : null);

// stream_url HAIRUDI. subscribed=true => UI haionyeshi Free/Premium
router.get('/channels', optionalAuth, ah(async (req, res) => {
  const r = await query(`SELECT c.id,c.name,c.logo_url,c.category_id,k.name AS category,c.popular,c.created_at,c.access_type,c.price,c.price_days,c.price_minutes
    FROM channels c LEFT JOIN channel_categories k ON k.id=c.category_id WHERE c.active AND NOT c.match_only ORDER BY k.sort_order NULLS LAST,k.name,c.sort_order,c.name`);
  let subscribed = false, owned = new Set();
  if (req.user) { subscribed = await subs.hasActiveSub(req.user.id); if (!subscribed) owned = await subs.ownedChannelIds(req.user.id); }
  res.json({ subscribed, channels: r.rows.map((c) => ({ ...c, owned: owned.has(c.id) })) });
}));

// Channels zinazouzwa moja moja
router.get('/channel-offers', ah(async (req, res) => {
  const r = await query("SELECT id,name,logo_url,price,price_days,price_minutes FROM channels WHERE active AND NOT match_only AND access_type='PAID' AND price>0 ORDER BY name");
  res.json({ offers: r.rows });
}));

// Ukaguzi wa papo hapo channel ikibonyezwa
// Mechi iliyo hewani: ruhusa kulingana na aina yake (FREE / PRICE / PACKAGE)
const matchMode = (m) => m.access_mode || (m.price > 0 ? 'PRICE' : 'FREE');
const matchOk = async (req, m, chId) => {
  const mode = matchMode(m);
  if (mode === 'FREE') return { ok: true };
  if (!req.user) return { ok: false, reason: 'login' };
  if (mode === 'PACKAGE') {
    // Mechi ya vifurushi: mteja akiwa na kifurushi kinachotumika, anacheza; asipokuwa nacho, hacheza
    return (await subs.hasActiveSub(req.user.id)) ? { ok: true } : { ok: false, reason: 'subscribe' };
  }
  if (await subs.hasActiveSub(req.user.id)) return { ok: true };
  if (await subs.hasMatchAccess(req.user.id, m.id)) return { ok: true };
  return { ok: false, reason: 'match' };
};

router.get('/channels/:id/access', optionalAuth, ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const c = (await query('SELECT access_type,price,price_days,price_minutes,match_only FROM channels WHERE id=$1', [id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Channel haipatikani.' });
  const liveA = await subs.activeMatchFor(id);
  if (liveA) {
    const g = await matchOk(req, liveA, id);
    if (g.ok) return res.json({ allowed: true });
    const offer = matchMode(liveA) === 'PRICE' ? { match_id: liveA.id, price: liveA.price, title: `${liveA.home_team} vs ${liveA.away_team}` } : offerOf(c);
    return res.json({ allowed: false, reason: g.reason === 'login' ? 'login' : g.reason, offer });
  }
  if (c.match_only) {   // channel ya mechi nje ya muda wake: inahitaji kifurushi kinachotumika
    if (!req.user) return res.json({ allowed: false, reason: 'login', offer: null });
    return res.json(await subs.canWatch(req.user.id, id) ? { allowed: true } : { allowed: false, reason: 'subscribe', offer: null });
  }
  if (c.access_type === 'FREE') return res.json({ allowed: true });
  if (!req.user) return res.json({ allowed: false, reason: 'login', offer: offerOf(c) });
  if (await subs.canWatch(req.user.id, id)) return res.json({ allowed: true });
  res.json({ allowed: false, reason: 'subscribe', offer: offerOf(c) });
}));

// Playback: ruhusa inakaguliwa hapa (seva) - link ya moja kwa moja haipiti bila ruhusa
router.get('/channels/:id/play', optionalAuth, ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = (await query('SELECT id,name,logo_url,stream_url,stream_type,headers,access_type,clearkey,price,price_days,price_minutes,match_only FROM channels WHERE id=$1', [id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Channel haipatikani.' });
  const liveP = await subs.activeMatchFor(id);
  if (liveP) {
    const g = await matchOk(req, liveP, id);
    if (!g.ok) {
      if (g.reason === 'login') return res.status(401).json({ error: 'Ingia ili kutazama mechi hii.', reason: 'login', offer: matchMode(liveP) === 'PRICE' ? { match_id: liveP.id, price: liveP.price, title: `${liveP.home_team} vs ${liveP.away_team}` } : null });
      if (g.reason === 'subscribe') return res.status(403).json({ error: 'Jiunge na kifurushi ili kutazama mechi hii.', reason: 'subscribe', offer: null });
      return res.status(403).json({ error: 'Lipia mechi hii ili kuitazama.', reason: 'match', offer: { match_id: liveP.id, price: liveP.price, title: `${liveP.home_team} vs ${liveP.away_team}` } });
    }
  } else if (c.match_only) {   // channel ya mechi nje ya muda wake: inahitaji kifurushi kinachotumika
    if (!req.user) return res.status(401).json({ error: 'Ingia ili kutazama.', reason: 'login', offer: null });
    if (!(await subs.canWatch(req.user.id, id))) return res.status(403).json({ error: 'Jiunge na kifurushi ili kutazama.', reason: 'subscribe', offer: null });
  } else if (c.access_type === 'PAID') {
    if (!req.user) return res.status(401).json({ error: 'Ingia ili kutazama channel hii.', reason: 'login', offer: offerOf(c) });
    if (!(await subs.canWatch(req.user.id, id))) return res.status(403).json({ error: 'Nunua kifurushi au lipia channel hii ili kutazama.', reason: 'subscribe', offer: offerOf(c) });
  }
  if (c.stream_type === 'API') {      // link + ClearKey vinachukuliwa kutoka kwenye endpoint (seva inaita, si mteja)
    try {
      const r = await resolveApiStream(c.id, c.stream_url, c.headers);
      await query('UPDATE channels SET last_error=NULL, last_error_at=NULL WHERE id=$1 AND last_error IS NOT NULL', [c.id]).catch(() => {});
      res.set('Cache-Control', 'no-store');
      return res.json({ id: c.id, name: c.name, logo_url: c.logo_url, url: r.url, type: r.type, headers: {}, clearkeys: r.clearkeys });
    } catch (e) {
      console.error('API stream resolve failed (channel ' + c.id + '):', e.message);
      await query('UPDATE channels SET last_error=$2, last_error_at=now() WHERE id=$1', [c.id, String(e.message || 'Hitilafu').slice(0, 200)]).catch(() => {});
      return res.status(502).json({ error: 'Stream haipatikani kwa sasa. Jaribu tena baada ya dakika moja.' });
    }
  }
  res.set('Cache-Control', 'no-store');
  if (c.stream_url.startsWith('http://') && !c.stream_type.startsWith('MPD')) {
    // Stream ya http:// haichezi kwenye ukurasa wa https://: tunaipitisha kwenye proxy yetu
    return res.json({ id: c.id, name: c.name, logo_url: c.logo_url, url: `/hls/${c.id}/p?t=${require('../utils/hls-proxy').mint(c.id, req.user ? req.user.id : 0)}`, type: 'hls', headers: {}, clearkeys: {} });
  }
  const clearkeys = c.stream_type.startsWith('MPD') ? (c.clearkey || {}) : {};   // hex kid:key (Shaka)
  res.json({ id: c.id, name: c.name, logo_url: c.logo_url, url: c.stream_url,
    type: c.stream_type.startsWith('MPD') ? 'dash' : 'hls', headers: c.stream_type.endsWith('_HEADERS') ? c.headers : {}, clearkeys });
}));

module.exports = router;
