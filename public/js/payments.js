const PHONE_RE = /^(0[67]\d{8}|255[67]\d{8}|\+255[67]\d{8})$/;
const cleanPhone = (v) => String(v || '').replace(/[\s-]/g, '');
window.startPurchase = (el, item, name, price) => {
  const box = $('#pay') || el;
  box.innerHTML = `<div class="paybox" id="pb">
    <div class="pay-top">
      <div class="pay-ic">💳</div>
      <div class="pay-meta"><div class="pay-name">${esc(name)}</div><div class="pay-sub">Malipo ya ClickPesa • kwa USSD</div></div>
      <div class="pay-amt">${fmt(price)}<small>TZS</small></div>
    </div>
    <div class="pay-steps" id="ps">
      <div class="ps on"><i>1</i><span>Namba</span></div>
      <div class="pst-line"></div>
      <div class="ps"><i>2</i><span>Thibitisha</span></div>
      <div class="pst-line"></div>
      <div class="ps"><i>3</i><span>Imekamilika</span></div>
    </div>
    <div id="pbody">
      <label class="pay-lbl">Namba ya Mobile Money</label>
      <div class="pay-field"><span class="pay-pre">📱</span><input id="pp" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX" value="${esc((window.me && window.me.phone) || '')}"></div>
      <div class="pay-hint" id="phint">Mfano: 0712345678 au 255712345678</div>
      <div id="pm" class="msg" hidden></div>
      <div class="pay-actions"><button class="btn" id="go">Lipia TZS ${fmt(price)}</button><button class="btn ghost" id="cx">Ghairi</button></div>
      <p class="pay-note">Utapokea ombi kwenye simu yako. Weka PIN yako kukamilisha malipo.</p>
    </div></div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const setStep = (n) => document.querySelectorAll('#ps .ps').forEach((s, i) => { s.classList.toggle('on', i === n); s.classList.toggle('done', i < n); });
  const pbody = () => $('#pbody');
  const err = (t) => { const m = $('#pm'); m.hidden = false; m.className = 'msg err'; m.textContent = t; };
  $('#cx').onclick = () => (box.innerHTML = '');
  $('#pp').oninput = (e) => { const ok = PHONE_RE.test(cleanPhone(e.target.value)); $('#phint').className = 'pay-hint ' + (ok || !e.target.value ? '' : 'bad'); $('#phint').textContent = ok || !e.target.value ? 'Mfano: 0712345678 au 255712345678' : 'Namba si sahihi. Tumia 07XXXXXXXX au 255XXXXXXXXX.'; };
  $('#go').onclick = async (ev) => {
    const phone = cleanPhone($('#pp').value);
    if (!PHONE_RE.test(phone)) return err('Weka namba sahihi ya Mobile Money.');
    $('#pm').hidden = true;
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Inatuma…';
    try {
      const r = await api('/payments/create', { method: 'POST', body: { ...item, phone } });
      setStep(1);
      pbody().innerHTML = `<div class="pay-wait"><div class="pay-ring"><div></div><span>📱</span></div>
        <b>Angalia simu yako</b><span class="pay-sub2">Weka PIN ili kuthibitisha malipo ya TZS ${fmt(price)}</span>
        <div class="pay-timer" id="ptm">00:00</div>
        <button class="btn ghost sm" id="cx2">Funga</button></div>`;
      $('#cx2').onclick = () => (box.innerHTML = '');
      poll(r.id, setStep, price, name, box);
    } catch (e) { err(e.message); ev.currentTarget.disabled = false; ev.currentTarget.textContent = 'Lipia TZS ' + fmt(price); }
  };
};
function poll(id, setStep, price, name, box) {
  let n = 0;
  const started = Date.now();
  const tick = setInterval(async () => {
    n++;
    const t = $('#ptm'); if (t) { const s = Math.floor((Date.now() - started) / 1000); t.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
    try {
      const { payment: p } = await api('/payments/' + id);
      if (p.status === 'COMPLETED') {
        clearInterval(tick); setStep(2);
        box.querySelector('#pbody').innerHTML = `<div class="pay-ok"><div class="pay-check">✅</div><b>Malipo yamekamilika</b><span class="pay-sub2">${esc(name)} imefunguliwa. Unaelekezwa…</span></div>`;
        setTimeout(() => (location.href = '/'), 1800);
      } else if (['FAILED', 'VOIDED', 'EXPIRED', 'REVIEW'].includes(p.status)) {
        clearInterval(tick);
        box.querySelector('#pbody').innerHTML = `<div class="pay-fail"><div class="pay-check">❌</div><b>Malipo hayakukamilika</b><span class="pay-sub2">${esc(p.failure_reason || p.status)}</span>
          <button class="btn sm" id="retry">Jaribu tena</button></div>`;
        $('#retry').onclick = () => window.startPurchase(box.parentElement, { id }, name, price);
      }
    } catch (_) {}
    if (n > 75) { clearInterval(tick); const b = box.querySelector('#pbody'); if (b) b.insertAdjacentHTML('beforeend', '<p class="pay-note">Bado tunasubiri uthibitisho. Angalia Profile baadaye.</p>'); }
  }, 4000);
}
