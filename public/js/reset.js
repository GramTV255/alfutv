// Kubadilisha password kwa code ya admin
(() => {
  document.addEventListener('app:ready', () => {
    if (document.body.dataset.page !== 'reset') return;
    const main = document.getElementById('main');
    main.innerHTML = `<section class="form reset-card">
      <h2>Badilisha password</h2>
      <p class="muted">1. Weka namba yako ya simu, kisha tuma ombi kwa admin.<br>2. Admin akikupa code, weka code na password mpya.</p>
      <form id="rq" novalidate><label>Namba ya simu</label><input name="phone" inputmode="tel" required placeholder="07XXXXXXXX">
        <div class="msg" id="rqm" hidden></div><button class="btn">Tuma ombi kwa admin</button></form>
      <hr>
      <form id="rc" novalidate><label>Namba ya simu</label><input name="phone" inputmode="tel" required placeholder="07XXXXXXXX">
        <label>Code kutoka kwa admin</label><input name="code" autocomplete="off" maxlength="12" style="text-transform:uppercase" required>
        <label>Password mpya (angalau herufi 6)</label><input name="password" type="password" minlength="6" required>
        <div class="msg" id="rcm" hidden></div><button class="btn">Badilisha password</button></form>
    </section>`;
    const show = (el, t, c) => { el.hidden = false; el.className = 'msg ' + c; el.textContent = t; };
    document.getElementById('rq').onsubmit = async (e) => {
      e.preventDefault();
      const m = document.getElementById('rqm');
      try { const r = await api('/auth/reset/request', { method: 'POST', body: { phone: e.target.phone.value } }); show(m, r.message, 'ok'); }
      catch (err) { show(m, err.message, 'err'); }
    };
    document.getElementById('rc').onsubmit = async (e) => {
      e.preventDefault();
      const m = document.getElementById('rcm');
      try {
        await api('/auth/reset/confirm', { method: 'POST', body: { phone: e.target.phone.value, code: e.target.code.value, password: e.target.password.value } });
        location.href = '/profile';
      } catch (err) { show(m, err.message, 'err'); }
    };
  });
})();
