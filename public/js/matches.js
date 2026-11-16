(() => {
  let SUBD = false;
  const pad = (n) => String(n).padStart(2, '0');
  const countdown = (iso) => {
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return 'Inaanza sasa';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return d ? `${d}d ${pad(h)}:${pad(m)}:${pad(x)}` : `${pad(h)}:${pad(m)}:${pad(x)}`;
  };
  const teamBadge = (name) => `<span class="mp-badge">${esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;
  const card = (m) => {
    const live = m.status === 'LIVE';
    const pkg = m.access_mode === 'PACKAGE';
    const locked = (m.price > 0 || pkg) && !m.owned && !SUBD;
    return `<article class="mp-card ${live ? 'is-live' : ''} ${locked ? 'locked' : ''}">
      <div class="mp-top">
        <span class="mp-league">${esc(m.league || 'Mechi')}</span>
        ${locked ? `<span class="mp-lk" title="Inahitaji kifurushi au malipo">${LOCK_SVG}</span>` : ''}
        ${live ? '<span class="mp-live">● LIVE</span>' : `<span class="mp-cd" data-t="${esc(m.kickoff_at)}">${esc(countdown(m.kickoff_at))}</span>`}
      </div>
      <div class="mp-teams">
        <div class="mp-team">${m.home_logo ? `<img class="mp-logo" src="${m.home_logo}" alt="">` : teamBadge(m.home_team)}<b>${esc(m.home_team)}</b></div>
        <div class="mp-vs">VS</div>
        <div class="mp-team">${m.away_logo ? `<img class="mp-logo" src="${m.away_logo}" alt="">` : teamBadge(m.away_team)}<b>${esc(m.away_team)}</b></div>
      </div>
      <div class="mp-when">${esc(fdate(m.kickoff_at))}</div>
      <div class="mp-foot">
        <div class="mp-info">
          <span class="mp-ch">📺 ${esc(m.channel_name || 'Channel haijawekwa')}</span>
          ${m.price > 0 ? `<span class="mp-price">💰 ${fmt(m.price)} TZS</span>` : (pkg ? '<span class="mp-price">📦 Vifurushi</span>' : '<span class="mp-price free">Bure</span>')}
        </div>
        ${m.channel_id ? `<button class="mp-btn" data-ch="${m.channel_id}">${locked ? '🔒 Fungua' : '▶ Tazama'}</button>` : ''}
      </div></article>`;
  };
  const render = (list) => {
    const main = $('#main');
    const live = list.filter((m) => m.status === 'LIVE');
    const up = list.filter((m) => m.status !== 'LIVE');
    if (!list.length) {
      main.innerHTML = `<div class="mp-head"><h1>⚽ Mechi</h1></div><div class="mp-empty"><div class="mp-empty-ic">⚽</div><b>Hakuna mechi kwa sasa</b><span class="muted">Mechi mpya zitaonekana hapa zitakapowekwa.</span></div>`;
      return;
    }
    main.innerHTML = `<div class="mp-head"><h1>⚽ Mechi</h1><p class="muted">Mechi zinazoendelea na zinazokuja</p></div>
      ${live.length ? `<h2 class="mp-sec"><span class="mp-dot"></span>Zinaendelea sasa</h2><div class="mp-grid">${live.map(card).join('')}</div>` : ''}
      ${up.length ? `<h2 class="mp-sec">Zinazokuja</h2><div class="mp-grid">${up.map(card).join('')}</div>` : ''}`;
    document.querySelectorAll('.mp-btn').forEach((b) => (b.onclick = () => openChannel(b.dataset.ch)));
  };
  document.addEventListener('app:ready', async () => {
    if (document.body.dataset.page !== 'matches') return;
    $('#main').innerHTML = '<div class="mp-head"><h1>⚽ Mechi</h1></div><div class="mp-grid"><div class="mp-card skel"></div><div class="mp-card skel"></div><div class="mp-card skel"></div></div>';
    try {
      const r = await api('/matches');
      SUBD = !!r.subscribed;
      render(r.matches || []);
      setInterval(() => document.querySelectorAll('.mp-cd').forEach((el) => (el.textContent = countdown(el.dataset.t))), 1000);
    } catch (e) { $('#main').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  });
})();
