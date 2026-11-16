(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('sw-TZ').format(n || 0);
  const fdate = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
  const rawApi = async (path, o = {}) => {
    const init = { method: o.method || 'GET', headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
    if (o.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    const r = await fetch('/api' + path, init); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.error || 'Hitilafu'); e.status = r.status; throw e; } return j;
  };
  const api = async (path, o) => { if (window.UI) UI.start(); try { return await rawApi(path, o); } finally { if (window.UI) UI.end(); } };
  // Ujumbe mmoja wa admin: unaonekana juu ya skrini, kisha unapotea baada ya sekunde 3.5
  const toast = (el, t, c) => {
    const b = mBox();
    b.className = 'msg amsg ' + (c || ''); b.textContent = String(t || '').slice(0, 300); b.hidden = false;
    clearTimeout(window.__amT); window.__amT = setTimeout(() => { b.hidden = true; }, 3500);
  };
  const tbl = (cols, rows) => rows.length ? `<div class="scroll"><table><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<p class="muted">Hakuna data.</p>';
  const opts = (list, val, lab, sel) => list.map((x) => `<option value="${esc(x[val])}" ${x[val] == sel ? 'selected' : ''}>${esc(x[lab])}</option>`).join('');
  const body = (form) => Object.fromEntries(new FormData(form));
  const NAV = [['Dashboard', 'dashboard'], ['Slider', 'sliders'], ['Channels', 'channels'], ['Categories', 'categories'], ['Packages', 'packages'], ['Users', 'users'],
    ['Subscriptions', 'subscriptions'], ['Payments', 'payments'], ['Payouts', 'payouts'], ['Revenue Reports', 'reports'], ['Site Identity', 'site-settings#identity'], ['Theme & Colors', 'site-settings#theme'], ['Site Appearance', 'site-settings#appearance'], ['Homepage Layout', 'site-settings#homepage'],
    ['Footer Settings', 'site-settings#footer'], ['Security & Audit Logs', 'audit'], ['General Settings', 'site-settings#general']];
  const GROUPS = [
    ['Muhtasari', [['Dashboard', 'dashboard', '📊']]],
    ['Maudhui', [['Channels', 'channels', '📺'], ['Proxy Link', 'proxy-links', '📡'], ['Mechi', 'matches', '⚽'], ['App Download', 'app-releases', '📱'], ['Muonekano wa Store', 'app-store', '🎨'], ['Categories', 'categories', '🗂'], ['Slider', 'sliders', '🖼'], ['Arifa', 'notifications', '🔔'], ['Packages', 'packages', '📦']]],
    ['Mauzo', [['Users', 'users', '👥'], ['Subscriptions', 'subscriptions', '🔁'], ['Payments', 'payments', '💳'], ['Payouts', 'payouts', '💸'], ['Promo Codes', 'promo', '🎟'], ['Maombi ya Reset', 'resets', '🔑'], ['Revenue Reports', 'reports', '📈']]],
    ['Mipangilio', [['ClickPesa Settings', 'clickpesa-settings', '💳'], ['SonicPesa Settings', 'sonicpesa-settings', '🔌'], ['FastLipa Settings', 'fastlipa-settings', '⚡'], ['Site Identity', 'site-settings#identity', '🏷'], ['Theme & Colors', 'site-settings#theme', '🎨'], ['Site Appearance', 'site-settings#appearance', '🖥'], ['Homepage Layout', 'site-settings#homepage', '🏠'], ['Footer Settings', 'site-settings#footer', '🦶'], ['General Settings', 'site-settings#general', '⚙️']]],
    ['Usalama', [['Security & Audit Logs', 'audit', '🛡']]],
  ];
  // Kisanduku cha ujumbe: kikikosekana kwenye ukurasa, kinaundwa juu ya skrini (haitaandika juu ya ukurasa mzima)
  const mBox = () => {
    let el = $('#m');
    if (!el) {
      el = document.createElement('div');
      el.id = 'm'; el.className = 'msg'; el.hidden = true;
      el.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:120;max-width:460px;width:calc(100% - 28px)';
      document.body.appendChild(el);
    }
    return el;
  };
  function shell(title, html) {
    const page = location.pathname.split('/').pop(), hash = location.hash;
    const on = (href) => { const [p, h] = href.split('#'); return p === page && (h ? ('#' + h === hash || (!hash && h === 'identity')) : true); };
    const adm = window.__adm || {};
    $('#root').innerHTML = `<div class="adm"><aside class="drawer" id="dr"><div class="dbrand"><span class="logo-dot">▶</span><div><b>Admin Panel</b><small>Usimamizi wa TV</small></div><button class="ib2 dx" id="dxb" aria-label="Funga">✕</button></div>
      <nav class="dnav">${GROUPS.map(([g, items]) => `<div class="dgrp">${g}</div>${items.map(([n, h, i]) => `<a href="/admin/${h}" class="${on(h) ? 'on' : ''}"><span class="ic">${i}</span>${n}</a>`).join('')}`).join('')}</nav>
      <div class="dfoot"><div class="uav">${esc((adm.name || 'A').charAt(0).toUpperCase())}</div><div class="who"><b>${esc(adm.name || 'Admin')}</b><span>${esc(adm.phone || '')}</span></div><button class="btn ghost sm" id="lo">Toka</button></div></aside>
      <div class="dshade" id="sh"></div>
      <main class="amain"><div class="atop"><button class="ib2 burger" id="bg" aria-label="Menu">☰</button><h2>${title}</h2><button class=\"ib2 aref\" id=\"aref\" aria-label=\"Refresh\" title=\"Refresh\"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg></button></div><div class="wrap" id="c">${html}</div></main></div>`;
    $('#bg').onclick = () => $('#dr').classList.toggle('open');
    $('#aref').onclick = (e) => { const b = e.currentTarget; b.classList.add('spin'); setTimeout(() => location.reload(), 180); };
    $('#sh').onclick = () => $('#dr').classList.remove('open');
    $('#dxb').onclick = () => $('#dr').classList.remove('open');
    $('#lo').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/login'; };
    document.title = title + ' - Admin';
  }
  const H = {};
  H.login = () => {
    document.title = 'Admin Login - Alfutv Pro Max';
    $('#root').innerHTML = `<div class="al-wrap">
      <aside class="al-side"><div class="al-brand"><span class="logo-dot">▶</span>Alfutv Pro Max</div>
        <h1>Dhibiti TV yako kwa urahisi.</h1><p>Channels, vifurushi, malipo na mapato yote mahali pamoja.</p>
        <div class="al-feat"><div><span class="fi">📺</span>Channels na categories</div><div><span class="fi">💳</span>Malipo ya ClickPesa</div><div><span class="fi">📈</span>Grafu za mapato papo hapo</div></div></aside>
      <main class="al-main"><form class="al-card" id="f" autocomplete="on"><h2>Karibu tena</h2><div class="sub">Ingia kwenye Admin Panel</div>
        <label>Namba ya simu</label><div class="fld">📱<input name="phone" inputmode="tel" placeholder="07XXXXXXXX" required></div>
        <label>Password</label><div class="fld">🔒<input name="password" type="password" id="pw" placeholder="••••••••" required><button type="button" class="pw-eye" id="eye" aria-label="Onyesha password">👁</button></div>
        <div id="m" class="msg" hidden></div><button class="btn">Ingia →</button></form></main></div>`;
    $('#eye').onclick = () => { const i = $('#pw'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/auth/login', { method: 'POST', body: body(e.target) });
        if (r.user.role !== 'admin') { await api('/auth/logout', { method: 'POST' }); throw new Error('Huna ruhusa ya admin.'); }
        location.href = '/admin/dashboard';
      } catch (err) { toast($('#m'), err.message, 'err'); }
    };
  };
  H.appreleases = async () => {
    const SV = window.SVG;
    const PL = { android: 'Android', ios: 'iOS', windows: 'Windows', mac: 'macOS', other: 'Nyingine' };
    const tzs = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US');
    const sz = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const KIND = { app: 'Programu', document: 'Hati', archive: 'Zip', other: 'Faili' };
    const icon = (r) => `<div class="ar-ic${r.has_logo ? ' has-logo' : ''}">${r.has_logo ? `<img src="/api/app-releases/${r.id}/logo" alt="">` : SV.app}</div>`;
    shell('App Download', `<div class="ar-stats" id="ars"></div>
      <form class="ar-up" id="f" novalidate>
        <div class="ar-steps" id="steps"><span class="on"><i>1</i>Chagua faili</span><span><i>2</i>Thibitisha maelezo</span><span><i>3</i>Pakia</span></div>
        <label class="ar-drop" id="drop"><input type="file" id="fi">
          <span class="ar-drop-ic">${SV.upload}</span>
          <b>Chagua faili au liburute hapa</b>
          <small>Faili yoyote isipokuwa video na picha • hadi 25MB</small></label>
        <div class="ar-file" id="fileBox" hidden>
          <span class="ar-file-ic" id="fileIc"></span>
          <div class="ar-file-m"><b id="fileName"></b><span id="fileMeta"></span></div>
          <button type="button" class="ar-x" id="fileClear" aria-label="Ondoa faili">${SV.close}</button>
        </div>
        <div class="ar-grid">
          <div class="ar-f"><label>Jina</label><input name="title" required maxlength="80" placeholder="Mfano: Alfu TV"></div>
          <div class="ar-f"><label>Toleo</label><input name="version" maxlength="30" placeholder="1.2.0"></div>
          <div class="ar-f"><label>Aina ya faili</label><select name="kind"><option value="app">Programu (app)</option><option value="document">Hati (PDF, Word, Excel)</option><option value="archive">Zip / kumbukumbu</option><option value="other">Nyingine</option></select></div>
          <div class="ar-f"><label>Mfumo</label><select name="platform"><option value="android">Android</option><option value="ios">iOS</option><option value="windows">Windows</option><option value="mac">macOS</option><option value="other">Nyingine</option></select></div>
          <div class="ar-f ar-span"><label>Bei</label>
            <div class="ar-chips" id="priceChips"><button type="button" data-p="0" class="on">Bure</button><button type="button" data-p="1000">1,000</button><button type="button" data-p="2000">2,000</button><button type="button" data-p="5000">5,000</button><button type="button" data-p="10000">10,000</button></div>
            <input name="price" type="number" min="0" step="100" value="0" placeholder="0 = bure"></div>
          <div class="ar-f"><label>Msanidi</label><input name="developer" maxlength="80" placeholder="Alfu Tech"></div>
          <div class="ar-f"><label>Kategoria</label><input name="category" maxlength="40" placeholder="Video"></div>
          <div class="ar-f ar-span"><label>Maelezo (hiari)</label><textarea name="notes" rows="3" maxlength="2000" placeholder="Kuna nini kipya kwenye toleo hili?"></textarea></div>
        </div>
        <div class="ar-prog" id="upb" hidden><i></i><span id="upt">0%</span></div>
        <div class="ar-upinfo" id="upinfo" hidden></div>
        <div id="m" class="msg" hidden></div>
        <div class="ar-foot"><button class="btn" id="go" disabled>Chagua faili kwanza</button></div>
      </form>
      <div id="ss"></div>
      <div class="ar-list" id="al"><div class="muted">Inapakia…</div></div>`);
    const f = $('#f'), fi = $('#fi'), fld = (n) => f.elements.namedItem(n);
    const setUp = (p) => { const b = $('#upb'); b.hidden = false; b.querySelector('i').style.width = p + '%'; $('#upt').textContent = p + '%'; if (p >= 100) setTimeout(() => { b.hidden = true; }, 700); };
    const EXT_KIND = { apk: 'app', aab: 'app', ipa: 'app', exe: 'app', msi: 'app', dmg: 'app' };
    const EXT_PLAT = { apk: 'android', aab: 'android', ipa: 'ios', exe: 'windows', msi: 'windows', dmg: 'mac' };
    const DOC_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|odp)$/i, ARC_RE = /\.(zip|rar|7z|tar|gz)$/i;
    const steps = (n) => document.querySelectorAll('#steps span').forEach((x, k) => x.classList.toggle('on', k <= n));
    const setPrice = (v) => { fld('price').value = v; document.querySelectorAll('#priceChips button').forEach((b) => b.classList.toggle('on', String(b.dataset.p) === String(v))); };
    document.querySelectorAll('#priceChips button').forEach((b) => (b.onclick = () => setPrice(b.dataset.p)));
    fld('price').oninput = (e) => setPrice(e.target.value);
    const clearFile = () => {
      fi.value = ''; $('#fileBox').hidden = true; $('#drop').hidden = false;
      $('#go').disabled = true; $('#go').textContent = 'Chagua faili kwanza'; steps(0);
    };
    $('#fileClear').onclick = clearFile;
    fi.onchange = () => {
      const x = fi.files[0];
      if (!x) return clearFile();
      const ext = (x.name.split('.').pop() || '').toLowerCase();
      const kind = EXT_KIND[ext] || (DOC_RE.test(x.name) ? 'document' : ARC_RE.test(x.name) ? 'archive' : 'other');
      $('#fileName').textContent = x.name;
      $('#fileMeta').textContent = sz(x.size) + ' • ' + (KIND[kind] || 'Faili');
      $('#fileIc').innerHTML = kind === 'app' ? SV.app : kind === 'document' ? SV.edit : kind === 'archive' ? SV.upload : SV.store;
      $('#fileBox').hidden = false; $('#drop').hidden = true;
      if (!fld('title').value.trim()) fld('title').value = x.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim().slice(0, 80);
      fld('kind').value = kind;
      if (EXT_PLAT[ext]) fld('platform').value = EXT_PLAT[ext];
      $('#go').disabled = false; $('#go').textContent = 'Pakia ' + (KIND[kind] || 'faili').toLowerCase();
      steps(1);
    };

    const upload = (url, file, onProg) => new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      x.setRequestHeader('X-Requested-With', 'fetch');
      x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      if (onProg) x.upload.onprogress = (ev) => { if (ev.lengthComputable) onProg(Math.round((ev.loaded / ev.total) * 100)); };
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText || '{}'); } catch (_) {} x.status < 300 ? resolve(d) : reject(new Error(d.error || 'Upakiaji umeshindikana.')); };
      x.onerror = () => reject(new Error('Mtandao umekatika wakati wa kupakia.'));
      x.send(file);
    });

    const editModal = (a) => {
      document.querySelector('#armod')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div class="ar-modal" id="armod"><form class="ar-sheet" id="arf">
        <div class="ar-sheet-h"><b>Hariri: ${esc(a.title)}</b><button type="button" class="ar-x" id="arx">${SV.close}</button></div>
        <div class="ar-grid">
          <div class="ar-f"><label>Jina</label><input name="title" value="${esc(a.title)}" maxlength="80"></div>
          <div class="ar-f"><label>Toleo</label><input name="version" value="${esc(a.version || '')}" maxlength="30"></div>
          <div class="ar-f"><label>Aina ya faili</label><select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${a.file_kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="ar-f"><label>Mfumo</label><select name="platform">${Object.entries(PL).map(([k, v]) => `<option value="${k}" ${a.platform === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="ar-f"><label>Bei (TZS, 0 = bure)</label><input name="price" type="number" min="0" step="100" value="${a.price || 0}"></div>
          <div class="ar-f"><label>Msanidi</label><input name="developer" value="${esc(a.developer || '')}" maxlength="80"></div>
          <div class="ar-f"><label>Kategoria</label><input name="category" value="${esc(a.category || '')}" maxlength="40"></div>
          <div class="ar-f"><label>Ukadiriaji (0–5, acha wazi = wastani)</label><input name="rating" type="number" step="0.5" min="0" max="5" value="${a.rating ?? ''}"></div>
          <div class="ar-f"><label>Hali</label><label class="ar-tg"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}><span class="t"></span><span id="arst">${a.active ? 'Inaonekana kwa watumiaji' : 'Imefichwa kwa watumiaji'}</span></label></div>
          <div class="ar-f ar-span"><label>Maelezo</label><textarea name="notes" rows="4" maxlength="2000">${esc(a.notes || '')}</textarea></div>
        </div>
        <div class="ar-f ar-span ar-repl"><label>Badilisha faili</label>
          <div class="ar-repl-row"><input type="file" id="arfi"><button type="button" class="btn" id="arrp">Pakia faili mpya</button></div>
          <small class="muted">Faili ya sasa: ${esc(a.file_name)} • ${sz(a.size)}. Faili mpya inachukua nafasi ya ile ya zamani; viungo vilivyopo vinaendelea kufanya kazi.</small>
          <div class="ar-prog" id="arpb" hidden><i></i><span>0%</span></div></div>
        <div class="ar-foot"><button type="button" class="btn ghost" id="arc">Funga</button><button class="btn">Hifadhi mabadiliko</button></div></form></div>`);
      const m = $('#armod'), frm = $('#arf');
      const close = () => m.remove();
      $('#arx').onclick = close; $('#arc').onclick = close;
      $('#arrp').onclick = () => {
        const x = $('#arfi').files[0];
        if (!x) return toast(mBox(), 'Chagua faili jipya kwanza.', 'err');
        if (x.size > 25 * 1048576) return toast(mBox(), 'Faili ni kubwa kuliko 25MB.', 'err');
        if (!confirm('Badilisha faili ya app hii? Faili ya zamani itafutwa.')) return;
        const pb = $('#arpb'), bar = pb.querySelector('i'), txt = pb.querySelector('span');
        pb.hidden = false; bar.style.width = '0%'; txt.textContent = '0%';
        const xr = new XMLHttpRequest();
        xr.open('POST', '/api/admin/app-releases/' + a.id + '/file');
        xr.setRequestHeader('Content-Type', x.type || 'application/octet-stream');
        xr.setRequestHeader('X-Requested-With', 'fetch');
        xr.setRequestHeader('X-File-Name', encodeURIComponent(x.name));
        xr.upload.onprogress = (ev) => { if (ev.lengthComputable) { const p = Math.round(ev.loaded / ev.total * 100); bar.style.width = p + '%'; txt.textContent = p + '%'; } };
        xr.onload = () => {
          let d = {}; try { d = JSON.parse(xr.responseText || '{}'); } catch (_) {}
          if (xr.status < 300) { toast(mBox(), 'Faili imebadilishwa.', 'ok'); close(); load(); }
          else toast(mBox(), d.error || 'Imeshindikana kubadilisha faili.', 'err');
        };
        xr.onerror = () => toast(mBox(), 'Mtandao umekatika wakati wa kupakia.', 'err');
        xr.send(x);
      };
      m.onclick = (e) => { if (e.target === m) close(); };
      frm.active.onchange = () => { $('#arst').textContent = frm.active.checked ? 'Inaonekana kwa watumiaji' : 'Imefichwa kwa watumiaji'; };
      frm.onsubmit = async (e) => {
        e.preventDefault(); const b = body(frm);
        try {
          await api('/admin/store/apps/' + a.id, { method: 'PATCH', body: {
            title: b.title, version: b.version, platform: b.platform, price: Number(b.price) || 0,
            developer: b.developer, category: b.category, rating: b.rating === '' ? null : Number(b.rating),
            notes: b.notes, active: frm.active.checked, file_kind: b.kind } });
          toast($('#m'), 'Mabadiliko yamehifadhiwa.', 'ok'); close(); load();
        } catch (err) { toast($('#m'), err.message, 'err'); }
      };
    };

    const shotPanel = async (id) => {
      const { shots } = await api('/app-releases/' + id + '/screenshots');
      const app = (window.__appRows || []).find((x) => x.id == id);
      $('#ss').innerHTML = `<div class="ar-panel"><div class="ar-panel-h"><b>Picha za skrini: ${esc(app ? app.title : '')}</b><span>${shots.length}/8 • PNG, JPG, WEBP hadi 3MB</span></div>
        <div class="ar-shots">${shots.map((sid) => `<div class="ar-shot"><img src="/api/app-releases/screenshots/${sid}" alt=""><button class="ar-del" data-sd="${sid}" aria-label="Futa">${SV.trash}</button></div>`).join('') || '<p class="muted">Hakuna picha bado.</p>'}</div>
        <div class="ar-foot"><input type="file" id="sfi" accept="image/png,image/jpeg,image/webp" ${shots.length >= 8 ? 'disabled' : ''}><button class="btn" id="sgo" ${shots.length >= 8 ? 'disabled' : ''}>Pakia picha</button><button class="btn ghost" id="sx">Funga</button></div></div>`;
      $('#sx').onclick = () => ($('#ss').innerHTML = '');
      $('#sgo').onclick = async () => {
        const x = $('#sfi').files[0]; if (!x) return toast($('#m'), 'Chagua picha kwanza.', 'err');
        try { await upload('/api/admin/app-releases/' + id + '/screenshots', x); toast($('#m'), 'Picha imepakiwa.', 'ok'); shotPanel(id); load(); }
        catch (err) { toast($('#m'), err.message, 'err'); }
      };
      document.querySelectorAll('[data-sd]').forEach((x2) => (x2.onclick = async () => { if (confirm('Futa picha hii?')) { await api('/admin/app-releases/screenshots/' + x2.dataset.sd, { method: 'DELETE' }); shotPanel(id); load(); } }));
      $('#ss').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const logoPanel = (id) => {
      const app = (window.__appRows || []).find((x) => x.id == id), has = app && app.has_logo;
      $('#ss').innerHTML = `<div class="ar-panel"><div class="ar-panel-h"><b>Logo: ${esc(app ? app.title : '')}</b><span>PNG, JPG, WEBP hadi 1MB • picha ya mraba inapendeza</span></div>
        <div class="ar-logo-row"><div class="ar-logo-prev${has ? ' has-logo' : ''}">${has ? `<img src="/api/app-releases/${id}/logo" alt="">` : SV.image}</div>
        <div class="ar-foot" style="border:0;padding:0"><input type="file" id="lfi" accept="image/png,image/jpeg,image/webp"><button class="btn" id="lgo">Weka logo</button>${has ? '<button class="btn danger" id="ldel">Ondoa</button>' : ''}<button class="btn ghost" id="lx">Funga</button></div></div></div>`;
      $('#lx').onclick = () => ($('#ss').innerHTML = '');
      $('#lgo').onclick = async () => {
        const x = $('#lfi').files[0]; if (!x) return toast($('#m'), 'Chagua picha kwanza.', 'err');
        try { await upload('/api/admin/app-releases/' + id + '/logo', x); toast($('#m'), 'Logo imewekwa.', 'ok'); await load(); logoPanel(id); }
        catch (err) { toast($('#m'), err.message, 'err'); }
      };
      const del = $('#ldel');
      if (del) del.onclick = async () => { if (confirm('Ondoa logo?')) { await api('/admin/app-releases/' + id + '/logo', { method: 'DELETE' }); await load(); logoPanel(id); } };
      $('#ss').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const load = async () => {
      const { releases: rows } = await api('/admin/app-releases');
      window.__appRows = rows;
      const act = rows.filter((r) => r.active).length, dls = rows.reduce((a, r) => a + r.download_count, 0);
      $('#ars').innerHTML = [[SV.store, rows.length, 'Apps zote'], [SV.eye, act, 'Zinaonekana'], [SV.download, dls, 'Upakuaji']]
        .map(([ic, n, l]) => `<div class="ar-stat"><i>${ic}</i><div><b>${n}</b><span>${l}</span></div></div>`).join('');
      $('#al').innerHTML = rows.length ? rows.map((r) => `<article class="ar-app${r.active ? '' : ' off'}">
        ${icon(r)}
        <div class="ar-m"><div class="ar-t"><b>${esc(r.title)}</b>
          <span class="ar-pill kind">${KIND[r.file_kind] || 'Faili'}</span>
          <span class="ar-pill ${r.price > 0 ? 'paid' : 'free'}">${r.price > 0 ? SV.lock + tzs(r.price) : 'Bure'}</span>
          <span class="ar-pill ${r.active ? 'on' : 'hid'}">${r.active ? 'Inaonekana' : 'Imefichwa'}</span></div>
          <span class="ar-sub">${esc(PL[r.platform] || r.platform)}${r.version ? ' • v' + esc(r.version) : ''} • ${sz(r.size)}${r.developer ? ' • ' + esc(r.developer) : ''}</span>
          <span class="ar-sub">${SV.download} ${r.download_count} • ${r.shots} picha • ${esc(fdate(r.created_at))}</span></div>
        <div class="ar-acts">
          <button class="ar-b" data-ed="${r.id}" title="Hariri">${SV.edit}<span>Hariri</span></button>
          <button class="ar-b" data-ss="${r.id}" title="Picha">${SV.image}<span>Picha</span></button>
          <button class="ar-b" data-lg="${r.id}" title="Logo">${SV.app}<span>Logo</span></button>
          <button class="ar-b" data-cp="${r.id}" title="Nakili link">${SV.link}<span>Link</span></button>
          <button class="ar-b" data-t="${r.id}" data-v="${r.active ? 0 : 1}" title="${r.active ? 'Ficha' : 'Onyesha'}">${r.active ? SV.eyeOff : SV.eye}<span>${r.active ? 'Ficha' : 'Onyesha'}</span></button>
          <button class="ar-b danger" data-d="${r.id}" title="Futa">${SV.trash}<span>Futa</span></button>
        </div></article>`).join('') : '<p class="muted">Hakuna app bado. Pakia ya kwanza hapo juu.</p>';
      const by = (id) => rows.find((x) => x.id == id);
      document.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = async () => { const d = await api('/admin/store/apps/' + x.dataset.ed); editModal(d.app); }));
      document.querySelectorAll('[data-ss]').forEach((x) => (x.onclick = () => shotPanel(x.dataset.ss)));
      document.querySelectorAll('[data-lg]').forEach((x) => (x.onclick = () => logoPanel(x.dataset.lg)));
      document.querySelectorAll('[data-cp]').forEach((x) => (x.onclick = async () => {
        const u = location.origin + '/store#app=' + x.dataset.cp;
        try { await navigator.clipboard.writeText(u); toast($('#m'), 'Link ya app imenakiliwa.', 'ok'); } catch (_) { window.prompt('Nakili link:', u); }
      }));
      document.querySelectorAll('[data-t]').forEach((x) => (x.onclick = async () => { await api('/admin/store/apps/' + x.dataset.t, { method: 'PATCH', body: { active: x.dataset.v === '1' } }); load(); }));
      document.querySelectorAll('[data-d]').forEach((x) => (x.onclick = async () => { if (confirm('Futa app hii kabisa? Picha, logo na malipo yake yatabaki kwenye historia.')) { await api('/admin/app-releases/' + x.dataset.d, { method: 'DELETE' }); load(); } }));
      void by;
    };

    f.onsubmit = async (e) => {
      e.preventDefault();
      const file = fi.files[0];
      if (!file) return toast($('#m'), 'Chagua faili kwanza.', 'err');
      if (file.size > 25 * 1048576) return toast($('#m'), 'Faili ni kubwa kuliko 25MB.', 'err');
      if (!fld('title').value.trim()) return toast($('#m'), 'Weka jina la app.', 'err');
      const q = new URLSearchParams({ title: fld('title').value.trim(), version: fld('version').value.trim(), platform: fld('platform').value, notes: fld('notes').value.trim(), kind: fld('kind').value });
      $('#go').disabled = true; $('#go').textContent = 'Inapakia…';
      try {
        const j = await new Promise((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open('POST', '/api/admin/app-releases?' + q.toString());
          x.setRequestHeader('Content-Type', 'application/octet-stream');
          x.setRequestHeader('X-Requested-With', 'fetch');
          x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
          x.upload.onprogress = (ev) => { if (ev.lengthComputable) setUp(Math.round((ev.loaded / ev.total) * 100)); };
          x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText || '{}'); } catch (_) {} x.status < 300 ? resolve(d) : reject(new Error(d.error || 'Upload imeshindikana.')); };
          x.onerror = () => reject(new Error('Mtandao umekatika wakati wa kupakia.'));
          setUp(0); x.send(file);
        });
        await api('/admin/store/apps/' + j.id, { method: 'PATCH', body: { price: Number(fld('price').value) || 0, developer: fld('developer').value.trim(), category: fld('category').value.trim() } });
        toast($('#m'), 'App imepakiwa.', 'ok'); f.reset(); fi.onchange(); load();
      } catch (err) { toast($('#m'), err.message, 'err'); }
      finally { $('#go').disabled = false; $('#go').textContent = 'Pakia app'; }
    };
    load();
  };

  H.promo = async () => {
    const SV = window.SVG;
    const money = (n) => 'TZS ' + Math.floor(Number(n) || 0).toLocaleString('en-US');
    const METHODS = { sonicpesa: ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa', 'CRDB Bank', 'NMB Bank', 'Selcom'], fastlipa: ['M-PESA', 'Tigo Pesa', 'Airtel Money', 'Halopesa'], clickpesa: [] };
    const p2 = (n) => String(n).padStart(2, '0');
    const toLocalDT = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
    const inDays = (n) => toLocalDT(new Date(Date.now() + n * 864e5).toISOString());
    const stat = (ic, n, l, cls) => `<div class="pm-stat ${cls || ''}"><i>${ic}</i><div><b>${n}</b><span>${l}</span></div></div>`;
    let tab = 'c', rateNow = 5, codesNow = [], provNow = 'clickpesa';

    shell('Promo Codes', `<div class="pm-stats" id="pms"></div>
      <div class="pm-top"><div class="pm-tabs" id="prt"><button class="on" data-t="c">Codes</button><button data-t="p">Maombi ya payout</button></div>
        <form class="pm-rate" id="rtf"><label>Asilimia ya jumla</label><div><input name="rate" type="number" min="0" max="50" step="0.5" value="5"><button class="btn sm">Hifadhi</button></div></form></div>
      <div id="pmCreate"></div>
      <div id="prc"></div>`);

    // ---------- Fomu ya kutengeneza code: inajitokeza mara moja ----------
    const createHTML = () => `<section class="pm-create">
        <div class="pm-h"><div><b>Tengeneza promo code</b><span>Mtu lazima awe na akaunti tayari</span></div></div>
        <form id="pnf" class="pm-form" novalidate>
          <div class="pm-fields">
            <div class="pm-f"><label>Aina ya code</label><select name="kind"><option value="COMMISSION">Commission (mwenye code analipwa)</option><option value="TRIAL">Majaribio: kifurushi cha siku 1 (kifaa kimoja mara moja)</option></select></div>
            <div class="pm-f"><label>1 · Namba ya mtu (kwa commission tu)</label><input name="phone" required inputmode="tel" placeholder="07XXXXXXXX"></div>
            <div class="pm-f"><label>2 · Code</label><input name="code" maxlength="20" placeholder="Acha wazi itengenezwe" style="text-transform:uppercase"></div>
            <div class="pm-f ar-span"><label>3 · Inaisha lini</label>
              <div class="pm-chips" id="pmDays"><button type="button" data-d="7">Siku 7</button><button type="button" data-d="30" class="on">Siku 30</button><button type="button" data-d="90">Siku 90</button><button type="button" data-d="365">Mwaka 1</button></div>
              <input name="expires_at" type="datetime-local" required value="${inDays(30)}"></div>
            <div class="pm-f ar-span"><label>4 · Asilimia maalum (hiari)</label>
              <div class="pm-chips" id="pmRate"><button type="button" data-r="" class="on">Ya jumla (${rateNow}%)</button><button type="button" data-r="5">5%</button><button type="button" data-r="7">7%</button><button type="button" data-r="10">10%</button></div>
              <input name="rate_percent" type="number" min="0" max="50" step="0.5" placeholder="Au andika asilimia"></div>
          </div>
          <div class="pm-preview" id="pmPrev"></div>
          <div class="pm-foot"><button class="btn">${SV.check} Tengeneza code</button></div>
        </form></section>`;

    const bindCreate = () => {
      const f = $('#pnf'); if (!f) return;
      const preview = () => {
        const ph = f.phone.value.trim() || '…', cd = (f.code.value.trim() || 'ITATENGENEZWA').toUpperCase();
        const r = f.rate_percent.value !== '' ? f.rate_percent.value + '%' : rateNow + '% (ya jumla)';
        const d = f.expires_at.value ? new Date(f.expires_at.value).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        $('#pmPrev').innerHTML = `<span>Muhtasari:</span> <b>${esc(cd)}</b> • mwenye code <b>${esc(ph)}</b> • asilimia <b>${esc(r)}</b> • inaisha <b>${esc(d)}</b>`;
      };
      document.querySelectorAll('#pmDays button').forEach((x) => (x.onclick = () => {
        f.expires_at.value = inDays(Number(x.dataset.d));
        document.querySelectorAll('#pmDays button').forEach((y) => y.classList.toggle('on', y === x)); preview();
      }));
      document.querySelectorAll('#pmRate button').forEach((x) => (x.onclick = () => {
        f.rate_percent.value = x.dataset.r;
        document.querySelectorAll('#pmRate button').forEach((y) => y.classList.toggle('on', y === x)); preview();
      }));
      f.rate_percent.oninput = () => { document.querySelectorAll('#pmRate button').forEach((y) => y.classList.toggle('on', y.dataset.r === f.rate_percent.value)); preview(); };
      ['phone', 'code', 'expires_at'].forEach((k) => (f[k].oninput = preview));
      preview();
      f.onsubmit = async (e) => {
        e.preventDefault(); const b = body(f);
        if (!b.expires_at) return toast(mBox(), 'Chagua tarehe ya kuisha.', 'err');
        try {
          await api('/admin/promo', { method: 'POST', body: { kind: b.kind || 'COMMISSION', phone: b.phone, expires_at: new Date(b.expires_at).toISOString(), code: b.code || '', rate_percent: b.rate_percent || null } });
          toast(mBox(), 'Promo code imetengenezwa.', 'ok'); f.reset(); f.expires_at.value = inDays(30); preview(); loadCodes();
        } catch (err) { toast(mBox(), err.message, 'err'); }
      };
    };

    // ---------- Orodha ya codes ----------
    const cardsHTML = (codes) => codes.map((c) => `<article class="pm-card ${c.expired ? 'off' : ''}">
        <div class="pm-card-h"><div class="pm-code">${esc(c.code)}</div><span class="pill ${c.expired ? 'bad' : 'ok'}">${c.expired ? 'Imeisha' : 'Inatumika'}</span></div>
        ${c.kind === 'TRIAL' ? '<div class="pm-owner"><b>🆓 Majaribio</b><span>Kifurushi cha siku 1 • kifaa kimoja mara moja</span></div>' : '<div class="pm-owner"><b>' + esc(c.name) + '</b><span>' + esc(c.phone) + '</span></div>'}
        <div class="pm-rate-row"><span>${c.rate_effective}%</span><small>${c.rate_percent != null ? 'asilimia maalum' : 'asilimia ya jumla'}</small></div>
        <div class="pm-mini">
          <div><b>${c.used}</b><span>Walitumia</span></div><div><b>${c.paid_buyers}</b><span>Walilipia</span></div>
          <div><b>${money(c.earned)}</b><span>Commission</span></div><div><b>${money(c.balance)}</b><span>Salio</span></div></div>
        <div class="pm-exp">Inaisha ${esc(fdate(c.expires_at))}</div>
        <div class="pm-acts">
          <button class="ar-b" data-lk="${c.id}">${SV.link}<span>Link</span></button>
          <button class="ar-b" data-ed="${c.id}">${SV.edit}<span>Hariri</span></button>
          <button class="ar-b ${c.active ? '' : 'ok'}" data-tg="${c.id}" data-v="${c.active ? 0 : 1}">${c.active ? SV.eyeOff : SV.eye}<span>${c.active ? 'Zima' : 'Washa'}</span></button>
          <button class="ar-b danger" data-fd="${c.id}">${SV.trash}<span>Futa</span></button>
        </div></article>`).join('') || '<div class="pm-empty">Hakuna promo codes bado. Tengeneza ya kwanza hapo juu.</div>';

    const bindList = () => {
      document.querySelectorAll('[data-lk]').forEach((x) => (x.onclick = async () => {
        const c = codesNow.find((k) => k.id == x.dataset.lk), u = location.origin + '/register?promo=' + encodeURIComponent(c.code);
        try { await navigator.clipboard.writeText(u); toast(mBox(), 'Link ya kujisajili imenakiliwa.', 'ok'); } catch (_) { window.prompt('Nakili link:', u); }
      }));
      document.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => editCode(codesNow.find((c) => c.id == x.dataset.ed))));
      document.querySelectorAll('[data-tg]').forEach((x) => (x.onclick = async () => {
        if (x.dataset.v === '0' && !confirm('Zima code hii?')) return;
        try { await api('/admin/promo/' + x.dataset.tg, { method: 'PATCH', body: { active: x.dataset.v === '1' } }); loadCodes(); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      }));
      document.querySelectorAll('[data-fd]').forEach((x) => (x.onclick = async () => {
        if (!confirm('Futa code hii kabisa? Historia yake ya commission na payout itafutwa. Haiwezi kurudishwa.')) return;
        try { const r = await api('/admin/promo/' + x.dataset.fd, { method: 'DELETE' }); toast(mBox(), 'Code imefutwa. ' + money(r.returned) + ' zimerudi kwenye salio la mfumo.', 'ok'); loadCodes(); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      }));
    };

    const editCode = (c) => {
      if (!c) return;
      document.querySelector('#pcmod')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div class="ar-modal" id="pcmod"><form class="ar-sheet" id="pcf">
        <div class="ar-sheet-h"><b>Hariri promo code</b><button type="button" class="ar-x" id="pcx">${SV.close}</button></div>
        <div class="ar-grid">
          <div class="ar-f"><label>Code</label><input name="code" value="${esc(c.code)}" maxlength="20" style="text-transform:uppercase"></div>
          <div class="ar-f"><label>Asilimia maalum (acha wazi = ya jumla)</label><input name="rate_percent" type="number" min="0" max="50" step="0.5" value="${c.rate_percent != null ? c.rate_percent : ''}"></div>
          <div class="ar-f"><label>Inaisha lini</label><input name="expires_at" type="datetime-local" value="${toLocalDT(c.expires_at)}"></div>
          <div class="ar-f"><label>Hali</label><label class="ar-tg"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><span class="t"></span><span>${c.active ? 'Inatumika' : 'Imezimwa'}</span></label></div>
        </div>
        <div class="ar-foot"><button type="button" class="btn ghost" id="pcc">Funga</button><button class="btn">Hifadhi mabadiliko</button></div></form></div>`);
      const m = document.querySelector('#pcmod'), f2 = document.querySelector('#pcf');
      const close = () => m.remove();
      document.querySelector('#pcx').onclick = close; document.querySelector('#pcc').onclick = close;
      m.onclick = (e) => { if (e.target === m) close(); };
      f2.onsubmit = async (e) => {
        e.preventDefault(); const b = body(f2);
        const payload = { code: b.code, rate_percent: b.rate_percent === '' ? null : Number(b.rate_percent), active: f2.active.checked };
        if (b.expires_at) payload.expires_at = new Date(b.expires_at).toISOString();
        try { await api('/admin/promo/' + c.id, { method: 'PATCH', body: payload }); toast(mBox(), 'Mabadiliko yamehifadhiwa.', 'ok'); close(); loadCodes(); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      };
    };

    const loadCodes = async () => {
      try {
        const { codes } = await api('/admin/promo');
        const cfg = await api('/admin/promo/config').catch(() => ({ rate_percent: rateNow }));
        codesNow = codes; rateNow = cfg.rate_percent;
        $('#rtf').rate.value = rateNow;
        const active = codes.filter((c) => !c.expired).length;
        const paid = codes.reduce((a, c) => a + Number(c.paid_buyers || 0), 0);
        const earned = codes.reduce((a, c) => a + Number(c.earned || 0), 0);
        $('#pms').innerHTML = [stat(SV.store, codes.length, 'Codes zote'), stat(SV.check, active, 'Zinatumika', 'ok'), stat(SV.cart, paid, 'Waliolipia'), stat(SV.download, money(earned), 'Jumla ya commission', 'gold')].join('');
        $('#prc').innerHTML = `<div class="pm-grid">${cardsHTML(codes)}</div>`;
        bindList();
      } catch (err) {
        $('#prc').innerHTML = `<div class="msg err">Imeshindikana kupakia codes: ${esc(err.message)}</div>`;
      }
    };

    // ---------- Maombi ya payout ----------
    const payoutsView = async () => {
      $('#pmCreate').innerHTML = '';
      $('#pms').innerHTML = '';
      try {
        const { payouts } = await api('/admin/promo/payouts');
        const pend = payouts.filter((x) => x.status === 'PENDING').length;
        $('#pms').innerHTML = [stat(SV.download, payouts.length, 'Maombi yote'), stat(SV.lock, pend, 'Yanasubiri', 'gold'), stat(SV.check, payouts.filter((x) => x.status === 'PAID').length, 'Yamelipwa', 'ok')].join('');
        $('#prc').innerHTML = `<div class="pm-grid">${payouts.map((x) => `<article class="pm-card">
            <div class="pm-card-h"><div class="pm-code sm">${money(x.amount)}</div><span class="pill ${x.status === 'PAID' ? 'ok' : (x.status === 'REJECTED' ? 'bad' : 'gold')}">${esc(x.status)}</span></div>
            <div class="pm-owner"><b>${esc(x.name)}</b><span>${esc(x.phone)} • ${esc(x.code)}</span></div>
            <div class="pm-exp">${esc(fdate(x.created_at))}${x.tx_ref ? ' • Muamala ' + esc(x.tx_ref) : ''}</div>
            ${x.status === 'PENDING' ? `<div class="pm-acts">
              <button class="ar-b ok" data-ap="${x.id}" data-amt="${x.amount}" data-ph="${esc(x.phone)}">${SV.check}<span>Thibitisha kwa SMS</span></button>
              <button class="ar-b danger" data-rj="${x.id}">${SV.close}<span>Kataa</span></button></div>` : ''}
          </article>`).join('') || '<div class="pm-empty">Hakuna maombi ya payout.</div>'}</div>`;
        document.querySelectorAll('[data-ap]').forEach((x) => (x.onclick = () => confirmSms(x.dataset.ap, Number(x.dataset.amt), x.dataset.ph)));
        document.querySelectorAll('[data-rj]').forEach((x) => (x.onclick = async () => {
          const reason = prompt('Sababu ya kukataa (hiari)') || '';
          try { await api('/admin/promo/payouts/' + x.dataset.rj + '/reject', { method: 'POST', body: { reason } }); payoutsView(); }
          catch (err) { toast(mBox(), err.message, 'err'); }
        }));
      } catch (err) { $('#prc').innerHTML = `<div class="msg err">Imeshindikana kupakia maombi: ${esc(err.message)}</div>`; }
    };

    // Dirisha la kubandika SMS ya muamala: mfumo unakagua kiasi, namba, na namba ya muamala
    const confirmSms = (id, amount, phone) => {
      document.querySelector('#pmsms')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div class="ar-modal" id="pmsms"><form class="ar-sheet" id="pmsf">
        <div class="ar-sheet-h"><b>Thibitisha malipo kwa SMS</b><button type="button" class="ar-x" id="pmsx">${SV.close}</button></div>
        <div class="pm-ask"><div><small>Kiasi cha ombi</small><b>${money(amount)}</b></div><div><small>Namba ya mwenye code</small><b>${esc(phone)}</b></div></div>
        <div class="ad-field"><label>Bandika SMS ya muamala wa kutuma pesa</label>
          <textarea name="sms" rows="6" placeholder="Mfano: ... Umetuma TZS 10,000 kwa 0712345678 ... Muamala ID: ABC12345XYZ ..."></textarea></div>
        <small class="muted">Mfumo utakagua kiasi, namba ya mwenye code, na namba ya muamala. Namba ya muamala haitumiki mara mbili.</small>
        <div class="ar-foot"><button type="button" class="btn ghost" id="pmsc">Funga</button><button class="btn">${SV.check} Thibitisha</button></div></form></div>`);
      const m = document.querySelector('#pmsms'), f = document.querySelector('#pmsf');
      const close = () => m.remove();
      document.querySelector('#pmsx').onclick = close; document.querySelector('#pmsc').onclick = close;
      m.onclick = (e) => { if (e.target === m) close(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api('/admin/promo/payouts/' + id + '/confirm', { method: 'POST', body: { sms: f.sms.value } });
          toast(mBox(), 'Malipo yamethibitishwa. Salio la mfumo limepunguzwa.', 'ok'); close(); payoutsView();
        } catch (err) { toast(mBox(), err.message, 'err'); }
      };
    };

    const show = async () => {
      document.querySelectorAll('#prt button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      if (tab === 'c') {
        if (!$('#pnf')) $('#pmCreate').innerHTML = createHTML();
        bindCreate();
        $('#prc').innerHTML = '<p class="muted">Inapakia codes…</p>';
        await loadCodes();
      } else {
        await payoutsView();
      }
    };

    $('#rtf').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('/admin/promo/config', { method: 'PUT', body: { rate_percent: Number(e.target.rate.value) } }); toast(mBox(), 'Asilimia ya jumla sasa ni ' + r.rate_percent + '%.', 'ok'); rateNow = r.rate_percent; }
      catch (err) { toast(mBox(), err.message, 'err'); }
    };
    document.querySelectorAll('#prt button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; show(); }));
    show();
  };

  H.resets = async () => {
    const SV = window.SVG;
    shell('Maombi ya Reset', `<div id="prc"><div class="muted">Inapakia…</div></div>`);
    const showCode = (code) => {
      document.querySelector('#rcode')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div class="ar-modal" id="rcode"><div class="ar-sheet">
        <div class="ar-sheet-h"><b>Code ya kubadilisha password</b></div>
        <p class="muted">Mpe mteja code hii sasa. Haitaonekana tena, na inaisha baada ya dakika 30.</p>
        <div class="pc-linkbox" style="font-size:1.6rem;text-align:center;letter-spacing:4px">${esc(code)}</div>
        <div class="ar-foot"><button class="btn ghost" id="rcx">Funga</button><button class="btn" id="rcc">Nakili code</button></div></div></div>`);
      document.getElementById('rcx').onclick = () => document.querySelector('#rcode').remove();
      document.getElementById('rcc').onclick = async () => { try { await navigator.clipboard.writeText(code); toast(mBox(), 'Code imenakiliwa.', 'ok'); } catch (_) {} };
    };

    let lastSig = '';
    let busy = false;          // admin yuko ndani ya orodha (mouse au kitufe kimechaguliwa)
    let queued = null;         // data mpya inayosubiri admin amalize
    const area = document.getElementById('prc');

    const render = (requests) => {
      $('#prc').innerHTML = `<div class="pm-grid">${requests.map((r) => `<article class="pm-card">
        <div class="pm-card-h"><div class="pm-code sm">${esc(r.name)}</div><span class="pill ${r.status === 'REJECTED' ? 'bad' : 'gold'}">${esc(r.status)}</span></div>
        <div class="pm-owner"><b>${esc(r.phone)}</b><span>Ombi: ${esc(fdate(r.requested_at))}${r.status === 'APPROVED' ? ' • inaisha ' + esc(fdate(r.expires_at)) + ' • majaribio ' + r.attempts + '/5' : ''}</span></div>
        ${r.status === 'PENDING' ? `<div class="pm-acts"><button class="ar-b ok" data-ap="${r.id}">${SV.check}<span>Idhinisha na upate code</span></button><button class="ar-b danger" data-rj="${r.id}">${SV.close}<span>Kataa</span></button></div>` : ''}
      </article>`).join('') || '<div class="pm-empty">Hakuna maombi ya reset.</div>'}</div>`;
      document.querySelectorAll('[data-ap]').forEach((x) => (x.onclick = async () => {
        if (!confirm('Idhinisha ombi hili? Utapewa code mara moja tu. Hakikisha ni mteja halisi.')) return;
        try { const r = await api('/admin/resets/' + x.dataset.ap + '/approve', { method: 'POST' }); showCode(r.code); lastSig = ''; fetchList(true); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      }));
      document.querySelectorAll('[data-rj]').forEach((x) => (x.onclick = async () => {
        try { await api('/admin/resets/' + x.dataset.rj + '/reject', { method: 'POST' }); lastSig = ''; fetchList(true); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      }));
    };

    // Kuchora upya: kama admin yuko ndani ya orodha, data inasubiri hadi aondoke
    const fetchList = async (force) => {
      const { requests } = await api('/admin/resets');
      const sig = JSON.stringify(requests);
      if (sig === lastSig && !force) return;
      if (busy && !force) { queued = { requests, sig }; return; }
      lastSig = sig; queued = null;
      render(requests);
    };

    area.addEventListener('pointerenter', () => { busy = true; });
    area.addEventListener('pointerleave', () => {
      busy = false;
      if (queued) { const q = queued; queued = null; lastSig = q.sig; render(q.requests); }
    });
    area.addEventListener('focusin', () => { busy = true; });
    area.addEventListener('focusout', () => {
      setTimeout(() => {
        if (area.matches(':hover') || area.contains(document.activeElement)) return;
        busy = false;
        if (queued) { const q = queued; queued = null; lastSig = q.sig; render(q.requests); }
      }, 50);
    });

    // Kila sekunde 2 baada ya jibu: ukurasa haurefreshiwi, na mzunguko unasimama admin akiondoka
    const poll = async () => {
      if (!document.getElementById('prc')) return;
      if (!document.hidden) { try { await fetchList(false); } catch (_) { /* kimya: jaribu tena */ } }
      setTimeout(poll, 2000);
    };
    poll();
  };

  H.storeadmin = async () => {
    shell('Muonekano wa Store', `<div class="ad-tabs" id="stt"><button class="on" data-t="b">🖼 Banners</button><button data-t="s">🗂 Sehemu na tabs</button><button data-t="a">📱 Maelezo ya apps</button><button data-t="r">⭐ Maoni</button></div><div id="stc"><div class="muted">Inapakia…</div></div>`);
    let apps = [], tab = 'b';
    const loadApps = async () => { apps = (await api('/admin/app-releases')).releases; };
    const upload = async (url, file, method) => {
      const r = await fetch(url, { method: method || 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-Requested-With': 'fetch' }, body: file });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Imeshindikana.');
      return j;
    };

    const bannersView = async () => {
      const { banners } = await api('/admin/store/banners');
      $('#stc').innerHTML = `<div class="ad-card"><div class="ad-card-h"><b>➕ Banner mpya</b><span class="muted">Slider ya juu ya ukurasa wa download</span></div>
        <form id="bf" class="ad-form-grid" style="padding:18px 22px">
          <div class="ad-field"><label>Kichwa</label><input name="title" required maxlength="80" placeholder="Mfano: Popular Tool Apps"></div>
          <div class="ad-field"><label>Maelezo mafupi</label><input name="subtitle" maxlength="120" placeholder="Mfano: Recommended Category"></div>
          <div class="ad-field"><label>Rangi ya nyuma</label><input name="bg_color" type="color" value="#6aa86a"></div>
          <div class="ad-field"><label>Inafungua app</label><select name="release_id"><option value="">— hakuna —</option>${apps.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select></div>
          <div class="ad-field ad-span"><label>Picha ya banner (hiari, hadi 2MB)</label><input type="file" id="bfi" accept="image/png,image/jpeg,image/webp"></div>
          <div class="ad-field"><label>Nafasi</label><input name="position" type="number" value="0"></div>
          <div class="ad-field"><label>Hali</label><label class="mf-toggle"><input type="checkbox" name="active" checked><span class="t"></span><span>Inaonekana</span></label></div>
          <div class="ad-span ad-foot"><button class="btn">➕ Ongeza banner</button></div></form></div>
        <div class="ad-list">${banners.map((b) => `<div class="ad-app ${b.active ? '' : 'off'}">
          <div class="st-banner" style="background:${esc(b.bg_color)}">${b.has_image ? `<img src="/api/app-store/banners/${b.id}/image" alt="">` : ''}<span>${esc(b.title)}</span></div>
          <div class="ad-app-m"><b>${esc(b.title)}</b><span class="muted">${esc(b.subtitle || '')}${b.release_title ? ' • inafungua: ' + esc(b.release_title) : ''}</span></div>
          <div class="ad-app-a"><input type="file" data-bimg="${b.id}" accept="image/png,image/jpeg,image/webp" class="st-file">
            <button class="btn sm ghost" data-bt="${b.id}" data-v="${b.active ? 0 : 1}">${b.active ? '🙈 Zima' : '👁 Washa'}</button>
            <button class="btn sm danger" data-bd="${b.id}">🗑</button></div></div>`).join('') || '<p class="muted">Hakuna banner bado.</p>'}</div>`;
      $('#bf').onsubmit = async (e) => {
        e.preventDefault();
        const b = body(e.target), file = $('#bfi').files[0];
        try {
          const r = await api('/admin/store/banners', { method: 'POST', body: { title: b.title, subtitle: b.subtitle, bg_color: b.bg_color, release_id: b.release_id || null, position: Number(b.position) || 0, active: e.target.active.checked } });
          if (file) await upload('/api/admin/store/banners/' + r.id + '/image', file);
          toast(mBox(), 'Banner imeongezwa.', 'ok'); bannersView();
        } catch (err) { toast(mBox(), err.message, 'err'); }
      };
      document.querySelectorAll('[data-bimg]').forEach((i) => (i.onchange = async () => { const f = i.files[0]; if (!f) return; try { await upload('/api/admin/store/banners/' + i.dataset.bimg + '/image', f); bannersView(); } catch (err) { toast(mBox(), err.message, 'err'); } }));
      document.querySelectorAll('[data-bt]').forEach((x) => (x.onclick = async () => { await api('/admin/store/banners/' + x.dataset.bt, { method: 'PATCH', body: { active: x.dataset.v === '1' } }); bannersView(); }));
      document.querySelectorAll('[data-bd]').forEach((x) => (x.onclick = async () => { if (confirm('Futa banner?')) { await api('/admin/store/banners/' + x.dataset.bd, { method: 'DELETE' }); bannersView(); } }));
    };

    const sectionsView = async () => {
      const { sections } = await api('/admin/store/sections');
      const tabs = [...new Set(sections.map((x) => x.tab))];
      $('#stc').innerHTML = `<div class="ad-card"><div class="ad-card-h"><b>➕ Sehemu mpya</b><span class="muted">Tab ni kundi kubwa (mfano Featured, Themes). Sehemu ni kadi au orodha ya apps.</span></div>
        <form id="sf" class="ad-form-grid" style="padding:18px 22px">
          <div class="ad-field"><label>Tab</label><input name="tab" list="tabl" value="Featured" maxlength="40"><datalist id="tabl">${tabs.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
          <div class="ad-field"><label>Jina la sehemu</label><input name="title" required maxlength="80" placeholder="Mfano: This week's recommended app"></div>
          <div class="ad-field"><label>Mpangilio wa onyesho</label><select name="kind"><option value="row">Kadi za mlalo</option><option value="list">Orodha wima</option></select></div>
          <div class="ad-field"><label>Nafasi</label><input name="position" type="number" value="0"></div>
          <div class="ad-span ad-foot"><button class="btn">➕ Ongeza sehemu</button></div></form></div>
        ${sections.map((x) => `<div class="ad-card"><div class="ad-card-h"><b>${esc(x.title)}</b><span class="muted">Tab: ${esc(x.tab)} • ${x.kind === 'list' ? 'Orodha' : 'Kadi'} • ${x.apps.length} apps</span>
            <span><button class="btn sm ghost" data-st="${x.id}" data-v="${x.active ? 0 : 1}">${x.active ? '🙈 Zima' : '👁 Washa'}</button> <button class="btn sm danger" data-sd="${x.id}">🗑</button></span></div>
          <div class="st-apps">${apps.map((a) => `<label class="st-chip ${x.apps.includes(a.id) ? 'on' : ''}"><input type="checkbox" value="${a.id}" ${x.apps.includes(a.id) ? 'checked' : ''}>${esc(a.title)}</label>`).join('') || '<span class="muted">Hakuna apps. Pakia app kwanza.</span>'}</div>
          <div class="ad-foot"><button class="btn" data-sv="${x.id}">💾 Hifadhi apps za sehemu hii</button></div></div>`).join('') || '<p class="muted">Hakuna sehemu bado.</p>'}`;
      $('#sf').onsubmit = async (e) => { e.preventDefault(); const b = body(e.target); try { await api('/admin/store/sections', { method: 'POST', body: { tab: b.tab, title: b.title, kind: b.kind, position: Number(b.position) || 0 } }); sectionsView(); } catch (err) { toast(mBox(), err.message, 'err'); } };
      document.querySelectorAll('[data-sv]').forEach((x) => (x.onclick = async () => {
        const card = x.closest('.ad-card');
        const ids = [...card.querySelectorAll('.st-apps input:checked')].map((i) => Number(i.value));
        await api('/admin/store/sections/' + x.dataset.sv + '/apps', { method: 'PUT', body: { ids } }); toast(mBox(), 'Imehifadhiwa.', 'ok'); sectionsView();
      }));
      document.querySelectorAll('[data-st]').forEach((x) => (x.onclick = async () => { await api('/admin/store/sections/' + x.dataset.st, { method: 'PATCH', body: { active: x.dataset.v === '1' } }); sectionsView(); }));
      document.querySelectorAll('[data-sd]').forEach((x) => (x.onclick = async () => { if (confirm('Futa sehemu hii?')) { await api('/admin/store/sections/' + x.dataset.sd, { method: 'DELETE' }); sectionsView(); } }));
    };

    const appsView = async () => {
      $('#stc').innerHTML = apps.length ? apps.map((a) => `<form class="ad-card st-app" data-id="${a.id}"><div class="ad-card-h"><b>${esc(a.title)}</b><span class="muted">${esc(a.platform)} • v${esc(a.version || '-')}</span></div>
          <div class="ad-form-grid" style="padding:18px 22px">
            <div class="ad-field"><label>Msanidi (developer)</label><input name="developer" value="${esc(a.developer || '')}" maxlength="80"></div>
            <div class="ad-field"><label>Kategoria (mfano Video)</label><input name="category" value="${esc(a.category || '')}" maxlength="40"></div>
            <div class="ad-field"><label>Ukadiriaji wa mkono (0–5, acha wazi = wastani wa maoni)</label><input name="rating" type="number" step="0.5" min="0" max="5" value="${a.rating ?? ''}"></div>
            <div class="ad-field ad-span"><label>Maelezo ya app (description)</label><textarea name="notes" rows="4" maxlength="2000">${esc(a.notes || '')}</textarea></div>
            <div class="ad-span ad-foot"><button class="btn">💾 Hifadhi</button></div></div></form>`).join('') : '<p class="muted">Pakia app kwanza kwenye App Download.</p>';
      document.querySelectorAll('.st-app').forEach((f) => (f.onsubmit = async (e) => {
        e.preventDefault(); const b = body(f);
        await api('/admin/store/apps/' + f.dataset.id, { method: 'PATCH', body: { developer: b.developer, category: b.category, rating: b.rating === '' ? null : Number(b.rating), notes: b.notes } });
        toast(mBox(), 'Imehifadhiwa.', 'ok');
      }));
    };

    const reviewsView = async () => {
      const aid = (window.__stAid && apps.find((a) => a.id == window.__stAid)) ? window.__stAid : (apps[0] && apps[0].id);
      if (!apps.length) { $('#stc').innerHTML = '<p class="muted">Pakia app kwanza.</p>'; return; }
      const { reviews } = await api('/app-releases/' + aid + '/reviews').catch(() => ({ reviews: [] }));
      $('#stc').innerHTML = `<div class="ad-card"><div class="ad-card-h"><b>⭐ Maoni</b><span class="muted">Ukadiriaji wa mkono unaweza kuwekwa kwenye Maelezo ya apps</span></div>
          <div class="ad-form-grid" style="padding:18px 22px">
            <div class="ad-field"><label>App</label><select id="rapp">${apps.map((a) => `<option value="${a.id}" ${a.id == aid ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></div>
            <div class="ad-field"><label>Jina la mtoa maoni</label><input id="rau" maxlength="60"></div>
            <div class="ad-field"><label>Ukadiriaji (1–5)</label><input id="rrt" type="number" step="0.5" min="1" max="5" value="5"></div>
            <div class="ad-field ad-span"><label>Maoni</label><textarea id="rbd" rows="3" maxlength="600"></textarea></div>
            <div class="ad-span ad-foot"><button class="btn" id="rgo">➕ Ongeza maoni</button></div></div></div>
        <div class="ad-list">${reviews.map((r) => `<div class="ad-app"><div class="ad-app-m"><b>${esc(r.author)} • ${r.rating}★</b><span class="muted">${esc(r.body || '')}</span></div>
          <div class="ad-app-a"><button class="btn sm danger" data-rd="${r.id}">🗑</button></div></div>`).join('') || '<p class="muted">Hakuna maoni kwa app hii.</p>'}</div>`;
      $('#rapp').onchange = (e) => { window.__stAid = Number(e.target.value); reviewsView(); };
      $('#rgo').onclick = async () => {
        try { await api('/admin/store/reviews', { method: 'POST', body: { release_id: Number($('#rapp').value), author: $('#rau').value, rating: Number($('#rrt').value), body: $('#rbd').value } }); reviewsView(); }
        catch (err) { toast(mBox(), err.message, 'err'); }
      };
      document.querySelectorAll('[data-rd]').forEach((x) => (x.onclick = async () => { if (confirm('Futa maoni?')) { await api('/admin/store/reviews/' + x.dataset.rd, { method: 'DELETE' }); reviewsView(); } }));
    };

    const show = async () => {
      document.querySelectorAll('#stt button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      await loadApps();
      if (tab === 'b') return bannersView();
      if (tab === 's') return sectionsView();
      if (tab === 'a') return appsView();
      return reviewsView();
    };
    document.querySelectorAll('#stt button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; show(); }));
    show();
  };

  const balHTML = (b, action, compact) => {
    if (compact) return `<div class="bal-card bal-compact">
      <div class="bal-glow"></div>
      <div class="bal-top"><span class="bal-tag"><i class="bal-dot"></i>Salio la mfumo</span><span class="bal-time">${esc(fdate(b.updated_at))}</span></div>
      <div class="bal-amt"><span>${fmt(b.available.value)}</span><small>${esc(b.available.currency || 'TZS')}</small></div>
      <div class="bal-sub">Imekusanywa kutoka kwa wateja, ukitoa payouts zilizotumwa</div></div>`;
    const coll = Number(b.collected) || 0, paid = Number(b.paid_out) || 0;
    const pct = Math.min(100, Math.round((paid / Math.max(coll, 1)) * 100));
    return `<div class="bal-card">
      <div class="bal-glow"></div>
      <div class="bal-top"><span class="bal-tag"><i class="bal-dot"></i>Salio la mfumo</span><span class="bal-time">${esc(fdate(b.updated_at))}</span></div>
      <div class="bal-amt"><span>${fmt(b.available.value)}</span><small>${esc(b.available.currency || 'TZS')}</small></div>
      <div class="bal-sub">Imekusanywa kutoka kwa wateja, ukitoa payouts zilizotumwa</div>
      <div class="bal-bar"><i style="width:${pct}%"></i></div>
      <div class="bal-stats">
        <div><span class="bal-ic ok">💳</span><div><b>${fmt(coll)}</b><small>Imekusanywa</small></div></div>
        <div><span class="bal-ic bad">💸</span><div><b>${fmt(paid)}</b><small>Imetolewa</small></div></div>
        <div><span class="bal-ic ok">🎟</span><div><b>${fmt(Number(b.commission_owed) || 0)}</b><small>Kamisheni ya promo</small></div></div>
        <div><span class="bal-ic">📈</span><div><b>${pct}%</b><small>Ya mapato yametolewa</small></div></div>
      </div>${action ? '<a class="btn bal-go" href="/admin/payouts">💸 Tuma payout</a>' : ''}</div>`;
  };
  const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k' : String(n));
  const lbl = (t, per) => { const d = new Date(t + 'T00:00:00'); return per === 'year' ? String(d.getFullYear()) : per === 'month' ? d.toLocaleDateString('sw-TZ', { month: 'short' }) : d.toLocaleDateString('sw-TZ', { day: '2-digit', month: '2-digit' }); };
  function barChart(pts, per) {
    const W = 640, Hh = 250, L = 46, R = 10, T = 14, B = 30, n = pts.length, iw = W - L - R, ih = Hh - T - B, step = iw / n, bw = Math.min(38, step * 0.6);
    const vals = pts.map((p) => Number(p.amount)); let max = Math.max(...vals, 1); const mag = Math.pow(10, Math.floor(Math.log10(max))), q = mag / 2; max = Math.ceil(max / q) * q;
    let g = '', bars = '', xl = '', line = []; const skip = Math.ceil(n / 8);
    for (let i = 0; i <= 4; i++) { const y = T + ih - (ih * i) / 4; g += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 6}" y="${y + 3}" text-anchor="end">${short(Math.round((max * i) / 4))}</text>`; }
    pts.forEach((p, i) => { const v = vals[i], h = Math.max(v ? 3 : 0, (ih * v) / max), x = L + step * i + (step - bw) / 2, y = T + ih - h;
      bars += `<rect class="bar" data-i="${i}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="7" fill="url(#bg)"><title>${lbl(p.t, per)}: ${fmt(v)} TZS</title></rect>`; line.push([x + bw / 2, y]);
      if (i % skip === 0 || i === n - 1) xl += `<text class="ax" x="${x + bw / 2}" y="${Hh - 10}" text-anchor="middle">${lbl(p.t, per)}</text>`; });
    const path = line.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${Hh}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--primary)"/></linearGradient></defs>${g}${bars}<path d="${path}" fill="none" style="stroke:var(--text)" stroke-opacity=".55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${xl}</svg>`;
  }
  function donut(parts) {
    const tot = parts.reduce((a, x) => a + x.v, 0), C = 2 * Math.PI * 40; let off = 0;
    const segs = tot ? parts.map((x) => { const len = (x.v / tot) * C, el = `<circle r="40" cx="50" cy="50" fill="none" stroke="${x.c}" stroke-width="14" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`; off += len; return el; }).join('') : '<circle r="40" cx="50" cy="50" fill="none" stroke="rgba(127,127,150,.25)" stroke-width="14"/>';
    return `<svg viewBox="0 0 100 100" width="130" height="130">${segs}<text x="50" y="48" text-anchor="middle" style="fill:var(--text);font-size:16px;font-weight:800">${tot}</text><text x="50" y="62" text-anchor="middle" class="ax">malipo</text></svg><div class="legend">${parts.map((x) => `<div><i style="background:${x.c}"></i>${x.n}: <b>${x.v}</b></div>`).join('')}</div>`;
  }
  H.dashboard = async () => {
    // Ikoni za mstari (SVG), zinafuata rangi ya theme
    const SI = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const QA = [
      ['channels', SI('<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8 21h8M10 3l2 3 2-3"/>'), 'Channels'],
      ['matches', SI('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>'), 'Mechi'],
      ['payouts', SI('<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16 15h2"/>'), 'Payouts'],
      ['promo', SI('<path d="M3 9a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 0 0-4V5H3z"/><path d="M14 5v3M14 11v2M14 16v3"/>'), 'Promo Codes'],
      ['users', SI('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'), 'Watumiaji'],
      ['packages', SI('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'), 'Vifurushi'],
      ['notifications', SI('<path d="M6 8a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 14 6 8z"/><path d="M10 19a2 2 0 0 0 4 0"/>'), 'Arifa'],
      ['app-releases', SI('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>'), 'Apps'],
    ];
    shell('Dashboard', `<div class="db">
      <section class="db-kpis">
        <div class="db-kpi"><span>Salio la mfumo</span><b id="kBal">—</b><small id="kBalS">Inapakia…</small></div>
        <div class="db-kpi"><span>Mapato ya leo</span><b id="kRev">—</b><small>Malipo yaliyokamilika leo tu</small></div>
        <div class="db-kpi"><span>Watumiaji</span><b id="kUsr">—</b><small id="kUsrS"></small></div>
        <div class="db-kpi"><span>Vifurushi hai</span><b id="kSub">—</b><small id="kSubS"></small></div>
      </section>
      <section class="db-actions">${QA.map(([p, ic, t]) => `<a class="db-act" href="/admin/${p}.html"><i>${ic}</i><span>${t}</span></a>`).join('')}</section>
      <div class="db-cols">
        <div class="card">
          <div class="chead"><div><h3 style="margin:0">Mapato</h3><div class="muted" id="tsub"></div></div>
            <div class="tabs" id="tabs"><button data-p="day" class="on">Siku</button><button data-p="week">Wiki</button><button data-p="month">Mwezi</button><button data-p="year">Mwaka</button></div></div>
          <div class="big" id="tot">—</div>
          <div class="chart" id="ch"><div class="muted">Inapakia…</div></div>
          <div class="muted" id="tip" style="min-height:1.3em;margin-top:6px">Gusa safu kuona kiasi.</div>
        </div>
        <div class="card"><h3 style="margin-top:0">Hali ya malipo</h3><div class="donutwrap" id="dn"></div></div>
      </div>
      <div class="card"><h3 style="margin-top:0">Payouts za karibuni</h3><div id="rp"></div></div>
    </div>`);

    const d = await api('/admin/dashboard');
    $('#kUsr').textContent = fmt(d.users.total);
    $('#kUsrS').textContent = `${fmt(d.users.active)} hai • ${fmt(d.users.suspended)} zimesimamishwa`;
    $('#kSub').textContent = fmt(d.subscriptions.active);
    $('#kSubS').textContent = `${fmt(d.subscriptions.expired)} zimeisha`;
    $('#dn').innerHTML = donut([{ n: 'Zimekamilika', v: d.payments.successful, c: '#1fa35a' }, { n: 'Zinasubiri', v: d.payments.pending, c: '#f5a623' }, { n: 'Zimeshindwa', v: d.payments.failed, c: '#e5384f' }]);
    $('#rp').innerHTML = tbl([['Mpokeaji', (r) => esc(r.recipient_name)], ['Amount', (r) => fmt(r.amount)], ['Status', (r) => esc(r.status)], ['Tarehe', (r) => fdate(r.created_at)]], d.recent_payouts);

    let pts = [], per = 'day';
    const SUB = { day: 'siku 14 zilizopita', week: 'wiki 12 zilizopita', month: 'miezi 12 iliyopita', year: 'miaka 5 iliyopita' };
    const load = async (p) => {
      per = p;
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
      const r = await api('/admin/dashboard/revenue?period=' + p); pts = r.points;
      $('#tot').textContent = fmt(r.total) + ' TZS'; $('#tsub').textContent = 'Jumla ya ' + SUB[p];
      // Mapato ya leo: kiasi cha siku ya leo pekee (si jumla ya chati nzima)
      if (p === 'day') {
        const today = new Date().toDateString();
        const hit = pts.find((x) => new Date(x.t).toDateString() === today);
        $('#kRev').textContent = fmt(hit ? hit.amount : 0) + ' TZS';
      }
      $('#ch').innerHTML = barChart(pts, per); $('#tip').textContent = 'Gusa safu kuona kiasi.';
      document.querySelectorAll('#ch .bar').forEach((el) => (el.onclick = () => { const x = pts[el.dataset.i]; $('#tip').textContent = `${lbl(x.t, per)} — ${fmt(x.amount)} TZS (${x.count} malipo)`; }));
    };
    document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => load(b.dataset.p)));
    load('day').catch((e) => { $('#ch').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });

    api('/admin/payments/balance').then((b) => {
      const v = Number(b.available && b.available.value != null ? b.available.value : (b.value ?? 0)) || 0;
      $('#kBal').textContent = fmt(v) + ' TZS';
      $('#kBalS').textContent = `Salio la sasa • Imekusanywa jumla ${fmt(b.collected || 0)} • Imetolewa ${fmt(b.paid_out || 0)}`;
    }).catch(() => {});
  };
  H.users = async () => {
    shell('Users', `<div class="search" style="max-width:480px"><input id="q" placeholder="Tafuta jina au namba ya simu…"></div><div id="ul" class="ugrid"><div class="muted">Inapakia…</div></div><div class="ushade" id="us" hidden></div><aside class="udrawer" id="ud" hidden></aside>`);
    const ini = (n) => esc((n || '?').trim().charAt(0).toUpperCase());
    const pill = (t, c) => `<span class="pill ${c || ''}">${esc(t)}</span>`;
    const stc = (x) => (x === 'ACTIVE' || x === 'COMPLETED' ? 'ok' : x === 'PENDING' ? 'gold' : 'bad');
    const closeD = () => { $('#ud').hidden = true; $('#us').hidden = true; };
    $('#us').onclick = closeD;
    async function openUser(uid) {
      const d = await api('/admin/users/' + uid), u = d.user;
      $('#ud').hidden = false; $('#us').hidden = false;
      $('#ud').innerHTML = `<div class="uhead"><div class="uav big">${ini(u.name)}</div><div style="flex:1;min-width:0"><h2 style="margin:0">${esc(u.name)}</h2><div class="muted">${esc(u.phone)} • Alijiunga ${fdate(u.created_at)}</div><div class="uchips">${pill(u.status, stc(u.status))}${u.role === 'admin' ? pill('ADMIN') : ''}</div></div><button class="ib2" id="dx" aria-label="Funga">✕</button></div>
        <div class="mini"><div><b>${fmt(d.totals.paid)}</b><span>Jumla aliyolipa (TZS)</span></div><div><b>${d.totals.ok}</b><span>Malipo yaliyokamilika</span></div><div><b>${d.totals.total}</b><span>Malipo yote</span></div><div><b>${d.subscriptions.filter((x) => x.status === 'ACTIVE').length + d.channel_purchases.filter((x) => x.status === 'ACTIVE').length}</b><span>Ufikiaji hai</span></div></div>
        ${u.role === 'admin' ? '' : `<div class="uact"><button class="btn sm ${u.status === 'ACTIVE' ? 'danger' : ''}" id="tg">${u.status === 'ACTIVE' ? '⛔ Simamisha akaunti' : '✅ Washa akaunti'}</button><a class="btn sm ghost" href="/admin/subscriptions?phone=${encodeURIComponent(u.phone)}">➕ Ongeza kifurushi/channel</a></div>`}
        <h3>Vifurushi vyake</h3><div class="card">${tbl([['Kifurushi', (x) => esc(x.package_name)], ['Kuanza', (x) => fdate(x.start_date)], ['Kuisha', (x) => fdate(x.end_date)], ['Hali', (x) => pill(x.status, stc(x.status))]], d.subscriptions)}</div>
        <h3>Channels alizolipia</h3><div class="card">${tbl([['Channel', (x) => esc(x.channel_name)], ['Kuisha', (x) => fdate(x.end_date)], ['Hali', (x) => pill(x.status, stc(x.status))]], d.channel_purchases)}</div>
        <h3>Malipo yote</h3><div class="card">${tbl([['Order', (x) => esc(x.order_id)], ['Kitu', (x) => esc(x.item)], ['Kiasi', (x) => fmt(x.amount) + ' ' + esc(x.currency)], ['Hali', (x) => pill(x.status, stc(x.status))], ['Tarehe', (x) => fdate(x.created_at)], ['Ref', (x) => esc(x.reference || '-')], ['Hitilafu', (x) => esc(x.failure_reason || '')]], d.payments)}</div>`;
      $('#dx').onclick = closeD;
      const tg = $('#tg'); if (tg) tg.onclick = async () => { if (!confirm('Una uhakika?')) return; await api('/admin/users/' + uid, { method: 'PATCH', body: { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } }); await openUser(uid); load(); };
    }
    const load = async () => {
      const { users } = await api('/admin/users?limit=100&q=' + encodeURIComponent($('#q').value));
      $('#ul').innerHTML = users.length ? users.map((u) => `<div class="card ucard" data-u="${u.id}"><div class="uav">${ini(u.name)}</div><div class="ub"><b>${esc(u.name)}</b><div class="muted">${esc(u.phone)}</div><div class="uchips">${pill(u.status, stc(u.status))}${u.role === 'admin' ? pill('ADMIN') : ''}${u.package_name ? pill(u.package_name, 'gold') : ''}</div>${u.subscription_end ? `<div class="muted" style="font-size:.72rem">Hadi ${fdate(u.subscription_end)}</div>` : ''}</div></div>`).join('') : '<p class="muted">Hakuna watumiaji.</p>';
      document.querySelectorAll('[data-u]').forEach((c) => (c.onclick = () => openUser(c.dataset.u)));
    };
    let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 300); }; load();
  };
  H.categories = async () => {
    shell('Categories', `<form class="card" id="f"><input type="hidden" name="id"><div class="row"><div><label>Jina</label><input name="name" required></div><div><label>Order</label><input name="sort_order" type="number" value="0"></div></div>
      <label><input type="checkbox" name="active" checked style="width:auto"> Active</label><div id="m" class="msg" hidden></div><button class="btn mt">Hifadhi</button> <button type="button" class="btn ghost mt" id="rs">Mpya</button></form><div class="card mt" id="t"></div>`);
    let rows = [];
    const load = async () => { rows = (await api('/admin/categories')).categories; $('#t').innerHTML = tbl([['Jina', (c) => esc(c.name)], ['Order', (c) => c.sort_order], ['Active', (c) => (c.active ? '✓' : '✗')], ['', (c) => `<button class="btn sm ghost" data-e="${c.id}">Hariri</button> <button class="btn sm danger" data-d="${c.id}">Futa</button>`]], rows);
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { const c = rows.find((x) => x.id == b.dataset.e), f = $('#f'); f.elements.id.value = c.id; f.elements.name.value = c.name; f.sort_order.value = c.sort_order; f.active.checked = c.active; scrollTo(0, 0); }));
      document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (confirm('Futa category?')) { await api('/admin/categories/' + b.dataset.d, { method: 'DELETE' }); load(); } })); };
    $('#rs').onclick = () => { $('#f').reset(); $('#f').elements.id.value = ''; };
    $('#f').onsubmit = async (e) => { e.preventDefault(); const f = e.target, b = { name: f.elements.name.value, sort_order: Number(f.sort_order.value), active: f.active.checked };
      try { await api('/admin/categories' + (f.elements.id.value ? '/' + f.elements.id.value : ''), { method: f.elements.id.value ? 'PATCH' : 'POST', body: b }); f.reset(); f.elements.id.value = ''; load(); } catch (err) { toast($('#m'), err.message, 'err'); } };
    load();
  };
  H.channels = async () => {
    const [{ categories }, { packages }] = await Promise.all([api('/admin/categories'), api('/admin/packages')]);
    const TYPES = [
      ['M3U8', 'HLS', 'Stream ya kawaida (.m3u8)', '📺'],
      ['M3U8_HEADERS', 'HLS + Headers', 'Inahitaji headers kama Referer au User-Agent', '🧾'],
      ['MPD', 'DASH + ClearKey', 'Stream ya MPD yenye ClearKey (kid:key)', '🔑'],
      ['MPD_HEADERS', 'DASH + Headers', 'MPD yenye headers na ClearKey', '🛡'],
      ['API', 'API Endpoint', 'Endpoint inayorudisha link na ClearKey kiotomatiki', '⚡'],
    ];
    const STEPS = ['Taarifa', 'Stream', 'Ufikiaji & bei', 'Hakiki'];
    shell('Channels', `<div class="card chform" id="fc">
      <div class="fh"><div><b id="ft">➕ Ongeza channel mpya</b><div class="muted">Fuata hatua nne. Logo ikikosekana, herufi ya kwanza ya jina itatumika.</div></div>
        <div style="display:flex;gap:8px"><button type="button" class="btn ghost sm" id="rs">＋ Mpya</button><button type="button" class="ib2" id="tgl" aria-label="Panua/Funga">⌃</button></div></div>
      <div class="steps" id="steps">${STEPS.map((s, i) => `<button type="button" data-st="${i}"><i>${i + 1}</i>${s}</button>`).join('')}</div>
      <form id="f" novalidate><input type="hidden" name="id"><input type="hidden" name="stream_type" value="M3U8"><input type="hidden" name="access_type" value="FREE">
        <section data-s="0">
          <div class="lgrow"><div class="lgp" id="lgp"><b>?</b></div><div style="flex:1"><label>Jina la channel *</label><input name="name" placeholder="Mfano: Azam Sport 1 HD"></div></div>
          <div class="row"><div><label>Category</label><select name="category_id"><option value="">— Bila category</option>${opts(categories, 'id', 'name')}</select></div><div><label>Logo URL (hiari)</label><input name="logo_url" placeholder="https://…"></div></div>
          <div class="row"><div><label>Mpangilio (namba ndogo inaonekana kwanza)</label><input name="sort_order" type="number" value="0"></div></div><div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:16px"><label class="sw"><input type="checkbox" name="active" checked><span class="t"></span>Inaonekana kwa watumiaji</label><label class="sw"><input type="checkbox" name="popular"><span class="t"></span>Maarufu (Popular)</label></div>
        </section>
        <section data-s="1" hidden>
          <label>Aina ya stream</label>
          <div class="tcards" id="tc">${TYPES.map(([v, t, d, ic]) => `<button type="button" class="tcard" data-t="${v}"><span class="ti">${ic}</span><b>${t}</b><span class="d">${d}</span></button>`).join('')}</div>
          <label id="surl-l">Stream URL *</label><input name="stream_url" placeholder="https://…">
          <div id="hw"><label>Headers (JSON)</label><textarea name="headers" rows="2" placeholder='{"Referer":"https://…","User-Agent":"…"}'></textarea></div>
          <div id="ckw"><label>🔑 ClearKey: kid:key kila mstari (hex 32 kila moja)</label><textarea name="clearkey" rows="3" placeholder="0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210"></textarea></div>
          <div id="apiw"><button type="button" class="btn ghost sm mt" id="tapi">🔌 Jaribu endpoint</button><div id="tres"></div></div>
        </section>
        <section data-s="2" hidden>
          <label>Ufikiaji</label>
          <div class="tcards" id="ac"><button type="button" class="tcard" data-a="FREE"><span class="ti">✅</span><b>Bure (FREE)</b><span class="d">Kila mtu anaiona bila kifurushi.</span></button><button type="button" class="tcard" data-a="PAID"><span class="ti">💎</span><b>Premium (PAID)</b><span class="d">Inahitaji kifurushi au kulipia channel hii.</span></button></div>
          <div id="pricew" class="row"><div><label>💰 Bei ya channel moja (TZS, 0 = haiuzwi peke yake)</label><input name="price" type="number" min="0" value="0"></div><div><label>Muda wa channel</label><div style="display:flex;gap:8px"><input name="price_days" type="number" min="1" value="30"><select name="price_unit" style="max-width:130px"><option value="d">Siku</option><option value="m">Dakika</option></select></div></div></div>
          <label>Vifurushi vinavyojumuisha channel hii (hiari)</label><div id="pk" class="chipbar">${packages.map((p) => `<label class="pkc"><input type="checkbox" value="${p.id}"><span>${esc(p.name)}</span></label>`).join('') || '<span class="muted">Hakuna vifurushi.</span>'}</div>
        </section>
        <section data-s="3" hidden><div id="rev"></div></section>
        <div class="wz-foot"><button type="button" class="btn ghost" id="prev">‹ Rudi</button><button type="button" class="btn" id="next">Endelea ›</button><button class="btn" id="save" hidden>💾 Hifadhi channel</button><div id="m" class="msg" hidden></div></div>
      </form></div>
      <div class="toolbar"><div class="search"><input id="cq" placeholder="Tafuta channel…"></div><div class="chipbar" id="cf">${[['all', 'Zote'], ['on', '👁 Zinaonekana'], ['off', '🙈 Zimefichwa'], ['free', 'Free'], ['paid', 'Paid']].map(([v, l]) => `<button type="button" class="chip ${v === 'all' ? 'on' : ''}" data-m="${v}">${l}</button>`).join('')}</div></div>
      <div class="cgrid" id="t"><div class="muted">Inapakia…</div></div>`);
    const f = $('#f'), fld = (n) => f.elements.namedItem(n);
    let rows = [], mode = 'all', cur = 0;
    const isApi = () => fld('stream_type').value === 'API', isMpd = () => fld('stream_type').value.startsWith('MPD'), isPaid = () => fld('access_type').value === 'PAID';
    const bad = (t) => { toast($('#m'), t, 'err'); return false; };
    const lgp = () => { const n = fld('name').value.trim() || '?'; $('#lgp').style.setProperty('--h', chHue(n)); $('#lgp').innerHTML = chLogo({ name: n, logo_url: fld('logo_url').value.trim() }); };
    const paint = () => {
      document.querySelectorAll('#tc .tcard').forEach((b) => b.classList.toggle('on', b.dataset.t === fld('stream_type').value));
      document.querySelectorAll('#ac .tcard').forEach((b) => b.classList.toggle('on', b.dataset.a === fld('access_type').value));
      $('#ckw').hidden = !isMpd(); $('#hw').hidden = !(fld('stream_type').value.endsWith('_HEADERS') || isApi()); $('#apiw').hidden = !isApi();
      $('#pricew').hidden = !isPaid();
      $('#surl-l').textContent = isApi() ? 'Endpoint URL *' : 'Stream URL *';
      fld('stream_url').placeholder = isApi() ? 'https://mtoa-huduma.example/endpoint' : 'https://…';
    };
    const check = (s) => {
      $('#m').hidden = true;
      if (s === 0 && !fld('name').value.trim()) { fld('name').focus(); return bad('Weka jina la channel.'); }
      if (s === 1) {
        const u = fld('stream_url').value.trim();
        if (!/^https?:\/\/\S+$/.test(u)) { fld('stream_url').focus(); return bad(isApi() ? 'Weka endpoint URL sahihi (https://…).' : 'Weka stream URL sahihi (https://…).'); }
        if (fld('headers').value.trim()) { try { const h = JSON.parse(fld('headers').value); if (typeof h !== 'object' || Array.isArray(h)) throw 0; } catch (_) { return bad('Headers ziwe JSON sahihi.'); } }
      }
      if (s === 2 && isPaid()) { const p = Number(fld('price').value) || 0; if (p && p < 500) return bad('Bei ya channel iwe angalau 500 TZS (au 0).'); }
      return true;
    };
    const review = () => {
      const pk = [...document.querySelectorAll('#pk input:checked')].map((i) => i.parentElement.textContent.trim());
      const t = TYPES.find((x) => x[0] === fld('stream_type').value);
      const price = Number(fld('price').value) || 0;
      $('#rev').innerHTML = `<div class="ccard"><div class="cc-top"><div class="cc-logo" style="--h:${chHue(fld('name').value)}">${chLogo({ name: fld('name').value || '?', logo_url: fld('logo_url').value.trim() })}</div>
        <div class="cc-info"><b>${esc(fld('name').value || '—')}</b><div class="muted">${esc(t[1])}</div></div></div>
        <div class="cc-tags"><span class="pill">${esc(fld('stream_type').value)}</span><span class="pill ${isPaid() ? 'gold' : 'ok'}">${isPaid() ? 'PAID' + (price ? ' • ' + fmt(price) + ' TZS / ' + fld('price_days').value + ' siku' : '') : 'FREE'}</span>${fld('active').checked ? '' : '<span class="pill bad">Imefichwa</span>'}${fld('popular').checked ? '<span class="pill">⭐ Maarufu</span>' : ''}</div>
        <div class="muted" style="word-break:break-all;font-size:.78rem">${isApi() ? 'Endpoint: ' : 'Stream: '}${esc(fld('stream_url').value)}</div>
        <div class="muted" style="font-size:.78rem">Vifurushi: ${pk.length ? esc(pk.join(', ')) : 'Hakuna'}</div></div>`;
    };
    const go = (n) => {
      for (let s = cur; s < n; s++) if (!check(s)) { n = s; break; }
      cur = n;
      document.querySelectorAll('[data-s]').forEach((s) => (s.hidden = Number(s.dataset.s) !== n));
      document.querySelectorAll('#steps button').forEach((b, i) => { b.classList.toggle('on', i === n); b.classList.toggle('done', i < n); });
      $('#prev').hidden = n === 0; $('#next').hidden = n === 3; $('#save').hidden = n !== 3;
      if (n === 3) review();
    };
    const reset = () => {
      f.reset(); fld('id').value = ''; fld('stream_type').value = 'M3U8'; fld('access_type').value = 'FREE';
      document.querySelectorAll('#pk input').forEach((i) => (i.checked = false));
      $('#tres').innerHTML = ''; $('#ft').textContent = '➕ Ongeza channel mpya';
      paint(); lgp(); go(0);
    };
    const fill = (c) => {
      reset();
      fld('id').value = c.id; fld('name').value = c.name; fld('logo_url').value = c.logo_url || ''; fld('category_id').value = c.category_id || '';
      fld('stream_type').value = c.stream_type; fld('access_type').value = c.access_type; fld('stream_url').value = c.stream_url;
      fld('headers').value = Object.keys(c.headers || {}).length ? JSON.stringify(c.headers) : '';
      fld('clearkey').value = Object.entries(c.clearkey || {}).map(([k, v]) => k + ':' + v).join('\n');
      fld('sort_order').value = c.sort_order || 0; fld('active').checked = c.active; fld('popular').checked = c.popular; fld('price').value = c.price || 0; fld('price_days').value = c.price_minutes ? (c.price_minutes % 1440 ? c.price_minutes : c.price_minutes / 1440) : (c.price_days || 30); fld('price_unit').value = c.price_minutes && c.price_minutes % 1440 ? 'm' : 'd';
      document.querySelectorAll('#pk input').forEach((i) => (i.checked = (c.package_ids || []).includes(Number(i.value))));
      $('#ft').textContent = '✏️ Unahariri: ' + c.name; paint(); lgp(); go(0);
      scrollTo({ top: 0, behavior: 'smooth' });
    };
    document.querySelectorAll('#tc .tcard').forEach((b) => (b.onclick = () => { fld('stream_type').value = b.dataset.t; paint(); }));
    document.querySelectorAll('#ac .tcard').forEach((b) => (b.onclick = () => { fld('access_type').value = b.dataset.a; paint(); }));
    $('#steps').onclick = (e) => { const b = e.target.closest('[data-st]'); if (b) go(Number(b.dataset.st)); };
    $('#prev').onclick = () => go(cur - 1);
    $('#next').onclick = () => go(cur + 1);
    fld('name').oninput = lgp; fld('logo_url').oninput = lgp;
    $('#rs').onclick = reset; $('#tgl').onclick = () => $('#fc').classList.toggle('collapsed');
    $('#tapi').onclick = async () => {
      const u = fld('stream_url').value.trim(), box = $('#tres');
      if (!/^https?:\/\//.test(u)) { box.innerHTML = '<div class="testbox bad">Weka endpoint URL kwanza.</div>'; return; }
      box.innerHTML = '<div class="testbox">⏳ Inajaribu endpoint…</div>';
      try {
        const r = await api('/admin/channels/test-endpoint', { method: 'POST', body: { url: u, headers: fld('headers').value } });
        box.innerHTML = `<div class="testbox ok">✅ Imefanikiwa: aina <b>${esc(r.type.toUpperCase())}</b> • ClearKey <b>${r.keys}</b> • Host <b>${esc(r.host)}</b></div>`;
      } catch (e) { box.innerHTML = `<div class="testbox bad">❌ ${esc(e.message)}</div>`; }
    };
    const card = (c) => `<div class="ccard ${c.active ? '' : 'off'}"><div class="cc-top"><div class="cc-logo" style="--h:${chHue(c.name)}">${chLogo(c)}</div><div class="cc-info"><b>${esc(c.name)}</b><div class="muted">${esc((categories.find((k) => k.id === c.category_id) || {}).name || 'Bila category')}</div></div></div>
      <div class="cc-tags"><span class="pill">${esc(c.stream_type)}</span>${Object.keys(c.clearkey || {}).length ? '<span class="pill gold">🔑 ClearKey</span>' : ''}<span class="pill ${c.access_type === 'PAID' ? 'gold' : 'ok'}">${esc(c.access_type)}${c.price > 0 ? ' • ' + fmt(c.price) + ' TZS' : ''}</span>${c.popular ? '<span class="pill">⭐ Maarufu</span>' : ''}${c.active ? '' : '<span class="pill bad">🙈 Imefichwa</span>'}</div>
      <div class="cc-act">${c.last_error ? '<span class="pill bad" title="' + esc(c.last_error) + '">⚠ Stream: ' + esc(String(c.last_error).slice(0, 48)) + '</span>' : ''}<button class="btn sm ghost" data-e="${c.id}">✏️ Hariri</button><button class="btn sm ghost" data-c="${c.id}" title="Nakili channel">📄 Nakili</button><label class="fr-sw" title="Bure au ya kulipia"><input type="checkbox" data-free="${c.id}" ${c.access_type === 'FREE' ? 'checked' : ''}><span></span><em>${c.access_type === 'FREE' ? 'Bure' : 'Kulipia'}</em></label><button class="btn sm ghost" data-v="${c.id}" data-a="${c.active ? 0 : 1}">${c.active ? '🙈 Ficha' : '👁 Onyesha'}</button><button class="btn sm danger" data-d="${c.id}">🗑</button></div></div>`;
    const render = () => {
      const q = $('#cq').value.trim().toLowerCase();
      const list = rows.filter((c) => (!q || c.name.toLowerCase().includes(q)) && ({ all: true, on: c.active, off: !c.active, free: c.access_type === 'FREE', paid: c.access_type === 'PAID' }[mode]));
      $('#t').innerHTML = list.length ? list.map(card).join('') : '<p class="muted">Hakuna channel.</p>';
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => fill(rows.find((x) => x.id == b.dataset.e))));
      document.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => dupChannel(rows.find((x) => x.id == b.dataset.c))));
      document.querySelectorAll('[data-free]').forEach((x) => (x.onchange = () => setFree(rows.find((r) => r.id == x.dataset.free), x.checked, x)));
      document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = async () => { await api('/admin/channels/' + b.dataset.v + '/visibility', { method: 'POST', body: { active: b.dataset.a === '1' } }); load(); }));
      document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (confirm('Futa channel?')) { await api('/admin/channels/' + b.dataset.d, { method: 'DELETE' }); load(); } }));
    };
    // Swichi ya bure/kulipia: inahifadhi moja kwa moja. Kulipia kunahitaji bei zaidi ya 0.
    const setFree = async (c, free, box) => {
      // Ya kulipia = inapatikana kupitia vifurushi alivyoweka admin (haiulizi bei)
      const price = 0;
      const days = c.price_minutes ? (c.price_minutes % 1440 ? c.price_minutes : c.price_minutes / 1440) : (c.price_days || 30);
      const minutesUnit = c.price_minutes && c.price_minutes % 1440 ? 1 : 1440;
      const body = {
        name: c.name, logo_url: c.logo_url || '', category_id: c.category_id || '',
        stream_type: c.stream_type, access_type: free ? 'FREE' : 'PAID', stream_url: c.stream_url || '',
        headers: Object.keys(c.headers || {}).length ? JSON.stringify(c.headers) : '',
        clearkey: Object.entries(c.clearkey || {}).map(([k, v]) => k + ':' + v).join('\n'),
        price, price_days: days, price_minutes: days * minutesUnit,
        sort_order: c.sort_order || 0, active: c.active, popular: !!c.popular, package_ids: c.package_ids || [],
      };
      try {
        await api('/admin/channels/' + c.id, { method: 'PATCH', body });
        toast(mBox(), free ? 'Channel sasa ni bure.' : 'Channel sasa ni ya kulipia kupitia vifurushi.', 'ok');
        load();
      } catch (err) { toast(mBox(), err.message, 'err'); box.checked = !free; }
    };

    // Kunakili channel: nakala inaundwa na taarifa zote, imefichwa kwa chaguo-msingi
    const dupChannel = async (c) => {
      if (!confirm('Nakili channel "' + c.name + '"?')) return;
      const days = c.price_minutes ? (c.price_minutes % 1440 ? c.price_minutes : c.price_minutes / 1440) : (c.price_days || 30);
      const minutesUnit = c.price_minutes && c.price_minutes % 1440 ? 1 : 1440;
      const body = {
        name: c.name + ' (nakala)', logo_url: c.logo_url || '', category_id: c.category_id || '',
        stream_type: c.stream_type, access_type: c.access_type, stream_url: c.stream_url || '',
        headers: Object.keys(c.headers || {}).length ? JSON.stringify(c.headers) : '',
        clearkey: Object.entries(c.clearkey || {}).map(([k, v]) => k + ':' + v).join('\n'),
        price: c.price || 0, price_days: days, price_minutes: days * minutesUnit,
        sort_order: c.sort_order || 0, active: false, popular: !!c.popular, package_ids: c.package_ids || [],
      };
      try { await api('/admin/channels', { method: 'POST', body }); toast(mBox(), 'Nakala imetengenezwa. Imefichwa; ionyeshe ukitaka.', 'ok'); load(); }
      catch (err) { toast(mBox(), err.message, 'err'); }
    };
    const load = async () => { rows = (await api('/admin/channels')).channels; render(); };
    $('#cq').oninput = render;
    document.querySelectorAll('#cf [data-m]').forEach((b) => (b.onclick = () => { mode = b.dataset.m; document.querySelectorAll('#cf .chip').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (cur !== 3) { go(cur + 1); return; }                       // Enter kwenye hatua ya kati haihifadhi kwa bahati mbaya
      const id = fld('id').value;
      const b = { name: fld('name').value, logo_url: fld('logo_url').value, category_id: fld('category_id').value, stream_type: fld('stream_type').value, access_type: fld('access_type').value,
        stream_url: fld('stream_url').value, headers: fld('headers').value, clearkey: fld('clearkey').value, price: Number(fld('price').value) || 0, price_days: Number(fld('price_days').value) || 30, price_minutes: (Number(fld('price_days').value) || 30) * (fld('price_unit').value === 'm' ? 1 : 1440),
        sort_order: Number(fld('sort_order').value) || 0, active: fld('active').checked, popular: fld('popular').checked, package_ids: [...document.querySelectorAll('#pk input:checked')].map((i) => Number(i.value)) };
      try { await api('/admin/channels' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body: b }); reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); load(); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    reset(); load();
  };
  H.packages = async () => {
    const { channels } = await api('/admin/channels');
    shell('Packages', `<div class="pstats" id="pks"></div>
      <form class="ad-card" id="f" novalidate><input type="hidden" name="id">
        <div class="ad-card-h"><b id="pk-t">📦 Kifurushi kipya</b><span class="muted">Bei na muda ndio vinavyomwonyesha mteja</span></div>
        <div class="ad-form-grid">
          <div class="ad-field"><label>Jina la kifurushi</label><input name="name" required placeholder="Mfano: Gold"></div>
          <div class="ad-field"><label>💰 Bei (TZS)</label><input name="price" type="number" min="500" required placeholder="5000"></div>
          <div class="ad-field ad-span"><label>⏱ Muda</label>
            <div class="chipbar" id="dur">${[[1, 'Siku 1'], [7, 'Siku 7'], [30, 'Siku 30'], [365, 'Mwaka']].map(([d, l]) => `<button type="button" class="chip" data-d="${d}">${l}</button>`).join('')}</div>
            <div style="display:flex;gap:10px;margin-top:10px"><input name="duration_days" type="number" min="1" required placeholder="Idadi"><select name="dunit" style="max-width:150px"><option value="d">Siku</option><option value="m">Dakika</option></select></div></div>
          <div class="ad-field ad-span"><label>Maelezo</label><textarea name="description" rows="2" placeholder="Kwa mfano: Channel zote, bila matangazo"></textarea></div>
        </div>
        <details class="ad-dd" id="ddc"><summary id="dds">📺 Chagua channels</summary>
        <div class="ad-chans" id="ck">${channels.map((c) => `<label class="ad-chan"><input type="checkbox" value="${c.id}"><span class="chic">${chLogo(c)}</span><span>${esc(c.name)}</span></label>`).join('') || '<span class="muted">Hakuna channels.</span>'}</div></details>
        <label class="mf-toggle mt"><input type="checkbox" name="active" checked><span class="t"></span><span>Kifurushi kinaonekana kwa wateja</span></label>
        <div id="m" class="msg" hidden></div>
        <div class="ad-foot"><button type="button" class="btn ghost" id="rs">＋ Mpya</button><button class="btn">💾 Hifadhi kifurushi</button></div></form>
      <div class="ad-pkgs" id="pl"></div>`);
    let rows = [];
    const fld = (n) => $('#f').elements.namedItem(n);
    const sumUp = () => { const n = document.querySelectorAll('#ck input:checked').length; $('#dds').textContent = '📺 Channels zilizochaguliwa: ' + n + ' • bonyeza kuona'; };
    document.querySelectorAll('#ck input').forEach((i) => (i.onchange = sumUp));
    const setDur = (d) => document.querySelectorAll('#dur [data-d]').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === Number(d)));
    const reset = () => { $('#f').reset(); fld('id').value = ''; $('#pk-t').textContent = '📦 Kifurushi kipya'; document.querySelectorAll('#ck input').forEach((i) => (i.checked = false)); setDur(0); sumUp(); };
    document.querySelectorAll('#dur [data-d]').forEach((b) => (b.onclick = () => { fld('duration_days').value = b.dataset.d; fld('dunit').value = 'd'; setDur(b.dataset.d); }));
    fld('duration_days').oninput = (e) => setDur(e.target.value);
    $('#rs').onclick = reset;
    const card = (p) => `<div class="ad-pkg ${p.active ? '' : 'off'}">
      <div class="ad-pkg-top"><b>${esc(p.name)}</b><span class="pill ${p.active ? 'ok' : 'bad'}">${p.active ? 'Hai' : 'Imefichwa'}</span></div>
      <div class="ad-pkg-price">${fmt(p.price)}<small> TZS</small></div>
      <div class="ad-pkg-meta"><span>⏱ ${p.duration_minutes && p.duration_minutes % 1440 ? p.duration_minutes + ' dakika' : 'Siku ' + (p.duration_minutes ? p.duration_minutes / 1440 : p.duration_days)}</span><span>📺 ${p.channel_ids.length} channels</span></div>
      <p class="muted ad-small">${esc(p.description || 'Hakuna maelezo')}</p>
      <div class="cc-act"><button class="btn sm ghost" data-e="${p.id}">✏️ Hariri</button></div></div>`;
    const load = async () => {
      rows = (await api('/admin/packages')).packages;
      const active = rows.filter((p) => p.active).length;
      $('#pks').innerHTML = [['📦', rows.length, 'Vifurushi vyote', ''], ['✅', active, 'Vinavyoonekana', 'ok'], ['🙈', rows.length - active, 'Vilivyofichwa', 'bad']].map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('');
      $('#pl').innerHTML = rows.length ? rows.map(card).join('') : '<p class="muted">Hakuna vifurushi bado.</p>';
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => {
        const p = rows.find((x) => x.id == b.dataset.e); reset();
        fld('id').value = p.id; fld('name').value = p.name; fld('price').value = p.price; fld('duration_days').value = p.duration_minutes ? (p.duration_minutes % 1440 ? p.duration_minutes : p.duration_minutes / 1440) : p.duration_days; fld('dunit').value = p.duration_minutes && p.duration_minutes % 1440 ? 'm' : 'd'; fld('description').value = p.description || ''; fld('active').checked = p.active;
        setDur(p.duration_days); document.querySelectorAll('#ck input').forEach((i) => (i.checked = (p.channel_ids || []).includes(Number(i.value)))); sumUp();
        $('#pk-t').textContent = '✏️ Unahariri: ' + p.name; scrollTo({ top: 0, behavior: 'smooth' });
      }));
    };
    $('#f').onsubmit = async (e) => {
      e.preventDefault(); const id = fld('id').value;
      const body2 = { name: fld('name').value, description: fld('description').value, price: Number(fld('price').value), duration_minutes: Number(fld('duration_days').value) * (fld('dunit').value === 'm' ? 1 : 1440), active: fld('active').checked, channel_ids: [...document.querySelectorAll('#ck input:checked')].map((i) => Number(i.value)) };
      try { await api('/admin/packages' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body: body2 }); reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); load(); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    load();
  };
  H.subscriptions = async () => {
    const [{ packages }, { channels }, { matches }, d] = await Promise.all([api('/admin/packages'), api('/admin/channels'), api('/admin/matches'), api('/admin/subscriptions?limit=100')]);
    const paid = channels.filter((c) => c.access_type === 'PAID');
    const upcoming = matches.filter((m) => m.status !== 'FINISHED');
    const pre = new URLSearchParams(location.search).get('phone') || '';
    const now = () => new Date();
    const subs = d.subscriptions || [], cps = d.channel_purchases || [];
    const mps = (d.match_purchases || []).map((x) => ({ ...x, status: new Date(x.end_date) > now() ? 'ACTIVE' : 'EXPIRED' }));
    const all = [...subs, ...cps, ...mps];
    const act = all.filter((x) => x.status === 'ACTIVE').length;
    shell('Subscriptions', `<div class="pstats">
        ${[['🔁', all.length, 'Jumla ya ufikiaji', ''], ['✅', act, 'Zinafanya kazi', 'ok'], ['⌛', all.length - act, 'Zimeisha au zimesimamishwa', 'bad'], ['⚽', mps.filter((x) => x.status === 'ACTIVE').length, 'Mechi zilizofunguliwa', 'gold']]
          .map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('')}
      </div>
      <form class="ad-card" id="f"><div class="ad-card-h"><b>➕ Mpe mteja ufikiaji kwa namba ya simu</b><span class="muted">Chagua kifurushi kizima, channel moja, au mechi moja</span></div>
        <div class="ad-form-grid">
          <div class="ad-field"><label>📱 Namba ya simu</label><input name="phone" inputmode="tel" placeholder="07XXXXXXXX" value="${esc(pre)}" required></div>
          <div class="ad-field ad-span"><label>Kifurushi, channel au mechi</label><select name="target">
            <optgroup label="📦 Kifurushi kizima">${packages.map((p) => `<option value="p:${p.id}">${esc(p.name)} • siku ${p.duration_days}</option>`).join('')}</optgroup>
            <optgroup label="📺 Channel moja">${paid.map((c) => `<option value="c:${c.id}">${esc(c.name)} • siku ${c.price_days}</option>`).join('')}</optgroup>
            <optgroup label="⚽ Mechi moja">${upcoming.map((m) => `<option value="m:${m.id}">${esc(m.home_team)} vs ${esc(m.away_team)} • ${esc(fdate(m.kickoff_at))}</option>`).join('')}</optgroup>
          </select></div>
          <div class="ad-field"><label>Muda (hiari)</label><div style="display:flex;gap:8px"><input name="days" type="number" min="1" placeholder="Mechi: hadi dakika 150"><select name="unit" style="max-width:130px"><option value="d">Siku</option><option value="m">Dakika</option></select></div></div>
        </div>
        <div id="m" class="msg" hidden></div>
        <div class="ad-foot"><button class="btn">➕ Mpe ufikiaji</button></div></form>
      <div class="ad-tabs" id="stabs"><button class="on" data-t="p">📦 Vifurushi (${subs.length})</button><button data-t="c">📺 Channels (${cps.length})</button><button data-t="m">⚽ Mechi (${mps.length})</button></div>
      <div class="ad-list" id="slist"></div>`);
    let tab = 'p';
    const lists = () => ({ p: subs, c: cps, m: mps });
    const prog = (s, e) => { const tot = Math.max(1, new Date(e) - new Date(s)); return Math.max(0, Math.min(100, ((new Date(e) - now()) / tot) * 100)).toFixed(0); };
    const cardOf = (x, k) => {
      const days = Math.max(0, Math.ceil((new Date(x.end_date) - now()) / 864e5));
      const ok = x.status === 'ACTIVE';
      const name = k === 'c' ? x.channel_name : k === 'm' ? x.match_title : x.package_name;
      const icon = k === 'c' ? '📺' : k === 'm' ? '⚽' : '💎';
      const acts = k === 'm'
        ? `<button class="btn sm ghost" data-x="${x.id}" data-k="m">+ Siku</button>`
        : `<button class="btn sm ghost" data-x="${x.id}" data-k="${k}">+ Siku</button><button class="btn sm danger" data-su="${x.id}" data-k="${k}">Simamisha</button><button class="btn sm ghost" data-ac="${x.id}" data-k="${k}">Washa</button>`;
      return `<div class="ad-sub ${ok ? '' : 'off'}">
        <div class="ad-sub-top"><span class="ad-av">${esc((x.user_name || '?').charAt(0).toUpperCase())}</span>
          <div class="ad-sub-id"><b>${esc(x.user_name)}</b><span class="muted">${esc(x.phone)}</span></div>
          <span class="pill ${ok ? 'ok' : x.status === 'SUSPENDED' ? 'bad' : ''}">${esc(x.status)}</span></div>
        <div class="ad-sub-name">${icon} ${esc(name)}</div>
        <div class="ad-bar"><i style="width:${ok ? prog(x.start_date, x.end_date) : 0}%"></i></div>
        <div class="ad-sub-meta"><span>Kuanza ${esc(fdate(x.start_date))}</span><span>Kuisha ${esc(fdate(x.end_date))}</span><b>${ok ? days + ' siku' : 'Imeisha'}</b></div>
        <div class="cc-act">${acts}</div></div>`;
    };
    const ep = (k, id) => (k === 'c' ? '/admin/channel-purchases/' : k === 'm' ? '/admin/match-purchases/' : '/admin/subscriptions/') + id;
    const draw = () => {
      document.querySelectorAll('#stabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      const list = lists()[tab];
      $('#slist').innerHTML = list.length ? list.map((x) => cardOf(x, tab)).join('') : '<p class="muted">Hakuna ufikiaji wa aina hii bado.</p>';
      document.querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => { const n = parseInt(prompt('Ongeza siku ngapi?'), 10); if (n > 0) { await api(ep(b.dataset.k, b.dataset.x), { method: 'PATCH', body: { extend_days: n } }); reload(); } }));
      document.querySelectorAll('[data-su]').forEach((b) => (b.onclick = async () => { await api(ep(b.dataset.k, b.dataset.su), { method: 'PATCH', body: { status: 'SUSPENDED' } }); reload(); }));
      document.querySelectorAll('[data-ac]').forEach((b) => (b.onclick = async () => { await api(ep(b.dataset.k, b.dataset.ac), { method: 'PATCH', body: { status: 'ACTIVE' } }); reload(); }));
    };
    const reload = async () => {
      const r = await api('/admin/subscriptions?limit=100');
      subs.length = 0; cps.length = 0; mps.length = 0;
      subs.push(...(r.subscriptions || [])); cps.push(...(r.channel_purchases || []));
      mps.push(...(r.match_purchases || []).map((x) => ({ ...x, status: new Date(x.end_date) > now() ? 'ACTIVE' : 'EXPIRED' })));
      draw();
    };
    document.querySelectorAll('#stabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    $('#f').onsubmit = async (e) => { e.preventDefault(); const b = body(e.target); const p = { phone: b.phone, target: b.target }; if (b.days) { if (b.unit === 'm') p.minutes = Number(b.days); else p.days = Number(b.days); }
      try { const r = await api('/admin/subscriptions', { method: 'POST', body: p }); toast($('#m'), `Imeongezwa kwa ${r.user}${r.label ? ' (' + r.label + ')' : ''}.`, 'ok'); reload(); } catch (err) { toast($('#m'), err.message, 'err'); } };
    draw();
  };
  H.payments = async () => {
    const { packages } = await api('/admin/packages');
    shell('Payments', `<div class="pstats" id="ps"></div>
      <form class="ad-card" id="f"><div class="ad-card-h"><b>🔎 Chuja malipo</b><span class="muted">Chagua vichujio, kisha bonyeza Chuja</span></div>
        <div class="ad-form-grid">
          <div class="ad-field"><label>Kuanzia</label><input type="date" name="from"></div>
          <div class="ad-field"><label>Hadi</label><input type="date" name="to"></div>
          <div class="ad-field"><label>Simu</label><input name="phone" placeholder="07…"></div>
          <div class="ad-field"><label>Reference / Order</label><input name="reference" placeholder="ORD…"></div>
          <div class="ad-field ad-span"><label>Kifurushi au channel</label><select name="package_id"><option value="">Zote</option>${opts(packages, 'id', 'name')}</select></div>
        </div>
        <input type="hidden" name="status" value="">
        <div class="chipbar mt" id="sc">${[['', 'Zote', '🧾'], ['COMPLETED', 'Zimekamilika', '✅'], ['PENDING', 'Zinasubiri', '⏳'], ['FAILED', 'Zimeshindwa', '❌'], ['EXPIRED', 'Zimeisha', '⌛'], ['REVIEW', 'Review', '🔍']].map(([v, l, i]) => `<button type="button" class="chip ${v ? '' : 'on'}" data-s="${v}">${i} ${l}</button>`).join('')}</div>
        <div class="ad-foot"><button class="btn">🔎 Chuja</button></div></form>
      <div class="ad-list" id="t"><div class="muted">Inapakia…</div></div>`);
    const stc = (s) => (s === 'COMPLETED' ? 'ok' : s === 'PENDING' ? 'gold' : 'bad');
    const load = async () => {
      const qs = new URLSearchParams(Object.entries(body($('#f'))).filter(([, v]) => v)); qs.set('limit', 100);
      const { payments: p } = await api('/admin/payments?' + qs);
      const ok = p.filter((x) => x.status === 'COMPLETED'), pen = p.filter((x) => x.status === 'PENDING'), bad = p.filter((x) => !['COMPLETED', 'PENDING'].includes(x.status));
      $('#ps').innerHTML = [['🧾', p.length, 'Malipo yaliyoonyeshwa', ''], ['✅', fmt(ok.reduce((a, x) => a + x.amount, 0)) + ' TZS', ok.length + ' yamekamilika', 'ok'], ['⏳', pen.length, 'Yanasubiri', 'gold'], ['❌', bad.length, 'Yameshindwa au yameisha', 'bad']]
        .map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('');
      $('#t').innerHTML = p.length ? p.map((x) => `<div class="ad-pay">
        <span class="ad-av">${esc((x.user_name || '?').charAt(0).toUpperCase())}</span>
        <div class="ad-pay-m"><b>${esc(x.user_name)}</b><span class="muted">${esc(x.phone)} • ${esc(x.package_name)}</span>
          <span class="muted ad-small">${esc(x.order_id)}${x.reference ? ' • ' + esc(x.reference) : ''}</span>${x.failure_reason ? `<span class="ad-err">${esc(x.failure_reason)}</span>` : ''}</div>
        <div class="ad-pay-a"><b>${fmt(x.amount)} <small>${esc(x.currency)}</small></b><span class="pill ${stc(x.status)}">${esc(x.status)}</span><span class="muted ad-small">${esc(fdate(x.created_at))}</span></div></div>`).join('') : '<p class="muted">Hakuna malipo yanayolingana na vichujio.</p>';
    };
    document.querySelectorAll('#sc [data-s]').forEach((b) => (b.onclick = () => { $('#f').status.value = b.dataset.s; document.querySelectorAll('#sc .chip').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
    $('#f').onsubmit = (e) => { e.preventDefault(); load(); };
    load();
  };
  H.payouts = async () => {
    const pr = await api('/admin/payment-provider');
    const isSp = pr.active === 'sonicpesa';
    const isFl = pr.active === 'fastlipa';
    const pname = (pr.providers.find((p) => p.id === pr.active) || {}).name || pr.active;
    const SP_METHODS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa', 'CRDB Bank', 'NMB Bank', 'Selcom'];
    const FL_METHODS = ['M-PESA', 'Tigo Pesa', 'Airtel Money', 'Halopesa'];
    shell('Payouts', `<div class="bal-wrap" id="pbal-w"></div>
      <form class="ad-card" id="f" novalidate><div class="ad-card-h"><b>💸 Tuma payout</b><span class="pill ${isSp ? 'gold' : 'ok'}">${esc(pname)}</span></div>
        <div class="ad-form-grid">
          ${isSp || isFl ? `<div class="ad-field ad-span"><label>Njia ya malipo</label><select name="method" required><option value="">— chagua njia —</option>${(isFl ? FL_METHODS : SP_METHODS).map((m) => `<option>${m}</option>`).join('')}</select></div>` : ''}
          <div class="ad-field"><label>Jina la mpokeaji</label><input name="recipient_name" required autocomplete="off"></div>
          <div class="ad-field"><label id="rl">${isSp ? 'Namba ya simu au akaunti' : 'Namba ya simu (Mobile Money)'}</label><input name="recipient" required inputmode="tel" autocomplete="off" placeholder="${isSp ? '07XXXXXXXX au namba ya akaunti' : '07XXXXXXXX'}"></div>
          <div class="ad-field"><label>Kiasi (TZS)</label><input name="amount" type="number" min="500" required></div>
          <div class="ad-field"><label>Maelezo (narration)</label><input name="narration" maxlength="200"></div>
        </div>
        <input type="hidden" name="channel" value="mobile">
        <div class="ad-fee" id="fee">${isSp ? 'SonicPesa haina makato. Kiasi chote kinatumwa.' : isFl ? 'Fee itajulikana baada ya ombi kupokelewa.' : 'Bonyeza "Kokotoa fee" kuona gharama kabla ya kutuma.'}</div>
        <div id="m" class="msg" hidden></div>
        <div class="ad-foot">${isSp || isFl ? '' : '<button type="button" class="btn ghost" id="pf">🧮 Kokotoa fee</button>'}<button class="btn" id="go">✅ Thibitisha & tuma</button></div></form>
      <div class="ad-list" id="t"><div class="muted">Inapakia…</div></div>`);
    const pb = $('#pbal-w');
    api('/admin/payments/balance').then((b) => { pb.innerHTML = balHTML(b, false, true); })
      .catch((e) => { pb.innerHTML = `<div class="msg err">Salio halipatikani: ${esc(e.message)}</div>`; });
    const f = $('#f'), fld = (n) => f.elements.namedItem(n);
    const fee = async () => {
      const a = Number(fld('amount').value); if (!a) return null;
      const r = await api('/admin/payments/fees?amount=' + a + '&channel=mobile&phone=' + encodeURIComponent(fld('recipient').value || ''));
      $('#fee').innerHTML = `Kiasi: <b>${fmt(r.amount)}</b> • Fee: <b>${fmt(r.fee)}</b>${r.fee_known === false ? ' <span class="muted">(haijulikani)</span>' : ''} • Jumla: <b>${fmt(r.total)} TZS</b>`;
      return r;
    };
    if (!isSp && !isFl) $('#pf').onclick = () => fee().catch((e) => toast($('#m'), e.message, 'err'));
    const load = async () => {
      const { payouts: p } = await api('/admin/payments/payouts');
      $('#t').innerHTML = p.length ? p.map((x) => `<div class="ad-pay">
        <span class="ad-av">${esc((x.recipient_name || '?').charAt(0).toUpperCase())}</span>
        <div class="ad-pay-m"><b>${esc(x.recipient_name)}</b><span class="muted">${esc(x.recipient_phone_or_account)}${x.bank_code ? ' • ' + esc(x.bank_code) : ' • Mobile Money'}</span>
          <span class="muted ad-small">${esc(x.provider || '')} • ${esc(fdate(x.created_at))}${x.provider_reference ? ' • ' + esc(x.provider_reference) : ''}</span>
          ${x.failure_reason ? `<span class="ad-err">${esc(x.failure_reason)}</span>` : ''}</div>
        <div class="ad-pay-a"><b>${fmt(x.amount)} <small>TZS</small></b><small class="muted">Fee ${fmt(x.fee)}</small><span class="pill ${x.status === 'COMPLETED' ? 'ok' : (x.status === 'FAILED' || x.status === 'REJECTED') ? 'bad' : 'gold'}">${esc(x.status)}</span>
          ${x.status === 'PENDING_VERIFY' ? `<button class="btn sm" data-r="${x.id}">Retry</button>` : x.provider_reference ? `<button class="btn sm ghost" data-sy="${x.id}">🔄 Kagua hali</button>` : ''}</div></div>`).join('') : '<p class="muted">Hakuna payouts bado.</p>';
      document.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => { await api(`/admin/payments/payouts/${b.dataset.r}/retry`, { method: 'POST' }); load(); }));
      document.querySelectorAll('[data-sy]').forEach((b) => (b.onclick = async () => { const r = await api('/admin/payments/payouts/' + b.dataset.sy); toast($('#m'), 'Hali ya payout: ' + r.payout.status, (r.payout.status === 'FAILED' || r.payout.status === 'REJECTED') ? 'err' : 'ok'); load(); }));
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = body(f), m = $('#m');
      if ((isSp || isFl) && !b.method) return toast(m, 'Chagua njia ya malipo.', 'err');
      try {
        const r = (isSp || isFl) ? { amount: Number(b.amount), fee: 0, total: Number(b.amount), fee_known: !isFl } : await fee();
        if (!r) return toast(m, 'Weka kiasi.', 'err');
        const feeTxt = r.fee_known === false ? 'Fee haijulikani (itaonekana baada ya kutuma)' : 'Fee ' + fmt(r.fee) + ', jumla ' + fmt(r.total) + ' TZS';
        if (!confirm(`Tuma ${fmt(b.amount)} kwa ${b.recipient_name}${isSp ? ' (' + b.method + ')' : ''}? ${feeTxt}.`)) return;
        $('#go').disabled = true;
        const res = await api('/admin/payments/payouts', { method: 'POST', body: { ...b, amount: Number(b.amount), confirm: true } });
        toast(m, 'Payout: ' + res.payout.status, 'ok'); f.reset(); load();
      } catch (err) { toast(m, err.message, 'err'); }
      finally { $('#go').disabled = false; }
    };
    load();
  };
  H.reports = async () => {
    const today = new Date().toISOString().slice(0, 10), ago = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    shell('Revenue Reports', `<form class="ad-card" id="f"><div class="ad-card-h"><b>📈 Kipindi cha mapato</b><span class="muted">Chagua tarehe na kundi</span></div>
        <div class="ad-form-grid">
          <div class="ad-field"><label>Kuanzia</label><input type="date" name="from" value="${ago}"></div>
          <div class="ad-field"><label>Hadi</label><input type="date" name="to" value="${today}"></div>
          <div class="ad-field"><label>Kundi</label><select name="group"><option value="day">Siku</option><option value="month">Mwezi</option></select></div>
        </div>
        <div class="ad-foot"><button class="btn">📊 Onyesha</button></div></form><div id="r"></div>`);
    const load = async () => {
      const d = await api('/admin/reports/revenue?' + new URLSearchParams(body($('#f'))));
      const pts = [...d.series].reverse().map((x) => ({ t: String(x.period).slice(0, 10), amount: Number(x.gross), count: x.payments }));
      const pk = d.by_package || [], max = Math.max(1, ...pk.map((x) => Number(x.gross)));
      $('#r').innerHTML = `<div class="pstats">${[['💰', fmt(d.totals.gross), 'Mauzo (gross) TZS', 'ok'], ['🧾', fmt(d.totals.fees), 'Fees TZS', 'gold'], ['🧮', fmt(d.totals.net), 'Net TZS', ''], ['✅', d.totals.payments, 'Malipo', ''], ['💸', fmt(d.payouts_completed_total), 'Payouts zilizokamilika', 'bad']]
          .map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('')}</div>
        <div class="ad-card"><div class="ad-card-h"><b>Mapato kwa kipindi</b><span class="muted">${esc(d.from)} → ${esc(d.to)}</span></div>
          <div class="chart">${pts.length ? barChart(pts, d.group) : '<p class="muted">Hakuna mauzo kwenye kipindi hiki.</p>'}</div></div>
        <div class="ad-card"><div class="ad-card-h"><b>Kwa kifurushi au channel</b></div>
          ${pk.length ? pk.map((x) => `<div class="ad-bar-row"><div><b>${esc(x.package_name)}</b><span class="muted">${x.payments} malipo</span></div><div class="ad-bar"><i style="width:${(Number(x.gross) / max * 100).toFixed(0)}%"></i></div><b>${fmt(x.gross)}</b></div>`).join('') : '<p class="muted">Hakuna data.</p>'}</div>`;
    };
    $('#f').onsubmit = (e) => { e.preventDefault(); load(); };
    load();
  };
  H.sliders = async () => {
    const { channels } = await api('/admin/channels');
    shell('Slider', `<form class="card" id="f"><input type="hidden" name="id">
      <div class="row"><div><label>Kichwa</label><input name="title" maxlength="80"></div><div><label>Maelezo mafupi</label><input name="subtitle" maxlength="160"></div></div>
      <div class="row"><div><label>Link (hiari) mfano /packages</label><input name="link_url"></div><div><label>Order</label><input name="sort_order" type="number" value="0"></div></div>
      <div class="row"><div><label>Kitufe kifungue channel gani?</label><select name="channel_id"><option value="">— (tumia Link au channel ya kwanza)</option>${opts(channels, 'id', 'name')}</select></div><div><label>Maandishi ya kitufe</label><input name="button_text" value="TAZAMA SASA" maxlength="24"></div></div>
      <label>Pakia picha (16:9 inapendekezwa; inapunguzwa kiotomatiki)</label><input type="file" id="img" accept="image/png,image/jpeg,image/webp">
      <label>Au Image URL (https)</label><input name="image_url" placeholder="https://…"><div class="spv" id="pv"></div>
      <label><input type="checkbox" name="active" checked style="width:auto"> Active</label><div id="m" class="msg" hidden></div>
      <button class="btn mt">Hifadhi</button> <button type="button" class="btn ghost mt" id="rs">Mpya</button></form><h3 class="mt">Slides</h3><div id="t" class="sgrid"></div>`);
    let rows = [], pending = null;
    const toData = (file) => new Promise((res, rej) => {                // inapunguza picha hadi 1600px JPEG kabla ya kutuma
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Picha haisomeki.'));
      fr.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('Picha haisomeki.'));
        im.onload = () => { const sc = Math.min(1, 1600 / im.width), c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.82)); };
        im.src = fr.result; };
      fr.readAsDataURL(file);
    });
    $('#img').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { pending = await toData(f); $('#pv').innerHTML = `<img src="${pending}" alt="">`; } catch (err) { toast($('#m'), err.message, 'err'); } };
    const reset = () => { $('#f').reset(); $('#f').elements.id.value = ''; pending = null; $('#pv').innerHTML = ''; };
    const load = async () => { rows = (await api('/admin/sliders')).slides;
      $('#t').innerHTML = rows.length ? rows.map((x) => `<div class="card scard"><img src="${esc(x.image)}" alt=""><div class="b"><b>${esc(x.title || '(bila kichwa)')}</b><div class="muted">${esc(x.subtitle)}</div><div class="muted">Order ${x.sort_order} • ${x.active ? '✓ Active' : '✗ Hidden'}</div><div class="mt"><button class="btn sm ghost" data-e="${x.id}">Hariri</button> <button class="btn sm danger" data-d="${x.id}">Futa</button></div></div></div>`).join('') : '<p class="muted">Hakuna slide bado.</p>';
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { const x = rows.find((r) => r.id == b.dataset.e), f = $('#f'); reset(); f.elements.id.value = x.id; f.title.value = x.title; f.subtitle.value = x.subtitle; f.link_url.value = x.link_url; f.sort_order.value = x.sort_order; f.active.checked = x.active; f.channel_id.value = x.channel_id || ''; f.button_text.value = x.button_text || 'TAZAMA SASA'; f.image_url.value = x.image.startsWith('/media/') ? '' : x.image; $('#pv').innerHTML = `<img src="${esc(x.image)}" alt="">`; scrollTo(0, 0); }));
      document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (confirm('Futa slide?')) { await api('/admin/sliders/' + b.dataset.d, { method: 'DELETE' }); load(); } })); };
    $('#rs').onclick = reset;
    $('#f').onsubmit = async (e) => { e.preventDefault(); const f = e.target;
      const b = { title: f.title.value, subtitle: f.subtitle.value, link_url: f.link_url.value, sort_order: Number(f.sort_order.value) || 0, active: f.active.checked, channel_id: f.channel_id.value ? Number(f.channel_id.value) : null, button_text: f.button_text.value };
      if (pending) b.image_data = pending; else if (f.image_url.value) b.image_url = f.image_url.value;
      try { await api('/admin/sliders' + (f.elements.id.value ? '/' + f.elements.id.value : ''), { method: f.elements.id.value ? 'PATCH' : 'POST', body: b }); reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); load(); } catch (err) { toast($('#m'), err.message, 'err'); } };
    load();
  };
  H.audit = async () => {
    shell('Security & Audit Logs', `<div class="pstats" id="as"></div><div class="chipbar" id="ac"></div><div class="ad-list" id="t"><div class="muted">Inapakia…</div></div>`);
    const { logs } = await api('/admin/audit-logs?limit=200');
    const cat = (a) => (a.startsWith('auth') ? 'auth' : /^(payment|payout|clickpesa)/.test(a) ? 'pay' : /^(channel|category|match|proxy|slider)/.test(a) ? 'content' : /^(user|subscription|channel_purchase)/.test(a) ? 'users' : a.startsWith('notification') ? 'notif' : 'other');
    const META = { auth: ['🔐', 'Kuingia', ''], pay: ['💳', 'Malipo', 'gold'], content: ['📺', 'Maudhui', 'ok'], users: ['👥', 'Watumiaji', 'bad'], notif: ['🔔', 'Arifa', ''], other: ['🛡', 'Nyingine', ''] };
    const today = new Date().toDateString();
    $('#as').innerHTML = [['🧾', logs.length, 'Matukio yaliyoonyeshwa', ''], ['📅', logs.filter((l) => new Date(l.created_at).toDateString() === today).length, 'Leo', 'ok'], ['🔐', logs.filter((l) => cat(l.action) === 'auth').length, 'Kuingia', 'gold'], ['💳', logs.filter((l) => cat(l.action) === 'pay').length, 'Matukio ya malipo', 'bad']]
      .map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('');
    let mode = 'all';
    const draw = () => {
      $('#ac').innerHTML = [['all', 'Zote', '🛡']].concat(Object.entries(META).map(([k, v]) => [k, v[1], v[0]])).map(([k, l, i]) => `<button type="button" class="chip ${mode === k ? 'on' : ''}" data-c="${k}">${i} ${l}</button>`).join('');
      document.querySelectorAll('#ac [data-c]').forEach((b) => (b.onclick = () => { mode = b.dataset.c; draw(); }));
      const list = logs.filter((l) => mode === 'all' || cat(l.action) === mode);
      $('#t').innerHTML = list.length ? list.map((l) => { const c = cat(l.action), m = META[c]; return `<div class="ad-log">
        <span class="ad-log-ic">${m[0]}</span>
        <div class="ad-log-b"><div class="ad-log-t"><b>${esc(l.action)}</b><span class="pill ${m[2]}">${esc(l.entity || '')}${l.entity_id ? ' #' + esc(l.entity_id) : ''}</span></div>
          <div class="muted ad-small">${esc(l.user_name || 'Mfumo')} • ${esc(fdate(l.created_at))}${l.ip ? ' • ' + esc(l.ip) : ''}</div>
          ${l.details && Object.keys(l.details).length ? `<details class="ad-det"><summary>Maelezo</summary><pre>${esc(JSON.stringify(l.details, null, 2))}</pre></details>` : ''}</div></div>`; }).join('') : '<p class="muted">Hakuna matukio.</p>';
    };
    draw();
  };
  const SF = {
    identity: [['site_name', 'Site name'], ['tagline', 'Tagline'], ['description', 'Description', 'area'], ['logo', 'Logo', 'img'], ['favicon', 'Favicon', 'img'], ['banner', 'Banner', 'img']],
    theme: [['mode', 'Mode', ['light', 'dark', 'custom']], ['primary', 'Primary', 'color'], ['secondary', 'Secondary', 'color'], ['accent', 'Accent', 'color'], ['background', 'Background', 'color'], ['text', 'Text', 'color'], ['header', 'Header', 'color'], ['navigation', 'Navigation', 'color'], ['button', 'Button', 'color'], ['button_text', 'Button text', 'color']],
    appearance: [['logo_size', 'Logo size (px)', 'num'], ['columns', 'Columns', 'num'], ['card_style', 'Channel card', ['rounded', 'square', 'glass']], ['packages_layout', 'Packages layout', ['grid', 'list']], ['login_banner', 'Login banner', 'bool'], ['slider_seconds', 'Slider ibadilike kila (sekunde 2-30)', 'num'], ['channels_layout', 'Muonekano wa channels ndani ya category (grid = jedwali, rail = mstari wa kusogeza, list = orodha)', ['grid', 'rail', 'list']]],
    footer: [['contact', 'Contact information'], ['privacy_url', 'Privacy Policy URL'], ['terms_url', 'Terms of Service URL'], ['links', 'Footer links (label|url kila mstari)', 'links']],
    general: [['currency_label', 'Currency label'], ['support_phone', 'Support phone'], ['whatsapp_number', 'WhatsApp number (mfano 0712345678) — acha wazi kuficha kitufe'], ['whatsapp_message', 'Ujumbe wa kuanzia WhatsApp']],
  };
  const TITLES = { identity: 'Site Identity', theme: 'Theme & Colors', appearance: 'Site Appearance', homepage: 'Homepage Layout', footer: 'Footer Settings', general: 'General Settings' };
  const SECI = { hero: '🖼', categories: '🗂', popular: '⭐', recent: '📈', all: '📺', matches: '⚽' };
  const homeHtml = (v) => `<div class="idgrid"><div class="card"><div class="fsec">Mpangilio wa Home</div>
    <div class="muted">Panga sehemu kwa mpangilio. Sehemu iliyozimwa haionekani kwa watumiaji.</div>
    <div class="hlist">${v.sections.map((s, i) => `<div class="hrow ${s.visible ? '' : 'off'}">
      <span class="hnum">${i + 1}</span><span class="hic">${SECI[s.id] || '•'}</span>
      <div class="hnm"><b>${esc(s.label)}</b><span>${s.visible ? 'Inaonekana' : 'Imefichwa'}</span></div>
      <div class="hact"><button type="button" class="ib2" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Juu">⌃</button><button type="button" class="ib2" data-dn="${i}" ${i === v.sections.length - 1 ? 'disabled' : ''} aria-label="Chini">⌄</button>
        <label class="sw"><input type="checkbox" data-i="${i}" ${s.visible ? 'checked' : ''}><span class="t"></span></label></div></div>`).join('')}</div></div>
    <div class="card prevcard"><div class="fsec">Preview ya Home</div>
      <div class="hprev">${v.sections.filter((s) => s.visible).map((s) => `<div class="hp-b"><span>${SECI[s.id] || '•'}</span>${esc(s.label)}</div>`).join('') || '<div class="muted">Hakuna sehemu inayoonekana.</div>'}</div></div></div>`;
  H.site = async () => {
    const site = await api('/site/settings');
    const THEME_KEYS = [['primary', 'Primary'], ['secondary', 'Secondary'], ['accent', 'Accent'], ['background', 'Background'], ['text', 'Text'], ['header', 'Header'], ['navigation', 'Navigation'], ['button', 'Button'], ['button_text', 'Button text']];
    // Mitindo tayari: admin anachagua tu (rangi zote zinawekwa kwa mara moja)
    const PRESETS = {
      Red: { primary: '#e50914', accent: '#f5a623', background: '#0b0b12', secondary: '#1b1b29', header: '#12121c', navigation: '#12121c', button: '#e50914', button_text: '#ffffff' },
      Ocean: { primary: '#2563eb', accent: '#22d3ee', background: '#060b18', secondary: '#101a33', header: '#0b1226', navigation: '#0b1226', button: '#2563eb', button_text: '#ffffff' },
      Emerald: { primary: '#10b981', accent: '#fbbf24', background: '#06120e', secondary: '#10231c', header: '#0a1a14', navigation: '#0a1a14', button: '#10b981', button_text: '#06120e' },
      Royal: { primary: '#7c3aed', accent: '#ec4899', background: '#0c0716', secondary: '#1a1230', header: '#130c24', navigation: '#130c24', button: '#7c3aed', button_text: '#ffffff' },
      Sunset: { primary: '#f97316', accent: '#facc15', background: '#140a05', secondary: '#26150b', header: '#1d0f07', navigation: '#1d0f07', button: '#f97316', button_text: '#140a05' },
      Midnight: { primary: '#6366f1', accent: '#a78bfa', background: '#07071a', secondary: '#12122e', header: '#0c0c22', navigation: '#0c0c22', button: '#6366f1', button_text: '#ffffff' },
      Forest: { primary: '#16a34a', accent: '#84cc16', background: '#06110a', secondary: '#0f2216', header: '#0a180f', navigation: '#0a180f', button: '#16a34a', button_text: '#ffffff' },
      Rose: { primary: '#e11d48', accent: '#fb7185', background: '#12060a', secondary: '#241018', header: '#1a0a12', navigation: '#1a0a12', button: '#e11d48', button_text: '#ffffff' },
      Teal: { primary: '#0d9488', accent: '#2dd4bf', background: '#05100f', secondary: '#0c2220', header: '#081816', navigation: '#081816', button: '#0d9488', button_text: '#ffffff' },
      Amber: { primary: '#d97706', accent: '#fde047', background: '#120c04', secondary: '#241a0a', header: '#1a1207', navigation: '#1a1207', button: '#d97706', button_text: '#120c04' },
      Slate: { primary: '#64748b', accent: '#94a3b8', background: '#0a0d14', secondary: '#161c28', header: '#0f131c', navigation: '#0f131c', button: '#475569', button_text: '#ffffff' },
      NeonPink: { primary: '#db2777', accent: '#22d3ee', background: '#0a0612', secondary: '#1c1028', header: '#130a1d', navigation: '#130a1d', button: '#db2777', button_text: '#ffffff' },
      Light: { primary: '#2563eb', accent: '#7c3aed', background: '#f3f3f8', text: '#15151f', secondary: '#ffffff', header: '#ffffff', navigation: '#ffffff', button: '#2563eb', button_text: '#ffffff' },
      LightWarm: { primary: '#ea580c', accent: '#f59e0b', background: '#fff7ed', text: '#1c1410', secondary: '#ffffff', header: '#ffffff', navigation: '#ffffff', button: '#ea580c', button_text: '#ffffff' },
    };
    const MODE_FX = { light: { background: '#f3f3f8', text: '#15151f', secondary: '#ffffff', header: '#ffffff', navigation: '#ffffff' }, dark: { background: '#0b0b12', text: '#f4f4f8', secondary: '#1b1b29', header: '#12121c', navigation: '#12121c' } };
    const eff = (t) => ({ ...t, ...(MODE_FX[t.mode] || {}) });
    const applyLive = (t) => { const s = document.documentElement.style; [['--primary', t.primary], ['--secondary', t.secondary], ['--accent', t.accent], ['--bg', t.background], ['--text', t.text], ['--header', t.header], ['--nav', t.navigation], ['--btn', t.button], ['--btn-text', t.button_text]].forEach(([k, x]) => x && s.setProperty(k, x)); };
    const identityHtml = (v) => {
      const upl = (k, label, hint) => { const has = v[k] && v[k].startsWith('data:'); return `<div class="upl"><div class="upl-pv" id="pv_${k}">${v[k] ? `<img src="${esc(v[k])}" alt="">` : '＋'}</div><div class="upl-b"><b>${label}</b><div class="muted">${hint}</div><input name="${k}" value="${has ? '' : esc(v[k])}" placeholder="${has ? '(picha imepakiwa)' : 'https://… au pakia hapa chini'}"><label class="upbtn">📤 Pakia picha<input type="file" accept="image/*" data-f="${k}" hidden></label></div></div>`; };
      return `<div class="idgrid"><div class="card"><div class="fsec">Taarifa za msingi</div><label>Jina la tovuti</label><input name="site_name" value="${esc(v.site_name)}" maxlength="60"><label>Tagline</label><input name="tagline" value="${esc(v.tagline)}" maxlength="120"><label>Maelezo (Description)</label><textarea name="description" rows="4">${esc(v.description)}</textarea></div>
        <div class="card"><div class="fsec">Picha</div>${upl('logo', 'Logo', 'Inaonekana kwenye header ya tovuti')}${upl('favicon', 'Favicon', 'Ikoni ndogo ya kichupo (tab)')}${upl('banner', 'Banner', 'Picha ya hero (kama huna slider)')}</div>
        <div class="card prevcard"><div class="fsec">Preview ya moja kwa moja</div><div class="pvsite"><div class="pvhead"><span class="pvlogo" id="pvl"></span><b id="pvn"></b></div><div class="pvban" id="pvb"><div><h3 id="pvt"></h3><p id="pvg"></p></div></div></div></div></div>`;
    };
    const themeHtml = (v) => `<div class="idgrid"><div class="card"><div class="fsec">Hali ya mwonekano</div><input type="hidden" name="mode" value="${esc(v.mode)}"><div class="seg" id="seg">${['light', 'dark', 'custom'].map((m) => `<button type="button" data-m="${m}" class="${v.mode === m ? 'on' : ''}">${{ light: '☀️ Light', dark: '🌙 Dark', custom: '🎨 Custom' }[m]}</button>`).join('')}</div>
        <div class="fsec">Mitindo tayari</div><div class="presets">${Object.entries(PRESETS).map(([n, p]) => `<button type="button" class="preset" data-p="${n}" style="background:linear-gradient(135deg,${p.primary},${p.accent})">${n}</button>`).join('')}</div></div>
      <div class="card"><div class="fsec">Rangi</div><div class="clrs">${THEME_KEYS.map(([k, l]) => `<label class="clr"><input type="color" name="${k}" value="${esc(v[k])}"><span><b>${l}</b><em id="hx_${k}">${esc(v[k])}</em></span></label>`).join('')}</div></div>
      <div class="card prevcard"><div class="fsec">Preview ya moja kwa moja</div><div class="mock" id="mock"><div class="mk-head"><span class="mk-dot"></span><b>${esc(site.identity.site_name)}</b><i style="font-style:normal">🔍</i></div><div class="mk-hero"><b>Tazama channels zote</b><span class="mk-btn">▶ TAZAMA SASA</span></div><div class="mk-row"><span class="mk-t">A</span><span class="mk-t">B</span><span class="mk-t">C</span></div><div class="mk-nav"><span class="on">🏠</span><span>📦</span><span>👤</span></div></div></div></div>`;
    const draw = () => {
      const g = (location.hash || '#identity').slice(1); if (!TITLES[g]) return;
      const v = site[g], fancy = g === 'identity' || g === 'theme' || g === 'homepage'; let fields = '';
      if (g === 'identity') fields = identityHtml(v);
      else if (g === 'theme') fields = themeHtml(v);
      else if (g === 'homepage') fields = homeHtml(v);
      else fields = SF[g].map(([k, lab, t]) => {
        const val = v[k];
        if (Array.isArray(t)) return `<label>${lab}</label><select name="${k}">${t.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
        if (t === 'num') return `<label>${lab}</label><input type="number" name="${k}" value="${esc(val)}">`;
        if (t === 'bool') return `<label><input type="checkbox" name="${k}" ${val ? 'checked' : ''} style="width:auto"> ${lab}</label>`;
        if (t === 'links') return `<label>${lab}</label><textarea name="${k}" rows="4">${esc((val || []).map((l) => l.label + '|' + l.url).join('\n'))}</textarea>`;
        return `<label>${lab}</label><input name="${k}" value="${esc(val)}">`;
      }).join('');
      shell(TITLES[g], `<form ${fancy ? '' : 'class="card" style="max-width:560px"'} id="f">${g === 'general' ? PROVBOX : ''}${fields}${fancy ? '<div class="savebar"><div id="m" class="msg" hidden></div><button class="btn">💾 Hifadhi mabadiliko</button></div>' : '<div id="m" class="msg" hidden></div><button class="btn mt">Hifadhi</button>'}</form>`);
      const f = $('#f'), files = {};
      if (g === 'general') loadProv();
      if (g === 'identity') {
        const src = (k) => files[k] || f.elements[k].value.trim() || (site.identity[k] || '');
        const upd = () => {
          const n = f.elements.site_name.value.trim() || 'Tovuti', lg = src('logo'), bn = src('banner');
          $('#pvl').innerHTML = lg ? `<img src="${esc(lg)}" alt="">` : esc(n.charAt(0).toUpperCase()); $('#pvn').textContent = n; $('#pvt').textContent = n; $('#pvg').textContent = f.elements.tagline.value;
          $('#pvb').style.backgroundImage = bn ? 'url(' + JSON.stringify(bn) + ')' : '';
          ['logo', 'favicon', 'banner'].forEach((k) => { const s = src(k); $('#pv_' + k).innerHTML = s ? `<img src="${esc(s)}" alt="">` : '＋'; });
        };
        f.addEventListener('input', upd); upd();
        f.querySelectorAll('[data-f]').forEach((i) => (i.onchange = () => { const file = i.files[0]; if (!file) return; if (file.size > 250000) { toast($('#m'), 'Picha ni kubwa (>250KB).', 'err'); return; } const r = new FileReader(); r.onload = () => { files[i.dataset.f] = r.result; upd(); }; r.readAsDataURL(file); }));
      }
      if (g === 'theme') {
        const cur = () => { const t = {}; THEME_KEYS.forEach(([k]) => (t[k] = f.elements[k].value)); t.mode = f.elements.mode.value; return t; };
        const upd = () => { const t = eff(cur()), m = $('#mock');
          [['--mp', t.primary], ['--ma', t.accent], ['--mb', t.background], ['--ms', t.secondary], ['--mt', t.text], ['--mh', t.header], ['--mn', t.navigation], ['--mbtn', t.button], ['--mbt', t.button_text]].forEach(([k, x]) => m.style.setProperty(k, x));
          applyLive(t); THEME_KEYS.forEach(([k]) => { const h = $('#hx_' + k); if (h) h.textContent = f.elements[k].value; }); };
        const setMode = (m) => { f.elements.mode.value = m; document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); };
        document.querySelectorAll('#seg button').forEach((b) => (b.onclick = () => { setMode(b.dataset.m); upd(); }));
        document.querySelectorAll('.preset').forEach((b) => (b.onclick = () => { const p = PRESETS[b.dataset.p]; Object.entries(p).forEach(([k, x]) => (f.elements[k].value = x)); setMode('custom'); upd(); }));
        f.querySelectorAll('input[type=color]').forEach((i) => (i.oninput = () => { setMode('custom'); upd(); }));
        upd();
      }
      if (g !== 'identity') f.querySelectorAll('[data-f]').forEach((i) => (i.onchange = () => { const file = i.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => (files[i.dataset.f] = r.result); r.readAsDataURL(file); }));
      if (g === 'homepage') {
        f.querySelectorAll('[data-up],[data-dn]').forEach((b) => (b.onclick = () => { const i = Number(b.dataset.up ?? b.dataset.dn), j = b.dataset.up !== undefined ? i - 1 : i + 1; if (j < 0 || j >= v.sections.length) return; [v.sections[i], v.sections[j]] = [v.sections[j], v.sections[i]]; draw(); }));
        f.querySelectorAll('[data-i]').forEach((c) => (c.onchange = () => (v.sections[c.dataset.i].visible = c.checked)));
      }
      f.onsubmit = async (e) => {
        e.preventDefault(); let b = {};
        if (g === 'homepage') b = { sections: v.sections.map((s) => ({ id: s.id, visible: s.visible })) };
        else SF[g].forEach(([k, , t]) => {
          const el = f.elements[k];
          if (t === 'bool') b[k] = el.checked; else if (t === 'num') b[k] = Number(el.value);
          else if (t === 'links') b[k] = el.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ...u] = l.split('|'); return { label: label.trim(), url: u.join('|').trim() }; });
          else if (t === 'img') { if (files[k]) b[k] = files[k]; else if (el.value !== '' || !(site.identity[k] || '').startsWith('data:')) b[k] = el.value; }
          else b[k] = el.value;
        });
        try { const r = await api('/admin/settings/' + g, { method: 'PATCH', body: b }); site[g] = r.settings; toast($('#m'), 'Imehifadhiwa.', 'ok'); } catch (err) { toast($('#m'), err.message, 'err'); }
      };
    };
    window.addEventListener('hashchange', draw); draw();
  };
  const PROVBOX = '<div class="card" id="provsw" style="margin-bottom:14px"><div class="muted">Inapakia mifumo ya malipo…</div></div>';
  const loadProv = async () => {
    const box = $('#provsw'); if (!box) return;
    const META = { clickpesa: ['💳', 'ClickPesa'], sonicpesa: ['🔌', 'SonicPesa'], fastlipa: ['⚡', 'FastLipa'] };
    const paint = (x) => {
      box.innerHTML = `<div class="fsec">💳 Mfumo wa malipo unaotumika</div>
        <p class="muted" style="margin:0 0 6px">Chagua mfumo utakaotumika kwa malipo ya watumiaji na kuonyesha salio kwenye dashboard.</p>
        <div class="provgrid">${x.providers.map((q) => {
          const m = META[q.id] || ['💳', q.name];
          const on = q.id === x.active;
          return `<button type="button" class="pcx ${on ? 'on' : ''}" data-pv="${q.id}">
            <span class="pi2">${m[0]}</span>
            <div style="flex:1;min-width:0"><b>${esc(q.name)}</b><span class="d">${q.ready ? '✅ Funguo zimewekwa' : '⚠ Funguo hazijawekwa'}</span></div>
            ${on ? '<span class="pill ok">Inatumika</span>' : '<span class="pill">Tumia</span>'}</button>`;
        }).join('')}</div>
        ${x.providers.some((q) => q.error) ? `<div class="msg err mt">${esc(x.providers.map((q) => q.error).filter(Boolean).join(' • '))}</div>` : ''}
        ${x.providers.some((q) => !q.ready) ? '<p class="muted ad-small mt">Mfumo usio na funguo: weka funguo kwenye ukurasa wake wa Settings kwenye menyu ya Mipangilio.</p>' : ''}`;
      box.querySelectorAll('[data-pv]').forEach((btn) => (btn.onclick = async () => {
        const id = btn.dataset.pv;
        if (id === x.active) return toast($('#m'), 'Mfumo huu tayari unatumika.', 'ok');
        const name = (META[id] || [0, id])[1];
        if (!confirm('Badilisha mfumo wa malipo kuwa ' + name + '?')) return;
        try {
          const r = await api('/admin/payment-provider', { method: 'PUT', body: { provider: id } });
          x = { ...x, active: r.active }; paint(x); toast($('#m'), 'Mfumo umebadilishwa kuwa ' + name + '.', 'ok');
        } catch (e) { toast($('#m'), e.message, 'err'); }
      }));
    };
    try { paint(await api('/admin/payment-provider')); }
    catch (e) { box.innerHTML = `<div class="fsec">💳 Mfumo wa malipo</div><div class="msg err">Haikuweza kupakia mifumo ya malipo: ${esc(e.message)}</div>`; }
  };
  H.clickpesa = async () => {
    shell('ClickPesa', `<div class="card cp-hero" id="cph"><div class="muted">Inapakia…</div></div>
      <div class="idgrid mt">
        <form class="card" id="f" autocomplete="off"><div class="fsec">🔑 Funguo</div>
          <label>Client ID</label><input name="client_id" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
          <label>API Key</label><input name="api_key" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
          <label>Checksum Key (webhook na saini ya maombi)</label><input name="checksum_key" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
          <div id="m" class="msg" hidden></div>
          <div class="wz-foot"><button class="btn">💾 Hifadhi funguo</button><button type="button" class="btn ghost" id="tc">🔌 Jaribu muunganisho</button></div>
        </form>
        <div class="card"><div class="fsec">📡 Webhook</div>
          <div class="muted">Weka URL hii kwenye dashboard ya ClickPesa, kisha chagua PAYMENT RECEIVED na PAYMENT FAILED.</div>
          <div class="plink mt" id="cpw">…</div>
          <button type="button" class="btn sm ghost mt" id="cpc">📋 Nakili URL</button>
          <div class="fsec mt">Hatua za kuunganisha</div>
          <ol class="steps2"><li>Tengeneza application ya API kwenye ClickPesa, ukiwasha Payment API na Payout API.</li><li>Nakili Client ID na API Key, kisha washa checksum upate Checksum Key.</li><li>Weka funguo hapa na ubonyeze Jaribu muunganisho.</li><li>Chagua ClickPesa kwenye General Settings.</li></ol>
        </div>
      </div>`);
    const draw = (s) => {
      const pill = (ok, t) => `<span class="pill ${ok ? 'ok' : 'bad'}">${t}</span>`;
      $('#cph').innerHTML = `<div class="cp-top"><div class="cp-ic">💳</div><div style="flex:1;min-width:0"><div class="big" style="font-size:1.35rem">ClickPesa</div>
        <div class="muted">${s.ready ? 'Funguo zote zimewekwa' : 'Funguo bado hazijakamilika'} • Jaribio la mwisho: ${fdate(s.last_test_at)}</div></div>
        ${pill(s.ready, s.ready ? 'Tayari' : 'Haijakamilika')}</div>
        <div class="accs mt">
          <div class="pst ${s.client_id_set ? 'ok' : 'bad'}"><i>🔑</i><div><b>${esc(s.client_id_hint || 'Haijawekwa')}</b><span>Client ID</span></div></div>
          <div class="pst ${s.api_key_set ? 'ok' : 'bad'}"><i>🔑</i><div><b>${esc(s.api_key_hint || 'Haijawekwa')}</b><span>API Key</span></div></div>
          <div class="pst ${s.checksum_set ? 'ok' : 'bad'}"><i>🔒</i><div><b>${s.checksum_set ? 'Imewekwa' : 'Haijawekwa'}</b><span>Checksum Key</span></div></div>
          <div class="pst ${s.connected === true ? 'ok' : s.connected === false ? 'bad' : ''}"><i>${s.connected === false ? '⚠' : '✅'}</i><div><b>${s.connected === null ? 'Haijajaribiwa' : s.connected ? 'Imeunganishwa' : 'Imeshindwa'}</b><span>Muunganisho</span></div></div>
        </div>
        ${s.last_error ? `<div class="msg err mt">${esc(s.last_error)}</div>` : ''}`;
      $('#cpw').textContent = s.webhook_url;
    };
    const load = async () => draw(await api('/admin/clickpesa/settings'));
    await load();
    $('#cpc').onclick = async () => { try { await navigator.clipboard.writeText($('#cpw').textContent); toast($('#m'), 'URL imenakiliwa.', 'ok'); } catch (_) { window.prompt('Nakili:', $('#cpw').textContent); } };
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { draw(await api('/admin/clickpesa/settings', { method: 'PUT', body: body(e.target) })); e.target.reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    $('#tc').onclick = async () => { try { draw(await api('/admin/clickpesa/test-connection', { method: 'POST' })); } catch (err) { toast($('#m'), err.message, 'err'); } };
  };
  H.proxy = async () => {
    const TYPES = [['M3U8', 'HLS (m3u8)', 'Link ya m3u8 moja kwa moja', '📺'], ['M3U8_HEADERS', 'HLS + Headers', 'm3u8 yenye headers maalumu', '🧾'], ['MPD', 'DASH (MPD)', 'Haitolewi kama m3u8', '🔑'], ['MPD_HEADERS', 'DASH + Headers', 'Haitolewi kama m3u8', '🛡'], ['API', 'API Endpoint', 'Endpoint inayotoa link ya stream', '⚡']];
    shell('Proxy Link', `<div class="card"><div class="fsec">➕ Ongeza Proxy Link</div>
      <div class="muted">Proxy Link haionekani kwa watumiaji wa tovuti. Kila moja inatoa link ya m3u8 unayoweza kutumia popote.</div>
      <form id="f" novalidate><input type="hidden" name="id"><input type="hidden" name="source_type" value="M3U8">
        <div class="row"><div><label>Jina</label><input name="name" required placeholder="Mfano: MBC 2"></div><div><label>Logo URL (hiari)</label><input name="logo_url" placeholder="https://…"></div></div>
        <label>Aina ya chanzo</label><div class="tcards" id="ptc">${TYPES.map(([v, t, d, ic]) => `<button type="button" class="tcard" data-t="${v}"><span class="ti">${ic}</span><b>${t}</b><span class="d">${d}</span></button>`).join('')}</div>
        <label>Source URL</label><input name="source_url" placeholder="https://… au http://…" required>
        <div id="phw"><label>Headers (JSON)</label><textarea name="headers" rows="2" placeholder='{"Referer":"https://…"}'></textarea></div>
        <div id="pres"></div>
        <div class="wz-foot"><button type="button" class="btn ghost" id="ptest">🔌 Jaribu chanzo</button><button class="btn">💾 Hifadhi</button><button type="button" class="btn ghost" id="prs">＋ Mpya</button><div id="m" class="msg" hidden></div></div>
      </form></div>
      <div class="toolbar"><div class="search"><input id="pq" placeholder="Tafuta proxy…"></div></div>
      <div class="cgrid" id="pl"><div class="muted">Inapakia…</div></div>`);
    const f = $('#f'), fld = (n) => f.elements.namedItem(n);
    let rows = [];
    const lk = (p) => location.origin + '/proxy/' + p.id + '/' + p.token + '/index.m3u8';
    const paint = () => {
      document.querySelectorAll('#ptc .tcard').forEach((b) => b.classList.toggle('on', b.dataset.t === fld('source_type').value));
      $('#phw').hidden = !(fld('source_type').value.endsWith('_HEADERS') || fld('source_type').value === 'API');
    };
    document.querySelectorAll('#ptc .tcard').forEach((b) => (b.onclick = () => { fld('source_type').value = b.dataset.t; paint(); }));
    const reset = () => { f.reset(); fld('id').value = ''; fld('source_type').value = 'M3U8'; $('#pres').innerHTML = ''; paint(); };
    const payload = () => ({ name: fld('name').value, logo_url: fld('logo_url').value, source_type: fld('source_type').value, source_url: fld('source_url').value.trim(), headers: fld('headers').value });
    const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast($('#m'), 'Link imenakiliwa.', 'ok'); } catch (_) { window.prompt('Nakili link:', t); } };
    const card = (p) => `<div class="ccard ${p.active ? '' : 'off'}"><div class="cc-top"><div class="cc-logo" style="--h:${chHue(p.name)}">${chLogo({ name: p.name, logo_url: p.logo_url })}</div>
      <div class="cc-info"><b>${esc(p.name)}</b><div class="muted">${esc(p.source_type)}</div></div></div>
      <div class="cc-tags"><span class="pill ${p.m3u8 ? 'ok' : 'gold'}">${p.m3u8 ? 'm3u8 ✓' : 'Haitolewi kama m3u8'}</span>${p.active ? '' : '<span class="pill bad">Imezimwa</span>'}</div>
      <div class="lnk">${esc(lk(p))}</div>
      <div class="cc-act"><button class="btn sm" data-cp="${esc(lk(p))}">📋 Nakili link</button><button class="btn sm ghost" data-e="${p.id}">✏️ Hariri</button><button class="btn sm ghost" data-a="${p.id}" data-v="${p.active ? 0 : 1}">${p.active ? '🙈 Zima' : '👁 Washa'}</button><button class="btn sm ghost" data-rt="${p.id}">♻ Badili link</button><button class="btn sm danger" data-d="${p.id}">🗑</button></div></div>`;
    const render = () => {
      const q = $('#pq').value.trim().toLowerCase();
      const list = rows.filter((p) => !q || p.name.toLowerCase().includes(q));
      $('#pl').innerHTML = list.length ? list.map(card).join('') : '<p class="muted">Hakuna proxy bado.</p>';
      document.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => copy(b.dataset.cp)));
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => {
        const p = rows.find((x) => x.id == b.dataset.e); reset();
        fld('id').value = p.id; fld('name').value = p.name; fld('logo_url').value = p.logo_url || ''; fld('source_type').value = p.source_type; fld('source_url').value = p.source_url;
        fld('headers').value = Object.keys(p.headers || {}).length ? JSON.stringify(p.headers) : ''; paint(); scrollTo({ top: 0, behavior: 'smooth' });
      }));
      document.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { await api('/admin/proxy-links/' + b.dataset.a, { method: 'PATCH', body: { active: b.dataset.v === '1' } }); load(); }));
      document.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = async () => { if (!confirm('Link ya sasa itaacha kufanya kazi. Endelea?')) return; await api('/admin/proxy-links/' + b.dataset.rt + '/token', { method: 'POST' }); load(); }));
      document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (confirm('Futa proxy hii?')) { await api('/admin/proxy-links/' + b.dataset.d, { method: 'DELETE' }); load(); } }));
    };
    const load = async () => { rows = (await api('/admin/proxy-links')).links; render(); };
    $('#pq').oninput = render;
    $('#prs').onclick = reset;
    $('#ptest').onclick = async () => {
      $('#pres').innerHTML = '<div class="testbox">⏳ Inajaribu chanzo…</div>';
      try { const r = await api('/admin/proxy-links/test', { method: 'POST', body: payload() }); $('#pres').innerHTML = `<div class="testbox ok">✅ Chanzo kinafanya kazi • host <b>${esc(r.host)}</b></div>`; }
      catch (e) { $('#pres').innerHTML = `<div class="testbox bad">❌ ${esc(e.message)}</div>`; }
    };
    f.onsubmit = async (e) => {
      e.preventDefault(); const id = fld('id').value;
      try { await api('/admin/proxy-links' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body: payload() }); reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); load(); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    paint(); load();
  };
  H.notifications = async () => {
    const AUD = [['all', '👥', 'Watumiaji wote', 'Kila mtumiaji aliye hai'], ['active', '💎', 'Wenye vifurushi hai', 'Wanaoweza kutazama kila kitu'], ['inactive', '🙈', 'Wasio na vifurushi', 'Hawana kifurushi hai'], ['user', '📱', 'Mtumiaji mmoja', 'Kwa namba ya simu']];
    shell('Arifa', `<div class="ad-two">
        <form class="ad-card" id="f" novalidate><div class="ad-card-h"><b>📣 Tuma arifa</b><span class="muted">Chagua nani apokee, kisha andika ujumbe</span></div>
          <div class="tcards" id="naud">${AUD.map(([v, ic, t, d]) => `<button type="button" class="tcard" data-a="${v}"><span class="ti">${ic}</span><b>${t}</b><span class="d">${d}</span></button>`).join('')}</div>
          <input type="hidden" name="audience" value="all">
          <div id="nph" hidden><label>Namba ya simu</label><input name="phone" inputmode="tel" placeholder="07XXXXXXXX"></div>
          <div class="ad-form-grid" style="margin-top:12px">
            <div class="ad-field ad-span"><label>Kichwa</label><input name="title" maxlength="80" required placeholder="Mfano: Ofa ya wikendi"></div>
            <div class="ad-field ad-span"><label>Ujumbe</label><textarea name="body" rows="4" maxlength="500" required placeholder="Andika ujumbe utakaoonekana kwa mtumiaji…"></textarea></div>
          </div>
          <div id="m" class="msg" hidden></div>
          <div class="ad-foot"><button class="btn">📨 Tuma arifa</button></div></form>
        <div class="ad-card"><div class="ad-card-h"><b>Preview kwa mtumiaji</b></div>
          <div class="np-card"><div class="np-ic">🔔</div><div style="min-width:0;flex:1"><b id="pvt">Kichwa cha arifa</b><div class="muted" id="pvb">Ujumbe wako utaonekana hapa.</div></div><span class="np-dot"></span></div></div>
      </div>
      <div class="ad-card"><div class="ad-card-h"><b>📜 Arifa zilizotumwa</b><span class="muted">Bonyeza arifa kuona waliosoma</span></div><div class="ad-list" id="nh"><div class="muted">Inapakia…</div></div></div>
      <div class="ushade" id="nsh" hidden></div><aside class="udrawer" id="ndr" hidden></aside>`);
    const f = $('#f'), fld = (n) => f.elements.namedItem(n);
    const paint = () => { const a = fld('audience').value; document.querySelectorAll('#naud .tcard').forEach((b) => b.classList.toggle('on', b.dataset.a === a)); $('#nph').hidden = a !== 'user'; };
    document.querySelectorAll('#naud .tcard').forEach((b) => (b.onclick = () => { fld('audience').value = b.dataset.a; paint(); }));
    fld('title').oninput = (e) => { $('#pvt').textContent = e.target.value || 'Kichwa cha arifa'; };
    fld('body').oninput = (e) => { $('#pvb').textContent = e.target.value || 'Ujumbe wako utaonekana hapa.'; };
    paint();
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const loadHistory = async () => {
      const { items } = await api('/admin/notifications/history');
      $('#nh').innerHTML = items.length ? items.map((n) => `<button class="ad-notif" data-b="${esc(n.batch_id)}">
        <span class="ad-log-ic">🔔</span>
        <div class="ad-log-b"><div class="ad-log-t"><b>${esc(n.title)}</b><span class="muted ad-small">${esc(fdate(n.created_at))}</span></div>
          <div class="muted ad-small">${esc(n.body)}</div>
          <div class="ad-bar"><i style="width:${pct(n.read_count, n.total)}%"></i></div>
          <div class="ad-small"><b>${n.read_count}</b> wamesoma kati ya <b>${n.total}</b> (${pct(n.read_count, n.total)}%)</div></div></button>`).join('') : '<p class="muted">Bado hujatuma arifa yoyote.</p>';
      document.querySelectorAll('.ad-notif').forEach((b) => (b.onclick = () => openDetail(b.dataset.b)));
    };
    const openDetail = async (batch) => {
      $('#nsh').hidden = false; $('#ndr').hidden = false;
      $('#ndr').innerHTML = '<div class="muted" style="padding:20px">Inapakia…</div>';
      const { recipients } = await api('/admin/notifications/history/' + encodeURIComponent(batch));
      const read = recipients.filter((r) => r.is_read).length, total = recipients.length;
      $('#ndr').innerHTML = `<div class="uhead"><div style="flex:1;min-width:0"><h2 style="margin:0">Waliosoma arifa</h2><div class="muted ad-small">${total} waliopokea • ${read} wamesoma • ${total - read} bado</div></div><button class="ib2" id="ndx" aria-label="Funga">✕</button></div>
        <div class="ad-bar" style="margin:10px 0 16px"><i style="width:${pct(read, total)}%"></i></div>
        <div class="ad-list">${recipients.map((r) => `<div class="ad-rcp ${r.is_read ? 'ok' : ''}">
          <span class="ad-av">${esc((r.name || '?').charAt(0).toUpperCase())}</span>
          <div class="ad-rcp-b"><b>${esc(r.name)}</b><span class="muted ad-small">${esc(r.phone)}</span></div>
          <div class="ad-rcp-s">${r.is_read ? `<span class="pill ok">✅ Amesoma</span><span class="muted ad-small">${esc(fdate(r.read_at))}</span>` : '<span class="pill">⏳ Bado</span>'}</div></div>`).join('') || '<p class="muted">Hakuna mpokeaji.</p>'}</div>`;
      $('#ndx').onclick = closeDetail;
    };
    const closeDetail = () => { $('#nsh').hidden = true; $('#ndr').hidden = true; };
    $('#nsh').onclick = closeDetail;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const a = fld('audience').value, label = (AUD.find((x) => x[0] === a) || [])[2];
      const target = a === 'user' ? 'namba ' + fld('phone').value : label;
      if (!confirm(`Tuma arifa kwa ${target}?`)) return;
      try {
        const r = await api('/admin/notifications', { method: 'POST', body: { audience: a, phone: fld('phone').value, title: fld('title').value, body: fld('body').value } });
        toast($('#m'), `Imetumwa kwa watumiaji ${fmt(r.sent)}.`, 'ok');
        f.reset(); fld('audience').value = 'all'; paint(); $('#pvt').textContent = 'Kichwa cha arifa'; $('#pvb').textContent = 'Ujumbe wako utaonekana hapa.';
        loadHistory();
      } catch (err) { toast($('#m'), err.message, 'err'); }
    };
    loadHistory();
  };
  H.matches = async () => {
    const { channels } = await api('/admin/channels');
    shell('Mechi', `<div class="pstats" id="mst"></div>
      <div class="mf-layout">
        <form class="mf-card" id="f" novalidate><input type="hidden" name="id"><input type="hidden" name="channel_id">
          <div class="mf-hero">
            <div><div class="mf-hero-t" id="mf-title">⚽ Mechi mpya</div><div class="muted" id="mf-sub">Jaza taarifa, chagua channel, kisha uhifadhi.</div></div>
            <button type="button" class="btn ghost sm" id="mrs">＋ Mpya</button>
          </div>
          <div class="mf-prev" id="mprev"></div>
          <div class="mf-sec"><i>1</i>Timu</div>
          <div class="mf-teams">
            <div class="mf-tin"><span class="mf-badge" id="bh">?</span><input name="home_team" required placeholder="Timu ya nyumbani" autocomplete="off"></div>
            <span class="mf-vs">VS</span>
            <div class="mf-tin"><span class="mf-badge" id="ba">?</span><input name="away_team" required placeholder="Timu ya ugenini" autocomplete="off"></div>
          </div>
          <div class="mf-sec"><i>1b</i>Logo za timu</div>
          <div class="mf-logos">
            <label class="mf-logo" id="lgH"><input type="file" accept="image/*" data-lg="home"><span class="mf-logo-p">+ Logo ya nyumbani</span></label>
            <label class="mf-logo" id="lgA"><input type="file" accept="image/*" data-lg="away"><span class="mf-logo-p">+ Logo ya ugenini</span></label>
            <div class="mf-logo-url" style="grid-column:1/-1"><input data-lgurl="home" placeholder="Au bandika link ya logo ya nyumbani (https://...)" autocomplete="off"><input data-lgurl="away" placeholder="Au bandika link ya logo ya ugenini (https://...)" autocomplete="off"></div>
            <input type="hidden" name="home_logo"><input type="hidden" name="away_logo">
          </div>
          <div class="mf-sec"><i>2</i>Ratiba na bei</div>
          <div class="mf-grid3">
            <div class="mf-field"><label>Ligi / Mashindano</label><input name="league" placeholder="NBC Premier League"></div>
            <div class="mf-field"><label>Tarehe na saa</label><input name="kickoff_at" type="datetime-local" required></div>
            <div class="mf-field mf-kind"><label>🎟 Aina ya mechi</label>
            <div class="mf-seg"><button type="button" data-kind="free" class="on">Bure</button><button type="button" data-kind="paid">Kulipia</button></div>
            <input name="price" type="number" min="0" value="0" placeholder="Bei (TZS)"></div>
          </div>
          <div class="mf-grid3">
            <div class="mf-field"><label>Mpangilio (namba ndogo kwanza)</label><div class="mf-order"><button type="button" id="so-dn" aria-label="Punguza">−</button><input name="sort_order" type="number" value="0" min="-9999" max="9999"><button type="button" id="so-up" aria-label="Ongeza">+</button></div></div>
            <div class="mf-field mf-span2"><label>Hali</label><label class="mf-toggle"><input type="checkbox" name="active" checked><span class="t"></span><span id="act-l">Inaonekana kwa watumiaji</span></label></div>
          </div>
          <div class="mf-sec"><i>3</i>Channel ya mechi</div>
          <div class="mf-search"><input id="chq" placeholder="🔎 Tafuta channel…" autocomplete="off"></div>
          <div class="chlist" id="chl"></div>
          <details class="newch"><summary>➕ Ongeza channel ya mechi hii (link ya aina yoyote)</summary>
            <div class="newch-body">
              <div class="row"><div><label>Jina la channel</label><input id="ncn" placeholder="Mfano: Azam Sport 1"></div><div><label>Aina ya link</label><select id="nct"><option value="M3U8">HLS (m3u8)</option><option value="M3U8_HEADERS">HLS + headers</option><option value="MPD">DASH (MPD) + ClearKey</option><option value="MPD_HEADERS">DASH + headers + ClearKey</option><option value="API">API Endpoint</option></select></div></div>
              <label>Link ya stream au endpoint</label><input id="ncu" placeholder="https://…">
              <label>Headers (JSON, hiari)</label><textarea id="nch" rows="2" placeholder='{"Referer":"https://…"}'></textarea>
              <label>ClearKey kwa MPD (kid:key kila mstari, hiari)</label><textarea id="ncck" rows="2" placeholder="0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210"></textarea>
              <button type="button" class="btn sm mt" id="ncb">💾 Hifadhi channel na uichague</button>
            </div></details>
          <div id="m" class="msg" hidden></div>
          <div class="mf-foot"><button class="btn">💾 Hifadhi mechi</button></div>
        </form>
        <aside class="mf-side">
          <div class="mf-card2"><div class="fsec">📺 Muhtasari</div><div class="mcount" id="mcount"></div>
            <p class="muted" style="font-size:.82rem;line-height:1.5">Mechi inaonekana kwenye skrini ya Mechi kwa mpangilio wa namba. Channel ya mechi inaishi kwa mechi hiyo tu, na inafutwa mechi ikifutwa.</p></div>
        </aside>
      </div>
      <div class="toolbar"><div class="search"><input id="mq" placeholder="Tafuta timu au ligi…"></div>
        <div class="chipbar" id="mfc">${[['all', 'Zote'], ['UPCOMING', '⏳ Zinakuja'], ['LIVE', '🔴 Zinaendelea'], ['FINISHED', '✅ Zimeisha']].map(([v, l]) => `<button type="button" class="chip ${v === 'all' ? 'on' : ''}" data-s="${v}">${l}</button>`).join('')}</div></div>
      <div class="mf-list" id="ml"><div class="muted">Inapakia…</div></div>`);
    const f = $('#f'), fld = (n) => f.elements.namedItem(n);
    let rows = [], mode = 'all', chosen = null;
    const toLocal = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const stPill = (s) => s === 'LIVE' ? '<span class="pill bad">● LIVE</span>' : s === 'UPCOMING' ? '<span class="pill gold">Inakuja</span>' : '<span class="pill">Imeisha</span>';
    const initial = (t) => esc((t || '?').trim().charAt(0).toUpperCase() || '?');
    const paintPrev = () => {
      const h = fld('home_team').value.trim() || 'Timu A', a = fld('away_team').value.trim() || 'Timu B';
      $('#bh').textContent = initial(h); $('#ba').textContent = initial(a);
      const when = fld('kickoff_at').value ? new Date(fld('kickoff_at').value).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : 'Tarehe na saa';
      const price = Number(fld('price').value) || 0;
      $('#mprev').innerHTML = `<div class="mf-pcard">
        <div class="mf-ptop"><span class="mf-plg">${esc(fld('league').value.trim() || 'Ligi')}</span><span class="mf-porder">#${Number(fld('sort_order').value) || 0}</span></div>
        <div class="mf-pteams"><div class="mf-pt"><span class="mbadge">${initial(h)}</span><b>${esc(h)}</b></div><span class="mvs">VS</span><div class="mf-pt"><span class="mbadge">${initial(a)}</span><b>${esc(a)}</b></div></div>
        <div class="mf-pfoot"><span class="mtime">${esc(when)}</span><span class="pill ${price ? 'gold' : 'ok'}">${price ? '💰 ' + fmt(price) + ' TZS' : 'Bure'}</span></div>
        <div class="mf-pch">${chosen ? '📺 ' + esc(chosen.name) : '📺 Chagua channel hapa chini'}</div></div>`;
      $('#act-l').textContent = fld('active').checked ? 'Inaonekana kwa watumiaji' : 'Imefichwa kwa watumiaji';
    };
    // Aina ya mechi: bure (bei 0) au kulipia (bei lazima iwe zaidi ya 0)
    let matchKind = 'free';
    const setKind = (k) => {
      matchKind = k;
      const p = fld('price');
      if (k === 'free') { p.value = '0'; p.disabled = true; }
      else { p.disabled = false; if (!(Number(p.value) > 0)) p.value = ''; p.focus(); }
      document.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === k));
    };
    document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));

    // Logo za timu: picha inapunguzwa hadi 160px ili iwe nyepesi
    const shrink = (file) => new Promise((ok, no) => {
      const img = new Image(), fr = new FileReader();
      fr.onload = () => {
        img.onload = () => {
          const S = 160, k = Math.min(1, S / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/png'));
        };
        img.onerror = () => no(new Error('Picha haiwezi kusomwa.'));
        img.src = fr.result;
      };
      fr.onerror = () => no(new Error('Faili haliwezi kusomwa.'));
      fr.readAsDataURL(file);
    });
    const paintLogos = () => {
      [['home', 'lgH', '+ Logo ya nyumbani'], ['away', 'lgA', '+ Logo ya ugenini']].forEach(([k, box, label]) => {
        const v = fld(k + '_logo').value;
        $('#' + box).querySelector('.mf-logo-p').innerHTML = v ? `<img src="${v}" alt="">` : label;
      });
    };
    document.querySelectorAll('[data-lgurl]').forEach((inp) => (inp.onchange = () => {
      const k = inp.dataset.lgurl, v = inp.value.trim();
      if (v && !/^https:\/\/\S{4,}$/i.test(v)) return toast(mBox(), 'Link ya logo lazima ianze na https://', 'err');
      fld(k + '_logo').value = v; paintLogos();
    }));
    const setUrlInputs = () => ['home', 'away'].forEach((k) => {
      const v = fld(k + '_logo').value;
      document.querySelector('[data-lgurl="' + k + '"]').value = /^https:\/\//.test(v) ? v : '';
    });
    document.querySelectorAll('[data-lg]').forEach((inp) => (inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { fld(inp.dataset.lg + '_logo').value = await shrink(f); paintLogos(); }
      catch (err) { toast(mBox(), err.message, 'err'); }
    }));
    const paintChannels = () => {
      const q = $('#chq').value.trim().toLowerCase();
      // Channels zilizofichwa hazionyeshwi kwenye orodha ya mechi
      $('#chl').innerHTML = channels.filter((c) => c.active && (!q || c.name.toLowerCase().includes(q))).map((c) => `<button type="button" class="chitem ${chosen && chosen.id === c.id ? 'on' : ''}" data-c="${c.id}"><span class="chic">${chLogo(c)}</span><span class="chn-t">${esc(c.name)}</span>${chosen && chosen.id === c.id ? '<span class="chck">✓</span>' : ''}</button>`).join('') || '<div class="muted" style="padding:10px">Hakuna channel.</div>';
      document.querySelectorAll('#chl .chitem').forEach((b) => (b.onclick = () => {
        chosen = channels.find((c) => c.id == b.dataset.c); fld('channel_id').value = chosen.id; paintChannels(); paintPrev();
      }));
    };
    const reset = () => {
      f.reset(); setKind('free'); fld('id').value = ''; chosen = null; fld('channel_id').value = ''; $('#chq').value = ''; fld('home_logo').value = ''; fld('away_logo').value = ''; paintLogos(); setUrlInputs();
      $('#mf-title').textContent = '⚽ Mechi mpya'; $('#mf-sub').textContent = 'Jaza taarifa, chagua channel, kisha uhifadhi.';
      paintChannels(); paintPrev();
    };
    const edit = (m) => {
      reset(); fld('id').value = m.id; fld('home_team').value = m.home_team; fld('away_team').value = m.away_team; fld('league').value = m.league || '';
      fld('kickoff_at').value = toLocal(m.kickoff_at); fld('active').checked = m.active; fld('price').value = m.price || 0; setKind(m.access_mode && m.access_mode !== 'FREE' ? 'paid' : 'free'); fld('sort_order').value = m.sort_order || 0;
      chosen = m.channel_id ? (channels.find((c) => c.id === m.channel_id) || { id: m.channel_id, name: m.channel_name || 'Channel' }) : null;
      fld('channel_id').value = chosen ? chosen.id : ''; fld('home_logo').value = m.home_logo || ''; fld('away_logo').value = m.away_logo || ''; paintLogos(); setUrlInputs();
      $('#mf-title').textContent = '✏️ Unahariri mechi'; $('#mf-sub').textContent = m.home_team + ' vs ' + m.away_team;
      paintChannels(); paintPrev(); scrollTo({ top: 0, behavior: 'smooth' });
    };
    const card = (m) => `<div class="mf-mc ${m.status === 'LIVE' ? 'is-live' : ''} ${m.active ? '' : 'off'}">
      <div class="mf-mc-top"><span class="mf-ord">#${m.sort_order || 0}</span><span class="mf-mlg">${esc(m.league || 'Mechi')}</span>${stPill(m.status)}</div>
      <div class="mf-pteams"><div class="mf-pt"><span class="mbadge">${initial(m.home_team)}</span><b>${esc(m.home_team)}</b></div><span class="mvs">VS</span><div class="mf-pt"><span class="mbadge">${initial(m.away_team)}</span><b>${esc(m.away_team)}</b></div></div>
      <div class="mf-mc-meta"><span class="mtime">${esc(fdate(m.kickoff_at))}</span><span class="pill ${m.access_mode === 'PACKAGE' ? 'gold' : (m.price > 0 ? 'gold' : 'ok')}">${m.access_mode === 'PACKAGE' ? '📦 Kulipia kwa vifurushi' : (m.price > 0 ? '💰 Kulipia ' + fmt(m.price) + ' TZS' : '🆓 Bure')}</span><label class="fr-sw" title="Bure au kulipia"><input type="checkbox" data-kp="${m.id}" ${m.access_mode !== 'FREE' ? 'checked' : ''}><span></span><em>${m.access_mode !== 'FREE' ? 'Kulipia' : 'Bure'}</em></label>${m.active ? '' : '<span class="pill bad">🙈 Imefichwa</span>'}</div>
      <div class="mf-mc-ch">${m.channel_name ? '📺 ' + esc(m.channel_name) : 'Bila channel'}</div>
      <div class="cc-act"><button class="btn sm ghost" data-e="${m.id}">✏️ Hariri</button><button class="btn sm ghost" data-t="${m.id}">${m.active ? '🙈 Ficha' : '👁 Onyesha'}</button><button class="btn sm danger" data-d="${m.id}">🗑</button></div></div>`;
    const render = () => {
      const q = $('#mq').value.trim().toLowerCase();
      const list = rows.filter((m) => (!q || (m.home_team + ' ' + m.away_team + ' ' + (m.league || '')).toLowerCase().includes(q)) && (mode === 'all' || m.status === mode));
      const n = (s) => rows.filter((m) => m.status === s).length;
      $('#mst').innerHTML = [['⚽', rows.length, 'Mechi zote', ''], ['⏳', n('UPCOMING'), 'Zinakuja', 'gold'], ['🔴', n('LIVE'), 'Zinaendelea', 'bad'], ['✅', n('FINISHED'), 'Zimeisha', 'ok']]
        .map((x) => `<div class="pst ${x[3]}"><i>${x[0]}</i><div><b>${x[1]}</b><span>${x[2]}</span></div></div>`).join('');
      $('#mcount').innerHTML = `<b>${channels.length}</b> channels zinapatikana`;
      $('#ml').innerHTML = list.length ? list.map(card).join('') : '<p class="muted">Hakuna mechi.</p>';
      const by = (id) => rows.find((m) => m.id == id);
      document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => edit(by(b.dataset.e))));
      document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = async () => {
        const m = by(b.dataset.t);
        await api('/admin/matches/' + m.id, { method: 'PATCH', body: { home_team: m.home_team, away_team: m.away_team, league: m.league, kickoff_at: m.kickoff_at, channel_id: m.channel_id, active: !m.active, price: m.price, sort_order: m.sort_order } });
        load();
      }));
      // Swichi ya Bure / Kulipia kwenye kila mechi: inahifadhi mara moja
      document.querySelectorAll('[data-kp]').forEach((x) => (x.onchange = async () => {
        const m = by(x.dataset.kp), paid = x.checked;
        const price = paid ? (Number(m.price) || 0) : 0;
        const access_mode = paid ? (price > 0 ? 'PRICE' : 'PACKAGE') : 'FREE';
        try {
          await api('/admin/matches/' + m.id, { method: 'PATCH', body: { home_team: m.home_team, away_team: m.away_team, league: m.league, kickoff_at: m.kickoff_at, channel_id: m.channel_id, active: m.active, price, sort_order: m.sort_order, access_mode } });
          toast(mBox(), paid ? (price > 0 ? 'Mechi sasa ni ya kulipia kwa bei.' : 'Mechi sasa ni ya kulipia kwa vifurushi.') : 'Mechi sasa ni bure.', 'ok');
          load();
        } catch (err) { toast(mBox(), err.message, 'err'); x.checked = !paid; }
      }));
      document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (confirm('Futa mechi hii? Channel yake pia itafutwa.')) { await api('/admin/matches/' + b.dataset.d, { method: 'DELETE' }); load(); } }));
    };
    const load = async () => { rows = (await api('/admin/matches')).matches; render(); };
    ['home_team', 'away_team', 'league', 'kickoff_at', 'price', 'sort_order', 'active'].forEach((k) => (fld(k).oninput = paintPrev));
    fld('active').onchange = paintPrev;
    $('#so-up').onclick = () => { fld('sort_order').value = (Number(fld('sort_order').value) || 0) + 1; paintPrev(); };
    $('#so-dn').onclick = () => { fld('sort_order').value = (Number(fld('sort_order').value) || 0) - 1; paintPrev(); };
    $('#chq').oninput = paintChannels;
    $('#mq').oninput = render;
    document.querySelectorAll('#mfc [data-s]').forEach((b) => (b.onclick = () => { mode = b.dataset.s; document.querySelectorAll('#mfc .chip').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
    $('#mrs').onclick = reset;
    $('#ncb').onclick = async () => {
      const name = $('#ncn').value.trim(), url = $('#ncu').value.trim();
      if (!name) return toast($('#m'), 'Weka jina la channel.', 'err');
      if (!/^https?:\/\/\S+$/.test(url)) return toast($('#m'), 'Weka link sahihi (https://…).', 'err');
      try {
        const r = await api('/admin/channels', { method: 'POST', body: { name, stream_type: $('#nct').value, stream_url: url, headers: $('#nch').value, clearkey: $('#ncck').value,
          access_type: 'FREE', active: true, popular: false, price: 0, price_days: 30, package_ids: [], match_only: true } });
        channels.push(r.channel); chosen = r.channel; fld('channel_id').value = r.channel.id;
        $('#ncn').value = ''; $('#ncu').value = ''; $('#nch').value = ''; $('#ncck').value = ''; $('#chq').value = '';
        paintChannels(); paintPrev(); toast($('#m'), 'Channel imeongezwa na kuchaguliwa.', 'ok');
      } catch (err) { toast($('#m'), err.message, 'err'); }
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!fld('kickoff_at').value) return toast($('#m'), 'Weka tarehe na saa ya mechi.', 'err');
      if (!fld('home_team').value.trim() || !fld('away_team').value.trim()) return toast($('#m'), 'Jaza timu zote mbili.', 'err');
      const id = fld('id').value;
      const body = { home_team: fld('home_team').value, away_team: fld('away_team').value, league: fld('league').value,
        kickoff_at: new Date(fld('kickoff_at').value).toISOString(), channel_id: fld('channel_id').value || null, home_logo: fld('home_logo').value, away_logo: fld('away_logo').value, active: fld('active').checked,
        price: matchKind === 'paid' ? (Number(fld('price').value) || 0) : 0, sort_order: Number(fld('sort_order').value) || 0,
        access_mode: matchKind === 'free' ? 'FREE' : ((Number(fld('price').value) || 0) > 0 ? 'PRICE' : 'PACKAGE') };
      try { await api('/admin/matches' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body }); reset(); toast($('#m'), 'Mechi imehifadhiwa.', 'ok'); load(); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    reset(); load();
  };
  H.sonicpesa = async () => {
    shell('SonicPesa Settings', `<div class="card" id="st"><div class="muted">Inapakia…</div></div>
      <form class="card mt" id="f" autocomplete="off"><div class="fsec">Funguo za SonicPesa</div>
        <label>API Key (malipo — X-API-KEY)</label><input name="api_key" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
        <label>API Secret (payouts na saini ya webhook — X-API-SECRET)</label><input name="api_secret" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
        <div id="m" class="msg" hidden></div>
        <div class="wz-foot"><button class="btn">💾 Hifadhi funguo</button><button type="button" class="btn ghost" id="tc">🔌 Jaribu muunganisho</button></div></form>`);
    const draw = (s) => {
      $('#st').innerHTML = `<div class="fsec">Hali</div>
        ${s.ready ? '' : '<div class="msg err">⚠ SonicPesa haitatumika hadi API Key na API Secret zote ziwekwe.</div>'}
        <div class="accs"><div class="pst ${s.api_key_set ? 'ok' : 'bad'}"><i>🔑</i><div><b>${esc(s.api_key_hint || 'Haijawekwa')}</b><span>API Key</span></div></div>
        <div class="pst ${s.secret_set ? 'ok' : 'bad'}"><i>🔒</i><div><b>${esc(s.secret_hint || 'Haijawekwa')}</b><span>API Secret</span></div></div></div>
        <div class="muted mt">Webhook URL (weka kwenye dashboard ya SonicPesa): <code>${esc(s.webhook_url)}</code></div>
        <div class="testbox ${s.connected === true ? 'ok' : s.connected === false ? 'bad' : ''}">Muunganisho: <b>${s.connected === null ? 'haijajaribiwa' : s.connected ? 'Umefanikiwa' : 'Umeshindwa'}</b> • ${fdate(s.last_test_at)}${s.last_error ? '<br>' + esc(s.last_error) : ''}</div>`;
    };
    draw(await api('/admin/sonicpesa/settings'));
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { draw(await api('/admin/sonicpesa/settings', { method: 'PUT', body: body(e.target) })); e.target.reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    $('#tc').onclick = async () => { try { draw(await api('/admin/sonicpesa/test-connection', { method: 'POST' })); } catch (err) { toast($('#m'), err.message, 'err'); } };
  };
  H.fastlipa = async () => {
    shell('FastLipa Settings', `<div class="card" id="st"><div class="muted">Inapakia…</div></div>
      <form class="card mt" id="f" autocomplete="off"><div class="fsec">Funguo za FastLipa</div>
        <label>Secret Token (Bearer — malipo na payouts)</label><input name="api_key" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
        <label>Webhook Signing Secret (saini ya webhook — X-FastLipa-Signature)</label><input name="api_secret" type="password" autocomplete="new-password" placeholder="Acha wazi kama hubadilishi">
        <div id="m" class="msg" hidden></div>
        <div class="wz-foot"><button class="btn">💾 Hifadhi funguo</button><button type="button" class="btn ghost" id="tc">🔌 Jaribu muunganisho</button></div></form>`);
    const draw = (s) => {
      $('#st').innerHTML = `<div class="fsec">Hali</div>
        ${s.broken ? '<div class="msg err">Funguo zilizohifadhiwa haziwezi kusomwa (huenda SESSION_SECRET imebadilika). Weka funguo upya na uhifadhi.</div>' : ''}
        ${s.ready ? '' : '<div class="msg err">⚠ FastLipa haitatumika hadi API Key na API Secret zote ziwekwe.</div>'}
        <div class="accs"><div class="pst ${s.api_key_set ? 'ok' : 'bad'}"><i>🔑</i><div><b>${esc(s.api_key_hint || 'Haijawekwa')}</b><span>Secret Token</span></div></div>
        <div class="pst ${s.secret_set ? 'ok' : 'bad'}"><i>🔒</i><div><b>${esc(s.secret_hint || 'Haijawekwa')}</b><span>Webhook secret</span></div></div></div>
        <div class="muted mt">Webhook URL (weka kwenye dashboard ya FastLipa): <code>${esc(s.webhook_url)}</code></div>
        <div class="testbox ${s.connected === true ? 'ok' : s.connected === false ? 'bad' : ''}">Muunganisho: <b>${s.connected === null ? 'haijajaribiwa' : s.connected ? 'Umefanikiwa' : 'Umeshindwa'}</b> • ${fdate(s.last_test_at)}${s.last_error ? '<br>' + esc(s.last_error) : ''}</div>`;
    };
    draw(await api('/admin/fastlipa/settings'));
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { draw(await api('/admin/fastlipa/settings', { method: 'PUT', body: body(e.target) })); e.target.reset(); toast($('#m'), 'Imehifadhiwa.', 'ok'); }
      catch (err) { toast($('#m'), err.message, 'err'); }
    };
    $('#tc').onclick = async () => { try { draw(await api('/admin/fastlipa/test-connection', { method: 'POST' })); } catch (err) { toast($('#m'), err.message, 'err'); } };
  };
  (async () => {
    const page = document.body.dataset.page;
    if (page === 'login') return H.login();
    try {
      const { user } = await api('/auth/me');
      window.__adm = user; if (user.role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 });
      try { const s = await api('/site/settings'); const th = s.theme, st = document.documentElement.style; if (window.themeVars) Object.entries(window.themeVars(th)).forEach(([k, x]) => st.setProperty(k, x)); } catch (_) {}
      await H[page]();
    } catch (e) {
      if (e.status === 401 || e.status === 403) location.href = '/login?next=/admin/dashboard';
      else $('#root').innerHTML = `<div class="wrap"><div class="msg err">${esc(e.message)}</div></div>`;
    }
  })();
})();
