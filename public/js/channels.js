(() => {
  let SUB = false;
  const isLocked = (c) => c.access_type === 'PAID' && !SUB && !c.owned;
  const tile = (c) => `<button class="chn ${isLocked(c) ? 'locked' : ''}" data-id="${c.id}"><span class="chn-logo" style="--h:${chHue(c.name)}">${chLogo(c)}${isLocked(c) ? `<span class="chn-lock">${LOCK_SVG}</span>` : ''}</span><span class="chn-name">${esc(c.name)}</span></button>`;
  function initSlider(root, seconds) {
    const track = root.querySelector('.hs-track'), slidesEl = [...root.querySelectorAll('.hs-slide')], segs = [...root.querySelectorAll('.hs-seg')], n = segs.length, cnt = root.querySelector('.hs-count');
    if (slidesEl[0]) slidesEl[0].classList.add('act');
    if (n < 2) return;
    let i = 0, timer, settle;
    const setActive = (k) => {
      i = k; segs.forEach((s, j) => { s.classList.toggle('done', j < k); s.classList.remove('on'); });
      slidesEl.forEach((s, j) => s.classList.toggle('act', j === k));
      if (cnt) cnt.textContent = String(k + 1).padStart(2, '0') + '/' + String(n).padStart(2, '0');
      void root.offsetWidth; segs[k].classList.add('on');
    };
    const restart = () => { clearTimeout(timer); timer = setTimeout(() => go(i + 1), seconds * 1000); };
    const go = (k) => { k = (k + n) % n; track.scrollTo({ left: k * track.clientWidth, behavior: 'smooth' }); setActive(k); restart(); };
    track.addEventListener('scroll', () => { clearTimeout(settle); settle = setTimeout(() => { const k = Math.round(track.scrollLeft / track.clientWidth); if (k !== i) { setActive(k); restart(); } }, 140); }, { passive: true });
    root.querySelector('.hs-prev').onclick = () => go(i - 1);
    root.querySelector('.hs-next').onclick = () => go(i + 1);
    segs.forEach((s, j) => (s.onclick = () => go(j)));
    ['pointerdown', 'touchstart'].forEach((e) => track.addEventListener(e, () => { clearTimeout(timer); root.classList.add('paused'); }, { passive: true }));
    ['pointerup', 'touchend', 'pointercancel'].forEach((e) => track.addEventListener(e, () => { root.classList.remove('paused'); setActive(i); restart(); }, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { setActive(i); restart(); } });
    setActive(0); restart();
  }
  const mcard = (m) => {
    const live = m.status === 'LIVE';
    const when = live ? '<span class="mlive">● LIVE</span>' : `<span class="mtime">${esc(fdate(m.kickoff_at))}</span>`;
    return `<div class="mcard ${live ? 'is-live' : ''}">
      <div class="mhead"><span class="mlg">${esc(m.league || 'Mechi')}</span>${when}${m.price > 0 && !m.owned ? ` <span class="mprice">💰 ${fmt(m.price)} TZS</span>` : ''}</div>
      <div class="mteams">
        <div class="mt"><span class="mbadge">${esc((m.home_team || '?').charAt(0))}</span><b>${esc(m.home_team)}</b></div>
        <span class="mvs">VS</span>
        <div class="mt"><span class="mbadge">${esc((m.away_team || '?').charAt(0))}</span><b>${esc(m.away_team)}</b></div>
      </div>
      <div class="mfoot"><span class="mch">${m.channel_name ? '📺 ' + esc(m.channel_name) : 'Channel bado haijawekwa'}</span>
        ${m.channel_id ? `<button class="btn sm mwatch" data-ch="${m.channel_id}">▶ Tazama</button>` : ''}</div></div>`;
  };
  const matchesBlock = (list) => (list.length
    ? `<h2 class="sec" id="mechi">Mechi<span class="cnt">${list.length}</span></h2><div class="mrail">${list.map(mcard).join('')}</div>` : '');
  async function home() {
    const main = $('#main'); const hp = (site.homepage || {}).sections || [];
    const [chRes, { categories }, sl, mt] = await Promise.all([api('/channels'), api('/channel-categories'), api('/slides').catch(() => ({ slides: [] })), api('/matches').catch(() => ({ matches: [] }))]);
    const channels = chRes.channels; SUB = !!chRes.subscribed;
    const slides = sl.slides || [], ap = site.appearance || {}, secs = Math.min(30, Math.max(2, Number(ap.slider_seconds) || 5));
    const layout = ['grid', 'rail', 'list'].includes(ap.channels_layout) ? ap.channels_layout : 'grid';
    let cat = null;
    const expanded = new Set();   // kategoria zilizofunguliwa kwa View more
    const list = () => channels.filter((c) => !cat || c.category_id === cat);
    const row = (t, items, cls) => (items.length ? `<h2 class="sec">${esc(t)}<span class="cnt">${items.length}</span></h2><div class="grid ${cls}">${items.map(tile).join('')}</div>` : '');
    const firstId = channels[0] && channels[0].id;
    // Kategoria bila namba: channels 8 za kwanza, kisha View more kuonyesha zote kwa pamoja
    const catRow = (key, t, items, cls, catId) => {
      if (catId) {   // kategoria zote: channels zote zinaonekana hapa, View more inafungua ukurasa wa kategoria
        const body = items.length ? `<div class="grid ${cls}">${items.map(tile).join('')}</div>` : '';
        return `<div class="sec-row"><h2 class="sec">${esc(t)}</h2><a class="btn ghost sm vmore-btn" href="/category.html?id=${catId}">View more</a></div>${body}`;
      }
      if (!items.length) return '';
      const open = expanded.has(key), show = open ? items : items.slice(0, 8);
      const more = items.length > 8 ? `<div class="vmore"><button class="btn ghost sm" data-more="${esc(key)}">${open ? 'Onyesha kidogo' : 'View more'}</button></div>` : '';
      return `<h2 class="sec">${esc(t)}</h2><div class="grid ${cls}">${show.map(tile).join('')}</div>${more}`;
    };
    const blocks = {
      hero: () => slides.length
        ? `<div class="hslider" style="--sec:${secs}s"><div class="hs-track">${slides.map((x) => `<div class="hs-slide"><img src="${esc(x.image)}" alt="" loading="lazy"><div class="hs-shade"></div><div class="hs-cap">${x.title ? `<h3>${esc(x.title)}</h3>` : ''}${x.subtitle ? `<p>${esc(x.subtitle)}</p>` : ''}<button class="btn hs-btn" data-ch="${x.channel_id || ''}" data-link="${esc(x.link_url || '')}">▶ ${esc(x.button_text || 'TAZAMA SASA')}</button></div></div>`).join('')}</div>
            ${slides.length > 1 ? `<button class="hs-nav hs-prev" aria-label="Iliyopita">‹</button><button class="hs-nav hs-next" aria-label="Inayofuata">›</button><div class="hs-prog">${slides.map(() => '<span class="hs-seg"><i></i></span>').join('')}</div>` : '<span class="hs-prev" hidden></span><span class="hs-next" hidden></span>'}</div>`
        : `<div class="hero"><div><h1>${esc((site.identity || {}).site_name || '')}</h1><p>${esc((site.identity || {}).tagline || '')}</p>${firstId ? `<button class="btn hs-btn" data-ch="${firstId}" data-link="">▶ TAZAMA SASA</button>` : ''}</div></div>`,
      matches: () => matchesBlock(mt.matches || []),
      categories: () => `<div class="chips"><button class="chip ${cat ? '' : 'on'}" data-cat="">Zote</button>${categories.map((k) => `<button class="chip ${cat === k.id ? 'on' : ''}" data-cat="${k.id}">${esc(k.name)}</button>`).join('')}</div>`,
      popular: () => row('Maarufu', list().filter((c) => c.popular), 'rail'),
      recent: () => row('Mpya', [...list()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10), 'rail'),
      all: () => {                                   // kila channel ndani ya category yake
        const items = list(); let html = '';
        categories.forEach((k) => { html += catRow('c' + k.id, k.name, items.filter((c) => c.category_id === k.id), layout, k.id); });
        html += catRow('other', 'Nyingine', items.filter((c) => !c.category_id || !categories.some((k) => k.id === c.category_id)), layout);
        return html;
      },
    };
    const guest = !window.me ? `<div class="card cta"><div><b>Karibu!</b><div class="muted">Ingia au jisajili kufungua channels zote.</div></div><div class="row" style="flex:none"><a class="btn ghost sm" href="/login">Ingia</a><a class="btn sm" href="/register">Jisajili</a></div></div>` : '';
    const draw = () => {
      main.innerHTML = guest + hp.filter((s) => s.visible && blocks[s.id]).map((s) => blocks[s.id]()).join('');
      main.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { cat = b.dataset.cat ? Number(b.dataset.cat) : null; draw(); }));
      main.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { const k = b.dataset.more; expanded.has(k) ? expanded.delete(k) : expanded.add(k); draw(); }));
      main.querySelectorAll('.mwatch').forEach((b) => (b.onclick = () => openChannel(b.dataset.ch)));
      main.querySelectorAll('.chn').forEach((el) => (el.onclick = () => openChannel(el.dataset.id)));
      main.querySelectorAll('.hs-btn').forEach((b) => (b.onclick = () => {
        if (b.dataset.ch) openChannel(b.dataset.ch); else if (b.dataset.link) location.href = b.dataset.link; else if (firstId) openChannel(firstId);
      }));
      const sli = main.querySelector('.hslider'); if (sli) initSlider(sli, secs);
      if (location.hash === '#mechi') { const el = document.getElementById('mechi'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    draw();
  }
  document.addEventListener('app:ready', () => { if (document.body.dataset.page === 'home') home().catch((e) => ($('#main').textContent = e.message)); });
})();
