// Mifumo ya malipo: ClickPesa na SonicPesa. Admin anachagua kwenye General Settings.
const { query } = require('./database');
const cp = require('./clickpesa');
const sp = require('./sonicpesa');
const fl = require('./fastlipa');

const PROVIDERS = { clickpesa: { name: 'ClickPesa' }, sonicpesa: { name: 'SonicPesa' }, fastlipa: { name: 'FastLipa' } };

async function isReady(p) {
  if (p === 'sonicpesa') return sp.configured();
  if (p === 'fastlipa') return fl.configured();
  return cp.configured();
}
// Mfumo uliochaguliwa ukiwa umesanidiwa; vinginevyo wa kwanza uliosanidiwa; vinginevyo ClickPesa
async function getActive() {
  const r = await query("SELECT value FROM site_settings WHERE key='payment_provider'");
  const p = r.rows[0] && r.rows[0].value && r.rows[0].value.provider;
  if (PROVIDERS[p] && (await isReady(p))) return p;
  for (const q of Object.keys(PROVIDERS)) if (await isReady(q)) return q;
  return 'clickpesa';
}
async function setActive(p) {
  await query(`INSERT INTO site_settings(key,value,updated_at) VALUES('payment_provider',$1,now()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()`, [{ provider: p }]);
}
module.exports = { PROVIDERS, getActive, setActive, isReady };
