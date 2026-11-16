document.addEventListener('app:ready', () => {
  const page = document.body.dataset.page, main = $('#main');
  const show = (el, t, c) => { el.className = 'msg ' + (c || ''); el.textContent = t; };
  const short = (e) => String((e && e.message) || e || 'Kuna tatizo. Jaribu tena.').replace(/<[^>]+>/g, '').slice(0, 160);
  if (page === 'login' || page === 'register') {
    const reg = page === 'register';
    main.innerHTML = `<form class="card form" id="f" novalidate><h2>${reg ? 'Jisajili' : 'Ingia'}</h2>
      ${reg ? '<label>Jina</label><input name="name" autocomplete="name" required>' : ''}
      <label>Namba ya simu</label><input name="phone" inputmode="tel" placeholder="0712345678" autocomplete="tel" required>
      <label>Password</label><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
      ${reg ? '<label>Confirm Password</label><input name="confirm_password" type="password" autocomplete="new-password" required>' : ''}
      ${reg ? '<label>Promo code (hiari)</label><input name="promo_code" autocomplete="off" placeholder="Mfano: ALFU1234" style="text-transform:uppercase">' : ''}
      <div id="m" class="msg" hidden></div><button class="btn mt" style="width:100%">${reg ? 'Jisajili' : 'Ingia'}</button>
      <p class="auth-sw">${reg ? `Tayari una akaunti? <a href="/login${esc(location.search)}">Ingia</a>` : `Huna akaunti? <a href="/register${esc(location.search)}">Jisajili</a>`}</p>${reg ? '' : '<p class="auth-sw"><a href="/reset">Umesahau password?</a></p>'}</form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const m = $('#m'), b = Object.fromEntries(new FormData(e.target)); m.hidden = false; show(m, 'Subiri…');
      try {
        const r = await api('/auth/' + page, { method: 'POST', body: b });
        let role = ((r && (r.user || r).role) || '');
        if (!role) { const m = await api('/auth/me').catch(() => null); role = ((m && (m.user || m).role) || ''); }
        // Admin akiingia kwenye ukurasa wa user anapelekwa moja kwa moja kwenye admin panel
        if (role === 'admin') { location.href = '/admin/dashboard'; return; }
        const n = new URLSearchParams(location.search).get('next');
        location.href = n && /^\/(?!\/)/.test(n) ? n : '/profile';
      }
      catch (err) { show(m, short(err), 'err'); }
    };
  }
  if (page === 'profile') {
    if (!window.me) { location.href = '/login?next=/profile'; return; }
    main.innerHTML = `<div class="pf-hero"><div class="pf-cover"></div><div class="pf-main"><div class="pf-av">${esc(me.name.trim().charAt(0).toUpperCase())}</div>
        <div class="pf-id"><h2>${esc(me.name)}</h2><div class="muted">📱 ${esc(me.phone)}</div></div><button class="btn ghost sm" id="lo2">Toka</button></div></div>
      <div class="pf-stats" id="pst"></div><div id="promo"></div><div id="subcard"><div class="pf-sub none">Inapakia…</div></div>
      <h2 class="sec">Malipo yangu</h2><div id="pays"><div class="muted">Inapakia…</div></div>
      <h2 class="sec">Settings ya akaunti</h2><form class="card" id="pf" style="max-width:480px"><label>Jina</label><input name="name" value="${esc(me.name)}">
      <label>Password ya sasa</label><input name="current_password" type="password" autocomplete="current-password"><label>Password mpya</label><input name="new_password" type="password" autocomplete="new-password">
      <div id="pm" class="msg" hidden></div><button class="btn mt">Hifadhi mabadiliko</button></form>`;
    $('#lo2').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; };
    Promise.all([api('/subscriptions/me'), api('/payments/me')]).then(([sr, pr]) => {
      const subs = sr.subscriptions || [], cps = (sr.channel_purchases || []).filter((x) => x.status === 'ACTIVE'), pays = pr.payments || [];
      const act = subs.find((x) => x.status === 'ACTIVE');
      const daysLeft = act ? Math.max(0, Math.ceil((new Date(act.end_date) - Date.now()) / 864e5)) : 0;
      const ok = pays.filter((p) => p.status === 'COMPLETED'), total = ok.reduce((a, p) => a + p.amount, 0);
      $('#pst').innerHTML = [['💎', act ? 'Hai' : 'Hakuna', 'Kifurushi'], ['⏳', daysLeft, 'Siku zilizobaki'], ['✅', ok.length, 'Malipo yaliyokamilika'], ['💰', fmt(total), 'Jumla ya malipo (TZS)']].map((x) => `<div class="pf-st"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('');
      const own = cps.length ? `<div class="pf-own">${cps.map((x) => `<span>📺 ${esc(x.channel_name)} • hadi ${new Date(x.end_date).toLocaleDateString('sw-TZ')}</span>`).join('')}</div>` : '';
      if (act) {
        const tot = Math.max(1, new Date(act.end_date) - new Date(act.start_date)), used = Math.min(100, Math.max(0, ((Date.now() - new Date(act.start_date)) / tot) * 100));
        $('#subcard').innerHTML = `<div class="pf-sub"><div style="opacity:.85;font-size:.8rem;font-weight:700;letter-spacing:1px">KIFURUSHI CHAKO</div><div class="nm">${esc(act.package_name)}</div>
          <div class="days"><b>${daysLeft}</b><span>siku zimebaki</span></div><div class="pf-prog"><i style="width:${(100 - used).toFixed(0)}%"></i></div>
          <div style="font-size:.78rem;opacity:.9;display:flex;justify-content:space-between"><span>${fdate(act.start_date)}</span><span>${fdate(act.end_date)}</span></div>
          <div style="margin-top:10px;font-weight:700">✅ Channel zote zimefunguliwa</div>${own}</div>`;
      } else {
        $('#subcard').innerHTML = `<div class="pf-sub none"><div style="font-size:1.1rem;font-weight:800">Huna kifurushi hai</div><div class="muted" style="margin:4px 0 14px">Unaweza kutazama channel za bure tu. Nunua kifurushi kufungua zote.</div><a class="btn" href="/packages">💎 Nunua kifurushi</a>${own ? own.replace('rgba(255,255,255,.25)', 'var(--line)') : ''}</div>`;
      }
      const ico = { COMPLETED: '✅', PENDING: '⏳' }, cls = { COMPLETED: 'ok', PENDING: 'gold' };
      $('#pays').innerHTML = pays.length ? pays.map((p) => `<div class="pf-pay"><div class="pi">${ico[p.status] || '❌'}</div><div class="pt"><b>${esc(p.package_name)}</b><div class="muted" style="font-size:.74rem">${fdate(p.created_at)} • ${esc(p.order_id)}${p.failure_reason ? ' • ' + esc(p.failure_reason) : ''}</div></div><div class="pa">${fmt(p.amount)} <small>${esc(p.currency)}</small><div><span class="pill ${cls[p.status] || 'bad'}">${esc(p.status)}</span></div></div></div>`).join('') : '<div class="card muted">Hakuna malipo bado.</div>';
    }).catch((e) => { $('#subcard').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });
    const renderPromo = (p) => {
      const box = $('#promo'); if (!box || !p) return;
      const money = (n) => 'TZS ' + Math.floor(Number(n) || 0).toLocaleString('en-US');
      box.innerHTML = `<section class="pc-card">
        <div class="pc-top"><div><small>PROMO CODE YAKO</small><div class="pc-code">${esc(p.code)}</div></div>
          <button class="pc-copy" id="pc-copy" type="button">Nakili</button></div>
        <div class="pc-exp ${p.expired ? 'bad' : ''}">${p.expired ? 'Imeisha' : 'Inaisha ' + fdate(p.expires_at)}</div>
        <div class="pc-stats">
          <div><b>${p.used}</b><span>Waliotumia</span></div>
          <div><b>${p.paid_buyers}</b><span>Waliolipia</span></div>
          <div><b>${p.paid_tx}</b><span>Miamala</span></div>
          <div><b>${money(p.earned)}</b><span>Jumla ya ${p.rate}%</span></div>
        </div>
        <div class="pc-bal"><div><small>Salio linalopatikana</small><b>${money(p.balance)}</b></div>
          <form id="pc-form" class="pc-form"><input name="amount" type="number" min="${p.min_payout}" step="500" placeholder="Kiasi (kiwango cha chini ${p.min_payout})"><button class="btn sm">Omba payout</button></form></div>
        <div class="pc-link"><small>Link ya kujisajili kwa promo hii</small><div class="pc-linkbox">${esc(location.origin + '/register?promo=' + p.code)}</div><button class="pc-copy" id="pc-link" type="button">Nakili link</button></div>
        <div id="pc-msg" class="msg" hidden></div>
        <div class="pc-hist">${p.payouts.map((x) => `<div class="pc-h"><span>${money(x.amount)}</span><span class="pill ${x.status === 'PAID' ? 'ok' : (x.status === 'REJECTED' ? 'bad' : 'gold')}">${esc(x.status)}</span><small>${fdate(x.created_at)}</small></div>`).join('') || '<p class="muted">Bado hakuna maombi ya payout.</p>'}</div>
      </section>`;
      $('#pc-copy').onclick = async () => { try { await navigator.clipboard.writeText(p.code); show($('#pc-msg'), 'Code imenakiliwa.', 'ok'); } catch (_) {} };
      const lk = location.origin + '/register?promo=' + encodeURIComponent(p.code);
      $('#pc-link').onclick = async () => { try { await navigator.clipboard.writeText(lk); show($('#pc-msg'), 'Link imenakiliwa.', 'ok'); } catch (_) { window.prompt('Nakili link:', lk); } };
      $('#pc-form').onsubmit = async (e) => {
        e.preventDefault();
        const m = $('#pc-msg'); m.hidden = false;
        try { await api('/promo/payouts', { method: 'POST', body: { amount: Number(e.target.amount.value) } }); show(m, 'Ombi limetumwa. Admin atalidhinisha.', 'ok'); setTimeout(() => location.reload(), 900); }
        catch (err) { show(m, short(err), 'err'); }
      };
    };
    api('/promo/me').then((r) => renderPromo(r.promo)).catch(() => {});
    $('#pf').onsubmit = async (e) => {
      e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); if (!b.new_password) { delete b.new_password; delete b.current_password; }
      const m = $('#pm'); m.hidden = false;
      try { await api('/users/me', { method: 'PATCH', body: b }); show(m, 'Imehifadhiwa.', 'ok'); } catch (err) { show(m, short(err), 'err'); }
    };
  }
});

// Link ya kujisajili yenye promo code: /register?promo=CODE
document.addEventListener('app:ready', () => setTimeout(async () => {
  if (document.body.dataset.page !== 'register') return;
  const code = (new URLSearchParams(location.search).get('promo') || '').trim().toUpperCase();
  const inp = document.querySelector('input[name="promo_code"]');
  if (!code || !inp) return;
  inp.value = code;
  const note = document.createElement('div');
  note.className = 'msg';
  inp.before(note);
  try {
    const r = await fetch('/api/promo/check?code=' + encodeURIComponent(code), { credentials: 'same-origin' }).then((x) => x.json());
    if (r.valid) {
      inp.readOnly = true; inp.classList.add('pc-locked');
      note.className = 'msg ok'; note.textContent = 'Promo code imekubaliwa. Jaza taarifa zako kujisajili.';
    } else {
      inp.value = ''; note.className = 'msg err';
      note.textContent = 'Promo code hii si sahihi au imeisha. Unaweza kujisajili bila code.';
    }
  } catch (_) { note.className = 'msg err'; note.textContent = 'Imeshindwa kuthibitisha promo code. Jaribu tena.'; }
}, 60));
