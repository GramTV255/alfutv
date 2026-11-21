/* Floating WhatsApp button. The number and greeting are set by the admin (Admin > WhatsApp). Hidden when no number is set. */
document.addEventListener('DOMContentLoaded', async () => {
  let c = null;
  try { c = await api('/api/public/contact', { noRedirect: true }); } catch (_) { return; }
  if (!c || !c.whatsapp) return;
  let who = '';
  try { const me = await api('/api/auth/me', { noRedirect: true }); if (me && me.full_name) who = ` Naitwa ${me.full_name} (${me.phone_number}).`; } catch (_) { /* guest */ }
  const a = document.createElement('a');
  a.className = 'wa-fab';
  a.href = `https://wa.me/${encodeURIComponent(c.whatsapp)}?text=${encodeURIComponent((c.message || 'Habari, nahitaji msaada.') + who)}`;
  a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Wasiliana nasi kupitia WhatsApp');
  a.innerHTML = `${waIcon()}<span>WhatsApp</span>`;
  document.body.appendChild(a);
});
