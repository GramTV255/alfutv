// Ukurasa wa kategoria: channels zote za kategoria moja, zikiwa na ukubwa sawa na ukurasa wa nyumbani
(() => {
  const id = Number(new URLSearchParams(location.search).get('id'));
  const BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  document.addEventListener('app:ready', async () => {
    if (document.body.dataset.page !== 'category') return;
    const main = document.getElementById('main');
    try {
      const [chRes, { categories }] = await Promise.all([api('/channels'), api('/channel-categories')]);
      const subbed = !!chRes.subscribed;
      const cat = categories.find((k) => k.id === id);
      const items = chRes.channels.filter((c) => c.category_id === id);
      const tile = (c) => {
        const locked = c.access_type === 'PAID' && !subbed && !c.owned;
        const hue = (String(c.name).length * 47) % 360;
        return `<a class="chn ${locked ? 'locked' : ''}" href="/live-tv?ch=${c.id}">
          <span class="chn-logo" style="--h:${hue}">${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="" loading="lazy">` : `<b>${esc(String(c.name).charAt(0).toUpperCase())}</b>`}${locked ? `<span class="chn-lock">${LOCK}</span>` : ''}</span>
          <span class="chn-name">${esc(c.name)}</span></a>`;
      };
      main.innerHTML = `<div class="cat-top"><a class="cat-back" href="/" aria-label="Rudi nyuma">${BACK}</a><h1>${esc(cat ? cat.name : 'Kategoria')}</h1></div>
        ${items.length ? `<div class="grid">${items.map(tile).join('')}</div>` : '<p class="muted">Hakuna channels kwenye kategoria hii.</p>'}`;
    } catch (e) { main.textContent = e.message; }
  });
})();
