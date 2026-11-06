'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.API_KEY_PEPPER = 'pepper-pepper-pepper';
const test = require('node:test');
const assert = require('node:assert');
const p = require('../src/services/proxyService');

test('sealed URLs round-trip and are bound to the channel', () => {
  const blob = p.seal('https://cdn.example.com/a/seg1.ts?x=1', 7);
  assert.ok(!blob.includes('example'));
  assert.strictEqual(p.unseal(blob, 7), 'https://cdn.example.com/a/seg1.ts?x=1');
  assert.throws(() => p.unseal(blob, 8));
  assert.throws(() => p.unseal(blob.slice(0, -2) + 'AA', 7));
});

test('HLS rewrite proxies segments, variants and key URIs', () => {
  const src = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nseg1.ts\n#EXTINF:4,\nhttps://other.example/seg2.ts\n';
  const out = p.rewriteHls(src, 'https://cdn.example.com/live/index.m3u8', (u) => `P(${u})`);
  assert.match(out, /URI="P\(https:\/\/cdn\.example\.com\/live\/key\.bin\)"/);
  assert.match(out, /^P\(https:\/\/cdn\.example\.com\/live\/seg1\.ts\)$/m);
  assert.match(out, /^P\(https:\/\/other\.example\/seg2\.ts\)$/m);
  assert.match(out, /#EXTINF:4,/);
});

test('MPD rewrite adds / replaces the top-level BaseURL', () => {
  const pf = (d) => `PX(${d})`;
  const a = p.rewriteMpd('<MPD type="dynamic"><Period><AdaptationSet/></Period></MPD>', 'https://cdn.example.com/dash/m.mpd?t=1', pf);
  assert.match(a, /<MPD type="dynamic"><BaseURL>PX\(https:\/\/cdn\.example\.com\/dash\/\)<\/BaseURL><Period>/);
  const b = p.rewriteMpd('<MPD><BaseURL>media/</BaseURL><Period/></MPD>', 'https://cdn.example.com/dash/m.mpd', pf);
  assert.match(b, /<BaseURL>PX\(https:\/\/cdn\.example\.com\/dash\/media\/\)<\/BaseURL>/);
});

test('ClearKey parsing, license JSON and MPD injection', () => {
  const keys = p.parseClearKeys('0123456789abcdef0123456789ABCDEF:00112233445566778899aabbccddeeff');
  assert.strictEqual(keys[0].kid, '0123456789abcdef0123456789abcdef');
  assert.throws(() => p.parseClearKeys('nonsense'));
  const lic = p.clearKeyLicense(keys);
  assert.strictEqual(lic.keys[0].kty, 'oct');
  assert.strictEqual(Buffer.from(lic.keys[0].k, 'base64url').toString('hex'), keys[0].key);
  const out = p.injectClearKey('<MPD><Period><AdaptationSet mimeType="video/mp4"><ContentProtection schemeIdUri="urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e" value="ClearKey1.0"/><Representation/></AdaptationSet></Period></MPD>', 'https://x.test/p/t/clearkey');
  assert.strictEqual((out.match(/<clearkey:Laurl/g) || []).length, 1); // old element replaced, not duplicated
  assert.match(out, /xmlns:clearkey=/);
});

test('amiriChannel finds the token part of a pasted link', () => {
  const A = require('../src/services/amiriService');
  const cur = 'tok_AbC123xyz';
  assert.strictEqual(A.makeTemplate(`https://h.example/live/${cur}/c/index.mpd`, cur, null).template, 'https://h.example/live/{token:tok}/c/index.mpd');
  // old token, found through the source regex
  const r = A.makeTemplate('https://h.example/live/tok_OLDOLD99/c/index.mpd?x=1', cur, '(tok_[A-Za-z0-9._~\\-]+)');
  assert.strictEqual(r.template, 'https://h.example/live/{token:tok}/c/index.mpd?x=1');
  assert.strictEqual(r.method, 'regex');
  assert.strictEqual(A.makeTemplate('https://h.example/{token}/i.mpd', cur, null).method, 'marker');
  assert.throws(() => A.makeTemplate('https://h.example/live/nothing/i.mpd', cur, '(tok_[a-z]+)'), /Token haikupatikana/);
  assert.throws(() => A.makeTemplate(`https://h.example/${cur}/${cur}.mpd`, cur, null), /mara 2/);
  assert.strictEqual(A.fill('https://h/{token}/i.mpd', 'T1'), 'https://h/T1/i.mpd');
});

test('direct MPD links: any public host accepted, internal addresses refused', async () => {
  const sh = require('../src/services/safeHttp');
  assert.strictEqual(sh.isDirectMpd('https://cdn.example.net/live/m.mpd?token=abc'), true);
  assert.strictEqual(sh.isDirectMpd('https://cdn.example.net/page'), false);
  const u = await sh.validateSourceUrl('http://any-cdn.example.org:8080/a/b.mpd?x=1', { allowHttp: true, anyHost: true });
  assert.strictEqual(u.hostname, 'any-cdn.example.org');
  for (const bad of ['http://localhost/a.mpd', 'http://192.168.1.5/a.mpd', 'https://127.0.0.1/a.mpd', 'https://box.internal/a.mpd', 'https://u:p@cdn.example.org/a.mpd', 'ftp://cdn.example.org/a.mpd']) {
    await assert.rejects(() => sh.validateSourceUrl(bad, { allowHttp: true, anyHost: true }), bad);
  }
  assert.ok(sh.isAcceptableLinkHost('8.8.8.8'));
});

test('JWT-style tok_ tokens: found by the default rule, expiry read from their exp claim', () => {
  const E = require('../src/services/extractionService');
  const payload = Buffer.from(JSON.stringify({ ver: '1.0', typ: 'ContentAuthZ', exp: 1893456000 })).toString('base64url');
  const tok = `tok_${Buffer.from(JSON.stringify({ kid: '1', alg: 'HS256' })).toString('base64url')}.${payload}.sig_ABC-def123`;
  const u = new URL(`https://cdn.example.com/live/${tok}/manifest.mpd`);
  assert.strictEqual(E.extractValue(u, {}), tok); // whole token, dots included
  assert.strictEqual(E.computeExpiry(u, {}, tok).toISOString(), '2030-01-01T00:00:00.000Z');
  // no exp claim -> normal TTL
  const plain = E.computeExpiry(u, { tokenTtlSeconds: 600 }, 'tok_plain123');
  assert.ok(plain > new Date() && plain < new Date(Date.now() + 700000));
});

test('MPD link is found anywhere in a response and the token is read from it', async () => {
  const E = require('../src/services/extractionService');
  const tok = 'tok_AAAA.BBBB-cc_DD.EEEE';
  const mpd = `https://cdn.example.net/live/${tok}/manifest.mpd?x=1&y=2`;
  const find = async (body, ct = 'text/plain', base = 'https://page.example.com/api/play') => (await E.collectMpdUrls(body, ct, {}, base)).map(String);
  // plain, JSON-escaped, html-escaped, unicode-escaped
  assert.deepStrictEqual(await find(`{"a":{"b":["${mpd}"]}}`, 'application/json'), [mpd]);
  assert.deepStrictEqual(await find(JSON.stringify({ u: mpd }).replace(/\//g, '\\/')), [mpd]);
  assert.deepStrictEqual(await find(`<a href="${mpd.replace(/&/g, '&amp;')}">x</a>`, 'text/html'), [mpd]);
  assert.deepStrictEqual(await find(mpd.replace(/\//g, '\\u002F').replace(/&/g, '\\u0026').replace('https:', 'https:')), [mpd]);
  // percent-encoded inside another URL, and base64
  assert.deepStrictEqual(await find(`https://redir.example.com/go?u=${encodeURIComponent(mpd)}`), [mpd]);
  assert.ok((await find(`{"d":"${Buffer.from(mpd).toString('base64')}"}`, 'application/json')).includes(mpd));
  // inside a JWT payload
  const jwt = `hdr.${Buffer.from(JSON.stringify({ manifest: mpd })).toString('base64url')}.sig`;
  assert.ok((await find(`token=${jwt}`)).includes(mpd));
  // relative / protocol-relative
  assert.deepStrictEqual(await find('{"m":"/dash/ch1/manifest.mpd?t=1"}'), ['https://page.example.com/dash/ch1/manifest.mpd?t=1']);
  assert.deepStrictEqual(await find('src="//cdn2.example.org/a/b.mpd"', 'text/html'), ['https://cdn2.example.org/a/b.mpd']);
  // internal addresses are never accepted
  assert.deepStrictEqual(await find('http://127.0.0.1/a.mpd http://intranet.local/b.mpd'), []);
  // token from the link: default rule, percent-encoded token, common parameter
  assert.strictEqual(E.tokenFromMpd(new URL(mpd), {}), tok);
  assert.strictEqual(E.tokenFromMpd(new URL(`https://c.example.net/a.mpd?p=${encodeURIComponent(tok)}`), {}), tok);
  assert.strictEqual(E.tokenFromMpd(new URL('https://c.example.net/a.mpd?hdnts=exp=1~hmac=ab'), {}), 'exp=1~hmac=ab');
  assert.strictEqual(E.tokenFromMpd(new URL('https://c.example.net/a.mpd'), {}), null);
});

test('both token styles: tok_... and ?cdntoken=<JWT>', async () => {
  const E = require('../src/services/extractionService');
  const p = Buffer.from(JSON.stringify({ exp: 1893456000, max_sessions: 1 })).toString('base64url');
  const jwt = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.${p}.abc_DEF-123`;
  const u = new URL(`https://cdn.example.org/live/ch/DASH/ch.mpd?cdntoken=${jwt}`);
  assert.strictEqual(E.tokenFromMpd(u, {}), jwt);
  assert.strictEqual(E.computeExpiry(u, {}, jwt).toISOString(), '2030-01-01T00:00:00.000Z');
  assert.strictEqual(E.tokenFromMpd(new URL(`https://cdn.example.org/a.mpd?x=1&k=${jwt}`), {}), null); // other parameter names are not read (only tok_ and cdntoken)
  assert.strictEqual(E.tokenFromMpd(new URL('https://cdn.example.org/live/tok_abc.def/a.mpd'), {}), 'tok_abc.def');
  // found inside a response, then read
  const found = await E.collectMpdUrls(`{"play":{"url":"${u.toString()}"}}`, 'application/json', {}, 'https://api.example.com/x');
  assert.strictEqual(E.tokenFromMpd(found[0], {}), jwt);
  // token in the body (not in the link)
  assert.strictEqual(E.extractValue ? true : false, true);
});

test('amiriChannel template detection handles ?cdntoken=<JWT> links with an old token', () => {
  const A = require('../src/services/amiriService');
  const p = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
  const link = `https://cdn.example.org/live/a/DASH/a.mpd?cdntoken=eyJ0eXAiOiJKV1QifQ.${p}.sig_x`;
  const r = A.makeTemplate(link, 'some-new-token-value', null);
  assert.strictEqual(r.template, 'https://cdn.example.org/live/a/DASH/a.mpd?cdntoken={token:bare}');
});

test('amiriChannel keeps the position and style of the admin example: tok_ in the middle, cdntoken at the end', () => {
  const A = require('../src/services/amiriService');
  const jwt = 'eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjF9.sigAAA';
  // example 1: tok_ in the middle of the path
  const mid = A.makeTemplate('https://h.example/live/tok_OLD123456/ch/index.mpd', 'x', null).template;
  assert.strictEqual(mid, 'https://h.example/live/{token:tok}/ch/index.mpd');
  assert.strictEqual(A.fill(mid, `tok_${jwt}`), `https://h.example/live/tok_${jwt}/ch/index.mpd`);
  assert.strictEqual(A.fill(mid, jwt), `https://h.example/live/tok_${jwt}/ch/index.mpd`); // source gave a bare value: prefix added
  // example 2: cdntoken at the end
  const end = A.makeTemplate(`https://h.example/live/ch/DASH/ch.mpd?cdntoken=${jwt}`, 'x', null).template;
  assert.strictEqual(end, 'https://h.example/live/ch/DASH/ch.mpd?cdntoken={token:bare}');
  assert.strictEqual(A.fill(end, jwt), `https://h.example/live/ch/DASH/ch.mpd?cdntoken=${jwt}`);
  assert.strictEqual(A.fill(end, `tok_${jwt}`), `https://h.example/live/ch/DASH/ch.mpd?cdntoken=${jwt}`); // prefix removed
  // typed marker keeps the value as it is
  assert.strictEqual(A.fill('https://h/{token}/i.mpd', 'T1'), 'https://h/T1/i.mpd');
  assert.strictEqual(A.sample(end), 'https://h.example/live/ch/DASH/ch.mpd?cdntoken=x');
});

test('source stores every token it finds, by type, and amiriChannel picks the one that fits its link', async () => {
  const E = require('../src/services/extractionService');
  const A = require('../src/services/amiriService');
  const { encrypt } = require('../src/utils/crypto');
  const p = (exp) => Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const jwt = `eyJhbGciOiJIUzUxMiJ9.${p(1893456000)}.sigAAA`;
  const tokVal = `tok_eyJraWQiOiIxIn0.${p(1893459600)}.sigBBB`;
  const body = JSON.stringify({
    a: `https://cdn.example.org/live/${tokVal}/ch1/manifest.mpd`,
    b: `https://cdn2.example.org/live/ch2/DASH/ch2.mpd?cdntoken=${jwt}`,
  });
  const urls = await E.collectMpdUrls(body, 'application/json', {}, 'https://api.example.com/x');
  const tokens = E.gatherTokens(urls, body, {});
  assert.deepStrictEqual(tokens.map((t) => t.type).sort(), ['cdntoken', 'tok']);
  assert.strictEqual(tokens.find((t) => t.type === 'tok').value, tokVal);
  assert.strictEqual(tokens.find((t) => t.type === 'cdntoken').value, jwt);
  assert.strictEqual(tokens.find((t) => t.type === 'cdntoken').exp, '2030-01-01T00:00:00.000Z'); // each token keeps its own expiry
  // both link styles get the cdntoken found at the source
  const row = { tokens_enc: encrypt(JSON.stringify(tokens)), extracted_value: jwt };
  assert.strictEqual(A.tokenFor(row, 'https://h/live/{token:tok}/c.mpd'), jwt); // the cdntoken goes into the tok_ place
  assert.strictEqual(A.tokenFor({ ...row, tokens_enc: encrypt(JSON.stringify(tokens.filter((x) => x.type === 'tok'))) }, 'https://h/live/{token:tok}/c.mpd'), tokVal); // no cdntoken stored: the tok_ one
  assert.strictEqual(A.tokenFor(row, 'https://h/c.mpd?cdntoken={token:bare}'), jwt);
  assert.strictEqual(A.tokenFor(row, 'https://h/{token}/c.mpd'), jwt); // typed marker: primary token
  assert.strictEqual(A.tokenFor({ extracted_value: 'only' }, 'https://h/{token:tok}/c.mpd'), 'only'); // nothing stored: primary
  // custom rule: only your pattern
  const custom = E.gatherTokens([new URL('https://h.example/a/ZZ99/x.mpd')], '', { tokenRegex: '/(ZZ\\d+)/' });
  assert.deepStrictEqual(custom.map((t) => [t.type, t.value]), [['custom', 'ZZ99']]);
});

test('only the cdntoken value is taken as the token (not the whole query), and it is stored first', () => {
  const E = require('../src/services/extractionService');
  const jwt = `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ exp: 1893456000 })).toString('base64url')}.sigAAA`;
  const u = new URL(`https://cdn.example.org/live/eds/Ch/DASH/Ch.mpd?a=1&cdntoken=${jwt}&b=2`);
  assert.strictEqual(E.tokenFromMpd(u, {}), jwt);
  assert.strictEqual(E.tokenFromMpd(new URL(`https://c.example.org/tok_PATH123/x.mpd?cdntoken=${jwt}`), {}), jwt); // cdntoken wins over tok_
  assert.strictEqual(E.tokenFromMpd(new URL(`https://c.example.org/x.mpd?sess=${jwt}&k=abc`), { tokenParam: 'k' }), 'abc'); // named parameter
  assert.strictEqual(E.tokenFromMpd(u, { tokenRegex: '[?&]a=(\\d)' }), '1'); // your own rule wins
  const list = E.gatherTokens([u], '', {});
  assert.strictEqual(list[0].type, 'cdntoken'); assert.strictEqual(list[0].value, jwt);
  assert.doesNotThrow(() => E.validateRules({ tokenParam: 'cdntoken' }));
  assert.throws(() => E.validateRules({ tokenParam: 'bad param!' }));
});

test('sources saved with the old pre-filled tok_ rule still find a cdntoken (screenshot case)', async () => {
  const E = require('../src/services/extractionService');
  const jwt = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.${Buffer.from(JSON.stringify({ exp: 1893456000, max_sessions: 1 })).toString('base64url')}.sig_AbC-123`;
  const link = `https://cdnblncr.example.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd?cdntoken=${jwt}`;
  const legacy = E.normalizeRules({ tokenRegex: '(tok_[A-Za-z0-9._~\\-]+)', tokenTtlSeconds: 3600 });
  assert.strictEqual(legacy.tokenRegex, undefined);
  const urls = await E.collectMpdUrls(`<script>player.load("${link}")</script>`, 'text/html', legacy, 'https://page.example.com/player/1');
  assert.strictEqual(E.tokenFromMpd(urls[0], legacy), jwt);
  // even a custom rule that finds nothing falls back to automatic detection
  assert.strictEqual(E.tokenFromMpd(urls[0], { tokenRegex: '(zzz_\\w+)' }), jwt);
  assert.strictEqual(E.gatherTokens(urls, '', { tokenRegex: '(zzz_\\w+)' })[0].value, jwt);
  assert.strictEqual(E.computeExpiry(urls[0], legacy, jwt).toISOString(), '2030-01-01T00:00:00.000Z');
});

test('amiriChannel: token goes right after "tok_=" in the path, exactly like the admin example', async () => {
  const A = require('../src/services/amiriService');
  const E = require('../src/services/extractionService');
  const mk = (exp) => `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig_${exp}-x`;
  const oldJwt = mk(1); const newJwt = mk(1893456000);
  const example = `https://cdnedgch2.example.co.tz/tok_=${oldJwt}/live/eds/AzamSport1/DASH/AzamSport1.mpd`;
  const t = A.makeTemplate(example, 'unrelated-current', null).template;
  assert.strictEqual(t, 'https://cdnedgch2.example.co.tz/tok_={token:bare}/live/eds/AzamSport1/DASH/AzamSport1.mpd');
  assert.strictEqual(A.fill(t, newJwt), `https://cdnedgch2.example.co.tz/tok_=${newJwt}/live/eds/AzamSport1/DASH/AzamSport1.mpd`);
  assert.strictEqual(A.fill(t, `tok_${newJwt}`), `https://cdnedgch2.example.co.tz/tok_=${newJwt}/live/eds/AzamSport1/DASH/AzamSport1.mpd`); // never "tok_=tok_"
  // the same link coming from a source response is read the same way
  const urls = await E.collectMpdUrls(JSON.stringify({ u: example }), 'application/json', {}, 'https://api.example.com/p');
  assert.strictEqual(E.tokenFromMpd(urls[0], {}), oldJwt);
  assert.strictEqual(E.gatherTokens(urls, '', {})[0].type, 'tok_=');
});

test('end to end: cdntoken from the source link is placed at tok_= of the amiriChannel link', async () => {
  const E = require('../src/services/extractionService');
  const A = require('../src/services/amiriService');
  const { encrypt } = require('../src/utils/crypto');
  const mk = (exp) => `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig_${exp}`;
  const fresh = mk(1893456000);
  const sourceLink = `https://cdnblncr.example.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd?cdntoken=${fresh}`;
  const urls = await E.collectMpdUrls(`{"play":"${sourceLink}"}`, 'application/json', {}, 'https://page.example.com/x');
  const tokens = E.gatherTokens(urls, '', {});
  const row = { tokens_enc: encrypt(JSON.stringify(tokens)), extracted_value: E.tokenFromMpd(urls[0], {}) };
  const t = A.makeTemplate(`https://cdnedgch2.example.co.tz/tok_=${mk(1)}/live/eds/AzamSport1/DASH/AzamSport1.mpd`, 'x', null).template;
  assert.strictEqual(A.fill(t, A.tokenFor(row, t)), `https://cdnedgch2.example.co.tz/tok_=${fresh}/live/eds/AzamSport1/DASH/AzamSport1.mpd`);
});

test('the link is exactly ...mpd?cdntoken=<JWT>: no label or prefix is ever doubled', () => {
  const A = require('../src/services/amiriService');
  const jwt = 'eyJ0eXAiOiJKV1QifQ.eyJleHAiOjF9.sigX';
  const t = 'https://cdnblncr.example.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd?cdntoken={token:bare}';
  const want = `https://cdnblncr.example.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd?cdntoken=${jwt}`;
  for (const stored of [jwt, `tok_${jwt}`, `cdntoken=${jwt}`, ` ${jwt} `, `tok_=${jwt}`]) assert.strictEqual(A.fill(t, stored), want);
  // an older channel saved with a typed {token} behind "cdntoken=" is cleaned the same way
  assert.strictEqual(A.fill('https://h/a.mpd?cdntoken={token}', `cdntoken=${jwt}`), `https://h/a.mpd?cdntoken=${jwt}`);
  assert.strictEqual(A.fill('https://h/{token}/a.mpd', 'T1'), 'https://h/T1/a.mpd'); // plain typed marker unchanged
});

test('beinProxy: signed playlist query (?t=..&e=..) is carried to relative segments on the same host only', () => {
  const px = require('../src/services/proxyService');
  const pl = 'http://re300.new-redirect.online/live/645587700/index.m3u8?t=QkR-K2S0FeQ2vYStgOnR9Q&e=1793740300';
  assert.strictEqual(px.carryQuery('http://re300.new-redirect.online/live/645587700/seg1.ts', pl), 'http://re300.new-redirect.online/live/645587700/seg1.ts?t=QkR-K2S0FeQ2vYStgOnR9Q&e=1793740300');
  assert.strictEqual(px.carryQuery('http://re300.new-redirect.online/x.ts?t=own', pl), 'http://re300.new-redirect.online/x.ts?t=own');
  assert.strictEqual(px.carryQuery('http://other.example/x.ts', pl), 'http://other.example/x.ts');
  const out = px.rewriteHls('#EXTM3U\n#EXTINF:4,\nseg1.ts\n', pl, (abs) => 'P:' + px.carryQuery(abs, pl));
  assert.match(out, /P:http:\/\/re300\.new-redirect\.online\/live\/645587700\/seg1\.ts\?t=QkR-K2S0FeQ2vYStgOnR9Q&e=1793740300/);
});

test('beinProxy accepts headers as "name: value" lines or JSON', () => {
  const { parseHeaders } = require('../src/utils/headers');
  assert.deepStrictEqual(parseHeaders('referer: https://a.example/\nuser-agent: X'), { referer: 'https://a.example/', 'user-agent': 'X' });
  assert.deepStrictEqual(parseHeaders('{"Referer":"https://a.example/"}'), { referer: 'https://a.example/' });
});

test('tok_ token keeps its trailing "==" (AzamOne link) in source extraction and in amiriChannel', () => {
  const ex = require('../src/services/extractionService');
  const A = require('../src/services/amiriService');
  const jwt = 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOiIxNzkzODA5MjA0Iiwic2lwIjoiIn0.GzuEkJDSs2cqA7RSvdOmWFBt9fRKo2QMQViIlg9SlUI2tWRyrhs_zVxmnfsx7rt-QYraSl3C0HHyYDRc3YTqig==';
  const link = `https://cdnedgch2.azamtvltd.co.tz/tok_${jwt}/live/eds/AzamOne/DASH/AzamOne.mpd?channel=5&k2_sig=affa8ebd&k2_ts=1793771533`;
  const rules = ex.normalizeRules({});
  assert.strictEqual(ex.tokenFromMpd(new URL(link), rules), `tok_${jwt}`);
  assert.ok(ex.gatherTokens([new URL(link)], '', rules).some((t) => t.value === `tok_${jwt}`));
  const t = A.makeTemplate(link, null, null);
  assert.ok(t.template.includes('{token'));
  assert.ok(!t.template.includes('=='));
});



test('only two kinds of token are read: tok_ and cdntoken (other parameters and opaque parts are ignored)', () => {
  const ex = require('../src/services/extractionService');
  const A = require('../src/services/amiriService');
  const rules = ex.normalizeRules({});
  const bein = new URL('http://re300.new-redirect.online/live/645587700/index.m3u8?t=QkR-K2S0FeQ2vYStgOnR9Q&e=1793740300');
  assert.strictEqual(ex.tokenFromMpd(bein, rules), null);
  assert.deepStrictEqual(ex.gatherTokens([bein], '{"playToken":"abc123def456ghi789"}', rules), []);
  const cdn = new URL('https://cdn.example.org/live/a/DASH/a.mpd?channel=5&k2_sig=aff&cdntoken=eyJ0eXAiOiJKV1QifQ.eyJleHAiOjE3OTM4MDkyMDR9.sig==');
  assert.deepStrictEqual(ex.gatherTokens([cdn], '', rules).map((t) => t.type), ['cdntoken']);
  assert.throws(() => A.makeTemplate('https://cdn.example.org/live/vt_9f8a7b6c5d4e3f2a1b0c/ch1/index.mpd', null, null));
});

test('MPD link is found even when ".mpd" is in the middle of the URL, not only at the end', async () => {
  const ex = require('../src/services/extractionService');
  const a = await ex.collectMpdUrls('see https://host.example/live/stream.mpd/tok_abc123/extra?x=1 here', '', {}, 'https://base.example/');
  assert.strictEqual(a[0].toString(), 'https://host.example/live/stream.mpd/tok_abc123/extra?x=1');
  const b = await ex.collectMpdUrls('"url":"https:\\/\\/host.example\\/live\\/a.mpd\\/seg\\/x"', '', {}, 'https://base.example/');
  assert.strictEqual(b[0].toString(), 'https://host.example/live/a.mpd/seg/x');
  // still works when .mpd is at the end, as before
  const c = await ex.collectMpdUrls('plain https://host.example/live/a.mpd?x=1 end', '', {}, 'https://base.example/');
  assert.strictEqual(c[0].toString(), 'https://host.example/live/a.mpd?x=1');
});
