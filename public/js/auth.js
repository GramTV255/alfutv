/* Login / register / forgot / reset forms */
document.addEventListener('DOMContentLoaded', () => {
  const msg = $('#msg');
  const show = (text, type) => { msg.innerHTML = text ? `<div class="alert ${type || 'bad'}">${esc(text)}</div>` : ''; };
  const formData = (form) => Object.fromEntries(new FormData(form).entries());

  // Already signed in? Go straight to the right dashboard.
  if (/\/(login|register)(\.html)?$/.test(location.pathname) && !new URLSearchParams(location.search).get('registered')) {
    api('/api/auth/me', { noRedirect: true }).then((me) => { location.replace(me.role === 'ADMIN' ? '/admin' : '/dashboard'); }).catch(() => {});
    const q = new URLSearchParams(location.search);
    if (q.get('registered')) show('Usajili umefanikiwa. Ingia sasa.', 'ok');
    if (q.get('reset')) show('Password mpya imewekwa. Ingia sasa.', 'ok');
  }

  const login = $('#login-form');
  if (login) login.addEventListener('submit', async (e) => {
    e.preventDefault(); show('');
    const d = formData(login);
    if (!d.phone || !d.password) return show('Jaza namba ya simu na password');
    const btn = $('button[type=submit]', login);
    await withBusy(btn, async () => {
      try {
        const r = await api('/api/auth/login', { method: 'POST', body: { phone: d.phone, password: d.password } });
        location.href = r.redirect; // chosen by the server from the role stored in the database
      } catch (err) { show(err.message); }
    });
  });

  const reg = $('#register-form');
  if (reg) reg.addEventListener('submit', async (e) => {
    e.preventDefault(); show('');
    const d = formData(reg);
    if (!d.fullName || !d.phone || !d.password) return show('Jaza sehemu zote');
    if (d.password !== d.confirmPassword) return show('Password na Confirm Password hazifanani');
    const btn = $('button[type=submit]', reg);
    await withBusy(btn, async () => {
      try {
        const r = await api('/api/auth/register', { method: 'POST', body: d });
        location.href = r.redirect || '/dashboard'; // new accounts are always USER
      } catch (err) { show(err.message); }
    });
  });

  const forgot = $('#forgot-form'), reset = $('#reset-form');
  if (forgot && reset) {
    $$('[data-tab]').forEach((t) => t.addEventListener('click', () => {
      $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === t));
      forgot.classList.toggle('hidden', t.dataset.tab !== 'ask');
      reset.classList.toggle('hidden', t.dataset.tab !== 'use');
      show('');
    }));
    forgot.addEventListener('submit', async (e) => {
      e.preventDefault(); show('');
      const btn = $('button[type=submit]', forgot);
      await withBusy(btn, async () => {
        try {
          const r = await api('/api/auth/forgot-password', { method: 'POST', body: formData(forgot) });
          show(r.message, 'ok');
        } catch (err) { show(err.message); }
      });
    });
    reset.addEventListener('submit', async (e) => {
      e.preventDefault(); show('');
      const d = formData(reset);
      if (d.newPassword !== d.confirmPassword) return show('Password mpya na Confirm hazifanani');
      const btn = $('button[type=submit]', reset);
      await withBusy(btn, async () => {
        try {
          await api('/api/auth/reset-password', { method: 'POST', body: d });
          location.href = '/login?reset=1';
        } catch (err) { show(err.message); }
      });
    });
  }
});
