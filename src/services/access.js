// Ukaguzi mmoja wa ufikiaji wa channel: mechi yenye bei, channel ya bure, au kifurushi/malipo ya mteja
const { query } = require('../config/database');
const subs = require('./subscription-service');

async function allowed(uid, channelId) {
  const c = (await query('SELECT access_type, match_only FROM channels WHERE id=$1', [channelId])).rows[0];
  if (!c) return false;
  const live = await subs.activeMatchFor(channelId);
  if (live) {
    if (live.access_mode === 'FREE' || (!live.access_mode && live.price === 0)) return true;
    if (live.access_mode === 'PACKAGE') return !!uid && (await subs.hasActiveSub(uid));   // mechi ya vifurushi: mteja ana kifurushi
    return !!uid && ((await subs.hasActiveSub(uid)) || (await subs.hasMatchAccess(uid, live.id)));
  }
  if (c.match_only) return !!uid && (await subs.canWatch(uid, channelId));   // channel ya mechi nje ya muda: kifurushi tu
  if (c.access_type === 'FREE') return true;
  return !!uid && (await subs.canWatch(uid, channelId));
}
module.exports = { allowed };
