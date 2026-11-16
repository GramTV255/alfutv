(() => {
  const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let pending = 0, hideT = null;
  function mount() {
    if (document.getElementById('uiBar')) return;
    document.body.insertAdjacentHTML('beforeend', '<div id="uiBar"><i></i></div><div id="uiPill"><span class="uisp"></span><span id="uiTxt">Inapakia…</span></div>');
  }
  const show = (txt) => { mount(); document.documentElement.classList.add('ui-busy'); const t = document.getElementById('uiTxt'); if (t) t.textContent = txt || 'Inapakia…'; };
  const hide = () => document.documentElement.classList.remove('ui-busy');
  window.UI = {
    start() { pending++; clearTimeout(hideT); show(); },
    end() { pending = Math.max(0, pending - 1); if (!pending) { clearTimeout(hideT); hideT = setTimeout(() => { if (!pending) hide(); }, 300); } },
    nav(txt) { show(txt || 'Inapakia ukurasa…'); },
    get pending() { return pending; },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a[href]');
    if (!el || el.disabled || el.closest('#stage, [data-noload]') || el.classList.contains('noload') || el.matches('.hs-nav, .hs-seg, .chip, input')) return;
    if (el.tagName === 'A') {
      const h = el.getAttribute('href') || '';
      if (!h || h.startsWith('#') || el.target === '_blank' || /^(mailto:|tel:|javascript:|https?:\/\/wa\.me)/.test(h) || e.ctrlKey || e.metaKey) return;
      UI.nav(); el.classList.add('is-loading'); setTimeout(() => el.classList.remove('is-loading'), 5000); return;
    }
    el.classList.add('is-loading'); show('Inapakia…');
    const done = () => { el.classList.remove('is-loading'); if (!pending) { clearTimeout(hideT); hideT = setTimeout(() => { if (!pending) hide(); }, 200); } };
    setTimeout(() => {
      if (!pending) return done();
      const iv = setInterval(() => { if (!pending) { clearInterval(iv); done(); } }, 120);
      setTimeout(() => { clearInterval(iv); done(); }, 25000);
    }, 500);
  }, true);
  document.addEventListener('error', (e) => {
    const t = e.target; if (!t || t.tagName !== 'IMG') return;
    if (t.dataset.fb) { const b = document.createElement('b'); b.textContent = t.dataset.fb; t.replaceWith(b); }
    else if (t.dataset.hide !== undefined) t.hidden = true;
  }, true);
  window.LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  window.chHue = (name) => { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  window.chLogo = (c) => { const l = (String(c.name || '?').trim().charAt(0) || '?').toUpperCase(); return c.logo_url ? `<img src="${E(c.logo_url)}" alt="" loading="lazy" data-fb="${E(l)}">` : `<b>${E(l)}</b>`; };
})();
(() => {
  const P = {
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V6M18 17v-9"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-4.5-4.5L5 21"/>',
    tv: '<rect x="2" y="6" width="20" height="14" rx="3"/><path d="m8 2 4 4 4-4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    package: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.3c1.8.7 3 2.4 3 4.7"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="3"/><path d="M16 13h2M2 10h18"/><path d="M5 6V5a2 2 0 0 1 2-2h10"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    plug: '<path d="M9 2v5M15 2v5"/><path d="M6 7h12v3a6 6 0 0 1-12 0Z"/><path d="M12 16v6"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.4-.5-.7-.5-1.1 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8.7-9-8.7Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2.5"/><path d="M8 21h8M12 17v4"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    footer: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15h18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    play: '<path d="M7 4.5v15l13-7.5Z"/>',
    pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    eyeoff: '<path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a18 18 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M16 7l3 3"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    xc: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    hourglass: '<path d="M6 2h12M6 22h12"/><path d="M7 2v4a5 5 0 0 0 2 4l3 2-3 2a5 5 0 0 0-2 4v4M17 2v4a5 5 0 0 1-2 4l-3 2 3 2a5 5 0 0 1 2 4v4"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20M9 3 7 9l5 12M15 3l2 6-5 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    volx: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    signal: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="2"/>', ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 3v4M3.5 9.5l4.5.5M20.5 9.5l-4.5.5M7 19l1.5-3M17 19l-1.5-3"/>', calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>', link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>', chevup: '<path d="m6 15 6-6 6 6"/>', chevl: '<path d="m15 18-6-6 6-6"/>', chevr: '<path d="m9 18 6-6-6-6"/>', check: '<path d="m5 12 5 5L20 7"/>',
  };
  const FILLED = new Set(['play', 'pause']);
  const MAP = { '📊': 'chart', '🖼': 'image', '📺': 'tv', '🗂': 'layers', '📦': 'package', '👥': 'users', '🔁': 'repeat', '💳': 'card', '💸': 'wallet', '📈': 'trend', '🔌': 'plug', '🏷': 'tag', '🎨': 'palette', '🖥': 'monitor', '🏠': 'home', '🦶': 'footer', '⚙': 'gear', '🛡': 'shield', '🔍': 'search', '🔎': 'search', '▶': 'play', '⏸': 'pause', '✕': 'x', '✗': 'x', '☰': 'menu', '➕': 'plus', '＋': 'plus', '✏': 'pencil', '🙈': 'eyeoff', '👁': 'eye', '🗑': 'trash', '💾': 'save', '🔑': 'key', '⭐': 'star', '💰': 'money', '✅': 'checkc', '⏳': 'clock', '❌': 'xc', '⌛': 'hourglass', '🧾': 'receipt', '🔐': 'lock', '🔒': 'lock', '💎': 'gem', '⚠': 'alert', '🔄': 'refresh', '↻': 'refresh', '📱': 'phone', '📤': 'upload', '☀': 'sun', '🌙': 'moon', '⛔': 'ban', '🔊': 'vol', '🔇': 'volx', '🚪': 'logout', '⌃': 'chevup', '‹': 'chevl', '›': 'chevr', '✓': 'check', '⚡': 'zap', '👤': 'user', '📡': 'signal', '🔗': 'link', '🔔': 'bell', '⚽': 'ball', '📅': 'calendar' };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map(esc).join('|');
  const RE_G = new RegExp('(?:' + keys + ')\\uFE0F?', 'gu'), RE_T = new RegExp('(?:' + keys + ')', 'u');
  const SKIP = new Set(['OPTION', 'SELECT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'TITLE', 'NOSCRIPT', 'INPUT', 'CODE']);
  const svg = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  window.icon = (n) => `<span class="ico${FILLED.has(n) ? ' f' : ''}" aria-hidden="true">${svg(n)}</span>`;
  function convert(root) {
    if (!root || !root.nodeType) return;
    const nodes = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { const p = n.parentElement; return p && !SKIP.has(p.tagName) && RE_T.test(n.nodeValue) && !p.closest('[data-noicons]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((node) => {
      const text = node.nodeValue, frag = document.createDocumentFragment(); let last = 0;
      text.replace(RE_G, (m, off) => {
        frag.append(text.slice(last, off));
        const name = MAP[m.replace(/\uFE0F/g, '')], span = document.createElement('span');
        span.className = 'ico' + (FILLED.has(name) ? ' f' : ''); span.setAttribute('aria-hidden', 'true'); span.innerHTML = svg(name);
        frag.append(span); last = off + m.length; return m;
      });
      frag.append(text.slice(last)); node.replaceWith(frag);
    });
  }
  window.iconify = convert;
  convert(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => { if (n.nodeType === 1) convert(n); else if (n.nodeType === 3 && n.parentElement) convert(n.parentElement); });
      if (m.type === 'characterData' && m.target.parentElement) convert(m.target.parentElement);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
(() => {
  const ua = navigator.userAgent || '';
  const isTV = /[?&]tv=1/.test(location.search)
    || /Android TV|AFT[A-Z]|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|WebOS|CrKey|HbbTV|NetCast|VIERA|Roku|AppleTV/i.test(ua)
    || (matchMedia('(pointer: none)').matches && matchMedia('(hover: none)').matches);
  if (!isTV) return;
  document.documentElement.classList.add('tv');
  const SEL = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const shown = (el) => {
    if (el.closest('[hidden],[inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const candidates = () => {
    const layer = document.querySelector('.modal, #nsheet, #so');
    return [...(layer || document).querySelectorAll(SEL)].filter(shown);
  };
  let cur = null;
  const mark = (el) => { if (cur && cur !== el) cur.classList.remove('tvf'); cur = el; if (el) el.classList.add('tvf'); };
  const focusEl = (el) => { el.focus({ preventScroll: true }); mark(el); el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); };
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  document.addEventListener('focusin', (e) => mark(e.target));
  const move = (dir) => {
    const list = candidates();
    if (!list.length) return false;
    const from = list.includes(document.activeElement) ? document.activeElement : (cur && list.includes(cur) ? cur : null);
    if (!from) { focusEl(list[0]); return true; }
    const c = center(from);
    const horiz = dir === 'L' || dir === 'R';
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const e = center(el), dx = e.x - c.x, dy = e.y - c.y;
      const ok = dir === 'R' ? dx > 4 : dir === 'L' ? dx < -4 : dir === 'D' ? dy > 4 : dy < -4;
      if (!ok) continue;
      const main = horiz ? Math.abs(dx) : Math.abs(dy), cross = horiz ? Math.abs(dy) : Math.abs(dx);
      const s = main + cross * 2.2;          // kipendele cha mstari huo huo
      if (s < bs) { bs = s; best = el; }
    }
    if (!best) return false;
    focusEl(best);
    return true;
  };
  document.addEventListener('keydown', (e) => {
    const k = e.key, code = e.keyCode;
    const typing = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(e.target.type)));
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || code === 10009 || code === 461 || (k === 'Backspace' && !typing)) {
      const ov = document.querySelector('.modal, #nsheet, #so, .ch-drawer.active');
      if (ov) {
        e.preventDefault();
        const x = ov.querySelector('#gx, #nx, #sx, #drClose, .dr-x');
        if (x) x.click(); else ov.remove();
        return;
      }
      if (history.length > 1) { e.preventDefault(); history.back(); }
      return;
    }
    if (document.body.classList.contains('live')) return;
    const dir = k === 'ArrowLeft' ? 'L' : k === 'ArrowRight' ? 'R' : k === 'ArrowUp' ? 'U' : k === 'ArrowDown' ? 'D' : null;
    if (!dir) return;
    if (typing && (dir === 'L' || dir === 'R')) return;   // kishale ndani ya maandishi
    if (move(dir)) e.preventDefault();
  });
  const initFocus = () => {
    if (document.body.classList.contains('live')) return;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const first = candidates().find((el) => el.closest('#main, #root, .wrap'));
    if (first) focusEl(first);
  };
  document.addEventListener('app:ready', () => setTimeout(initFocus, 450));
  setTimeout(initFocus, 900);
})();

// Icons za kisasa (SVG za mstari) zinazotumika kote kwenye store na admin
window.SVG = (() => {
  const w = (d, extra) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${d}</svg>`;
  return {
    search: w('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    back: w('<path d="M15 18l-6-6 6-6"/>'),
    close: w('<path d="M6 6l12 12M18 6L6 18"/>'),
    download: w('<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>'),
    check: w('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    lock: w('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    cart: w('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>'),
    app: w('<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M12 8v8M8 12h8"/>'),
    star: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
    eye: w('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: w('<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 6 10 6a9.8 9.8 0 0 0 4.3-1"/>'),
    image: w('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 9"/>'),
    trash: w('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
    link: w('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    upload: w('<path d="M12 20V9"/><path d="M7 13.5l5-5 5 5"/><path d="M5 4h14"/>'),
    edit: w('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    phone: w('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    store: w('<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/>'),
  };
})();

// Rangi za theme: maandishi yanahesabiwa kulingana na background ili yasomeke kwenye kila theme
window.themeVars = (t = {}) => {
  const hex = (h, d) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : d);
  const lum = (c) => {
    const v = [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bg = hex(t.background, '#0b0b12'), sec = hex(t.secondary, '#1b1b29');
  const light = lum(bg) > 0.4;
  let text = hex(t.text, light ? '#15151f' : '#f4f4f8');
  if (cr(text, bg) < 4.5 || cr(text, sec) < 4.5) text = light ? '#15151f' : '#f4f4f8';
  const btn = hex(t.button, '#e50914');
  const btnText = cr('#ffffff', btn) >= cr('#111111', btn) ? '#ffffff' : '#111111';
  return {
    '--primary': hex(t.primary, '#e50914'), '--secondary': sec, '--accent': hex(t.accent, '#f5a623'),
    '--bg': bg, '--text': text, '--muted': light ? '#5b5b6e' : '#9a9aae',
    '--line': light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)',
    '--header': hex(t.header, bg), '--nav': hex(t.navigation, bg), '--btn': btn, '--btn-text': btnText,
  };
};
