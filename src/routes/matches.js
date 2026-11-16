// Mechi: public (kwa Home) na admin (usimamizi), pamoja na bei ya mechi
const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { isStr, ah, httpErr } = require('../utils/validation');
const { audit } = require('../utils/audit-log');
const { optionalAuth } = require('../middleware/auth');
const subs = require('../services/subscription-service');

// Hali inahesabiwa kwenye server: kabla ya kick-off = UPCOMING, dakika 150 baada yake = LIVE, baadaye = FINISHED
const STATUS = `CASE WHEN m.kickoff_at > now() THEN 'UPCOMING' WHEN m.kickoff_at + interval '150 minutes' > now() THEN 'LIVE' ELSE 'FINISHED' END`;
const COLS = `m.id,m.home_team,m.away_team,m.league,m.kickoff_at,m.channel_id,m.active,m.price,m.sort_order,m.home_logo,m.away_logo,m.access_mode,${STATUS} AS status,c.name AS channel_name,c.logo_url AS channel_logo,c.access_type`;

const publicRouter = express.Router();
const adminRouter = express.Router();

publicRouter.get('/', optionalAuth, ah(async (req, res) => {
  const r = await query(`SELECT ${COLS}, EXISTS (SELECT 1 FROM match_purchases mp WHERE mp.match_id=m.id AND mp.user_id=$1 AND mp.end_date>now()) AS owned
    FROM matches m LEFT JOIN channels c ON c.id=m.channel_id
    WHERE m.active AND m.kickoff_at > now() - interval '150 minutes' AND m.kickoff_at < now() + interval '14 days'
    ORDER BY m.sort_order, m.kickoff_at LIMIT 40`, [req.user ? req.user.id : 0]);
  const subscribed = req.user ? await subs.hasActiveSub(req.user.id) : false;
  res.json({ matches: r.rows, subscribed });
}));

// Channel ya mechi (iliyoundwa kwa mechi hii) inaambatishwa; zilizobaki za mechi hii zinafutwa
async function attachChannel(matchId, chId) {
  if (chId) {
    const src = (await query('SELECT id, match_only FROM channels WHERE id=$1', [chId])).rows[0];
    // Channel ya kawaida inanakiliwa kwa mechi hii: nakala inakuwa ya mechi pekee, asili inabaki kwenye channels zake
    if (src && !src.match_only) {
      const cols = (await query("SELECT column_name FROM information_schema.columns WHERE table_name='channels' AND column_name NOT IN ('id','match_only','match_id','created_at')")).rows.map((r) => r.column_name);
      const cp = await query(`INSERT INTO channels(${cols.join(',')},match_only,match_id) SELECT ${cols.join(',')},TRUE,$2 FROM channels WHERE id=$1 RETURNING id`, [chId, matchId]);
      chId = cp.rows[0].id;
      await query('UPDATE matches SET channel_id=$1 WHERE id=$2', [chId, matchId]);
    }
  }
  // Nakala za mechi hii ambazo hazitumiki tena zinafutwa
  await query('DELETE FROM channels WHERE match_only=TRUE AND match_id=$1 AND id IS DISTINCT FROM $2 AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.channel_id=channels.id AND m.id<>$1)', [matchId, chId || null]);
}

// Logo: picha ndogo ya data URL (PNG/JPG/WEBP), isiwe kubwa kuliko ~110KB
// Aina ya ufikiaji: FREE, PRICE (bei zaidi ya 0), au PACKAGE (vifurushi vya admin)
function modeOf(m, price) {
  if (m === 'FREE' || m === 'PRICE' || m === 'PACKAGE') {
    if (m === 'PRICE' && !(price > 0)) return 'PACKAGE';
    return m;
  }
  return price > 0 ? 'PRICE' : 'FREE';
}

function logoOf(x) {
  if (x === undefined) return undefined;
  if (x === null || x === '') return '';
  const t = String(x).trim();
  if (/^https:\/\/\S+$/i.test(t)) {          // link ya picha
    if (t.length > 500) throw httpErr(400, 'Link ya logo ni ndefu mno.');
    return t;
  }
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(t) || t.length > 150000) throw httpErr(400, 'Logo lazima iwe link ya https au picha ndogo (PNG/JPG/WEBP).');
  return t;
}

