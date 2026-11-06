/* Admin panel. Every action is re-authorised on the server (role comes from the database). */
(function () {
  'use strict';
  const TITLES = { dashboard: 'Dashboard', users: 'Watumiaji', packages: 'Vifurushi', channels: 'Channels', proxy: 'Proxy link', bein: 'beinProxy', amiri: 'amiriChannel', payments: 'Malipo', clickpesa: 'ClickPesa', settings: 'Mipangilio', audit: 'Audit Logs' };
  const root = () => $('#root');
  const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const loading = () => { root().innerHTML = '<div class="loader"><span class="spin"></span></div>'; };
  const router = makeRouter('/admin', { '': 'dashboard', users: 'users', packages: 'packages', channels: 'channels', proxy: 'proxy', bein: 'bein', amiri: 'amiri', payments: 'payments', clickpesa: 'clickpesa', settings: 'settings', contact: 'settings', audit: 'audit' }, () => render());
  const view = () => router.current();
  const errBox = (e) => `<div class="alert bad">${esc(e.message)}</div>`;

  async function render() {
    const v = view();
    $('#title').textContent = TITLES[v];
    $$('#nav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $('#sidebar').classList.remove('open'); $('.scrim').classList.remove('show');
    loading();
    try { await ({ dashboard, users, packages, channels, proxy, bein, amiri, payments, clickpesa, settings, audit }[v])(); } catch (e) { root().innerHTML = errBox(e); }
  }

  // ================= Dashboard =================
  async function dashboard() {
    const s = await api('/api/admin/stats');
    let range = 'today';
    const max = Math.max(1, ...s.daily.map((d) => Number(d.revenue)));
    const draw = () => {
      const p = s.periods[range];
      $('#period').innerHTML = `
        <div class="grid cols-4">
          <div class="card stat ok"><div class="label">${icon('wallet')} Mapato</div><div class="value">${fmtMoney(p.revenue)}</div><div class="sub">Yaliyothibitishwa</div></div>
          <div class="card stat"><div class="label">${icon('check')} Malipo yaliyofanikiwa</div><div class="value">${p.success}</div></div>
          <div class="card stat warn"><div class="label">${icon('clock')} Yanayosubiri</div><div class="value">${p.pending}</div></div>
          <div class="card stat bad"><div class="label">${icon('x')} Yaliyoshindwa</div><div class="value">${p.failed}</div></div>
          <div class="card stat"><div class="label">${icon('users')} Watumiaji wapya</div><div class="value">${p.new_users}</div></div>
          <div class="card stat"><div class="label">${icon('activity')} API requests</div><div class="value">${Number(p.api_requests).toLocaleString()}</div></div>
        </div>`;
      $$('#range button').forEach((b) => b.classList.toggle('active', b.dataset.r === range));
    };
    root().innerHTML = `
      <div class="row between" style="margin-bottom:16px"><h3 style="margin:0">Takwimu</h3>
        <div class="tabs" id="range"><button data-r="today">Leo</button><button data-r="week">Wiki hii</button><button data-r="month">Mwezi huu</button></div></div>
      <div id="period"></div>
      <h3 class="mt">Jumla kwa ujumla</h3>
      <div class="grid cols-4">
        <div class="card stat"><div class="label">${icon('users')} Watumiaji wote</div><div class="value">${s.users.total}</div><div class="sub">Active ${s.users.active} • Suspended ${s.users.suspended}</div></div>
        <div class="card stat"><div class="label">${icon('key')} API Keys</div><div class="value">${s.keys.active}</div><div class="sub">Active • Inactive ${s.keys.inactive}</div></div>
        <div class="card stat ok"><div class="label">${icon('layers')} Subscriptions</div><div class="value">${s.subscriptions.active}</div><div class="sub">Active • Expired ${s.subscriptions.expired}</div></div>
        <div class="card stat ok"><div class="label">${icon('trend')} Jumla ya mapato</div><div class="value" style="font-size:1.5rem">${fmtMoney(s.payments.revenue)}</div><div class="sub">Success ${s.payments.success} • Pending ${s.payments.pending} • Failed ${s.payments.failed}</div></div>
      </div>
      <div class="card mt"><h3>${icon('trend')} Mapato ya siku 14 zilizopita</h3>
        <div class="bars">${s.daily.map((d) => `<div class="bar" style="height:${Math.max(2, (Number(d.revenue) / max) * 100)}%"><span>${esc(d.day)}: ${fmtMoney(d.revenue)}</span></div>`).join('')}</div>
        <div class="bar-labels">${s.daily.map((d) => `<span>${esc(d.day.split(' ')[0])}</span>`).join('')}</div></div>`;
    $$('#range button').forEach((b) => b.addEventListener('click', () => { range = b.dataset.r; draw(); }));
    draw();
  }

  // ---------- small UI helpers shared by the admin views ----------
  const ago = (d) => {
    if (!d) return '—';
    const sec = Math.max(0, Math.floor((Date.now() - new Date(d)) / 1000));
    if (sec < 60) return 'sasa hivi';
    if (sec < 3600) return `dakika ${Math.floor(sec / 60)} zilizopita`;
    if (sec < 86400) return `saa ${Math.floor(sec / 3600)} zilizopita`;
    return `siku ${Math.floor(sec / 86400)} zilizopita`;
  };
  const left = (d) => {
    if (!d) return '—';
    const sec = Math.floor((new Date(d) - Date.now()) / 1000);
    if (sec <= 0) return 'imeisha';
    if (sec < 3600) return `dakika ${Math.ceil(sec / 60)}`;
    if (sec < 86400) return `saa ${Math.floor(sec / 3600)}`;
    return `siku ${Math.floor(sec / 86400)}`;
  };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x.charAt(0).toUpperCase()).join('');
  const hostOf = (u) => { try { return new URL(u).hostname; } catch (_) { return u; } };
  // little "⋯" popover menu: items = [{ label, icon, danger, run }]
  let openPop = null;
  const popMenu = (btn, items) => {
    if (openPop) { openPop.remove(); openPop = null; }
    const m = document.createElement('div');
    m.className = 'pop-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map((it, i) => `<button type="button" class="pop-item ${it.danger ? 'danger' : ''}" data-i="${i}" role="menuitem">${icon(it.icon)}<span>${esc(it.label)}</span></button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.top = `${Math.min(r.bottom + 6, window.innerHeight - m.offsetHeight - 8)}px`;
    m.style.left = `${Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8))}px`;
    const close = () => { m.remove(); if (openPop === m) openPop = null; document.removeEventListener('click', away, true); document.removeEventListener('keydown', esc2); };
    const away = (e) => { if (!m.contains(e.target)) close(); };
    const esc2 = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { close(); items[Number(b.dataset.i)].run(); } });
    setTimeout(() => { document.addEventListener('click', away, true); document.addEventListener('keydown', esc2); }, 0);
    openPop = m;
  };

  // ================= Users =================
  async function users() {
    root().innerHTML = `
      <div class="toolbar">
        <div class="input-icon grow" style="max-width:420px">${icon('search')}<input class="input" id="q" placeholder="Tafuta kwa jina au namba ya simu" autocomplete="off"></div>
        <div class="chips" id="flt" role="tablist">
          <button class="chip active" data-f="all">Wote</button><button class="chip" data-f="sub">Wenye kifurushi</button><button class="chip" data-f="nosub">Bila kifurushi</button><button class="chip" data-f="sus">Waliosimamishwa</button>
        </div>
        <button class="btn" id="reqs">${icon('lock')} Maombi ya password</button></div>
      <div id="list"></div>`;
    let page = 1, filter = 'all', data = null;
    const hasSub = (u) => u.sub_status === 'ACTIVE' && new Date(u.sub_expires_at) > new Date();
    const keyState = (u) => (u.key_status === 'ACTIVE' && !hasSub(u) ? 'INACTIVE' : (u.key_status || 'NONE'));
    const match = (u) => (filter === 'sub' ? hasSub(u) : filter === 'nosub' ? !hasSub(u) : filter === 'sus' ? u.account_status !== 'ACTIVE' : true);

    const subBlock = (u) => {
      if (!hasSub(u)) return `<div class="sub-none">Hana kifurushi</div>`;
      const total = Math.max(1, (new Date(u.sub_expires_at) - new Date(u.sub_starts_at || Date.now())) || (u.package_days || 1) * 86400000);
      const pct = Math.max(2, Math.min(100, ((new Date(u.sub_expires_at) - Date.now()) / total) * 100));
      const days = (new Date(u.sub_expires_at) - Date.now()) / 86400000;
      return `<div class="sub-line"><b>${esc(u.package_name)}</b><span class="${days <= 1 ? 'warn-t' : 'muted'}">${left(u.sub_expires_at)} zimebaki</span></div>
        <div class="progress"><i style="width:${pct.toFixed(0)}%;${days <= 1 ? 'background:var(--warn)' : ''}"></i></div>`;
    };

    const draw = () => {
      const r = data; if (!r) return;
      const rows = r.users.filter(match);
      const cnt = { sub: r.users.filter(hasSub).length, sus: r.users.filter((u) => u.account_status !== 'ACTIVE').length };
      $$('#flt .chip').forEach((c) => { const n = { all: r.users.length, sub: cnt.sub, nosub: r.users.length - cnt.sub, sus: cnt.sus }[c.dataset.f]; c.dataset.n = n; });
      $('#list').innerHTML = `<div class="people">
        ${rows.length ? rows.map((u) => `<div class="person ${u.account_status !== 'ACTIVE' ? 'is-off' : ''}">
          <div class="p-id"><div class="p-av">${esc(initials(u.full_name))}</div><div class="p-who"><b>${esc(u.full_name)}</b><span class="mono">${esc(u.phone_number)}</span></div></div>
          <div class="p-sub">${subBlock(u)}</div>
          <div class="p-key">${badge(keyState(u))}<span class="mono muted">${esc(u.key_prefix || '')}</span></div>
          <div class="p-state">${u.account_status !== 'ACTIVE' ? badge(u.account_status) : ''}<span class="muted">Alijisajili ${fmtDay(u.created_at)}</span></div>
          <div class="p-act"><button class="btn sm primary" data-grant="${u.id}" data-name="${esc(u.full_name)}">${icon('plus')} Weka kifurushi</button>
            <button class="btn sm icon" data-more="${u.id}" aria-label="Zaidi" title="Zaidi">${icon('more')}</button></div></div>`).join('')
        : `<div class="empty">${data.users.length ? 'Hakuna mtumiaji anayelingana na kichujio hiki.' : 'Hakuna watumiaji bado.'}</div>`}</div>
        <div class="row between mt"><span class="muted">Jumla: ${r.total}</span><div class="row">
        <button class="btn sm" id="prev" ${page <= 1 ? 'disabled' : ''}>← Nyuma</button><span class="muted">Ukurasa ${r.page}</span><button class="btn sm" id="next" ${page * r.limit >= r.total ? 'disabled' : ''}>Mbele →</button></div></div>`;
      $('#prev').onclick = () => { page--; load(); }; $('#next').onclick = () => { page++; load(); };
      $$('[data-grant]').forEach((b) => (b.onclick = () => grant(b.dataset.grant, b.dataset.name)));
      $$('[data-more]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const u = r.users.find((x) => x.id === b.dataset.more);
        const items = [];
        if (hasSub(u)) items.push({ label: 'Toa kifurushi', icon: 'x', danger: true, run: () => unsub(u) });
        items.push({ label: 'Tengeneza code ya password', icon: 'lock', run: () => resetPw(u) });
        items.push(u.account_status === 'ACTIVE' ? { label: 'Simamisha akaunti', icon: 'x', danger: true, run: () => suspend(u) } : { label: 'Rudisha akaunti', icon: 'check', run: () => act(`/api/admin/users/${u.id}/restore`, 'Akaunti imerudishwa') });
        popMenu(b, items);
      }));
    };
    const load = async () => {
      try { data = await api(`/api/admin/users?page=${page}&search=${encodeURIComponent($('#q').value.trim())}`); draw(); } catch (e) { $('#list').innerHTML = errBox(e); }
    };
    const act = async (url, ok) => { try { await api(url, { method: 'POST' }); toast(ok, 'ok'); load(); } catch (e) { toast(e.message, 'err'); } };
    const suspend = async (u) => { if (await confirmBox(`Simamisha ${u.full_name}?`, 'Mtumiaji atatolewa kwenye mfumo na API Key yake haitafanya kazi.', 'Simamisha', true)) act(`/api/admin/users/${u.id}/suspend`, 'Akaunti imesimamishwa'); };
    const unsub = async (u) => {
      if (!(await confirmBox(`Toa kifurushi cha ${u.full_name}?`, 'Kifurushi kitaisha mara moja na API Key yake itazimwa hadi apewe au alipie kifurushi kingine.', 'Toa kifurushi', true))) return;
      act(`/api/admin/users/${u.id}/revoke-subscription`, 'Kifurushi kimetolewa');
    };
    const resetPw = async (u) => {
      if (!(await confirmBox('Anzisha password reset?', 'Hakikisha umemthibitisha mtumiaji kabla ya kumpa code. Hutaona password yake.', 'Tengeneza code'))) return;
      try {
        const r = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' });
        const m = openModal(`<h3>${icon('lock')} Code ya reset</h3><p class="muted">Namba: <b>${esc(r.phone)}</b>. Mpe mtumiaji code hii kwa njia salama. Inatumika mara moja na inaisha baada ya dakika ${r.expires_in_minutes}.</p>
          <div class="keybox"><span style="font-size:1.3rem;letter-spacing:.1em">${esc(r.code)}</span><button class="btn sm" id="cc">${icon('copy')} Copy</button></div>
          <p class="hint">Haitaonyeshwa tena. Mtumiaji ataitumia kwenye ukurasa wa "Umesahau password".</p><div class="actions"><button class="btn primary" data-close>Sawa</button></div>`);
        m.$('#cc').onclick = (e) => copyText(r.code, e.currentTarget);
      } catch (e) { toast(e.message, 'err'); }
    };
    const grant = async (id, name) => {
      try {
        const pk = (await api('/api/admin/packages')).packages.filter((p) => p.status === 'ACTIVE');
        if (!pk.length) return toast('Hakuna kifurushi ACTIVE. Unda kwanza.', 'err');
        const m = openModal(`<h3>${icon('plus')} Weka kifurushi: ${esc(name)}</h3>
          <div class="field"><label>Kifurushi</label><select id="gp">${pk.map((p) => `<option value="${p.id}">${esc(p.name)} (siku ${p.duration_days})</option>`).join('')}</select></div>
          <div class="field"><label>Siku (hiari, acha tupu kutumia muda wa kifurushi)</label><input class="input" id="gd" type="number" min="1" max="3650"></div>
          <div class="field"><label>Kama ana kifurushi kinachoendelea</label><select id="gm"><option value="extend">Ongeza muda juu ya kilichopo</option><option value="replace">Badilisha: kianze sasa, cha zamani kiishe</option></select></div>
          <p class="hint">API Key ya mtumiaji inawashwa na itaisha kifurushi kikiisha.</p>
          <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="gs">Weka kifurushi</button></div>`);
        m.$('#gs').onclick = () => withBusy(m.$('#gs'), async () => {
          try { const d = m.$('#gd').value; await api(`/api/admin/users/${id}/grant`, { method: 'POST', body: { packageId: Number(m.$('#gp').value), days: d ? Number(d) : undefined, mode: m.$('#gm').value } }); m.close(); toast('Kifurushi kimewekwa', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
        });
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#q').addEventListener('input', debounce(() => { page = 1; load(); }));
    $$('#flt .chip').forEach((c) => (c.onclick = () => { filter = c.dataset.f; $$('#flt .chip').forEach((x) => x.classList.toggle('active', x === c)); draw(); }));
    $('#reqs').onclick = async () => {
      try {
        const r = await api('/api/admin/password-resets');
        openModal(`<h3>Maombi ya password reset</h3>${r.requests.length ? `<div class="table-wrap"><table><thead><tr><th>Jina</th><th>Simu</th><th>Muda</th></tr></thead><tbody>${r.requests.map((x) => `<tr><td>${esc(x.full_name)}</td><td class="mono">${esc(x.phone_number)}</td><td>${fmtDate(x.created_at)}</td></tr>`).join('')}</tbody></table></div><p class="hint">Tafuta namba hiyo kwenye orodha, thibitisha mtumiaji, kisha tumia menyu ya ⋯ kumpa code.</p>` : '<p class="empty">Hakuna maombi mapya.</p>'}<div class="actions"><button class="btn" data-close>Funga</button></div>`, { wide: true });
      } catch (e) { toast(e.message, 'err'); }
    };
    load();
  }

  // ================= Packages =================
  async function packages() {
    const r = await api('/api/admin/packages');
    const on = r.packages.filter((p) => p.status === 'ACTIVE').length;
    root().innerHTML = `<div class="toolbar"><div class="grow"><b>${r.packages.length}</b> <span class="muted">vifurushi • ${on} vinatumika</span></div><button class="btn primary" id="add">${icon('plus')} Kifurushi kipya</button></div>
      <div class="pkg-grid">
      ${r.packages.map((p) => `<article class="pk ${p.status === 'ACTIVE' ? '' : 'is-off'}">
        <header><h3>${esc(p.name)}</h3><label class="switch" title="${p.status === 'ACTIVE' ? 'Kinatumika' : 'Kimezimwa'}"><input type="checkbox" data-tog="${p.id}" ${p.status === 'ACTIVE' ? 'checked' : ''}><i></i></label></header>
        <div class="pk-price">${Number(p.price).toLocaleString('en-US')} <small>TZS</small></div>
        <div class="pk-dur">${icon('clock')} Siku ${p.duration_days}${p.duration_days > 0 ? ` <span class="muted">• TZS ${Math.round(p.price / p.duration_days).toLocaleString('en-US')} kwa siku</span>` : ''}</div>
        <dl class="pk-stats"><div><dt>Wanunuzi</dt><dd>${p.subscriptions}</dd></div><div><dt>Malipo</dt><dd>${p.payments}</dd></div><div><dt>Hali</dt><dd>${p.status === 'ACTIVE' ? 'Active' : 'Imezimwa'}</dd></div></dl>
        <footer><span class="muted">Kimeundwa ${fmtDay(p.created_at)}</span><span class="row" style="gap:6px"><button class="btn sm" data-edit="${p.id}">${icon('edit')} Badilisha</button><button class="btn sm icon danger" data-del="${p.id}" aria-label="Futa">${icon('trash')}</button></span></footer>
      </article>`).join('')}
      <button class="pk pk-new" id="add2" type="button">${icon('plus')}<span>Kifurushi kipya</span><small class="muted">Daily, Weekly, Monthly au maalum</small></button>
      </div>`;
    const form = (p) => {
      const m = openModal(`<h3>${p ? 'Badilisha kifurushi' : 'Kifurushi kipya'}</h3>
        <div class="field"><label>Jina</label><input class="input" id="pn" value="${esc(p ? p.name : '')}" placeholder="Weekly Package"></div>
        <div class="grid cols-2"><div class="field"><label>Bei (TZS)</label><input class="input" id="pp" type="number" min="1" value="${p ? p.price : ''}"></div>
        <div class="field"><label>Muda (siku)</label><input class="input" id="pd" type="number" min="1" value="${p ? p.duration_days : ''}"></div></div>
        <div class="field"><label>Hali</label><select id="ps"><option value="ACTIVE" ${p && p.status === 'ACTIVE' || !p ? 'selected' : ''}>ACTIVE</option><option value="DISABLED" ${p && p.status === 'DISABLED' ? 'selected' : ''}>DISABLED</option></select></div>
        <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="sv">Hifadhi</button></div>`);
      m.$('#sv').onclick = () => withBusy(m.$('#sv'), async () => {
        try {
          const body = { name: m.$('#pn').value, price: m.$('#pp').value, duration_days: m.$('#pd').value, status: m.$('#ps').value };
          await api(p ? `/api/admin/packages/${p.id}` : '/api/admin/packages', { method: p ? 'PUT' : 'POST', body });
          m.close(); toast('Imehifadhiwa', 'ok'); render();
        } catch (e) { toast(e.message, 'err'); }
      });
    };
    $('#add').onclick = () => form(null); $('#add2').onclick = () => form(null);
    $$('[data-edit]').forEach((b) => (b.onclick = () => form(r.packages.find((x) => x.id === Number(b.dataset.edit)))));
    $$('[data-tog]').forEach((b) => (b.onchange = async () => { const p = r.packages.find((x) => x.id === Number(b.dataset.tog)); try { await api(`/api/admin/packages/${p.id}`, { method: 'PUT', body: { status: b.checked ? 'ACTIVE' : 'DISABLED' } }); toast(b.checked ? 'Kifurushi kinatumika' : 'Kifurushi kimezimwa', 'ok'); render(); } catch (e) { b.checked = !b.checked; toast(e.message, 'err'); } }));
    $$('[data-del]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Futa kifurushi?', 'Kitafutwa kabisa. Kikiwa kimeshatumika, kitakataliwa (kizime badala yake).', 'Futa', true))) return; try { await api(`/api/admin/packages/${b.dataset.del}`, { method: 'DELETE' }); toast('Kimefutwa', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } }));
  }

  // ================= Channels =================
  async function channels() {
    const r = await api('/api/admin/sources');
    const act = r.sources.filter((s) => s.status === 'ACTIVE').length;
    const openSrc = (channels.open = channels.open || new Set()); // sources the admin has expanded survive a refresh
    const health = (s) => {
      if (s.status !== 'ACTIVE') return ['off', 'Imezimwa'];
      if (s.channel_status === 'VALID' && s.has_mpd) return ['ok', 'Inafanya kazi'];
      if (s.channel_status === 'FAILED') return ['bad', 'Imeshindwa'];
      return ['warn', 'Inasubiri data'];
    };
    root().innerHTML = `
      <div class="toolbar"><div class="grow"><b>${r.sources.length}</b> <span class="muted">sources • ${act} zinatumika</span></div><button class="btn primary" id="add">${icon('plus')} Source mpya</button></div>
      <div class="src-list">
      ${r.sources.length ? r.sources.map((s) => { const h = health(s); const open = openSrc.has(s.id); return `<article class="src ${s.status === 'ACTIVE' ? '' : 'is-off'} ${open ? 'open' : ''}" data-src="${s.id}">
        <div class="src-head" role="button" tabindex="0" aria-expanded="${open}" data-open="${s.id}">
          <span class="dot ${h[0]}" title="${esc(h[1])}"></span>
          <div class="src-title"><h3>${esc(s.source_name)}</h3>
            <div class="src-mini"><span class="mono">${esc(hostOf(s.source_url))}</span>${s.has_mpd ? '<span class="mini ok-t">MPD</span>' : ''}${s.has_clearkey ? '<span class="mini ok-t">ClearKey</span>' : ''}<span class="mini">kila dakika ${s.interval_minutes}</span></div></div>
          <span class="state ${h[0]}">${esc(h[1])}</span>
          <label class="switch" title="${s.status === 'ACTIVE' ? 'Zima source' : 'Washa source'}"><input type="checkbox" data-tgl="${s.id}" ${s.status === 'ACTIVE' ? 'checked' : ''}><i></i></label>
          <span class="chev" aria-hidden="true"></span>
        </div>
        <div class="src-body"><div class="src-inner">
        <div class="src-tiles">
          <div class="tile"><span>MPD link</span><b class="${s.has_mpd ? 'ok-t' : 'muted'}">${s.has_mpd ? 'Imepatikana' : 'Haijapatikana'}</b></div>
          <div class="tile"><span>ClearKey</span><b class="${s.has_clearkey ? 'ok-t' : 'muted'}">${s.has_clearkey ? 'Imepatikana' : 'Haijapatikana'}</b></div>
          <div class="tile"><span>Inaombwa kila</span><b>dakika ${s.interval_minutes}</b></div>
          <div class="tile"><span>Ombi la mwisho</span><b>${ago(s.last_fetch_at)}</b></div>
          <div class="tile"><span>Token</span><b>Haiishi</b></div>
          <div class="tile"><span>Aina za token</span><b>${s.token_types && s.token_types.length ? esc(s.token_types.join(', ')) : '—'}</b></div>
        </div>
        <div class="src-ep"><span class="muted">Chanzo</span><code class="trunc">${esc(s.http_method)} ${esc(s.source_url)}</code></div>
        <div class="src-hdrs"><span class="muted">Headers (${s.header_names.length})</span>${s.header_names.length ? s.header_names.slice(0, 8).map((h2) => `<code class="chip">${esc(h2)}</code>`).join('') + (s.header_names.length > 8 ? `<code class="chip more" title="${esc(s.header_names.slice(8).join(', '))}">+${s.header_names.length - 8}</code>` : '') : '<span class="muted">hakuna</span>'}</div>
        <footer class="src-foot"><button class="btn sm primary" data-ex="${s.id}">${icon('play')} Jaribu extraction</button><button class="btn sm" data-lg="${s.id}">${icon('file')} Logs</button><button class="btn sm" data-ed="${s.id}">${icon('edit')} Badilisha</button><button class="btn sm icon danger" data-dl="${s.id}" aria-label="Futa">${icon('trash')}</button></footer>
        </div></div>
      </article>`; }).join('') : `<div class="card empty">Hakuna source bado. Bonyeza "Source mpya" kuanza.</div>`}
      </div>
      <details class="card allow mt"><summary>${icon('globe')} Allowed hosts (allowlist) <span class="muted">• ${r.allowed_hosts.length} domain</span></summary>
        <div class="row" style="margin-top:12px"><input class="input grow" id="hosts" value="${esc(r.allowed_hosts.join(', '))}" placeholder="example.com, *.cdn.example.com"><button class="btn primary" id="sh">Hifadhi</button></div>
        <p class="hint">Domain ya Source URL na ya MPD URL lazima ziwe humu, zikitenganishwa kwa koma. Seva haifuati redirects na haihifadhi HTML. Tumia vyanzo ulivyoidhinishwa pekee.</p></details>`;
    const toggleSrc = (head) => {
      const card = head.closest('.src'); const id = Number(head.dataset.open);
      const now = !card.classList.contains('open');
      card.classList.toggle('open', now); head.setAttribute('aria-expanded', String(now));
      if (now) openSrc.add(id); else openSrc.delete(id);
    };
    $$('[data-open]').forEach((h2) => {
      h2.addEventListener('click', (e) => { if (e.target.closest('.switch')) return; toggleSrc(h2); });
      h2.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h2) { e.preventDefault(); toggleSrc(h2); } });
    });
    $$('[data-cp]').forEach((b) => (b.onclick = () => copyText(location.origin + b.dataset.cp, b)));
    $$('[data-tgl]').forEach((b) => (b.onchange = async () => {
      const want = b.checked ? 'ACTIVE' : 'DISABLED';
      try { await api(`/api/admin/sources/${b.dataset.tgl}`, { method: 'PUT', body: { status: want } }); toast(want === 'ACTIVE' ? 'Source imewashwa' : 'Source imezimwa', 'ok'); render(); } catch (e) { b.checked = !b.checked; toast(e.message, 'err'); }
    }));
    $('#sh').onclick = () => withBusy($('#sh'), async () => { try { await api('/api/admin/allowed-hosts', { method: 'PUT', body: { hosts: $('#hosts').value } }); toast('Allowlist imehifadhiwa', 'ok'); } catch (e) { toast(e.message, 'err'); } });
    $$('[data-ex]').forEach((b) => (b.onclick = () => withBusy(b, async () => {
      try { const x = await api(`/api/admin/sources/${b.dataset.ex}/extract`, { method: 'POST' }); toast(`Imefanikiwa: ${x.result.value_preview} (host ${x.result.host})`, 'ok'); render(); } catch (e) { toast(e.message, 'err'); render(); }
    })));
    $$('[data-lg]').forEach((b) => (b.onclick = async () => {
      try {
        const l = await api(`/api/admin/sources/${b.dataset.lg}/logs`);
        openModal(`<h3>Extraction logs</h3><div class="table-wrap"><table><thead><tr><th>Muda</th><th>Matokeo</th><th>HTTP</th><th>ms</th><th>Na</th><th>Ujumbe</th></tr></thead><tbody>
          ${l.logs.length ? l.logs.map((x) => `<tr><td>${fmtDate(x.created_at)}</td><td>${badge(x.success ? 'SUCCESS' : 'FAILED')}</td><td>${x.http_status || '—'}</td><td>${x.duration_ms || '—'}</td><td>${esc(x.triggered_by)}</td><td class="wrap">${esc(x.message)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Hakuna logs.</td></tr>'}</tbody></table></div><div class="actions"><button class="btn" data-close>Funga</button></div>`, { wide: true });
      } catch (e) { toast(e.message, 'err'); }
    }));
    $$('[data-dl]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Futa source?', 'Source na channel yake vitafutwa.', 'Futa', true))) return; try { await api(`/api/admin/sources/${b.dataset.dl}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); } }));

    const form = (s) => {
      const rulesDefault = JSON.stringify(s ? s.extraction_rules : { tokenTtlSeconds: 3600 }, null, 2);
      const m = openModal(`<h3>${s ? 'Badilisha source' : 'Source mpya'}</h3>
        <div class="field"><label>Source Name</label><input class="input" id="sn" value="${esc(s ? s.source_name : '')}"></div>
        <div class="field"><label>Source URL (https, au link yoyote ya .mpd)</label><input class="input" id="su" value="${esc(s ? s.source_url : '')}" placeholder="https://authorized-host.example/path  au  https://cdn.example/live/manifest.mpd?token=..."><div class="hint">Link inayoishia <code>.mpd</code> inapokelewa kutoka host yoyote (http au https): token inachukuliwa kwenye link yenyewe. Domain ya kurasa za source inaongezwa kwenye allowlist yenyewe ukithibitisha idhini.</div></div>
        <div class="grid cols-2"><div class="field"><label>HTTP Method</label><select id="sm"><option>GET</option><option ${s && s.http_method === 'POST' ? 'selected' : ''}>POST</option></select></div>
        <div class="field"><label>Content Type</label><input class="input" id="sc" value="${esc(s && s.content_type || '')}" placeholder="application/json"></div></div>
        <div class="field"><label>Headers ${s ? '(acha tupu kuziacha kama zilivyo)' : ''}</label><textarea id="sh2" rows="8" placeholder='Bandika kama ulivyo-copy kwenye browser (kila mstari "name: value"), au JSON:&#10;accept: text/html,application/xhtml+xml&#10;accept-encoding: gzip, deflate, br&#10;cookie: a=1; b=2&#10;referer: https://authorized-host.example/&#10;sec-ch-ua: "Chromium";v="141"&#10;user-agent: Mozilla/5.0 ...'></textarea><div class="hint">Inasaidia: accept, accept-encoding, accept-language, cache-control, cookie, priority, referer, sec-ch-ua*, sec-fetch-*, upgrade-insecure-requests, user-agent na zingine. Zinahifadhiwa zimesimbwa kwenye seva na hazionyeshwi tena.</div></div>
        <div class="field"><label>Extraction Rules (JSON)</label><textarea id="sr">${esc(rulesDefault)}</textarea>
        <div class="hint"><code>mpdUrlRegex</code>, <code>tokenParam</code> (jina la parameter ya token, mfano "cdntoken"), <code>tokenRegex</code>, <code>tokenTtlSeconds</code>, <code>expiryParam</code>, <code>valueType</code> ("token" | "url"), <code>channelName</code>, <code>clearKeyPath</code>, <code>clearKeyRegex</code>, <code>requireClearKey</code></div></div>
        <div class="field"><label>Tuma request kwenye source kila (dakika 1–60)</label><input class="input" id="si" type="number" min="1" max="60" value="${s ? s.interval_minutes : 3}"></div>
        <div class="field"><label>Source Status</label><select id="ss"><option value="DISABLED" ${s && s.status === 'DISABLED' || !s ? 'selected' : ''}>DISABLED</option><option value="ACTIVE" ${s && s.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE (inaruhusiwa kutumika)</option></select></div>
        <label class="check"><input type="checkbox" id="sa" ${s && s.authorized_at ? 'checked' : ''}><span>Nathibitisha kuwa nina idhini ya mtoa huduma kutumia chanzo hiki na kutoa taarifa hii.</span></label>
        <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="sv">Hifadhi</button></div>`, { wide: true });
      m.$('#sv').onclick = () => withBusy(m.$('#sv'), async () => {
        try {
          const body = { source_name: m.$('#sn').value, source_url: m.$('#su').value, http_method: m.$('#sm').value, content_type: m.$('#sc').value, extraction_rules: m.$('#sr').value, interval_minutes: Number(m.$('#si').value || 3), status: m.$('#ss').value, confirmAuthorized: m.$('#sa').checked };
          if (m.$('#sh2').value.trim()) body.headers = m.$('#sh2').value;
          await api(s ? `/api/admin/sources/${s.id}` : '/api/admin/sources', { method: s ? 'PUT' : 'POST', body });
          m.close(); toast('Imehifadhiwa', 'ok'); render();
        } catch (e) { toast(e.message, 'err'); }
      });
    };
    $('#add').onclick = () => form(null);
    $$('[data-ed]').forEach((b) => (b.onclick = () => form(r.sources.find((x) => x.id === Number(b.dataset.ed)))));
  }

  // ================= Proxy links (m3u8 / m4s) =================
  async function proxy() {
    const r = await api('/api/admin/proxy');
    const openP = (proxy.open = proxy.open || new Set());
    const act = r.channels.filter((c) => c.status === 'ACTIVE').length;
    root().innerHTML = `
      <div class="toolbar"><div class="grow"><b>${r.channels.length}</b> <span class="muted">proxy links • ${act} zinatumika</span></div><button class="btn primary" id="add">${icon('plus')} Proxy mpya</button></div>
      <div class="alert info" style="margin-bottom:14px">${icon('link')} <span>Link ya proxy haionyeshi source halisi. Ni admin pekee anayeiona hapa na kuiga. Yeyote mwenye link anaweza kuicheza, kwa hiyo usiishiriki hadharani; ukiivujisha bonyeza "Link mpya".</span></div>
      <div class="src-list">
      ${r.channels.length ? r.channels.map((c) => { const open = openP.has(c.id); const st = c.status === 'ACTIVE' ? ['ok', 'Inafanya kazi'] : ['off', 'Imezimwa']; return `<article class="src ${c.status === 'ACTIVE' ? '' : 'is-off'} ${open ? 'open' : ''}">
        <div class="src-head" role="button" tabindex="0" aria-expanded="${open}" data-open="${c.id}">
          <span class="dot ${st[0]}"></span>
          <div class="src-title"><h3>${esc(c.name)}</h3><div class="src-mini"><span class="mini ok-t">${esc(c.type)}</span><span class="mini">${c.hits} maombi</span><span class="mini">${c.last_used_at ? 'ilitumika ' + ago(c.last_used_at) : 'haijatumika'}</span></div></div>
          <span class="state ${st[0]}">${st[1]}</span>
          <label class="switch"><input type="checkbox" data-tgl="${c.id}" ${c.status === 'ACTIVE' ? 'checked' : ''}><i></i></label>
          <span class="chev" aria-hidden="true"></span>
        </div>
        <div class="src-body"><div class="src-inner">
          <div class="src-ep"><span class="muted">Proxy link</span><code class="trunc">${c.link ? esc(c.link) : 'Haipatikani (tengeneza link mpya)'}</code>${c.link ? `<button class="btn sm primary" data-cp="${esc(c.link)}">${icon('copy')} Copy</button>` : ''}${c.link && c.clearkeys && c.clearkeys.length ? `<button class="btn sm primary" data-cp="${esc(c.link + '\n' + c.clearkeys.map((k) => 'ClearKey: ' + k).join('\n'))}">${icon('copy')} Copy + ClearKey</button>` : ''}</div>
          ${c.kind === 'M4S' && !(c.clearkeys && c.clearkeys.length) ? `<div class="src-ep"><span class="muted">ClearKey</span><span class="muted">Haijawekwa. Bonyeza "Badilisha" kisha weka kid:key.</span></div>` : ''}
          ${c.clearkeys && c.clearkeys.length ? `<div class="src-ep"><span class="muted">ClearKey</span><code class="trunc">${esc(c.clearkeys.join(' , '))}</code><button class="btn sm" data-cp="${esc(c.clearkeys.join('\n'))}">${icon('copy')} Copy</button></div>
          <div class="src-ep"><span class="muted">License URL</span><code class="trunc">${esc(c.clearkey_link || '')}</code>${c.clearkey_link ? `<button class="btn sm" data-cp="${esc(c.clearkey_link)}">${icon('copy')} Copy</button>` : ''}</div>` : ''}
          <div class="src-ep"><span class="muted">Source</span><code class="trunc">${esc(c.source_host || '')} — imefichwa kwa watumiaji</code></div>
          <div class="src-hdrs"><span class="muted">Headers (${c.header_names.length})</span>${c.header_names.length ? c.header_names.slice(0, 8).map((h) => `<code class="chip">${esc(h)}</code>`).join('') : '<span class="muted">hakuna</span>'}</div>
          <footer class="src-foot"><button class="btn sm" data-ts="${c.id}">${icon('play')} Jaribu</button><button class="btn sm" data-ed="${c.id}">${icon('edit')} Badilisha</button><button class="btn sm" data-rg="${c.id}">${icon('refresh')} Link mpya</button><button class="btn sm icon danger" data-dl="${c.id}" aria-label="Futa">${icon('trash')}</button></footer>
        </div></div></article>`; }).join('') : '<div class="card empty">Hakuna proxy link bado. Bonyeza "Proxy mpya".</div>'}
      </div>`;
    const toggle = (head) => { const card = head.closest('.src'); const id = Number(head.dataset.open); const now = !card.classList.contains('open'); card.classList.toggle('open', now); head.setAttribute('aria-expanded', String(now)); if (now) openP.add(id); else openP.delete(id); };
    $$('[data-open]').forEach((h) => { h.addEventListener('click', (e) => { if (e.target.closest('.switch')) return; toggle(h); }); h.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h) { e.preventDefault(); toggle(h); } }); });
    $$('[data-cp]').forEach((b) => (b.onclick = () => copyText(b.dataset.cp, b)));
    $$('[data-tgl]').forEach((b) => (b.onchange = async () => { try { await api(`/api/admin/proxy/${b.dataset.tgl}`, { method: 'PUT', body: { status: b.checked ? 'ACTIVE' : 'DISABLED' } }); render(); } catch (e) { b.checked = !b.checked; toast(e.message, 'err'); } }));
    $$('[data-ts]').forEach((b) => (b.onclick = () => withBusy(b, async () => { try { const x = await api(`/api/admin/proxy/${b.dataset.ts}/test`, { method: 'POST' }); if (x.ok && x.result.ok) toast(`Sawa: ${x.result.type} (${x.result.host})`, 'ok'); else toast(x.error || x.result.message, 'err'); } catch (e) { toast(e.message, 'err'); } })));
    $$('[data-rg]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Tengeneza link mpya?', 'Link ya zamani itaacha kufanya kazi mara moja.', 'Endelea', true))) return; try { await api(`/api/admin/proxy/${b.dataset.rg}/regenerate`, { method: 'POST' }); toast('Link mpya imetengenezwa', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } }));
    $$('[data-dl]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Futa proxy link?', 'Link hii itaacha kufanya kazi.', 'Futa', true))) return; try { await api(`/api/admin/proxy/${b.dataset.dl}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); } }));

    const TYPES = [['M3U8', false, 'm3u8'], ['M3U8', true, 'm3u8 + header'], ['M4S', false, 'm4s'], ['M4S', true, 'm4s + header']];
    const form = (c) => {
      const cur = c ? (c.kind === 'M3U8' ? 0 : 2) + (c.with_header ? 1 : 0) : 0;
      const m = openModal(`<h3>${c ? 'Badilisha proxy' : 'Proxy mpya'}</h3>
        <div class="field"><label>Aina</label><div class="chips" id="pt">${TYPES.map((t, i) => `<button type="button" class="chip ${i === cur ? 'active' : ''}" data-t="${i}">${t[2]}</button>`).join('')}</div></div>
        <div class="field"><label>Jina la channel</label><input class="input" id="pn" value="${esc(c ? c.name : '')}"></div>
        <div class="field"><label>Source URL (http au https)</label><input class="input" id="pu" value="${esc(c ? c.source_url : '')}" placeholder="http://authorized-host.example/live/index.m3u8"></div>
        <div class="field" id="ph"><label>Headers ${c ? '(acha tupu kuziacha kama zilivyo)' : ''}</label><textarea id="phx" rows="7" placeholder="referer: https://authorized-host.example/&#10;user-agent: Mozilla/5.0 ...&#10;cookie: a=1"></textarea><div class="hint">Zinahifadhiwa zimesimbwa na hazionyeshwi tena.</div></div>
        <div class="field" id="pk"><label>ClearKey (hiari) ${c ? '(acha tupu kuziacha; weka "-" kufuta)' : ''}</label><textarea id="pkx" rows="3" placeholder="kid:key (hex 32 : hex 32), mstari mmoja kwa key"></textarea><div class="hint">Ukiweka, MPD ya proxy inajumuisha ClearKey license URL ya proxy hii, kwa hiyo player inapata key yenyewe. Link ya license pia inaonekana kwenye kadi.</div></div>
        <label class="check"><input type="checkbox" id="pa" ${c ? 'checked' : ''}><span>Nathibitisha kuwa nina idhini ya kutumia na kusambaza stream hii. Domain lazima iwe kwenye allowlist.</span></label>
        <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="pv">Hifadhi</button></div>`, { wide: true });
      let sel = cur; const sync = () => { m.$('#ph').style.display = TYPES[sel][1] ? '' : 'none'; m.$('#pk').style.display = TYPES[sel][0] === 'M4S' ? '' : 'none'; document.querySelectorAll('#pt .chip').forEach((x) => x.classList.toggle('active', Number(x.dataset.t) === sel)); };
      document.querySelectorAll('#pt .chip').forEach((x) => (x.onclick = () => { sel = Number(x.dataset.t); sync(); })); sync();
      m.$('#pv').onclick = () => withBusy(m.$('#pv'), async () => {
        try {
          const body = { name: m.$('#pn').value, source_url: m.$('#pu').value, kind: TYPES[sel][0], with_header: TYPES[sel][1], confirmAuthorized: m.$('#pa').checked };
          if (TYPES[sel][1] && m.$('#phx').value.trim()) body.headers = m.$('#phx').value;
          const ck = m.$('#pkx').value.trim(); if (TYPES[sel][0] === 'M4S' && ck) body.clearkey = ck === '-' ? '' : ck;
          await api(c ? `/api/admin/proxy/${c.id}` : '/api/admin/proxy', { method: c ? 'PUT' : 'POST', body });
          m.close(); toast('Imehifadhiwa', 'ok'); if (c) openP.add(c.id); render();
        } catch (e) { toast(e.message, 'err'); }
      });
    };
    $('#add').onclick = () => form(null);
    $$('[data-ed]').forEach((b) => (b.onclick = () => form(r.channels.find((x) => x.id === Number(b.dataset.ed)))));
  }

  // ================= beinProxy (paste one m3u8 link -> copyable proxy m3u8 link) =================
  async function bein() {
    const r = await api('/api/admin/bein');
    const act = r.channels.filter((c) => c.status === 'ACTIVE').length;
    root().innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <b>${icon('link')} Link mpya ya m3u8</b>
        <div class="field"><input class="input" id="bu" placeholder="http://re300.new-redirect.online/live/645587700/index.m3u8?t=...&e=..." autocomplete="off" spellcheck="false"></div>
        <div class="field"><input class="input" id="bn" placeholder="Jina (hiari)"></div>
        <div class="field"><label>Headers (hiari)</label><textarea id="bh" rows="4" spellcheck="false" placeholder="referer: https://site.example/&#10;user-agent: Mozilla/5.0 ...&#10;cookie: a=1&#10;au JSON: {&quot;Referer&quot;:&quot;https://site.example/&quot;}"></textarea><div class="hint">Zinahifadhiwa zimesimbwa na hazionyeshwi tena. Acha tupu kama haihitajiki.</div></div>
        <label class="check"><input type="checkbox" id="ba"><span>Nathibitisha kuwa nina idhini ya kutumia na kusambaza stream hii.</span></label>
        <div class="actions" style="margin-top:10px"><button class="btn primary" id="bgo">${icon('plus')} Tengeneza proxy link</button></div>
      </div>
      <div class="alert info" style="margin-bottom:14px">${icon('link')} <span>Bandika link ya m3u8 (http au https, hata ikiwa na <code>?t=...&amp;e=...</code>). Seva inatengeneza link ya proxy ya m3u8 unayoweza kunakili; source halisi haionekani kwa mtumiaji. Link ya source ikiisha muda (<code>e=</code>), bonyeza "Badilisha link" uweke mpya; proxy link inabaki ile ile.</span></div>
      <div class="toolbar"><div class="grow"><b>${r.channels.length}</b> <span class="muted">beinProxy • ${act} zinatumika</span></div></div>
      <div class="src-list">
      ${r.channels.length ? r.channels.map((c) => `<article class="src ${c.status === 'ACTIVE' ? '' : 'is-off'} open">
        <div class="src-head"><span class="dot ${c.status === 'ACTIVE' ? 'ok' : 'off'}"></span>
          <div class="src-title"><h3>${esc(c.name)}</h3><div class="src-mini"><span class="mini ok-t">m3u8</span><span class="mini">${c.hits} maombi</span><span class="mini">${c.last_used_at ? 'ilitumika ' + ago(c.last_used_at) : 'haijatumika'}</span></div></div>
          <label class="switch"><input type="checkbox" data-tgl="${c.id}" ${c.status === 'ACTIVE' ? 'checked' : ''}><i></i></label></div>
        <div class="src-body" style="display:block"><div class="src-inner">
          <div class="src-ep"><span class="muted">Proxy m3u8</span><code class="trunc">${c.link ? esc(c.link) : 'Haipatikani (bonyeza Link mpya)'}</code>${c.link ? `<button class="btn sm primary" data-cp="${esc(c.link)}">${icon('copy')} Copy</button>` : ''}</div>
          <div class="src-ep"><span class="muted">Source</span><code class="trunc">${esc(c.source_host || '')} — imefichwa</code></div>
          <div class="src-hdrs"><span class="muted">Headers (${c.header_names.length})</span>${c.header_names.length ? c.header_names.slice(0, 8).map((h) => `<code class="chip">${esc(h)}</code>`).join('') : '<span class="muted">hakuna</span>'}</div>
          <footer class="src-foot"><button class="btn sm" data-ts="${c.id}">${icon('play')} Jaribu</button><button class="btn sm" data-ed="${c.id}">${icon('edit')} Badilisha</button><button class="btn sm" data-rg="${c.id}">${icon('refresh')} Link mpya</button><button class="btn sm icon danger" data-dl="${c.id}" aria-label="Futa">${icon('trash')}</button></footer>
        </div></div></article>`).join('') : '<div class="card empty">Hakuna beinProxy bado. Bandika link juu.</div>'}
      </div>`;
    $$('[data-cp]').forEach((b) => (b.onclick = () => copyText(b.dataset.cp, b)));
    $('#bgo').onclick = () => withBusy($('#bgo'), async () => {
      try { const x = await api('/api/admin/bein', { method: 'POST', body: { url: $('#bu').value, name: $('#bn').value, headers: $('#bh').value, confirmAuthorized: $('#ba').checked } }); toast('Proxy link imetengenezwa', 'ok'); if (x.channel && x.channel.link) copyText(x.channel.link).catch(() => {}); render(); }
      catch (e) { toast(e.message, 'err'); }
    });
    $$('[data-tgl]').forEach((b) => (b.onchange = async () => { try { await api(`/api/admin/bein/${b.dataset.tgl}`, { method: 'PUT', body: { status: b.checked ? 'ACTIVE' : 'DISABLED' } }); render(); } catch (e) { b.checked = !b.checked; toast(e.message, 'err'); } }));
    $$('[data-ts]').forEach((b) => (b.onclick = () => withBusy(b, async () => { try { const x = await api(`/api/admin/bein/${b.dataset.ts}/test`, { method: 'POST' }); if (x.ok && x.result.ok) toast(`Sawa: ${x.result.type} (${x.result.host})`, 'ok'); else toast(x.error || x.result.message, 'err'); } catch (e) { toast(e.message, 'err'); } })));
    $$('[data-rg]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Tengeneza link mpya?', 'Proxy link ya zamani itaacha kufanya kazi mara moja.', 'Endelea', true))) return; try { await api(`/api/admin/bein/${b.dataset.rg}/regenerate`, { method: 'POST' }); toast('Link mpya imetengenezwa', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } }));
    $$('[data-dl]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Futa?', 'Proxy link hii itaacha kufanya kazi.', 'Futa', true))) return; try { await api(`/api/admin/bein/${b.dataset.dl}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); } }));
    $$('[data-ed]').forEach((b) => (b.onclick = () => { const c = r.channels.find((x) => x.id === Number(b.dataset.ed));
      const m = openModal(`<h3>Badilisha ${esc(c.name)}</h3><div class="field"><label>Link mpya ya source (acha tupu kuiacha)</label><input class="input" id="eu" placeholder="http://.../index.m3u8?t=...&e=..."></div><div class="field"><label>Headers (acha tupu kuziacha; weka "-" kuziondoa)</label><textarea id="eh" rows="4" spellcheck="false" placeholder="referer: https://site.example/"></textarea></div><div class="hint">Proxy link ya ${esc(c.name)} inabaki ile ile.</div><div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="es">Hifadhi</button></div>`);
      m.$('#es').onclick = () => withBusy(m.$('#es'), async () => { try { await api(`/api/admin/bein/${c.id}`, { method: 'PUT', body: (() => { const b = {}; if (m.$('#eu').value.trim()) b.url = m.$('#eu').value; if (m.$('#eh').value.trim()) b.headers = m.$('#eh').value; return b; })() }); m.close(); toast('Imehifadhiwa', 'ok'); render(); } catch (e) { toast(e.message, 'err'); } }); }));
  }

  // ================= amiriChannel (MPD link + token from a source + ClearKey) =================
  async function amiri() {
    const r = await api('/api/admin/amiri');
    const openA = (amiri.open = amiri.open || new Set());
    const act = r.channels.filter((c) => c.status === 'ACTIVE').length;
    const tok = (c) => (c.token_state === 'VALID' ? ['ok', 'Token ipo'] : c.token_state === 'FAILED' ? ['bad', 'Source imeshindwa'] : ['warn', 'Inasubiri token']);
    root().innerHTML = `
      <div class="toolbar"><div class="grow"><b>${r.channels.length}</b> <span class="muted">amiriChannel • ${act} zinatumika</span></div><button class="btn primary" id="add" ${r.sources.length ? '' : 'disabled'}>${icon('plus')} Channel mpya</button></div>
      ${r.channels.length && r.sources.length ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div style="flex:1 1 220px"><b>${icon('refresh')} Source ya channel zote</b><div class="hint">${r.common_source_id ? 'Channel zote zinatumia source hii.' : 'Channel zinatumia sources tofauti. Chagua moja ili zote zitumie hiyo.'}</div></div>
        <select id="allsrc" style="flex:0 1 240px;min-width:180px">${r.common_source_id ? '' : '<option value="">— chagua source —</option>'}${r.sources.map((x) => `<option value="${x.id}" ${r.common_source_id === x.id ? 'selected' : ''}>${esc(x.source_name)}</option>`).join('')}</select>
        <button class="btn primary" id="allsrcb">${icon('check')} Tumia kwa zote</button></div></div>` : ''}
      <div class="alert info" style="margin-bottom:14px">${icon('radio')} <span>Bandika link nzima ya MPD. Seva inatambua sehemu ya token na kuibadilisha na token ya sasa ya source uliyochagua (inayosasishwa kila dakika chache). Weka ClearKey chini.${r.sources.length ? '' : ' <b>Weka source kwanza kwenye Channels.</b>'}</span></div>
      <div class="src-list">
      ${r.channels.length ? r.channels.map((c) => { const open = openA.has(c.id); const t = tok(c); const on = c.status === 'ACTIVE'; return `<article class="src ${on ? '' : 'is-off'} ${open ? 'open' : ''}">
        <div class="src-head" role="button" tabindex="0" aria-expanded="${open}" data-open="${c.id}">
          <span class="dot ${on ? t[0] : 'off'}"></span>
          <div class="src-title"><h3>${esc(c.name)}</h3><div class="src-mini"><span class="mono">${esc(c.host || '')}</span><span class="mini ok-t">MPD</span>${c.clearkeys.length ? '<span class="mini ok-t">ClearKey</span>' : '<span class="mini">bila ClearKey</span>'}<span class="mini">source: ${esc(c.source_name)}</span></div></div>
          <span class="state ${on ? t[0] : 'off'}">${on ? t[1] : 'Imezimwa'}</span>
          <label class="switch"><input type="checkbox" data-tgl="${c.id}" ${on ? 'checked' : ''}><i></i></label>
          <span class="chev" aria-hidden="true"></span>
        </div>
        <div class="src-body"><div class="src-inner">
          <div class="src-ep"><span class="muted">MPD link</span><code class="trunc">${esc(c.preview)}</code>${c.link ? `<button class="btn sm primary" data-cp="${esc(c.link)}">${icon('copy')} Copy</button>` : '<span class="muted">Token haipo sasa</span>'}</div>
          <div class="src-ep"><span class="muted">ClearKey</span>${c.clearkeys.length ? `<code class="trunc">${esc(c.clearkeys.join(' , '))}</code><button class="btn sm" data-cp="${esc(c.clearkeys.join('\n'))}">${icon('copy')} Copy</button>${c.link ? `<button class="btn sm primary" data-cp="${esc(c.link + '\n' + c.clearkeys.map((k) => 'ClearKey: ' + k).join('\n'))}">${icon('copy')} Copy zote</button>` : ''}` : '<span class="muted">Haijawekwa. Bonyeza "Badilisha".</span>'}</div>
          <div class="src-ep"><span class="muted">API endpoint</span><code class="trunc">/api/v1/amiri/${esc(c.slug)}</code><button class="btn sm icon" data-cp="${esc(c.endpoint)}" aria-label="Copy">${icon('copy')}</button></div>
          <div class="src-ep"><span class="muted">Token za source</span>${c.token_types.length ? c.token_types.map((x) => `<code class="chip">${esc(x)}</code>`).join('') : '<span class="muted">hakuna (source haijapata token)</span>'}${c.token_note ? `<span class="state warn">${esc(c.token_note)}</span>` : ''}</div>
          <div class="src-ep"><span class="muted">Token</span><b>Haiishi</b></div>
          <footer class="src-foot"><button class="btn sm" data-ed="${c.id}">${icon('edit')} Badilisha</button><button class="btn sm icon danger" data-dl="${c.id}" aria-label="Futa">${icon('trash')}</button></footer>
        </div></div></article>`; }).join('') : '<div class="card empty">Hakuna amiriChannel bado. Bonyeza "Channel mpya".</div>'}
      </div>`;
    const toggle = (head) => { const card = head.closest('.src'); const id = Number(head.dataset.open); const now = !card.classList.contains('open'); card.classList.toggle('open', now); head.setAttribute('aria-expanded', String(now)); if (now) openA.add(id); else openA.delete(id); };
    $$('[data-open]').forEach((h) => { h.addEventListener('click', (e) => { if (e.target.closest('.switch')) return; toggle(h); }); h.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === h) { e.preventDefault(); toggle(h); } }); });
    $$('[data-cp]').forEach((b) => (b.onclick = () => copyText(b.dataset.cp, b)));
    $$('[data-tgl]').forEach((b) => (b.onchange = async () => { try { await api(`/api/admin/amiri/${b.dataset.tgl}`, { method: 'PUT', body: { status: b.checked ? 'ACTIVE' : 'DISABLED' } }); render(); } catch (e) { b.checked = !b.checked; toast(e.message, 'err'); } }));
    $$('[data-dl]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Futa channel?', 'Itaacha kutolewa kwenye API.', 'Futa', true))) return; try { await api(`/api/admin/amiri/${b.dataset.dl}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); } }));
    const form = (c) => {
      const m = openModal(`<h3>${c ? 'Badilisha amiriChannel' : 'amiriChannel mpya'}</h3>
        <div class="field"><label>Jina la channel</label><input class="input" id="an" value="${esc(c ? c.name : '')}"></div>
        <div class="field"><label>Source ya token</label><select id="as">${r.sources.map((s) => `<option value="${s.id}" ${c && c.source_id === s.id ? 'selected' : ''}>${esc(s.source_name)}</option>`).join('')}</select><div class="hint">Token itachukuliwa kutoka kwenye source hii (inasasishwa na seva).</div></div>
        <div class="field"><label>Link nzima ya MPD (http au https)</label><textarea id="al" rows="3" placeholder="https://authorized-host.example/live/tok_AbC123.../ch1/manifest.mpd&#10;(ukitaka, weka {token} mahali token inapokaa)">${esc(c ? (c.link || c.template) : '')}</textarea><div class="hint">Seva inatafuta token ya sasa (au muundo wa tokenRegex wa source) ndani ya link na kuibadilisha. Haikuipata? Andika <code>{token}</code> mahali pake.</div></div>
        <div class="field"><label>ClearKey ${c ? '(futa kila kitu ili kuondoa)' : ''}</label><textarea id="ak" rows="3" placeholder="kid:key (hex 32 : hex 32), mstari mmoja kwa key">${esc(c ? c.clearkeys.join('\n') : '')}</textarea></div>
        <label class="check"><input type="checkbox" id="aa" ${c ? 'checked' : ''}><span>Nathibitisha kuwa nina idhini ya kutumia na kusambaza link hii. Domain lazima iwe kwenye allowlist.</span></label>
        <div class="actions"><button class="btn" data-close>Ghairi</button><button class="btn primary" id="av">Hifadhi</button></div>`, { wide: true });
      m.$('#av').onclick = () => withBusy(m.$('#av'), async () => {
        try {
          const body = { name: m.$('#an').value, source_id: Number(m.$('#as').value), confirmAuthorized: m.$('#aa').checked };
          if (m.$('#al').value.trim()) body.link = m.$('#al').value.trim();
          if (c || m.$('#ak').value.trim()) body.clearkey = m.$('#ak').value.trim();
          const x = await api(c ? `/api/admin/amiri/${c.id}` : '/api/admin/amiri', { method: c ? 'PUT' : 'POST', body });
          m.close(); toast(x.detected ? `Imehifadhiwa (token imetambuliwa: ${({ marker: '{token}', 'current-token': 'token ya sasa', regex: 'tokenRegex' })[x.detected] || x.detected})` : 'Imehifadhiwa', 'ok'); render();
        } catch (e) { toast(e.message, 'err'); }
      });
    };
    if ($('#allsrcb')) $('#allsrcb').onclick = async () => {
      const id = Number($('#allsrc').value);
      if (!id) return toast('Chagua source kwanza', 'err');
      const name = r.sources.find((x) => x.id === id).source_name;
      if (!(await confirmBox('Badilisha source ya channel zote?', `Channel zote ${r.channels.length} zitachukua token kutoka "${name}". Hakikisha token ya source hiyo inafaa links zote.`, 'Badilisha zote', false))) return;
      withBusy($('#allsrcb'), async () => { try { const x = await api('/api/admin/amiri/source-all', { method: 'PUT', body: { source_id: id } }); toast(`Source imebadilishwa (${x.changed} channel)`, 'ok'); render(); } catch (e) { toast(e.message, 'err'); } });
    };
    $('#add').onclick = () => form(null);
    $$('[data-ed]').forEach((b) => (b.onclick = () => form(r.channels.find((x) => x.id === Number(b.dataset.ed)))));
  }

  // ================= Payments =================
  async function payments() {
    root().innerHTML = `<div class="row between" style="margin-bottom:16px">
      <div class="input-icon grow" style="max-width:420px">${icon('search')}<input class="input" id="q" placeholder="Transaction ID, simu au provider reference"></div>
      <div class="tabs" id="flt"><button data-s="" class="active">Yote</button><button data-s="SUCCESS">Zilizofanikiwa</button><button data-s="PENDING">Zinazosubiri</button><button data-s="FAILED">Zilizoshindwa</button></div></div><div id="list"></div>`;
    let page = 1, status = '';
    const load = async () => {
      try {
        const r = await api(`/api/admin/payments?page=${page}&status=${status}&search=${encodeURIComponent($('#q').value.trim())}`);
        $('#list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tarehe</th><th>Mtumiaji</th><th>Kifurushi</th><th>Kiasi</th><th>Transaction ID</th><th>Hali</th><th></th></tr></thead><tbody>
          ${r.payments.length ? r.payments.map((p) => `<tr><td>${fmtDate(p.created_at)}</td><td>${esc(p.full_name)}<div class="hint mono">${esc(p.phone_number)}</div></td><td>${esc(p.package_name)}</td><td>${fmtMoney(p.amount)}</td>
            <td class="mono">${esc(p.transaction_id)}<div class="hint">${esc(p.provider_reference || '')}</div></td><td>${badge(p.payment_status === 'PENDING' ? 'PROCESSING' : p.payment_status)}${p.failure_message ? `<div class="hint">${esc(p.failure_message)}</div>` : ''}</td>
            <td class="right"><button class="btn sm" data-d="${esc(p.transaction_id)}">Maelezo</button>${p.payment_status === 'SUCCESS' ? '' : ` <button class="btn sm" data-v="${esc(p.transaction_id)}" title="Thibitisha na ClickPesa">${icon('refresh')}</button>`}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">Hakuna malipo.</td></tr>'}</tbody></table></div>
          <div class="row between mt"><span class="muted">Jumla: ${r.total}</span><div class="row"><button class="btn sm" id="prev" ${page <= 1 ? 'disabled' : ''}>← Nyuma</button><span class="muted">Ukurasa ${r.page}</span><button class="btn sm" id="next" ${page * r.limit >= r.total ? 'disabled' : ''}>Mbele →</button></div></div>`;
        $('#prev').onclick = () => { page--; load(); }; $('#next').onclick = () => { page++; load(); };
        $$('[data-v]').forEach((b) => (b.onclick = () => withBusy(b, async () => { try { const x = await api(`/api/admin/payments/${b.dataset.v}/verify`, { method: 'POST' }); toast(`Matokeo: ${x.result}`, 'info'); load(); } catch (e) { toast(e.message, 'err'); } })));
        $$('[data-d]').forEach((b) => (b.onclick = () => {
          const p = r.payments.find((x) => x.transaction_id === b.dataset.d);
          openModal(`<h3>Taarifa za malipo</h3><dl class="kv"><dt>Transaction ID</dt><dd class="mono">${esc(p.transaction_id)}</dd><dt>Provider ref</dt><dd class="mono">${esc(p.provider_reference || '—')}</dd><dt>Mtumiaji</dt><dd>${esc(p.full_name)} (${esc(p.phone_number)})</dd>
            <dt>Namba ya malipo</dt><dd>${esc(p.payment_phone || '—')}</dd><dt>Kifurushi</dt><dd>${esc(p.package_name)}</dd><dt>Kiasi</dt><dd>${fmtMoney(p.amount)} ${esc(p.currency)}</dd><dt>Hali</dt><dd>${badge(p.payment_status)} <span class="muted">${esc(p.provider_status || '')}</span></dd>
            <dt>Imeanzishwa</dt><dd>${fmtDate(p.created_at)}</dd><dt>Imethibitishwa</dt><dd>${fmtDate(p.confirmed_at)}</dd><dt>Ujumbe</dt><dd>${esc(p.failure_message || '—')}</dd></dl><div class="actions"><button class="btn" data-close>Funga</button></div>`);
        }));
      } catch (e) { $('#list').innerHTML = errBox(e); }
    };
    $('#q').addEventListener('input', debounce(() => { page = 1; load(); }));
    $$('#flt button').forEach((b) => (b.onclick = () => { status = b.dataset.s; page = 1; $$('#flt button').forEach((x) => x.classList.toggle('active', x === b)); load(); }));
    load();
  }

  // ================= ClickPesa =================
  // ================= Settings (WhatsApp number + message) =================
  async function settings() {
    const c = await api('/api/admin/contact');
    const on = !!c.whatsapp;
    const dMsg = 'Habari, nahitaji msaada.';
    const pretty = (n) => (n ? `+${n.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')}` : '—');
    root().innerHTML = `<div class="wa-admin">
      <div class="wa-hero"><div class="wa-hero-ic">${waIcon()}</div>
        <div><h2>WhatsApp ya msaada</h2><p>Weka namba na ujumbe. Wateja wataona kitufe cha WhatsApp kwenye dashboard yao.</p></div>
        <span class="badge ${on ? 'ok' : 'mute'}">${on ? 'IMEWASHWA' : 'IMEZIMWA'}</span></div>
      <div class="grid cols-2">
        <div class="card">
          <h3>${icon('chat')} Namba na ujumbe</h3>
          <div class="field"><label for="wn">Namba ya WhatsApp</label>
            <div class="input-icon">${icon('phone')}<input class="input" id="wn" inputmode="tel" autocomplete="off" value="${esc(c.whatsapp)}" placeholder="0712 345 678 au 255712345678"></div>
            <div class="hint">Namba ya Tanzania au ya kimataifa. Acha tupu kuzima kitufe.</div></div>
          <div class="field"><label for="wm">Ujumbe wa kuanzia</label>
            <textarea id="wm" rows="4" maxlength="300" placeholder="${esc(dMsg)}">${esc(c.message)}</textarea>
            <div class="hint"><span id="wcount">0</span>/300 • Jina na namba ya mteja vinaongezwa mwishoni kiotomatiki.</div></div>
          <div class="row"><button class="btn primary" id="wsave">${icon('check')} Hifadhi</button>
            <a class="btn" id="wtest" target="_blank" rel="noopener">${icon('globe')} Jaribu</a>
            ${on ? `<button class="btn danger" id="wdel">${icon('trash')} Ondoa</button>` : ''}</div>
        </div>
        <div class="card"><h3>Mteja ataona hivi</h3>
          <div class="wa-preview"><span class="wa-fab static" aria-hidden="true">${waIcon()}<span>WhatsApp</span></span>
            <div class="muted mono" id="wshow">${esc(pretty(c.whatsapp))}</div>
            <div class="wa-bubble" id="wbub"></div></div>
        </div>
      </div></div>`;
    const digits = () => { let n = $('#wn').value.replace(/\D/g, ''); if (n.startsWith('0')) n = '255' + n.slice(1); return n; };
    const msg = () => $('#wm').value.trim() || dMsg;
    const refresh = () => {
      const n = digits();
      $('#wtest').href = n ? `https://wa.me/${n}?text=${encodeURIComponent(msg())}` : '#';
      $('#wshow').textContent = pretty(n); $('#wbub').textContent = msg(); $('#wcount').textContent = $('#wm').value.length;
    };
    $('#wn').addEventListener('input', refresh); $('#wm').addEventListener('input', refresh); refresh();
    const save = async (number, message) => {
      try { const r = await api('/api/admin/contact', { method: 'PUT', body: { whatsapp: number, message } }); toast(r.whatsapp ? 'Imehifadhiwa. Kitufe kinaonekana kwa wateja.' : 'Kitufe cha WhatsApp kimezimwa', 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    };
    $('#wsave').onclick = () => withBusy($('#wsave'), () => save($('#wn').value, $('#wm').value));
    const del = $('#wdel'); if (del) del.onclick = async () => { if (await confirmBox('Ondoa namba?', 'Kitufe cha WhatsApp kitatoweka kwa wateja.', 'Ondoa', true)) save('', $('#wm').value); };
  }

  async function clickpesa() {
    const c = await api('/api/admin/clickpesa');
    root().innerHTML = `
      <div class="grid cols-2">
        <div class="card"><h3>${icon('sliders')} Credentials ${c.configured ? badge('ACTIVE') : badge('INACTIVE')}</h3>
          <p class="muted">Zinahifadhiwa zimesimbwa (AES-256-GCM) kwenye seva. Hazionyeshwi tena baada ya kuhifadhi.</p>
          <div class="field"><label>Client ID</label><input class="input" id="ci" autocomplete="off" placeholder="${c.client_id_masked ? esc(c.client_id_masked) + ' (imehifadhiwa)' : 'Client ID'}"></div>
          <div class="field"><label>API Key</label><input class="input" id="ak" type="password" autocomplete="new-password" placeholder="${c.api_key_set ? '•••••••• (imehifadhiwa)' : 'API Key'}"></div>
          <div class="field"><label>Checksum Key <span class="muted">(ikiwa umewasha checksum kwenye ClickPesa)</span></label><input class="input" id="ck" type="password" autocomplete="new-password" placeholder="${c.checksum_key_set ? '•••••••• (imehifadhiwa)' : 'Checksum Key (hiari)'}"></div>
          <label class="check" style="margin-bottom:16px"><input type="checkbox" id="net" ${c.accept_net_amount ? 'checked' : ''}><span>Kubali <code>collectedAmount</code> ndogo kuliko bei (ikiwa ClickPesa inakata ada kabla ya kukujulisha). Kawaida: izima.</span></label>
          <div class="row"><button class="btn primary" id="save">Hifadhi</button><button class="btn" id="test">${icon('zap')} Jaribu muunganisho</button>${c.checksum_key_set ? `<button class="btn danger sm" id="rmck">Ondoa checksum key</button>` : ''}</div>
          <div id="tres" class="mt"></div></div>
        <div class="card"><h3>${icon('globe')} Webhook & Payment Configuration</h3>
          <p class="muted">Kwenye ClickPesa Dashboard → Settings → Developers → application yako → <b>Application Webhooks</b>, weka URL hii kwa events zote mbili:</p>
          <div class="keybox"><span>${esc(c.webhook_url)}</span><button class="btn sm" data-copy="${esc(c.webhook_url)}">${icon('copy')} Copy</button></div>
          <p class="mt">${c.webhook_events.map((e) => `<span class="badge info">${esc(e)}</span>`).join(' ')}</p>
          <dl class="kv" style="font-size:.88rem"><dt>Sarafu</dt><dd>TZS</dd><dt>Njia ya malipo</dt><dd>Mobile USSD-PUSH</dd><dt>Uthibitisho</dt><dd>Webhook + ClickPesa Query Payment API (seva inathibitisha kila malipo)</dd><dt>Checksum</dt><dd>${c.checksum_key_set ? badge('ACTIVE') : badge('DISABLED')}</dd></dl>
          <div class="alert warn" style="margin:12px 0 0">ClickPesa haina sandbox: majaribio hufanyika live kwa kiasi kidogo. Kabla ya KYC kuidhinishwa kuna kikomo cha TZS 100,000.</div></div>
      </div>
      <div class="card mt"><h3>${icon('activity')} Webhooks za hivi karibuni</h3><div class="table-wrap"><table><thead><tr><th>Muda</th><th>Event</th><th>Order</th><th>Checksum</th><th>Matokeo</th></tr></thead><tbody>
        ${c.recent_webhooks.length ? c.recent_webhooks.map((w) => `<tr><td>${fmtDate(w.created_at)}</td><td>${esc(w.event)}</td><td class="mono">${esc(w.order_ref)}</td><td>${badge(w.verified ? 'SUCCESS' : 'NONE')}</td><td>${esc(w.outcome)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Hakuna webhooks bado.</td></tr>'}</tbody></table></div></div>`;
    $$('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy, b)));
    $('#save').onclick = () => withBusy($('#save'), async () => {
      const body = { client_id: $('#ci').value.trim(), api_key: $('#ak').value.trim(), checksum_key: $('#ck').value.trim(), accept_net_amount: $('#net').checked };
      try { const r = await api('/api/admin/clickpesa', { method: 'PUT', body }); toast(`Imehifadhiwa (${r.changed.join(', ') || 'hakuna mabadiliko'})`, 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    });
    $('#test').onclick = () => withBusy($('#test'), async () => {
      try { const r = await api('/api/admin/clickpesa/test', { method: 'POST' }); $('#tres').innerHTML = `<div class="alert ${r.ok ? 'ok' : 'bad'}">${esc(r.message)}</div>`; } catch (e) { toast(e.message, 'err'); }
    });
    const rm = $('#rmck'); if (rm) rm.onclick = async () => { try { await api('/api/admin/clickpesa', { method: 'PUT', body: { clear_checksum_key: true } }); render(); } catch (e) { toast(e.message, 'err'); } };
  }

  // ================= Audit =================
  async function audit() {
    const r = await api('/api/admin/audit');
    root().innerHTML = `<div class="table-wrap"><table><thead><tr><th>Muda</th><th>Admin</th><th>Kitendo</th><th>Lengo</th><th>IP</th></tr></thead><tbody>
      ${r.logs.length ? r.logs.map((a) => `<tr><td>${fmtDate(a.created_at)}</td><td class="mono">${esc(a.admin_phone || 'system')}</td><td><b>${esc(a.action)}</b></td><td class="muted">${esc(a.target_type || '')} ${esc(a.target_id || '')}</td><td class="mono">${esc(a.ip || '')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Hakuna logs.</td></tr>'}</tbody></table></div>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const first = render(); // data for the first section loads while the session is being checked
    const me = await requireSession('ADMIN');
    if (!me) return;
    $('#uname').textContent = me.full_name; $('#avatar').textContent = (me.full_name || 'A').charAt(0).toUpperCase();
    await first;
  });
})();
