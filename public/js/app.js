/* Shared front-end helpers (no inline scripts anywhere: the CSP only allows files from this site) */
(function () {
  'use strict';

  // ---------- Icons (inline SVG, stroke style) ----------
  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3"/><path d="M16 7l3 3"/><path d="M14 9l2 2"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.8c2.4.6 4 2.3 4 5.2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    package: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 010 8.4M7.8 16.2a6 6 0 010-8.4"/><path d="M19.1 4.9a10 10 0 010 14.2M4.9 19.1a10 10 0 010-14.2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 01-12.4 7.4L3 20l1.2-5.4A8.4 8.4 0 1121 11.5z"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v6M14 10v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    refresh: '<path d="M21 12a9 9 0 01-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0118.5 5.8L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z"/><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><path d="M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
    file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  window.icon = (name, extra) => `<svg class="ico ${extra || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  // ---------- Helpers ----------
  window.$ = (s, r) => (r || document).querySelector(s);
  window.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  window.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.fmtMoney = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
  window.fmtDate = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  window.fmtDay = (d) => (d ? new Date(d).toLocaleDateString('sw-TZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  window.fmtRemaining = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `siku ${d}, saa ${h}`;
    if (h > 0) return `saa ${h}, dk ${m}`;
    return `dk ${m}, sek ${s}`;
  };
  const BADGES = {
    ACTIVE: ['ok', 'ACTIVE'], SUCCESS: ['ok', 'SUCCESS'], VALID: ['ok', 'VALID'],
    INACTIVE: ['warn', 'INACTIVE'], PENDING: ['warn', 'PENDING'], PROCESSING: ['warn', 'PROCESSING'], EXPIRED: ['bad', 'EXPIRED'],
    SUSPENDED: ['bad', 'SUSPENDED'], FAILED: ['bad', 'FAILED'], REVOKED: ['bad', 'REVOKED'], DISABLED: ['mute', 'DISABLED'],
    NONE: ['mute', 'NONE'], EMPTY: ['mute', 'EMPTY'], SUPERSEDED: ['mute', 'SUPERSEDED'],
  };
  window.badge = (s) => { const b = BADGES[s] || ['mute', s || '—']; return `<span class="badge ${b[0]}">${esc(b[1])}</span>`; };

  window.toast = (msg, type) => {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = `toast ${type || 'info'}`;
    t.innerHTML = `${icon(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info')}<div>${esc(msg)}</div>`;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 6500 : 4000);
  };

  window.copyText = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) { /* ignore */ } ta.remove();
    }
    toast('Imenakiliwa', 'ok');
    if (btn) { const o = btn.innerHTML; btn.innerHTML = icon('check') + ' Imenakiliwa'; setTimeout(() => (btn.innerHTML = o), 1500); }
  };

  // ---------- API ----------
  let csrf = null;
  window.setCsrf = (t) => { csrf = t; };
  window.api = async (path, opts) => {
    opts = opts || {};
    const headers = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    let res;
    try {
      res = await fetch(path, { method: opts.method || 'GET', headers, credentials: 'same-origin', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    } catch (_) { throw new Error('Hakuna mtandao. Angalia muunganisho wako.'); }
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok) {
      if (res.status === 401 && !opts.noRedirect && !/\/api\/auth\/(login|register|forgot|reset)/.test(path)) { location.href = '/login'; }
      const err = new Error((data && data.error) || `Hitilafu (${res.status})`);
      err.status = res.status; err.code = data && data.code; err.data = data;
      throw err;
    }
    return data;
  };

  // Loads the session; redirects when the role does not match this page.
  window.requireSession = async (role) => {
    try {
      const me = await api('/api/auth/me', { noRedirect: true });
      setCsrf(me.csrf);
      if (window.initProfile) initProfile(me);
      if (role && me.role !== role) { location.replace(me.role === 'ADMIN' ? '/admin' : '/dashboard'); return null; }
      return me;
    } catch (_) { location.replace('/login'); return null; }
  };
  // Profile button (top right): opens a small menu with the account details, change password and logout.
  window.initProfile = (me) => {
    const chip = $('.userchip');
    if (!chip || chip.dataset.ready) return;
    chip.dataset.ready = '1';
    chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0'); chip.setAttribute('aria-haspopup', 'menu'); chip.style.cursor = 'pointer';
    const isAdmin = me.role === 'ADMIN';
    let menu = null;
    const close = () => { if (menu) { menu.remove(); menu = null; } };
    const open = () => {
      if (menu) return close();
      menu = document.createElement('div');
      menu.className = 'profile-menu'; menu.setAttribute('role', 'menu');
      const initial = esc((me.full_name || '?').trim().charAt(0).toUpperCase());
      menu.innerHTML = `<div class="pm-banner"><div class="pm-avatar">${initial}</div>
          <div class="pm-id"><div class="pm-name">${esc(me.full_name)}</div><div class="pm-phone">${esc(me.phone_number)}</div></div>
          <span class="pm-role">${isAdmin ? 'ADMIN' : 'MTEJA'}</span></div>
        <div class="pm-since">${icon('clock')} Alijisajili ${esc(fmtDay(me.created_at))}</div>
        <div class="pm-list">
          ${isAdmin ? `<a class="pm-item" href="/admin" role="menuitem"><i>${icon('home')}</i><span>Dashboard ya admin</span></a>` : `<a class="pm-item" href="/dashboard" role="menuitem"><i>${icon('home')}</i><span>Dashboard</span></a>
          <a class="pm-item" href="/dashboard/security" role="menuitem"><i>${icon('shield')}</i><span>Akaunti na usalama</span></a>`}
          <button class="pm-item" type="button" id="pm-pw" role="menuitem"><i>${icon('lock')}</i><span>Badilisha password</span></button>
          <a class="pm-item" href="/docs" role="menuitem"><i>${icon('book')}</i><span>API Docs</span></a>
        </div>
        <button class="pm-item pm-out" type="button" id="pm-out" role="menuitem"><i>${icon('logout')}</i><span>Toka</span></button>`;
      document.body.appendChild(menu);
      const r = chip.getBoundingClientRect();
      menu.style.top = `${r.bottom + 10}px`; menu.style.right = `${Math.max(10, window.innerWidth - r.right)}px`;
      menu.querySelector('#pm-out').onclick = () => logout();
      menu.querySelectorAll('a.pm-item').forEach((a) => a.addEventListener('click', close));
      menu.querySelector('#pm-pw').onclick = () => { close(); passwordModal(); };
    };
    const passwordModal = () => {
      const m = openModal(`<h3>${icon('lock')} Badilisha password</h3>
        <div class="field"><label>Password ya sasa</label><input class="input" type="password" id="pw0" autocomplete="current-password"></div>
        <div class="field"><label>Password mpya</label><input class="input" type="password" id="pw1" autocomplete="new-password"><div class="hint">Angalau herufi 8, ikiwa na herufi na namba.</div></div>
        <div class="field"><label>Thibitisha password mpya</label><input class="input" type="password" id="pw2" autocomplete="new-password"></div>
        <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="pw-save">Hifadhi</button></div>`);
      m.$('#pw-save').onclick = () => withBusy(m.$('#pw-save'), async () => {
        try {
          const r = await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: m.$('#pw0').value, newPassword: m.$('#pw1').value, confirmPassword: m.$('#pw2').value } });
          if (r.csrf) setCsrf(r.csrf);
          m.close(); toast('Password imebadilishwa', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      });
    };
    chip.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', close);
  };

  window.logout = async () => { try { await api('/api/auth/logout', { method: 'POST', noRedirect: true }); } catch (_) { /* ignore */ } location.href = '/login'; };

  // Path router (no #hash): base='/admin', map={ '': 'dashboard', users: 'users', ... } -> view name from the URL
  window.makeRouter = (base, map, onChange) => {
    const views = Object.values(map);
    const current = () => {
      const p = location.pathname.replace(/\/+$/, '');
      const key = p === base ? '' : p.startsWith(base + '/') ? p.slice(base.length + 1) : '';
      return map[key] || views[0];
    };
    const hrefOf = (view) => { const k = Object.keys(map).find((x) => map[x] === view); return k ? `${base}/${k}` : base; };
    // old bookmarks like /dashboard#plans
    const legacy = (location.hash || '').slice(1);
    if (legacy && views.includes(legacy)) history.replaceState(null, '', hrefOf(legacy));
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const h = a.getAttribute('href');
      if (h !== base && !h.startsWith(base + '/')) return;
      e.preventDefault();
      if (h !== location.pathname) history.pushState(null, '', h);
      onChange();
    });
    window.addEventListener('popstate', onChange);
    return { current, hrefOf };
  };

  // WhatsApp glyph (filled)
  window.waIcon = () => '<svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M16.04 3C9.4 3 4 8.4 4 15.03c0 2.12.55 4.18 1.6 6L4 29l8.17-1.57A12 12 0 0016.04 27C22.67 27 28 21.6 28 14.97 28 8.4 22.67 3 16.04 3zm0 21.96c-1.8 0-3.55-.48-5.08-1.4l-.36-.22-4.85.93.98-4.72-.24-.38A9.9 9.9 0 016.1 15c0-5.46 4.46-9.9 9.94-9.9 5.45 0 9.9 4.44 9.9 9.9 0 5.5-4.45 9.96-9.9 9.96zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.78-1.66-2.08-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/></svg>';

  // Busy-state button helper
  window.withBusy = async (btn, fn) => {
    if (btn.disabled) return;
    const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  };

  // ---------- Modal ----------
  window.openModal = (html, { wide } = {}) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => back.remove();
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
    document.body.appendChild(back);
    $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
    const first = $('input, select, textarea', back); if (first) first.focus();
    return { el: back, close, $: (s) => $(s, back) };
  };
  window.confirmBox = (title, text, okLabel, danger) => new Promise((resolve) => {
    const m = openModal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cf-ok">${esc(okLabel || 'Endelea')}</button></div>`);
    m.$('#cf-ok').addEventListener('click', () => { m.close(); resolve(true); });
    m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.hasAttribute('data-close')) resolve(false); });
  });

  // ---------- Theme ----------
  const applyTheme = (t) => { document.documentElement.setAttribute('data-theme', t); };
  let saved = null; try { saved = localStorage.getItem('theme'); } catch (_) { /* ignore */ }
  applyTheme(saved || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  window.toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next); try { localStorage.setItem('theme', next); } catch (_) { /* ignore */ }
    $$('[data-theme-btn]').forEach((b) => (b.innerHTML = icon(next === 'light' ? 'moon' : 'sun')));
  };
  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-theme-btn]').forEach((b) => {
      b.innerHTML = icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun');
      b.addEventListener('click', toggleTheme);
      b.setAttribute('aria-label', 'Badilisha theme');
    });
    $$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.getAttribute('data-icon')) + (el.hasAttribute('data-icon-gap') ? ' ' : '')); });
    $$('[data-logout]').forEach((b) => b.addEventListener('click', logout));
    // mobile sidebar
    const sb = $('.sidebar'), scrim = $('.scrim');
    $$('.menu-btn').forEach((b) => b.addEventListener('click', () => { sb.classList.toggle('open'); scrim.classList.toggle('show'); }));
    if (scrim) scrim.addEventListener('click', () => { sb.classList.remove('open'); scrim.classList.remove('show'); });
    // copy buttons in static docs
    $$('[data-copy-target]').forEach((b) => b.addEventListener('click', () => copyText($(b.getAttribute('data-copy-target')).textContent, b)));
  });
})();