function parseBody(b) {
  if (!isStr(b.home_team, 1, 60)) throw httpErr(400, 'Timu ya nyumbani inahitajika.');
  if (!isStr(b.away_team, 1, 60)) throw httpErr(400, 'Timu ya ugenini inahitajika.');
  const d = new Date(b.kickoff_at);
  if (isNaN(d.getTime())) throw httpErr(400, 'Tarehe na saa ya mechi si sahihi.');
  const price = parseInt(b.price, 10) || 0;
  const sort = Number.isInteger(parseInt(b.sort_order, 10)) ? Math.max(-9999, Math.min(9999, parseInt(b.sort_order, 10))) : 0;
  if (price && (price < 500 || price > 100000000)) throw httpErr(400, 'Bei ya mechi iwe angalau 500 TZS (au 0 kwa bure).');
  const ch = b.channel_id ? parseInt(b.channel_id, 10) : null;
  return {
    home: b.home_team.trim(), away: b.away_team.trim(),
    league: typeof b.league === 'string' ? b.league.trim().slice(0, 80) : '',
    kickoff: d.toISOString(), channel: ch || null, active: b.active !== false, price, sort, home_logo: logoOf(b.home_logo), away_logo: logoOf(b.away_logo), access_mode: b.access_mode === undefined ? undefined : modeOf(b.access_mode, price),
  };
}

adminRouter.get('/', ah(async (req, res) => {
  const r = await query(`SELECT ${COLS} FROM matches m LEFT JOIN channels c ON c.id=m.channel_id ORDER BY m.sort_order, m.kickoff_at DESC LIMIT 200`);
  res.json({ matches: r.rows });
}));

adminRouter.post('/', ah(async (req, res) => {
  const v = parseBody(req.body || {});
  if (v.channel && !(await query('SELECT 1 FROM channels WHERE id=$1', [v.channel])).rowCount) throw httpErr(400, 'Channel haipo.');
  const r = await query('INSERT INTO matches(home_team,away_team,league,kickoff_at,channel_id,active,price,sort_order,home_logo,away_logo,access_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    [v.home, v.away, v.league, v.kickoff, v.channel, v.active, v.price, v.sort, v.home_logo ?? '', v.away_logo ?? '', v.access_mode ?? 'FREE']);
  await attachChannel(r.rows[0].id, v.channel);
  await audit(req, 'match.create', 'match', r.rows[0].id, { home: v.home, away: v.away, price: v.price });
  res.status(201).json({ id: r.rows[0].id });
}));

adminRouter.patch('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const v = parseBody(req.body || {});
  if (v.channel && !(await query('SELECT 1 FROM channels WHERE id=$1', [v.channel])).rowCount) throw httpErr(400, 'Channel haipo.');
  const r = await query('UPDATE matches SET home_team=$2, away_team=$3, league=$4, kickoff_at=$5, channel_id=$6, active=$7, price=$8, sort_order=$9, home_logo=COALESCE($10,home_logo), away_logo=COALESCE($11,away_logo), access_mode=COALESCE($12,access_mode) WHERE id=$1 RETURNING id',
    [id, v.home, v.away, v.league, v.kickoff, v.channel, v.active, v.price, v.sort, v.home_logo ?? null, v.away_logo ?? null, v.access_mode ?? null]);
  if (!r.rowCount) throw httpErr(404, 'Mechi haipatikani.');
  await attachChannel(id, v.channel);
  await audit(req, 'match.update', 'match', id, { home: v.home, away: v.away, price: v.price });
  res.json({ ok: true });
}));

adminRouter.delete('/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const mm = (await query('SELECT channel_id FROM matches WHERE id=$1', [id])).rows[0];
  await query('DELETE FROM matches WHERE id=$1', [id]);
  // Channel ya mechi (iliyotengwa kwa mechi hii) nayo inafutwa, isipokuwa ikiwa mechi nyingine bado inaitumia
  if (mm && mm.channel_id) await query('DELETE FROM channels WHERE id=$1 AND match_only=TRUE AND NOT EXISTS (SELECT 1 FROM matches WHERE channel_id=$1)', [mm.channel_id]);
  await audit(req, 'match.delete', 'match', id);
  res.json({ ok: true });
}));

module.exports = { publicRouter, adminRouter };
