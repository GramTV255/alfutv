/* Landing page: a signed-in visitor never sees Ingia/Jisajili; "Anza sasa" goes to their own area. */
document.addEventListener('DOMContentLoaded', async () => {
  let me = null;
  try { me = await api('/api/auth/me', { noRedirect: true }); } catch (_) { me = null; }
  if (!me || !me.role) return;
  const home = me.role === 'ADMIN' ? '/admin' : '/dashboard';
  $$('[data-guest]').forEach((a) => a.classList.add('hidden'));
  const nav = $('#nav-me');
  if (nav) { nav.href = home; nav.innerHTML = `${icon(me.role === 'ADMIN' ? 'shield' : 'home')} ${me.role === 'ADMIN' ? 'Admin Panel' : 'Dashboard'}`; nav.classList.remove('hidden'); }
  const cta = $('#cta-start');
  if (cta) { cta.href = home; cta.innerHTML = `${icon('zap')} ${me.role === 'ADMIN' ? 'Fungua Admin Panel' : 'Nenda kwenye Dashboard'}`; }
});
