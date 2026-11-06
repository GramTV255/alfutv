/* Docs page: real site URL in examples, copy buttons, nav that follows the sign-in state, per-source endpoint list */
document.addEventListener('DOMContentLoaded', async () => {
  const origin = location.origin;
  $$('pre, code#base-url').forEach((el) => { el.textContent = el.textContent.replace(/https:\/\/your-domain\.example/g, origin); });
  $$('pre').forEach((pre) => {
    const b = document.createElement('button');
    b.className = 'btn sm icon copy-pre'; b.type = 'button'; b.setAttribute('aria-label', 'Copy'); b.innerHTML = icon('copy');
    b.addEventListener('click', () => copyText(pre.firstChild.textContent, null));
    pre.appendChild(b);
  });

  // Nav: guests see Ingia/Jisajili; signed-in users only see a button to their own area.
  const links = $('#top-links');
  let me = null;
  try { me = await api('/api/auth/me', { noRedirect: true }); } catch (_) { me = null; }
  if (me && me.role) {
    const a = document.createElement('a');
    a.className = 'btn sm primary'; a.href = me.role === 'ADMIN' ? '/admin' : '/dashboard';
    a.innerHTML = `${icon(me.role === 'ADMIN' ? 'shield' : 'home')} ${me.role === 'ADMIN' ? 'Admin Panel' : 'Dashboard'}`;
    links.appendChild(a);
  } else {
    links.insertAdjacentHTML('beforeend', '<a class="btn sm" href="/login">Ingia</a><a class="btn sm primary" href="/register">Jisajili</a>');
  }

  // Signed-in user: show the real endpoint of every source.
  if (me && me.role === 'USER') {
    try {
      const o = await api('/api/user/overview', { noRedirect: true });
      const ch = (o.api && o.api.channels) || [];
      $('#sources-box').innerHTML = ch.length
        ? `<div class="table-wrap"><table><thead><tr><th>Jina</th><th>Endpoint</th></tr></thead><tbody>${ch.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="mono"><span>${esc(c.endpoint)}</span> <button class="btn sm icon" data-copy="${esc(c.endpoint)}" aria-label="Copy">${icon('copy')}</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Hakuna channel inayotumika kwa sasa.</p>';
      $$('[data-copy]', $('#sources-box')).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy, b)));
    } catch (_) { /* keep default hint */ }
  } else if (me && me.role === 'ADMIN') {
    $('#sources-hint').textContent = 'Channels zinaonekana kwenye Admin Panel → amiriChannel. Kila moja ina endpoint ya /api/v1/amiri/{slug}.';
  }

  const navLinks = $$('.docs nav a');
  const obs = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) navLinks.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${e.target.id}`)); });
  }, { rootMargin: '-30% 0px -60% 0px' });
  $$('.docs section').forEach((s) => obs.observe(s));
});
