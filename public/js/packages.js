const needLogin = () => { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); };
window.renderPackages = async (el) => {
  const { packages } = await api('/packages');
  const lay = ((window.site || {}).appearance || {}).packages_layout === 'list' ? 'list' : '';
  el.innerHTML = packages.length ? `<div class="pk ${lay}">${packages.map((p) => `<div class="card"><h3 style="margin:0">${esc(p.name)}</h3>
    <div class="price">${fmt(p.price)} TZS</div><div class="muted">Siku ${p.duration_days}</div><p>${esc(p.description || '')}</p>
    <ul class="feat"><li>Channel zote zimefunguliwa</li><li>Muda: siku ${p.duration_days}</li><li>Tazama popote kwenye simu, tablet na TV</li></ul>
    <button class="btn mt" data-buy="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}">Nunua</button></div>`).join('')}</div>` : '<p class="muted">Hakuna vifurushi kwa sasa.</p>';
  el.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
    if (!window.me) return needLogin();
    window.startPurchase(el, { package_id: Number(b.dataset.buy) }, b.dataset.name, b.dataset.price);
  }));
};
document.addEventListener('app:ready', async () => {
  if (document.body.dataset.page !== 'packages') return;
  $('#main').innerHTML = '<h2>Vifurushi</h2><div id="pk"></div><div id="pay"></div>';   // orodha ya "Lipia channel moja" imeondolewa
  renderPackages($('#pk'));
  const qp = new URLSearchParams(location.search), mid = Number(qp.get('match'));
  if (mid) {
    if (!window.me) return needLogin();
    window.startPurchase($('#pay'), { match_id: mid }, qp.get('name') || 'Mechi', Number(qp.get('price')) || 0);
    return;
  }
  const want = Number(new URLSearchParams(location.search).get('channel'));
  if (want && window.me) {
    try { const { offers } = await api('/channel-offers'); const o = offers.find((x) => x.id === want); if (o) window.startPurchase($('#pk'), { channel_id: o.id }, o.name, o.price); } catch (_) {}
  }
});
