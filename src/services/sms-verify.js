// Ukaguzi wa SMS ya muamala wa kutuma pesa (payout ya mkono)
// Inatafuta: kiasi, namba ya mpokeaji, na namba ya muamala. Haiwasiliani na mtandao wowote wa malipo.

const last9 = (d) => String(d).replace(/\D/g, '').slice(-9);

function parseSms(text) {
  const t = String(text || '');

  // Kiasi: TZS / Tsh / Sh ikifuatiwa na namba (inaruhusu 6,000 au 6,000.00)
  let amount = null;
  const am = t.match(/(?:TZS|TSH|Tsh|Tshs|Sh\.?)\s*([\d]{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,]00)?/i);
  if (am) amount = Number(am[1].replace(/\D/g, ''));

  // Namba za simu: 0XXXXXXXXX (tarakimu 10) au 255XXXXXXXXX (tarakimu 12), pamoja na nafasi au +
  const flat = t.replace(/(\d)[\s-]+(?=\d)/g, '$1');
  const phones = [];
  const pr = /(?<!\d)(?:\+?255|0)([67]\d{8})(?!\d)/g;
  let m;
  while ((m = pr.exec(flat))) phones.push(last9(m[1]));

  // Namba ya muamala: kwanza kwa neno linalotangulia, kisha namba yoyote yenye herufi na tarakimu (9-14)
  let tx = null;
  const tm = t.match(/(?:muamala|transaction|trans\.?\s*id|transid|kumbukumbu|namba ya muamala|ref(?:erence)?)\D{0,25}?([A-Z0-9]{8,15})\b/i);
  if (tm && /[A-Z]/i.test(tm[1]) && /\d/.test(tm[1])) tx = tm[1].toUpperCase();
  if (!tx) {
    const tokens = t.match(/(?<![A-Za-z0-9])[A-Z0-9]{9,14}(?![A-Za-z0-9])/g) || [];
    const hit = tokens.find((x) => /[A-Z]/.test(x) && /\d/.test(x));
    if (hit) tx = hit;
  }

  return { amount, phones, tx };
}

// Inarudisha { ok, errors, tx } kulingana na ombi la payout
function verify(text, { amount, phone }) {
  const p = parseSms(text);
  const errors = [];
  if (p.amount == null) errors.push('SMS haina kiasi cha pesa (mfano TZS 6,000)');
  else if (p.amount !== Number(amount)) errors.push(`Kiasi kwenye SMS (TZS ${p.amount.toLocaleString('en-US')}) hakilingani na ombi (TZS ${Number(amount).toLocaleString('en-US')})`);
  if (!p.phones.length) errors.push('SMS haina namba ya mpokeaji');
  else if (!p.phones.includes(last9(phone))) errors.push('Namba kwenye SMS hailingani na ya mwenye code');
  if (!p.tx) errors.push('Namba ya muamala haionekani kwenye SMS');
  return { ok: errors.length === 0, errors, tx: p.tx };
}

module.exports = { parseSms, verify };
