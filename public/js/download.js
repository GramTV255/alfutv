// Alfu Store: duka la apps (banners, sehemu, bei, malipo ya app, maoni), icons za SVG
(() => {
  const SV = window.SVG;
  const LABEL = { android: 'Android', ios: 'iOS', windows: 'Windows', mac: 'macOS', other: 'Nyingine' };
  const nf = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n || 0));
  const sz = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US');
  let S = { banners: [], tabs: [], sections: [], apps: [], total_downloads: 0 }, A = {}, TAB = '', SLIDE = 0, timer = null;
  const isAdmin = () => !!(window.me && window.me.role === 'admin');
  const locked = (r) => r.price > 0 && !r.owned;

  const stars = (n) => {
    const v = Number(n) || 0;
    return [1, 2, 3, 4, 5].map((i) => `<span class="gs-st ${v >= i ? 'on' : v >= i - 0.5 ? 'half' : ''}">${SV.star}</span>`).join('');
  };
  const appIcon = (r, cls) => `<div class="${cls}${r.has_logo ? ' has-logo' : ''}">${r.has_logo ? `<img src="/api/app-releases/${r.id}/logo" alt="">` : SV.app}</div>`;
  const dlBtn = (r, cls, label) => {
    const lab = label || (locked(r) ? SV.cart + '<span class="gs-pl">' + tzs(r.price) + '</span>' : 'Pakua');
    return `<button class="gs-dl ${cls || ''}${locked(r) ? ' is-buy' : ''}" data-dl="${r.id}" aria-label="${esc(r.title)}"><span class="gs-fill"></span><span class="gs-lbl">${lab}</span></button>`;
  };
  const top = (title, back) => `<header class="gs-top">${back ? `<a class="gs-back" href="#" aria-label="Rudi">${SV.back}</a>` : '<span class="gs-back gs-ghost"></span>'}<b>${title}</b><span class="gs-back gs-ghost"></span></header>`;

  const banner = (b, i) => {
    const r = A[b.release_id];
    return `<div class="gs-slide" data-rel="${b.release_id || ''}" style="background:${b.bg_color}" data-i="${i}">
      ${b.has_image ? `<img src="/api/app-store/banners/${b.id}/image" alt="">` : ''}
      <div class="gs-slide-t"><b>${esc(b.title)}</b>${b.subtitle ? `<span>${esc(b.subtitle)}</span>` : ''}${r ? `<em>${esc(r.title)}</em>` : ''}</div></div>`;
  };
  const bannersHTML = () => (S.banners.length ? `<div class="gs-slides" id="gs-slides">${S.banners.map(banner).join('')}</div>
      <div class="gs-dots">${S.banners.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : '');
  const tabsHTML = () => (S.tabs.length > 1 ? `<nav class="gs-tabs">${S.tabs.map((t) => `<button class="${t === TAB ? 'on' : ''}" data-tab="${esc(t)}">${esc(t)}</button>`).join('')}</nav>` : '');

  const rowCard = (r) => `<article class="gs-card" data-open="${r.id}">${appIcon(r, 'gs-card-ic')}
      <div class="gs-card-t"><b>${esc(r.title)}</b><span>${esc(r.developer || LABEL[r.platform] || r.platform)}</span></div>${dlBtn(r, 'gs-dl-sm', locked(r) ? tzs(r.price) : 'Pakua')}</article>`;
  const listRow = (r) => `<div class="gs-row" data-open="${r.id}">${appIcon(r, 'gs-row-ic')}
      <div class="gs-row-m"><b>${esc(r.title)}</b><span>${esc(r.developer || LABEL[r.platform] || r.platform)}</span>
        <small>${r.rating != null ? Number(r.rating).toFixed(1) + ' ★ • ' : ''}${sz(r.size)}</small></div>${dlBtn(r, 'gs-dl-ic', locked(r) ? tzs(r.price) : SV.download)}</div>`;

  const sectionsHTML = () => S.sections.filter((s) => s.tab === TAB).map((s) => {
    const apps = s.apps.map((id) => A[id]).filter(Boolean);
    return `<section class="gs-sec-b"><h2 class="gs-sec">${esc(s.title)}</h2>
      ${s.kind === 'list' ? `<div class="gs-list">${apps.map(listRow).join('')}</div>` : `<div class="gs-row-scroll">${apps.map(rowCard).join('')}</div>`}</section>`;
  }).join('');

  // Apps ambazo mtumiaji amelipia: anaweza kuzipakua wakati wowote akiwa ameingia
  const mineHTML = () => {
    if (!window.me) return '';
    const mine = S.apps.filter((a) => a.price > 0 && a.owned);
    return mine.length ? `<section class="gs-sec-b"><h2 class="gs-sec">Apps zangu <span>${mine.length}</span></h2><div class="gs-list">${mine.map(listRow).join('')}</div></section>` : '';
  };
  const homeView = () => top('Alfu Store', false) + `<div class="gs-search"><span>${SV.search}</span><input id="gs-q" placeholder="Tafuta app" autocomplete="off"></div>
    <div id="gs-res" class="gs-res" hidden></div>
    <div id="gs-body" class="gs-home">${bannersHTML()}${mineHTML()}${tabsHTML()}${sectionsHTML() || '<div class="gs-empty"><b>Hakuna apps kwenye sehemu hii</b></div>'}</div>`;

  const detailView = async (r) => {
    const [shots, rv] = await Promise.all([
      api('/app-releases/' + r.id + '/screenshots').then((x) => x.shots).catch(() => []),
      api('/app-store/apps/' + r.id + '/reviews').then((x) => x.reviews).catch(() => []),
    ]);
    const avg = r.rating != null ? Number(r.rating) : (rv.length ? rv.reduce((a, x) => a + Number(x.rating), 0) / rv.length : 0);
    const long = (r.notes || '').length > 140;
    return top(esc(r.title), true) + `<section class="gs-detail">
      <div class="gs-d-head">${appIcon(r, 'gs-d-ic')}<div class="gs-d-m"><h1>${esc(r.title)}</h1>
        <span class="gs-dev">${esc(r.developer || LABEL[r.platform] || r.platform)}</span>
        <div class="gs-d-tags">${r.category ? `<span class="gs-cat">#${esc(r.category)}</span>` : ''}${r.price > 0 ? `<span class="gs-price">${SV.lock}${tzs(r.price)}</span>` : '<span class="gs-cat">Bure</span>'}</div></div></div>
      <div class="gs-rate">${stars(avg)}<b>${avg ? avg.toFixed(1) : '—'}</b>${rv.length ? `<span class="muted">(${rv.length} maoni)</span>` : ''}</div>
      <div class="gs-stats"><div><b>${nf(r.download_count)}</b><span>Upakuaji</span></div><div><b>${sz(r.size)}</b><span>Ukubwa</span></div><div><b>${esc(r.version || '—')}</b><span>Toleo</span></div></div>
      ${shots.length ? `<div class="gs-shots">${shots.map((id) => `<img loading="lazy" alt="" src="/api/app-releases/screenshots/${id}">`).join('')}</div>` : ''}
      <h2 class="gs-sec">Maelezo</h2>
      <p class="gs-desc${long ? ' clip' : ''}" id="gsd">${r.notes ? esc(r.notes) : 'Hakuna maelezo kwa toleo hili.'}</p>
      ${long ? `<button class="gs-more" id="gsm" aria-label="Soma zaidi">⌄</button>` : ''}
      <h2 class="gs-sec">Ratings and reviews</h2>
      <div class="gs-reviews">
        <div class="gs-avg"><b>${avg ? avg.toFixed(1) : '—'}</b><div>${stars(avg)}</div><span class="muted">${rv.length} maoni</span></div>
        <div class="gs-rv-list">${rv.map((x) => `<div class="gs-rv"><div class="gs-rv-h"><b>${esc(x.author)}</b>${stars(x.rating)}</div>${x.body ? `<p>${esc(x.body)}</p>` : ''}</div>`).join('') || '<p class="muted">Bado hakuna maoni.</p>'}</div>
      </div>
      <div class="gs-bar">${dlBtn(r, 'gs-dl-big', locked(r) ? SV.cart + ' Lipia ' + tzs(r.price) : 'Pakua')}</div>
    </section>`;
  };

  const emptyView = () => top('Alfu Store', false) + '<div class="gs-empty"><b>Hakuna app inayopatikana kwa sasa</b><span>Rudi baadaye.</span></div>';
  const notFound = () => top('Alfu Store', true) + '<div class="gs-empty"><b>App haipatikani</b><span>Huenda imeondolewa au imefichwa.</span></div>';
  const adminPreview = (a) => top(esc(a.title), true) + `<section class="gs-detail">
      <div class="gs-admin-note ${a.active ? 'ok' : 'off'}">${a.active ? 'Inaonekana kwa watumiaji' : 'Imefichwa kwa watumiaji. Wewe tu (admin) unaiona.'}</div>
      <div class="gs-d-head">${appIcon(a, 'gs-d-ic')}<div class="gs-d-m"><h1>${esc(a.title)}</h1><span class="gs-dev">${esc(LABEL[a.platform] || a.platform)}${a.version ? ' • v' + esc(a.version) : ''}</span>
        <div class="gs-d-tags">${a.price > 0 ? `<span class="gs-price">${SV.lock}${tzs(a.price)}</span>` : '<span class="gs-cat">Bure</span>'}</div></div></div>
      <div class="gs-stats"><div><b>${nf(a.download_count)}</b><span>Upakuaji</span></div><div><b>${sz(a.size)}</b><span>Ukubwa</span></div><div><b>${a.shots}</b><span>Picha</span></div></div>
      <div class="gs-bar"><button class="gs-dl gs-dl-big" id="gs-show">${a.active ? SV.eyeOff + ' Ficha kwa watumiaji' : SV.eye + ' Onyesha kwa watumiaji'}</button></div>
    </section>`;

  // Kupakua kwa kuonyesha maendeleo kwenye kitufe chenyewe
  const download = async (r, b) => {
    if (b.dataset.busy) return;
    b.dataset.busy = '1';
    const fill = b.querySelector('.gs-fill'), lbl = b.querySelector('.gs-lbl');
    const label = lbl.innerHTML;
    b.classList.add('busy'); fill.style.width = '0%'; lbl.textContent = '0%';
    let done = false, needBuy = false;
    try {
      const res = await fetch('/api/app-releases/' + r.id + '/file', { credentials: 'same-origin' });
      if (res.status === 402) { needBuy = true; throw new Error('pay'); }
      if (!res.ok) throw new Error('x');
      const total = Number(res.headers.get('content-length')) || r.size || 0;
      const reader = res.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        parts.push(value); got += value.length;
        const p = total ? Math.min(99, Math.round((got / total) * 100)) : null;
        fill.style.width = (p === null ? 50 : p) + '%';
        lbl.textContent = p === null ? '…' : p + '%';
      }
      const blob = new Blob(parts, { type: res.headers.get('content-type') || 'application/octet-stream' });
      b._url = URL.createObjectURL(blob); b._name = r.file_name || 'app';
      r.download_count += 1;
      done = true;
      fill.style.width = '100%'; lbl.innerHTML = SV.check + ' Imepakuliwa';
      setTimeout(() => { b.classList.remove('busy'); fill.style.width = '0%'; lbl.innerHTML = 'Pakua'; delete b.dataset.busy; }, 1800);
    } catch (e) {
      if (needBuy) { openBuy(r); }
      else lbl.textContent = 'Jaribu tena';
    } finally {
      if (!done) setTimeout(() => { b.classList.remove('busy'); fill.style.width = '0%'; lbl.innerHTML = label; delete b.dataset.busy; }, 1400);
    }
  };
  // Kuhifadhi faili kwenye Downloads ya simu. Lazima ianzishwe na kugusa kwa mtumiaji (sio kiotomatiki)
  const openInstall = (b) => {
    if (!b._url) return;
    const a = document.createElement('a');
    a.href = b._url; a.download = b._name || 'app';
    document.body.appendChild(a); a.click(); a.remove();
  };

  // Kulipia app: karatasi tofauti na malipo ya vifurushi
  const setStep = (k) => document.querySelectorAll('#gs-steps i').forEach((x, i) => x.classList.toggle('on', i <= k));
  const closeBuy = () => { const s = document.querySelector('#gs-sheet'); if (s) s.remove(); };
  const openBuy = (r) => {
    closeBuy();
    if (!window.me) {
      // Hajaingia: mpeleke kuingia, kisha arudishwe kwenye app hii na karatasi ya malipo ifunguke
      location.href = '/login?next=' + encodeURIComponent('/store#app=' + r.id + '&buy=1');
      return;
    }
    const me = window.me;
    document.body.insertAdjacentHTML('beforeend', `<div class="gs-sheet-bg" id="gs-sheet"><div class="gs-sheet" role="dialog" aria-modal="true">
      <div class="gs-sheet-h"><div class="gs-sheet-app">${appIcon(r, 'gs-sheet-ic')}<div><b>${esc(r.title)}</b><span>${tzs(r.price)} • malipo ya mara moja</span></div></div>
        <button class="gs-x" id="gs-x" aria-label="Funga">${SV.close}</button></div>
      ${me ? `<div class="gs-steps" id="gs-steps"><i class="on">1</i><em></em><i>2</i><em></em><i>3</i></div>
        <label class="gs-lbl2">Namba ya Mobile Money</label>
        <div class="gs-field">${SV.phone}<input id="gs-phone" inputmode="tel" autocomplete="tel" value="${esc(me.phone || '')}" placeholder="07XXXXXXXX"></div>
        <div id="gs-msg" class="gs-msg" hidden></div>
        <button class="gs-pay" id="gs-go">Lipia ${tzs(r.price)}</button>
        <p class="gs-note">Utapokea ombi kwenye simu yako. Weka PIN kukamilisha malipo. Baada ya malipo app inafunguka kwa akaunti yako.</p>`
        : `<p class="gs-note">Ingia kwanza ili ulipie na kupakua app hii.</p><a class="gs-pay" href="/login">Ingia</a>`}
    </div></div>`);
    $('#gs-x').onclick = closeBuy;
    document.querySelector('#gs-sheet').onclick = (e) => { if (e.target.id === 'gs-sheet') closeBuy(); };
    if (!me) return;
    $('#gs-go').onclick = async () => {
      const phone = $('#gs-phone').value.replace(/[\s-]/g, ''), msg = $('#gs-msg');
      if (!/^(0[67]\d{8}|255[67]\d{8}|\+255[67]\d{8})$/.test(phone)) { msg.hidden = false; msg.className = 'gs-msg err'; msg.textContent = 'Weka namba sahihi ya Mobile Money.'; return; }
      msg.hidden = true; $('#gs-go').disabled = true; $('#gs-go').textContent = 'Inatuma…';
      try {
        const p = await api('/app-store/apps/' + r.id + '/buy', { method: 'POST', body: { phone } });
        setStep(1); $('#gs-go').textContent = 'Subiri PIN yako…';
        pollPay(p.id, r);
      } catch (e) {
        msg.hidden = false; msg.className = 'gs-msg err'; msg.textContent = e.message;
        $('#gs-go').disabled = false; $('#gs-go').textContent = 'Lipia ' + tzs(r.price);
      }
    };
  };
  const pollPay = (id, r) => {
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try {
        const { payment: p } = await api('/payments/' + id);
        if (p.status === 'COMPLETED') {
          clearInterval(t); r.owned = true; setStep(2);
          const m = $('#gs-msg'); if (m) { m.hidden = false; m.className = 'gs-msg ok'; m.textContent = 'Malipo yamekamilika. Sasa unaweza kupakua.'; }
          setTimeout(() => { closeBuy(); route(); }, 1200);
        } else if (['FAILED', 'VOIDED', 'EXPIRED', 'REVIEW'].includes(p.status)) {
          clearInterval(t);
          const m = $('#gs-msg'); if (m) { m.hidden = false; m.className = 'gs-msg err'; m.textContent = p.failure_reason || 'Malipo hayakukamilika.'; }
          if ($('#gs-go')) { $('#gs-go').disabled = false; $('#gs-go').textContent = 'Jaribu tena'; }
        }
      } catch (_) {}
      if (n > 75) clearInterval(t);
    }, 4000);
  };

  const bindSlides = () => {
    const box = $('#gs-slides'); if (!box) return;
    const dots = [...document.querySelectorAll('.gs-dots i')];
    const go = (i) => { SLIDE = (i + S.banners.length) % S.banners.length; box.scrollTo({ left: box.clientWidth * SLIDE, behavior: 'smooth' }); dots.forEach((d, k) => d.classList.toggle('on', k === SLIDE)); };
    box.onscroll = () => { const i = Math.round(box.scrollLeft / box.clientWidth); if (i !== SLIDE) { SLIDE = i; dots.forEach((d, k) => d.classList.toggle('on', k === i)); } };
    clearInterval(timer);
    if (S.banners.length > 1) timer = setInterval(() => { if (!document.hidden) go(SLIDE + 1); }, 5000);
  };

  const route = async () => {
    const w = $('#gs-wrap'); if (!w) return;
    clearInterval(timer);
    const m = location.hash.match(/app=(\d+)/);
    if (m) {
      let r = A[m[1]];
      if (!r) {
        // App iliyofichwa: inafunguka kwa link yenye ID yake, lakini haionekani kwenye orodha
        const j = await api('/app-store/apps/' + m[1]).catch(() => null);
        if (j && j.app) { r = j.app; A[r.id] = r; }
      }
      if (!r && isAdmin()) {
        const j = await api('/admin/store/apps/' + m[1]).catch(() => null);
        if (j && j.app) {
          w.innerHTML = adminPreview(j.app); window.scrollTo(0, 0);
          const b = $('#gs-show');
          if (b) b.onclick = async () => { await api('/admin/store/apps/' + j.app.id, { method: 'PATCH', body: { active: !j.app.active } }); location.hash = 'app=' + j.app.id; route(); };
          return;
        }
      }
      if (!r) { w.innerHTML = notFound(); return; }
      w.innerHTML = await detailView(r);
      window.scrollTo(0, 0);
      // Amerudi kutoka kuingia akiwa amechagua kulipia: fungua malipo ya app hii
      if (/buy=1/.test(location.hash) && window.me && locked(r)) {
        history.replaceState(null, '', location.pathname + '#app=' + r.id);
        openBuy(r);
      }
      return;
    }
    if (!S.apps.length) { w.innerHTML = emptyView(); return; }
    if (!S.tabs.includes(TAB)) TAB = S.tabs[0] || '';
    w.innerHTML = homeView();
    bindSlides();
  };

  document.addEventListener('app:ready', async () => {
    if (document.body.dataset.page !== 'download') return;
    $('#main').innerHTML = '<div id="gs-wrap" class="gs-wrap"><div class="gs-skel"></div></div>';
    try {
      S = await api('/app-store');
      A = {}; S.apps.forEach((a) => (A[a.id] = a));
      // Hakuna sehemu/banners zilizowekwa na admin: onyesha apps zako moja kwa moja
      if (S.apps.length && !S.sections.length) {
        const byDl = [...S.apps].sort((a, b) => b.download_count - a.download_count);
        S.tabs = ['Featured'];
        S.sections = [
          { id: 'fb1', tab: 'Featured', title: 'Zinazopendwa', kind: 'row', apps: byDl.slice(0, 8).map((a) => a.id) },
          { id: 'fb2', tab: 'Featured', title: 'Apps zote', kind: 'list', apps: S.apps.map((a) => a.id) },
        ];
      }
      if (S.apps.length && !S.banners.length) {
        const top = [...S.apps].sort((a, b) => b.download_count - a.download_count)[0];
        S.banners = [{ id: 0, title: 'Apps zetu', subtitle: 'Pakua app zetu za hivi karibuni', bg_color: 'linear-gradient(135deg,var(--primary),var(--accent))', release_id: top.id, has_image: false }];
      }
      TAB = S.tabs[0] || '';
    } catch (e) {
      $('#gs-wrap').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
      return;
    }
    const w = $('#gs-wrap');
    w.addEventListener('input', (e) => {
      if (e.target.id !== 'gs-q') return;
      const q = e.target.value.trim().toLowerCase(), res = $('#gs-res'), body = $('#gs-body');
      if (!q) { res.hidden = true; res.innerHTML = ''; body.hidden = false; return; }
      const hits = S.apps.filter((a) => (a.title + ' ' + (a.developer || '') + ' ' + (a.category || '')).toLowerCase().includes(q));
      body.hidden = true; res.hidden = false;
      res.innerHTML = hits.length ? `<div class="gs-list">${hits.map(listRow).join('')}</div>` : '<div class="gs-empty"><b>Hakuna app inayolingana</b></div>';
    });
    w.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { TAB = tb.dataset.tab; route(); return; }
      const d = e.target.closest('[data-dl]');
      if (d) {
        e.stopPropagation();
        const r = A[d.dataset.dl]; if (!r) return;
        if (locked(r)) { openBuy(r); return; }
        // Kivinjari kinapakua moja kwa moja: jibu ni attachment, hivyo ukurasa haubadiliki
        // na kivinjari kinaonyesha arifa ya upakuaji
        window.location.assign('/api/app-releases/' + r.id + '/file');
        return;
      }
      const sl = e.target.closest('.gs-slide');
      if (sl && sl.dataset.rel) { location.hash = 'app=' + sl.dataset.rel; return; }
      const o = e.target.closest('[data-open]');
      if (o) { location.hash = 'app=' + o.dataset.open; return; }
      if (e.target.closest('#gsm')) { const p = $('#gsd'); p.classList.toggle('clip'); e.target.textContent = p.classList.contains('clip') ? '⌄' : '⌃'; }
    });
    window.addEventListener('hashchange', route);
    route();
  });
})();
