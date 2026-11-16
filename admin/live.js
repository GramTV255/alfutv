// Live User Locations: muundo rahisi. Inasasishwa kimya kimya kila sekunde 1 ndani ya kadi, bila kurefresh ukurasa.
(() => {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const flag = (code) => (code && /^[A-Z]{2}$/.test(code)) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '🌍';

  const wrap = document.createElement('section');
  wrap.className = 'lv2';
  wrap.innerHTML = `
    <div class="lv2-head">
      <div class="lv2-t"><span class="lv2-dot"></span><b>Live User Locations</b></div>
      <small id="lv2F">Inapakia…</small>
    </div>
    <div class="lv2-main">
      <div class="lv2-big"><b id="lv2T">0</b><span>watu mtandaoni sasa</span></div>
      <div class="lv2-chips"><span class="w"><i id="lv2W">0</i> wanacheza</span><span class="i"><i id="lv2I">0</i> wamefungua app</span></div>
    </div>
    <div class="lv2-grid">
      <div class="lv2-box"><h4>Mikoa</h4><div id="lv2R"></div></div>
      <div class="lv2-box"><h4>Channels</h4><div id="lv2H"></div></div>
    </div>`;

  // Kadi inakaa chini kabisa ya dashboard
  const place = () => {
    const main = document.querySelector('.amain');
    if (!main) return false;
    if (main.lastElementChild !== wrap) main.appendChild(wrap);
    return true;
  };

  const empty = (t) => `<div class="lv2-empty">${t}</div>`;
  let lastSig = '';
  const $ = (id) => document.getElementById(id);

  const render = (d) => {
    $('lv2T').textContent = d.total;
    $('lv2W').textContent = d.watching;
    $('lv2I').textContent = d.idle;
    const f = [];
    if (d.unknown_geo) f.push(`${d.unknown_geo} hawajulikani eneo`);
    f.push('Imesasishwa ' + new Date(d.updated_at).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    $('lv2F').textContent = f.join(' • ');

    // Orodha zinachorwa upya tu data ikibadilika
    const sig = JSON.stringify([d.regions, d.channels]);
    if (sig === lastSig) return;
    lastSig = sig;
    $('lv2R').innerHTML = d.regions.length
      ? d.regions.map((x) => `<div class="lv2-row"><span class="lv2-fl">${flag(x.code)}</span><span class="lv2-n">${esc(x.name)}<small>${esc(x.country)}</small></span><span class="lv2-c">${x.count}</span></div>`).join('')
      : empty('Hakuna mtu mtandaoni kwa sasa');
    $('lv2H').innerHTML = d.channels.length
      ? d.channels.map((x, i) => `<div class="lv2-row"><span class="lv2-rk">${i + 1}</span><span class="lv2-n">${esc(x.name)}</span><span class="lv2-c">${x.count}</span></div>`).join('')
      : empty('Hakuna channel inayochezwa sasa');
  };

  // Mzunguko wa kimya: data inawekwa mahali pake, ukurasa haurefreshiwi
  const loop = async () => {
    place();
    if (!document.hidden) {
      try {
        const r = await fetch('/api/admin/live/summary', { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) render(await r.json());
      } catch (_) { /* mtandao ukikatika, jaribu tena */ }
    }
    setTimeout(loop, 1000);
  };
  loop();
})();
