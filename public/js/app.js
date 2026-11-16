window.$ = (s, r = document) => r.querySelector(s);
window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.fmt = (n) => new Intl.NumberFormat('sw-TZ').format(n || 0);
window.fdate = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
window.api = async (path, opts = {}) => {
  const o = { method: opts.method || 'GET', headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  if (window.UI) UI.start();
  try {
    const r = await fetch('/api' + path, o);
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.error || 'Hitilafu'); e.status = r.status; e.data = j; throw e; }
    return j;
  } finally { if (window.UI) UI.end(); }
};
window.applyTheme = (t, a) => {
  const s = document.documentElement.style;
  const m = window.themeVars ? window.themeVars(t) : {};
  if (t.mode === 'light') Object.assign(m, { '--bg': '#f3f3f8', '--text': '#15151f', '--secondary': '#ffffff', '--header': '#ffffff', '--nav': '#ffffff', '--muted': '#5d5d6b' });
  if (t.mode === 'dark') Object.assign(m, { '--bg': '#0b0b12', '--text': '#f4f4f8', '--secondary': '#1b1b29', '--header': '#12121c', '--nav': '#12121c', '--muted': '#9a9aae' });
  Object.entries(m).forEach(([k, v]) => v && s.setProperty(k, v));
  if (a) { s.setProperty('--logo', a.logo_size + 'px'); s.setProperty('--cols', a.columns); }
};
window.me = null;
window.loadMe = async () => { try { window.me = (await api('/auth/me')).user; } catch (_) { window.me = null; } return window.me; };
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  packages: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  matches: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 3v4M3.5 9.5l4.5.5M20.5 9.5l-4.5.5M7 19l1.5-3M17 19l-1.5-3"/>',
};
/* ---- Ukaguzi wa papo hapo channel ikibonyezwa ---- */
window.gate = (reason, id, offer, opts = {}) => {
  if (reason === 'match' && offer) {
    const old = $('#gm'); if (old) old.remove();
    const q = `/packages?match=${offer.match_id}&price=${offer.price}&name=${encodeURIComponent(offer.title || 'Mechi')}`;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="gm"><div class="mbox"><div class="mico">⚽</div>
      <h3>Lipia mechi hii</h3><p class="muted">${esc(offer.title || '')}<br>Bei: ${fmt(offer.price)} TZS. Baada ya malipo utaweza kuitazama mechi.</p>
      <div class="mact"><a class="btn" href="${q}">💳 Lipia TZS ${fmt(offer.price)}</a><button class="btn ghost" id="gx">Funga</button></div></div></div>`);
    $('#gx').onclick = () => $('#gm').remove(); $('#gm').onclick = (e) => { if (e.target.id === 'gm') $('#gm').remove(); };
    return;
  }
  const old = $('#gm'); if (old) old.remove();
  const login = reason === 'login', nxt = encodeURIComponent('/live-tv?ch=' + id);
  const one = offer ? `<a class="btn ghost" href="/packages?channel=${id}">Lipia channel hii • ${fmt(offer.price)} TZS / siku ${offer.days}</a>` : '';
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="gm"><div class="mbox"><div class="mico">${login ? '🔐' : '💎'}</div>
    <h3>${login ? 'Ingia kuendelea' : 'Unahitaji kifurushi'}</h3>
    <p class="muted">${login ? 'Ingia au jisajili, kisha chagua kifurushi ili kutazama channel hii.' : 'Nunua kifurushi ufungue channel zote' + (offer ? ', au lipia channel hii peke yake.' : '.')}</p>
    <div class="mact">${login ? `<a class="btn" href="/login?next=${nxt}">Ingia</a><a class="btn ghost" href="/register?next=${nxt}">Jisajili</a>` : `<a class="btn" href="/packages">Angalia vifurushi</a>${one}`}<button class="btn ghost" id="gx">Funga</button></div></div></div>`);
  const close = () => { const e = $('#gm'); if (e) e.remove(); if (opts.onClose) opts.onClose(); };
  $('#gx').onclick = close; $('#gm').onclick = (e) => { if (e.target.id === 'gm') close(); };
};
window.openChannel = async (id) => {
  try { const r = await api(`/channels/${id}/access`); if (r.allowed) location.href = '/live-tv?ch=' + id; else gate(r.reason, id, r.offer); }
  catch (e) { alert(e.message); }
};
window.banner = (n) => {
  const el = document.createElement('div');
  el.className = 'nbanner';
  el.innerHTML = `<span class="nb-ic">🔔</span><div class="nb-t"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div><button class="nb-x" aria-label="Funga">✕</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.onclick = (e) => { if (e.target.closest('.nb-x')) return; el.remove(); window.openNotes(); };
  el.querySelector('.nb-x').onclick = (e) => { e.stopPropagation(); el.remove(); };
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6500);
};
window.askNotifPerm = () => {
  if (!('Notification' in window) || Notification.permission !== 'default' || localStorage.getItem('notif-asked')) return;
  const el = document.createElement('div');
  el.className = 'nbanner ask';
  el.innerHTML = `<span class="nb-ic">🔔</span><div class="nb-t"><b>Ruhusu arifa?</b><span>Pata taarifa za ofa, vifurushi na matangazo papo hapo.</span><div class="nb-btns"><button class="btn sm" id="nok">Ruhusu</button><button class="btn sm ghost" id="nlater">Baadaye</button></div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.querySelector('#nok').onclick = async () => {
    localStorage.setItem('notif-asked', '1'); el.remove();
    try { const p = await Notification.requestPermission(); if (p === 'granted') window.banner({ title: 'Arifa zimewashwa ✅', body: 'Utapata taarifa mpya hapa.' }); } catch (_) {}
  };
  el.querySelector('#nlater').onclick = () => { localStorage.setItem('notif-asked', '1'); el.remove(); };
};
window.sysNotify = async (n) => {
  const opts = { body: n.body, icon: '/assets/logo.png', badge: '/assets/logo.png', tag: 'n' + n.id, data: { url: '/' } };
  try { const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()); if (reg) return reg.showNotification(n.title, opts); } catch (_) {}
  try { new Notification(n.title, opts); } catch (_) {}
};
window.initNotifs = () => {
  if (!('Notification' in window) || !window.me) return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.askNotifPerm();
  const key = 'nid:' + window.me.id;
  let last = Number(localStorage.getItem(key) || 0);
  const tick = async () => {
    let r; try { r = await api('/notifications'); } catch (_) { return; }
    const items = r.items || [];
    if (!last && items.length) { last = Math.max(...items.map((n) => n.id)); localStorage.setItem(key, last); return; }
    const fresh = items.filter((n) => !n.is_read && n.id > last).sort((a, b) => a.id - b.id);
    for (const n of fresh) {
      last = Math.max(last, n.id);
      if (Notification.permission === 'granted') window.sysNotify(n);
      if (!document.hidden || Notification.permission !== 'granted') window.banner(n);
    }
    if (fresh.length) localStorage.setItem(key, last);
    if (window.refreshBadge) window.refreshBadge();
  };
  tick(); setInterval(() => { if (!document.hidden) tick(); }, 30000);
};
window.refreshBadge = async () => {
  try { const r = await api('/notifications'); const b = $('#nbadge'); if (b) { b.hidden = !r.unread; b.textContent = r.unread > 9 ? '9+' : r.unread; } } catch (_) {}
};
window.openNotes = async () => {
  if ($('#nsheet')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="nsheet" id="nsheet"><div class="nsh-bg" id="nsbg"></div><div class="nsh-box">
    <div class="nsh-head"><div><b>Arifa</b><div class="muted" id="nsn" style="font-size:.74rem"></div></div><div style="display:flex;gap:8px"><button class="ib2" id="nall" title="Soma zote">✓</button><button class="ib2" id="nx" title="Funga">✕</button></div></div>
    <div class="nsh-list" id="nlist"><div class="muted" style="padding:16px">Inapakia…</div></div></div></div>`);
  const close = () => { const e = $('#nsheet'); if (e) e.remove(); };
  $('#nx').onclick = close; $('#nsbg').onclick = close;
  const draw = (r) => {
    $('#nsn').textContent = r.unread ? r.unread + ' hazijasomwa' : 'Zote umeshazisoma';
    $('#nlist').innerHTML = r.items.length ? r.items.map((n) => `<button class="nitem ${n.is_read ? '' : 'un'}" data-id="${n.id}"><span class="nic">🔔</span><span class="nbody"><b>${esc(n.title)}</b><span>${esc(n.body)}</span><small>${fdate(n.created_at)}</small></span>${n.is_read ? '' : '<i class="ndot"></i>'}</button>`).join('') : '<div class="muted" style="padding:20px;text-align:center">Hakuna arifa bado.</div>';
    document.querySelectorAll('#nlist .nitem').forEach((b) => (b.onclick = async () => { if (b.classList.contains('un')) { b.classList.remove('un'); b.querySelector('.ndot')?.remove(); await api('/notifications/' + b.dataset.id + '/read', { method: 'POST' }).catch(() => {}); window.refreshBadge(); } }));
  };
  try { draw(await api('/notifications')); } catch (e) { $('#nlist').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  $('#nall').onclick = async () => { await api('/notifications/read-all', { method: 'POST' }).catch(() => {}); draw(await api('/notifications')); window.refreshBadge(); };
};
window.openSearch = async () => {
  if ($('#so')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="so" id="so"><div class="sobar"><input id="sq" placeholder="Tafuta channel…" autocomplete="off"><button class="ib2" id="sx" aria-label="Funga">✕</button></div><div class="sres" id="sr"><div class="muted" style="padding:14px">Inapakia…</div></div></div>`);
  const close = () => { const e = $('#so'); if (e) e.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey); $('#sx').onclick = close;
  if (!window._chs) { try { const r = await api('/channels'); window._chs = r.channels; window._sub = r.subscribed; } catch (_) { window._chs = []; } }
  const draw = (q) => {
    const list = window._chs.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)).slice(0, 40);
    $('#sr').innerHTML = list.length ? list.map((c) => `<button class="sit" data-id="${c.id}"><span class="sico" style="--h:${chHue(c.name)}">${chLogo(c)}</span><div><b>${esc(c.name)}</b><div class="muted">${esc(c.category || '')}</div></div>${c.access_type === 'PAID' && !window._sub && !c.owned ? `<span class="sit-lock">${LOCK_SVG}</span>` : '<span class="go">▶</span>'}</button>`).join('') : '<div class="muted" style="padding:14px">Hakuna matokeo.</div>';
    document.querySelectorAll('.sit').forEach((b) => (b.onclick = () => openChannel(b.dataset.id)));
  };
  $('#sq').oninput = (e) => draw(e.target.value.trim().toLowerCase()); draw(''); $('#sq').focus();
};
(async () => {
  let site = {};
  try { site = await api('/site/settings'); } catch (_) {}
  window.site = site;
  if (site.theme) applyTheme(site.theme, site.appearance);
  const id = site.identity || {};
  document.title = (id.site_name || 'TV') + ' - ' + document.title;
  if (id.favicon) { const l = document.createElement('link'); l.rel = 'icon'; l.href = id.favicon; document.head.appendChild(l); }
  await loadMe();
  const page = document.body.dataset.page;
  // Admin akiwa tayari ameingia akifungua kurasa za user, anapelekwa moja kwa moja kwenye admin panel
  // (Alfu Store inabaki wazi kwa kuangalia)
  if (window.me && window.me.role === 'admin' && page !== 'download') {
    location.replace('/admin/dashboard');
    return;
  }
  if (page !== 'live' && page !== 'category') {   // Live TV na kategoria: hakuna header wala nav
    const hdr = $('#hdr');
    if (hdr) hdr.innerHTML = `<header class="top"><div class="bar">
      <a class="brand" href="/">${id.logo ? `<img src="${esc(id.logo)}" alt="">` : '<span class="logo-dot">▶</span>'}<span>${esc(id.site_name || 'TV')}</span></a>
      <div class="hdr-acts"><a class="ib2 hbtn" href="/store" aria-label="Alfu Store" title="Alfu Store">${window.SVG ? window.SVG.store : ''}</a>${window.me ? `<button class="ib2 hbtn" id="nbtn" aria-label="Arifa" title="Arifa"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="nbadge" id="nbadge" hidden></span></button>` : ''}<button class="ib2 hbtn" id="rbtn" aria-label="Refresh" title="Refresh"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg></button><button class="ib2 hbtn" id="sbtn" aria-label="Tafuta" title="Tafuta"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button></div></div></header>`;
    const sb = $('#sbtn'); if (sb) sb.onclick = () => window.openSearch();
    const nb = $('#nbtn'); if (nb) { nb.onclick = () => window.openNotes(); window.refreshBadge(); setInterval(() => { if (!document.hidden) window.refreshBadge(); }, 60000); }
    window.initNotifs();
    const rb = $('#rbtn'); if (rb) rb.onclick = () => { rb.classList.add('spin'); if (window.UI) UI.nav('Inaonyesha upya…'); setTimeout(() => location.reload(), 180); };
    const items = [['/', 'Home', 'home'], ['/packages', 'Packages', 'packages'], ['/profile', 'Profile', 'profile']];
    document.body.classList.add('has-nav');
    document.body.insertAdjacentHTML('beforeend', `<nav class="bnav">${items.map((n) => `<a href="${n[0]}" class="${n[2] === page ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n[2]]}</svg>${n[1]}</a>`).join('')}</nav>`);
    const g = site.general || {};
    if (g.whatsapp_number) document.body.insertAdjacentHTML('beforeend', `<a class="wa" href="https://wa.me/${esc(g.whatsapp_number)}?text=${encodeURIComponent(g.whatsapp_message || '')}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.46 3.49A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42z"/></svg></a>`);
    api('/matches').then((r) => {   // kitufe cha Mechi kinaonekana kwa wote, wakiwa wameingia au la
      const nav = $('.bnav');
      if (!nav || !(r.matches || []).length || nav.querySelector('[data-mech]')) return;
      const a = document.createElement('a');
      a.href = '/matches'; a.setAttribute('data-mech', '1');
      if (page === 'matches') a.classList.add('on');
      a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.matches}</svg>Mechi`;
      (nav.children[0] || nav.firstChild) && nav.children[0].after(a);
    }).catch(() => {});
    const f = site.footer || {}, ftr = $('#ftr');
    const links = `${f.privacy_url ? `<a href="${esc(f.privacy_url)}"><u>Privacy</u></a> ` : ''}${f.terms_url ? `<a href="${esc(f.terms_url)}"><u>Terms</u></a> ` : ''}${(f.links || []).map((l) => `<a href="${esc(l.url)}"><u>${esc(l.label)}</u></a> `).join('')}`;
    if (ftr && (f.contact || links.trim())) ftr.innerHTML = `<footer class="foot" style="text-align:center;color:var(--muted);font-size:.8rem;padding:10px 16px 24px">${f.contact ? `<div>${esc(f.contact)}</div>` : ''}${links.trim() ? `<div>${links}</div>` : ''}</footer>`;
  }
  // WhatsApp kwenye ukurasa wa kategoria (ukurasa huu hauna kichwa wala nav)
  if (page === 'category') { const g = site.general || {}; if (g.whatsapp_number) document.body.insertAdjacentHTML('beforeend', `<a class="wa" href="https://wa.me/${esc(g.whatsapp_number)}?text=${encodeURIComponent(g.whatsapp_message || '')}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.46 3.49A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42z"/></svg></a>`); }
  document.dispatchEvent(new Event('app:ready'));
})();

// Kitufe cha "Fungua kwenye app": Android (intent) na iPhone (link ya App Store)
document.addEventListener('app:ready', async () => {
  const page = document.body.dataset.page;
  if (page === 'live' || page === 'category' || page === 'admin') return;
  if (sessionStorage.getItem('oapp_x')) return;
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (!isAndroid && !isIOS) return;
  let cfg = {};
  try { cfg = await fetch('/api/app-links', { credentials: 'same-origin' }).then((r) => r.json()); } catch (_) { return; }
  let href = '';
  if (isAndroid && cfg.android_package) {
    const u = new URL(location.href);
    href = 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;package=' + cfg.android_package + ';S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
  } else if (isIOS && cfg.ios_app_url) {
    href = cfg.ios_app_url;
  }
  if (!href) return;
  const bar = document.createElement('div');
  bar.className = 'oapp';
  bar.innerHTML = '<span>Fungua kwenye app yetu kwa uzoefu bora</span><a class="btn sm" href="' + href.replace(/"/g, '&quot;') + '">Fungua app</a><button class="oapp-x" aria-label="Funga">✕</button>';
  document.body.appendChild(bar);
  bar.querySelector('.oapp-x').onclick = () => { sessionStorage.setItem('oapp_x', '1'); bar.remove(); };
});
