/* User dashboard */
(function () {
  'use strict';
  let S = null; // overview state
  let tick = null;
  const TITLES = { overview: 'Muhtasari', api: 'API Key', plans: 'Lipia Kifurushi', payments: 'Malipo', usage: 'Matumizi ya API', security: 'Usalama' };
  const root = () => $('#root');

  async function load() {
    S = await api('/api/user/overview');
    $('#uname').textContent = S.account.full_name;
    $('#avatar').textContent = (S.account.full_name || '?').trim().charAt(0).toUpperCase();
    render();
  }

  const router = makeRouter('/dashboard', { '': 'overview', 'api-key': 'api', pay: 'plans', payments: 'payments', usage: 'usage', security: 'security' }, () => render());
  const view = () => router.current();

  function render() {
    if (!S) return;
    const v = view();
    $('#title').textContent = TITLES[v];
    $$('#nav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $('#sidebar').classList.remove('open'); $('.scrim').classList.remove('show');
    clearInterval(tick);
    root().innerHTML = { overview, api: apiView, plans, payments, usage, security }[v]();
    bind(v);
    if (v === 'overview' || v === 'plans') startCountdown();
  }

  // ---------- views ----------
  function subCard() {
    const s = S.subscription;
    if (s.status === 'NONE') return `<div class="alert warn">Huna kifurushi kinachotumika. API Key yako ni <b>INACTIVE</b> hadi ulipie kifurushi.</div>
      <a class="btn primary" href="/dashboard/pay" data-icon="package" data-icon-gap>${icon('package')} Chagua kifurushi</a>`;
    const total = (new Date(s.expires_at) - new Date(s.starts_at)) || 1;
    const pct = s.status === 'ACTIVE' ? Math.max(0, Math.min(100, ((new Date(s.expires_at) - Date.now()) / total) * 100)) : 0;
    return `<dl class="kv">
        <dt>Kifurushi</dt><dd><b>${esc(s.package_name)}</b></dd>
        <dt>Bei</dt><dd>${fmtMoney(s.package_price)}</dd>
        <dt>Hali</dt><dd>${badge(s.status)}</dd>
        <dt>Imeanza</dt><dd>${fmtDate(s.starts_at)}</dd>
        <dt>Inaisha</dt><dd>${fmtDate(s.expires_at)}</dd>
        <dt>Muda uliobaki</dt><dd><b id="remain" data-exp="${esc(s.expires_at)}">${s.status === 'ACTIVE' ? fmtRemaining(s.remaining_seconds) : 'Imeisha'}</b></dd>
      </dl>
      <div class="progress mt"><i style="width:${pct.toFixed(1)}%"></i></div>
      ${s.status !== 'ACTIVE' ? `<div class="mt"><a class="btn primary" href="/dashboard/pay">${icon('refresh')} Lipia kifurushi kingine</a></div>` : ''}`;
  }

  function overview() {
    const a = S.account, k = S.api, u = S.usage;
    return `
    <div class="grid cols-4">
      <div class="card stat"><div class="label">${icon('key')} API Key</div><div class="value" style="font-size:1.3rem;margin-top:12px">${badge(k.key_status)}</div><div class="sub mono">${k.key_prefix ? esc(k.key_prefix) + '…' : 'Hakuna'}</div></div>
      <div class="card stat ${S.subscription.status === 'ACTIVE' ? 'ok' : 'warn'}"><div class="label">${icon('clock')} Kifurushi</div><div class="value" style="font-size:1.3rem;margin-top:12px">${badge(S.subscription.status)}</div><div class="sub">${esc(S.subscription.package_name || 'Hakuna kifurushi')}</div></div>
      <div class="card stat"><div class="label">${icon('activity')} Maombi yote</div><div class="value">${Number(u.total).toLocaleString()}</div><div class="sub">API requests</div></div>
      <div class="card stat ok"><div class="label">${icon('check')} Yaliyofanikiwa</div><div class="value">${Number(u.success).toLocaleString()}</div><div class="sub">Yaliyoshindwa: ${Number(u.failed).toLocaleString()}</div></div>
    </div>
    <div class="grid cols-2 mt">
      <div class="card"><h3>${icon('user')} Taarifa za akaunti</h3>
        <dl class="kv">
          <dt>Jina kamili</dt><dd>${esc(a.full_name)}</dd>
          <dt>Namba ya simu</dt><dd>${esc(a.phone_number)}</dd>
          <dt>User ID</dt><dd class="mono" style="font-size:.8rem">${esc(a.user_id)}</dd>
          <dt>Hali ya akaunti</dt><dd>${badge(a.account_status)}</dd>
          <dt>Tarehe ya usajili</dt><dd>${fmtDay(a.created_at)}</dd>
        </dl></div>
      <div class="card"><h3>${icon('clock')} Kifurushi changu</h3>${subCard()}</div>
    </div>
    <div class="card mt"><h3>${icon('server')} Anza kutumia API</h3>
      <p class="muted">Tuma ombi la <code>GET</code> kwenye endpoint ya channel unayotaka (jina lake mwishoni mwa link), ukiweka API Key yako kwenye header <code>X-API-Key</code>.</p>
      ${chList(k)}
      <p class="mt"><a class="btn" href="/dashboard/api-key">${icon('key')} Simamia API Key</a> <a class="btn" href="/docs">${icon('book')} Docs</a></p>
    </div>`;
  }

  // One endpoint per channel: /api/v1/amiri/<slug>
  function chList(k) {
    const ch = k.channels || [];
    if (!ch.length) return `<div class="keybox"><span>${esc(k.endpoint)}</span><button class="btn sm" data-copy="${esc(k.endpoint)}">${icon('copy')} Copy Endpoint</button></div>`;
    return ch.map((c) => `<div style="margin-bottom:10px"><div class="hint"><b>${esc(c.name)}</b></div><div class="keybox"><span>${esc(c.endpoint)}</span><button class="btn sm" data-copy="${esc(c.endpoint)}">${icon('copy')} Copy</button></div></div>`).join('');
  }

  function apiView() {
    const k = S.api;
    const curl = `curl -H "X-API-Key: YOUR_PERSONAL_API_KEY" ${(k.channels && k.channels[0]) ? k.channels[0].endpoint : k.endpoint}`;
    return `
    <div class="grid cols-2">
      <div class="card"><h3>${icon('globe')} API Endpoint</h3>
        <p class="muted">Kila channel ina endpoint yake (kwa jina au ID).</p>
        ${chList(k)}
        <p class="hint mt">Method: <b>GET</b> • Header: <code>X-API-Key</code></p>
      </div>
      <div class="card"><h3>${icon('key')} API Key yako</h3>
        <div class="row" style="margin-bottom:12px"><span>Hali:</span>${badge(k.key_status)}</div>
        <div class="keybox"><span>${k.key_prefix ? esc(k.key_prefix) + '••••••••••••••••••••••••••••' : 'Huna API Key. Tengeneza mpya.'}</span></div>
        <p class="hint">Kwa usalama, key kamili inaonyeshwa <b>mara moja tu</b> inapotengenezwa. Ukiipoteza, tengeneza mpya.</p>
        ${k.key_status === 'INACTIVE' ? `<div class="alert warn">Key itakuwa <b>ACTIVE</b> baada ya malipo kuthibitishwa. <a href="/dashboard/pay">Lipia kifurushi</a></div>` : ''}
        <div class="row">
          <button class="btn primary" id="regen">${icon('refresh')} ${k.key_prefix ? 'Tengeneza key mpya' : 'Tengeneza API Key'}</button>
          ${k.key_prefix ? `<button class="btn danger" id="revoke">${icon('trash')} Futa key</button>` : ''}
        </div>
      </div>
    </div>
    <div class="card mt"><h3>${icon('zap')} Mfano wa ombi</h3>
      <pre id="curl">${esc(curl)}</pre>
      <button class="btn sm" data-copy="${esc(curl)}">${icon('copy')} Copy</button>
      <p class="hint mt">Majibu: <code>200</code> maandishi • <code>401</code> key si halali • <code>403</code> hakuna kifurushi / kimeisha • <code>503</code> huduma haipatikani kwa sasa.</p>
    </div>`;
  }

  function plans() {
    const s = S.subscription;
    const mid = Math.floor(S.packages.length / 2);
    return `${s.status === 'ACTIVE' ? `<div class="alert ok">Una kifurushi <b>${esc(s.package_name)}</b> kinachotumika. Ukilipia kingine, muda <b>utaongezwa</b> baada ya kilichopo kuisha.</div>` : ''}
    <div class="grid cols-3">${S.packages.length ? S.packages.map((p, i) => `
      <div class="card pkg ${i === mid && S.packages.length > 2 ? 'featured' : ''}">
        ${i === mid && S.packages.length > 2 ? '<span class="badge info ribbon">MAARUFU</span>' : ''}
        <h3>${esc(p.name)}</h3>
        <div class="price">${Number(p.price).toLocaleString()} <small>TZS</small></div>
        <p class="muted">Muda: <b>${p.duration_days === 1 ? 'siku 1' : `siku ${p.duration_days}`}</b></p>
        <ul class="muted" style="padding-left:18px;margin:0 0 14px;font-size:.9rem"><li>API Key inawaka mara moja</li><li>Maombi ya API bila kikomo cha kifurushi</li></ul>
        <button class="btn primary block" data-pay="${p.id}">${icon('wallet')} Lipia sasa</button>
      </div>`).join('') : '<div class="card empty">Hakuna vifurushi kwa sasa.</div>'}</div>
    <p class="hint mt">Malipo ya simu (USSD-PUSH) kupitia ClickPesa: M-Pesa, Mixx by Yas, Airtel Money, Halopesa.</p>`;
  }

  function payments() {
    return `<div class="card"><h3>${icon('wallet')} Historia ya malipo</h3>
      <div class="table-wrap"><table><thead><tr><th>Tarehe</th><th>Kifurushi</th><th>Kiasi</th><th>Reference</th><th>Hali</th></tr></thead><tbody>
      ${S.payments.length ? S.payments.map((p) => `<tr><td>${fmtDate(p.created_at)}</td><td>${esc(p.package_name)}</td><td>${fmtMoney(p.amount)}</td><td class="mono">${esc(p.transaction_id)}</td>
        <td>${badge(p.payment_status === 'PENDING' ? 'PROCESSING' : p.payment_status)}${p.payment_status === 'FAILED' && p.failure_message ? `<div class="hint">${esc(p.failure_message)}</div>` : ''}${p.payment_status === 'PROCESSING' || p.payment_status === 'PENDING' ? `<div><button class="btn sm" data-check="${esc(p.transaction_id)}">${icon('refresh')} Angalia hali</button></div>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Bado hujafanya malipo.</td></tr>'}
      </tbody></table></div></div>`;
  }

  function usage() {
    const u = S.usage;
    return `<div class="grid cols-3">
      <div class="card stat"><div class="label">Jumla ya requests</div><div class="value">${Number(u.total).toLocaleString()}</div></div>
      <div class="card stat ok"><div class="label">Zilizofanikiwa</div><div class="value">${Number(u.success).toLocaleString()}</div></div>
      <div class="card stat bad"><div class="label">Zilizoshindwa</div><div class="value">${Number(u.failed).toLocaleString()}</div></div></div>
      <div class="card mt"><h3>${icon('activity')} Maombi ya hivi karibuni</h3>
      <div class="table-wrap"><table><thead><tr><th>Tarehe na muda</th><th>Endpoint</th><th>Status</th></tr></thead><tbody>
      ${u.recent.length ? u.recent.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td class="mono">${esc(r.endpoint)}</td><td>${badge(r.response_status >= 200 && r.response_status < 300 ? 'SUCCESS' : 'FAILED')} <span class="muted mono">${r.response_status}</span></td></tr>`).join('') : '<tr><td colspan="3" class="empty">Hakuna maombi bado.</td></tr>'}
      </tbody></table></div></div>`;
  }

  function security() {
    return `<div class="card" style="max-width:520px"><h3>${icon('lock')} Badilisha password</h3>
      <form id="pw-form" novalidate>
        <div class="field"><label>Password ya sasa</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></div>
        <div class="field"><label>Password mpya</label><input class="input" type="password" name="newPassword" autocomplete="new-password" required minlength="8"><div class="hint">Angalau herufi 8, ikiwa na herufi na namba.</div></div>
        <div class="field"><label>Thibitisha password mpya</label><input class="input" type="password" name="confirmPassword" autocomplete="new-password" required></div>
        <button class="btn primary" type="submit">Hifadhi password</button>
      </form></div>`;
  }

  // ---------- behaviour ----------
  function startCountdown() {
    const el = $('#remain');
    if (!el) return;
    tick = setInterval(() => {
      const left = (new Date(el.dataset.exp) - Date.now()) / 1000;
      if (left <= 0) { clearInterval(tick); load().catch(() => {}); return; }
      el.textContent = fmtRemaining(left);
    }, 1000);
  }

  function bind(v) {
    $$('[data-copy]', root()).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
    $$('[data-pay]', root()).forEach((b) => b.addEventListener('click', () => payFlow(Number(b.dataset.pay))));
    $$('[data-check]', root()).forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      try { const r = await api(`/api/user/payments/${b.dataset.check}/status`); toast(`Hali: ${r.status}`, r.status === 'SUCCESS' ? 'ok' : 'info'); await load(); } catch (e) { toast(e.message, 'err'); }
    })));
    if (v === 'api') {
      $('#regen').addEventListener('click', async () => {
        if (S.api.key_prefix && !(await confirmBox('Tengeneza key mpya?', 'Key ya zamani itafutwa na haitafanya kazi tena. Programu zako zinazotumia key ya zamani zitahitaji kusasishwa.', 'Tengeneza', true))) return;
        try {
          const r = await api('/api/user/api-key/regenerate', { method: 'POST' });
          const m = openModal(`<h3>${icon('key')} API Key yako mpya</h3>
            <div class="alert warn">Hifadhi key hii <b>sasa</b>. Haitaonyeshwa tena.</div>
            <div class="keybox"><span id="newkey">${esc(r.api_key)}</span><button class="btn sm" id="ck">${icon('copy')} Copy</button></div>
            <p class="hint">Hali: ${esc(r.status)} ${r.status === 'INACTIVE' ? '— itawaka baada ya malipo kuthibitishwa.' : ''}</p>
            <div class="actions"><button class="btn primary" data-close>Nimeihifadhi</button></div>`);
          m.$('#ck').addEventListener('click', (e) => copyText(r.api_key, e.currentTarget));
          await load();
        } catch (e) { toast(e.message, 'err'); }
      });
      const rv = $('#revoke');
      if (rv) rv.addEventListener('click', async () => {
        if (!(await confirmBox('Futa API Key?', 'Key itaacha kukubali maombi mara moja. Unaweza kutengeneza mpya baadaye.', 'Futa', true))) return;
        try { await api('/api/user/api-key', { method: 'DELETE' }); toast('API Key imefutwa', 'ok'); await load(); } catch (e) { toast(e.message, 'err'); }
      });
    }
    if (v === 'security') {
      const f = $('#pw-form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f).entries());
        if (d.newPassword !== d.confirmPassword) return toast('Password mpya na Confirm hazifanani', 'err');
        await withBusy($('button[type=submit]', f), async () => {
          try { const r = await api('/api/auth/change-password', { method: 'POST', body: d }); setCsrf(r.csrf); toast(r.message, 'ok'); f.reset(); } catch (er) { toast(er.message, 'err'); }
        });
      });
    }
  }

  function payFlow(packageId) {
    const p = S.packages.find((x) => x.id === packageId);
    if (!p) return;
    const m = openModal(`<h3>${icon('wallet')} Lipia ${esc(p.name)}</h3>
      <dl class="kv" style="margin-bottom:16px"><dt>Bei</dt><dd><b>${fmtMoney(p.price)}</b></dd><dt>Muda</dt><dd>Siku ${p.duration_days}</dd></dl>
      <div class="field"><label for="pp">Namba ya simu ya kulipia</label><input class="input" id="pp" type="tel" inputmode="tel" value="${esc(S.account.phone_number)}">
      <div class="hint">Utapokea ombi la PIN kwenye simu hii (M-Pesa, Mixx by Yas, Airtel Money au Halopesa).</div></div>
      <div id="pstate"></div>
      <div class="actions"><button class="btn" data-close id="pc">Ghairi</button><button class="btn primary" id="go">${icon('zap')} Tuma ombi la malipo</button></div>`);
    let polling = false;
    m.$('#go').addEventListener('click', async () => {
      const btn = m.$('#go');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Inatuma...';
      try {
        const r = await api('/api/user/payments', { method: 'POST', body: { packageId, phone: m.$('#pp').value } });
        m.$('#pstate').innerHTML = `<div class="alert ok">${esc(r.message)}</div><div class="row"><span class="spin"></span><span class="muted">Tunasubiri uthibitisho wa malipo kutoka ClickPesa…</span></div>`;
        btn.classList.add('hidden'); m.$('#pp').disabled = true;
        polling = true;
        let tries = 0;
        const loop = async () => {
          if (!polling || !document.body.contains(m.el)) return;
          tries++;
          try {
            const st = await api(`/api/user/payments/${r.transaction_id}/status`);
            if (st.status === 'SUCCESS') { polling = false; m.$('#pstate').innerHTML = '<div class="alert ok"><b>Malipo yamethibitishwa!</b> API Key yako sasa ni ACTIVE.</div>'; toast('Malipo yamethibitishwa', 'ok'); m.$('#pc').textContent = 'Funga'; await load(); return; }
            if (st.status === 'FAILED') { polling = false; m.$('#pstate').innerHTML = `<div class="alert bad">Malipo yameshindwa. ${esc(st.message || '')}</div>`; btn.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = `${icon('refresh')} Jaribu tena`; m.$('#pp').disabled = false; await load(); return; }
          } catch (_) { /* keep polling */ }
          if (tries < 60) setTimeout(loop, 4000);
          else { polling = false; m.$('#pstate').innerHTML = '<div class="alert warn">Bado tunasubiri. Ukikamilisha malipo, hali itasasishwa yenyewe — angalia kwenye <a href="/dashboard/payments">Malipo</a>.</div>'; }
        };
        setTimeout(loop, 3000);
      } catch (e) {
        m.$('#pstate').innerHTML = `<div class="alert bad">${esc(e.message)}</div>`;
        btn.disabled = false; btn.innerHTML = `${icon('zap')} Jaribu tena`;
      }
    });
    m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.hasAttribute('data-close')) { polling = false; load().catch(() => {}); } });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // session check and page data are requested at the same time (no waiting in a row)
    const dataP = load().catch((e) => { root().innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; });
    const me = await requireSession('USER');
    if (!me) return;
    await dataP;
  });
})();
