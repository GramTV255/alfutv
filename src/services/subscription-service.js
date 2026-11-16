const { query } = require('../config/database');

// Muda wa kifurushi kipya unaongezwa kwenye muda uliobaki wa kifurushi chochote kilicho hai. payment_id UNIQUE inahakikisha mara moja tu.
async function activateForPayment(c, payment) {
  if (payment.app_release_id) {      // malipo ya app: ufikiaji wa app pekee, bila kugusa vifurushi
    const r = await c.query('INSERT INTO app_purchases(user_id,release_id,payment_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
      [payment.user_id, payment.app_release_id, payment.id]);
    if (r.rowCount) await c.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)', [payment.user_id, 'App imelipiwa', 'Sasa unaweza kuipakua app hiyo.']);
    return r.rowCount > 0;
  }
  if (payment.match_id) {            // malipo ya mechi: ufikiaji hadi dakika 150 baada ya kick-off
    const r = await c.query(`INSERT INTO match_purchases(user_id,match_id,start_date,end_date,payment_id)
      VALUES($1,$2,now(),(SELECT kickoff_at + interval '150 minutes' FROM matches WHERE id=$2),$3) ON CONFLICT (payment_id) DO NOTHING RETURNING id`,
      [payment.user_id, payment.match_id, payment.id]);
    if (r.rowCount) await c.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)', [payment.user_id, 'Malipo yamepokelewa', 'Mechi imefunguliwa. Ingia ukatazame.']);
    return r.rowCount > 0;
  }
  if (payment.channel_id) {            // malipo ya channel moja
    const ch = (await c.query('SELECT COALESCE(price_minutes, price_days*1440) AS mins FROM channels WHERE id=$1', [payment.channel_id])).rows[0];
    if (!ch) throw new Error('Channel missing');
    const cur = (await c.query("SELECT max(end_date) AS e FROM channel_purchases WHERE user_id=$1 AND channel_id=$2 AND status='ACTIVE' AND end_date>now()", [payment.user_id, payment.channel_id])).rows[0];
    const start = cur && cur.e ? cur.e : new Date();
    const r = await c.query(`INSERT INTO channel_purchases(user_id,channel_id,start_date,end_date,status,payment_id)
      VALUES($1,$2,$3,$3::timestamptz + ($4 || ' minutes')::interval,'ACTIVE',$5) ON CONFLICT (payment_id) DO NOTHING RETURNING id`,
      [payment.user_id, payment.channel_id, start, String(ch.mins), payment.id]);
    if (r.rowCount) await c.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)', [payment.user_id, 'Malipo yamepokelewa', 'Channel yako imefunguliwa.']);
    return r.rowCount > 0;
  }
  const pk = (await c.query('SELECT COALESCE(duration_minutes, duration_days*1440) AS mins FROM packages WHERE id=$1', [payment.package_id])).rows[0];
  if (!pk) throw new Error('Package missing');
  const cur = (await c.query(
    "SELECT max(end_date) AS e FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND end_date>now()", [payment.user_id])).rows[0];
  const start = cur && cur.e ? cur.e : new Date();
  const r = await c.query(
    `INSERT INTO subscriptions(user_id,package_id,start_date,end_date,status,payment_id)
     VALUES($1,$2,$3,$3::timestamptz + ($4 || ' minutes')::interval,'ACTIVE',$5)
     ON CONFLICT (payment_id) DO NOTHING RETURNING id`,
    [payment.user_id, payment.package_id, start, String(pk.mins), payment.id]);
  if (r.rowCount) {
    await c.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',
      [payment.user_id, 'Malipo yamepokelewa', 'Kifurushi chako kimewashwa.']);
  }
  return r.rowCount > 0;
}

// Mtumiaji mwenye kifurushi kinachofanya kazi anafungua channel ZOTE (Free + Premium)
async function hasActiveSub(userId) {
  const r = await query("SELECT 1 FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND end_date>now() LIMIT 1", [userId]);
  return r.rowCount > 0;
}

async function hasChannelAccess(userId, channelId) {
  const r = await query("SELECT 1 FROM channel_purchases WHERE user_id=$1 AND channel_id=$2 AND status='ACTIVE' AND end_date>now() LIMIT 1", [userId, channelId]);
  return r.rowCount > 0;
}
const canWatch = async (userId, channelId) => (await hasActiveSub(userId)) || (await hasChannelAccess(userId, channelId));
async function ownedChannelIds(userId) {
  const r = await query("SELECT channel_id FROM channel_purchases WHERE user_id=$1 AND status='ACTIVE' AND end_date>now()", [userId]);
  return new Set(r.rows.map((x) => x.channel_id));
}
async function listChannelPurchases(userId) {
  const r = await query(`SELECT cp.id, c.name AS channel_name, cp.start_date, cp.end_date,
      CASE WHEN cp.status='ACTIVE' AND cp.end_date<=now() THEN 'EXPIRED' ELSE cp.status END AS status
    FROM channel_purchases cp JOIN channels c ON c.id=cp.channel_id WHERE cp.user_id=$1 ORDER BY cp.end_date DESC`, [userId]);
  return r.rows;
}

async function hasAccess(userId, channelId) {   // eslint-disable-line no-unused-vars
  return hasActiveSub(userId);
}


async function accessibleChannelIds(userId) {
  const r = await query(
    `SELECT DISTINCT pc.channel_id FROM subscriptions s JOIN package_channels pc ON pc.package_id=s.package_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.end_date>now()`, [userId]);
  return new Set(r.rows.map((x) => x.channel_id));
}

async function listForUser(userId) {
  const r = await query(
    `SELECT s.id, s.package_id, p.name AS package_name, s.start_date, s.end_date,
            CASE WHEN s.status='ACTIVE' AND s.end_date<=now() THEN 'EXPIRED' ELSE s.status END AS status
     FROM subscriptions s JOIN packages p ON p.id=s.package_id
     WHERE s.user_id=$1 ORDER BY s.end_date DESC`, [userId]);
  return r.rows;
}

async function expireOld() {
  await query("UPDATE subscriptions SET status='EXPIRED' WHERE status='ACTIVE' AND end_date<=now()");
  await query("UPDATE channel_purchases SET status='EXPIRED' WHERE status='ACTIVE' AND end_date<=now()");
  await query("DELETE FROM channels WHERE match_only AND match_id IS NULL AND created_at < now() - interval '1 day'");
}

module.exports = { activateForPayment, hasChannelAccess, canWatch, ownedChannelIds, listChannelPurchases, hasActiveSub, hasAccess, accessibleChannelIds, listForUser, expireOld };

// Mechi yenye bei inayochezwa sasa hivi kwenye channel hii (dakika 30 kabla hadi 150 baada ya kick-off)
async function activeMatchFor(channelId) {
  const r = await query(`SELECT id,price,access_mode,home_team,away_team FROM matches WHERE channel_id=$1 AND active
    AND kickoff_at - interval '30 minutes' <= now() AND kickoff_at + interval '150 minutes' > now() ORDER BY kickoff_at LIMIT 1`, [channelId]);
  return r.rows[0] || null;
}
async function hasMatchAccess(userId, matchId) {
  const r = await query('SELECT 1 FROM match_purchases WHERE user_id=$1 AND match_id=$2 AND end_date>now() LIMIT 1', [userId, matchId]);
  return r.rowCount > 0;
}
module.exports.activeMatchFor = activeMatchFor;
module.exports.hasMatchAccess = hasMatchAccess;
