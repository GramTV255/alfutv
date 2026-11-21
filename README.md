# Channel API System

User website + Admin panel + Node.js (Express) API + PostgreSQL, with personal API keys, ClickPesa payments, subscriptions, channel sources, MPD token extraction and a public channel API.

## Login ya mtumiaji / admin
Ukurasa mmoja (`/login.html`). Seva inasoma `role` kwenye database na kurudisha `USER` au `ADMIN`; browser inapelekwa `/dashboard.html` au `/admin.html`. Kila API ya admin inakagua role upya kwenye seva, na kila ukurasa unajikagua (mtumiaji wa kawaida akifungua `/admin.html` anarudishwa dashboard yake). Usajili hauwezi kutengeneza ADMIN.

## Requirements
Node.js 18.17+ (22 recommended), PostgreSQL 13+.

## Quick start
```bash
npm install
cp .env.example .env
npm run gen-secrets        # paste the 3 values into .env
# edit .env: DATABASE_URL, PUBLIC_BASE_URL, ALLOWED_SOURCE_HOSTS
npm run create-admin       # creates the FIRST admin (interactive, hidden password)
npm start                  # runs migrations automatically (advisory-locked, transactional), then listens
```
Open `http://localhost:3000`. Health check: `/healthz`.

## First admin (secure setup)
1. Run `npm run create-admin` on the server (it asks for phone, name, password twice; password is bcrypt-hashed, never printed/logged).
2. Non-interactive alternative: `ADMIN_PHONE=0712345678 ADMIN_NAME="Jina" ADMIN_PASSWORD='...' npm run create-admin` (clear your shell history afterwards).
3. Log in at `/login.html`. Running the command again for an existing phone promotes/resets that account.
4. Public registration can never create an admin.

**"Namba ya simu au password si sahihi" ingawa umeweka ADMIN_PHONE/ADMIN_PASSWORD sahihi?** Kuna sababu mbili za kawaida:
1. **Admin tayari alikuwepo.** Env vars hizi zinatumika mara moja tu, wakati akaunti ya kwanza ya admin inapoundwa. Mara ipo, kubadilisha ADMIN_PASSWORD kwenye Wasmer hakuibadilishi akaunti iliyopo (hii ni kwa makusudi, kwa usalama) — ukurasa wa Logs utaonyesha "An admin already exists ... ADMIN_PHONE/ADMIN_PASSWORD were left as they are." Ili kulazimisha kubadilisha password ya admin huyo, ongeza pia `ADMIN_FORCE_RESET=true`, fanya Save and Redeploy mara moja, ingia, kisha ondoa `ADMIN_FORCE_RESET` na `ADMIN_PASSWORD`. Mfumo sasa unasafisha nafasi tupu/alama za mwanzo-mwisho (`"..."`) kwenye thamani za ADMIN_* kiotomatiki (zinazotokea mara nyingine ukinakili-bandika kwenye jedwali la Wasmer), na **Logs** zinaandika kwa usahihi kabisa kama ADMIN_PHONE au ADMIN_PASSWORD imekataliwa na kwa nini.
2. **Akaunti imefungwa kwa muda** baada ya majaribio 5 ya password isiyo sahihi (dakika 15 kwa chaguo-msingi). Sasa ujumbe tofauti unaonekana: "Majaribio mengi ya kuingia yameshindwa... jaribu tena baada ya dakika N" badala ya ule wa jumla, ili iwe wazi kuwa si suala la password. Subiri muda huo, au weka `LOGIN_LOCK_MINUTES` fupi zaidi kwenye env kisha fanya Save and Redeploy (hii haifungui akaunti iliyofungwa tayari; database bado ina `locked_until` ya zamani — kwa hilo tumia njia ya 1 juu, `ADMIN_FORCE_RESET=true`, ambayo pia inafungua akaunti).

## ClickPesa setup
1. In the ClickPesa dashboard create an **API application**, enable Collection, copy **Client ID** and **API Key** (optional **Checksum key** if you enable checksum).
2. Admin Panel → **ClickPesa** → paste credentials → Save → **Jaribu muunganisho** (gets a token; no money moves).
3. In ClickPesa → Settings → Developers → your application → **Application Webhooks**, set the URL shown in the panel (`https://YOUR-DOMAIN/api/webhooks/clickpesa`) for `PAYMENT RECEIVED` and `PAYMENT FAILED`.
4. ClickPesa has **no sandbox**. Test live with the smallest package; before KYC the limit is TZS 100,000 and 100 API calls/day.

Implemented strictly from docs.clickpesa.com: `POST /third-parties/generate-token` (headers `client-id`, `api-key`), `POST /payments/preview-ussd-push-request`, `POST /payments/initiate-ussd-push-request`, `GET /payments/{orderReference}`, checksum = HMAC-SHA256 over canonical (recursively key-sorted) compact JSON excluding `checksum`/`checksumMethod`.

Payment safety: the browser's claim is never trusted. A subscription is activated only after the server asks ClickPesa's query API and sees `SUCCESS`/`SETTLED` with a matching amount; processing is idempotent (row lock + status check), a background job reconciles missed webhooks.

## Channel sources and extraction
Admin → Channels. Add only sources you are **authorized** to use (a confirmation checkbox is required and audited).
1. Add the source host(s) to **Allowed hosts** (the source URL and the MPD URL host must both be listed). With an empty allowlist nothing is fetched.
2. Add the source (URL, method, JSON headers, rules). Headers are stored AES-256-GCM encrypted and never returned.
3. Press **Jaribu extraction**; the panel shows only a masked preview and logs.

A `.mpd` MPD link is found anywhere in a response even when `.mpd` sits in the middle of the URL (more path or a token follows it), not only when the link ends in `.mpd?...`.

Rules JSON: `tokenRegex` (default `(tok_[A-Za-z0-9._~\-]+)`), `mpdUrlRegex`, `tokenTtlSeconds` (default 3600), `expiryParam`, `valueType` (`token`|`url`), `channelName`.
Protections: https only, host allowlist, public-IP check with DNS pinning (the DNS lookup itself is now also bounded, so an unresponsive resolver cannot hang a request), no redirects, 10s timeout, 1MB limit. Only the extracted value is stored (never the full HTML). Expired values are re-extracted from the authorized source (with a cooldown) and never served stale. No authentication or licensing controls are bypassed.

## Public API
Users never see sources. The public API serves **amiriChannel** only (header `X-API-Key`; the key, account and an ACTIVE unexpired subscription are checked on every request): `GET /api/v1/amiri/<name>` (one channel per request, by its name/slug; there is no endpoint that lists or returns all channels) → `{channel, id, slug, mpd_url, token, clearkey, clearkeys, expires_at}` (`?format=text` for plain lines). Errors: `401`, `403`, `404`, `429`, `503`. The old `/api/v1/channel…` endpoints were removed. See `/docs`.

## Pages (each section has its own URL)
User: `/dashboard`, `/dashboard/api-key`, `/dashboard/pay` (choose a package and pay), `/dashboard/payments`, `/dashboard/usage`, `/dashboard/security`. Admin: `/admin`, `/admin/users`, `/admin/packages`, `/admin/channels`, `/admin/amiri`, `/admin/proxy`, `/admin/payments`, `/admin/clickpesa`, `/admin/audit`. No `.html` anywhere; old `.html` and `#hash` links redirect.

## Source headers
Paste headers exactly as copied from the browser (one `name: value` per line, DevTools/curl `-H` formats also work) or as JSON. Cookie, referer, sec-ch-ua*, sec-fetch-*, user-agent, accept-language, etc. are all sent. `accept-encoding` is sent as `identity` (no compression) by default because it is the most robust on small hosts; set `SOURCE_ALLOW_COMPRESSION=true` to allow gzip/deflate (decoded in memory with a size cap; br/zstd are never requested). Host, content-length and connection headers are always controlled by the server. Values are encrypted at rest and never shown again.

## Endpoints
Sources (Admin → Channels) are internal: they only supply tokens and have no public endpoint. Each amiriChannel has its own `slug` and numeric `id`; the slugs `all` and `list` are reserved. Pages use clean URLs (`/login`, `/dashboard`, `/docs`); `*.html` redirects.

## Admin grants and refresh interval
* Admin → Watumiaji → **Weka kifurushi**: give a user a package (optional custom days) without payment; choose to extend the running one or replace it now. **Toa kifurushi** ends it immediately and switches the key off. Both are audited (`SUBSCRIPTION_GRANT`/`SUBSCRIPTION_REVOKE`).
* The top-right profile button (user and admin) opens the account menu: details, change password, docs, logout.
* Each source has `interval_minutes` (default 3, 1–60). Active sources are requested immediately on save and then every interval by the minute scheduler. **Runs even when nobody opens the site:** on Wasmer Edge add the `jobs:` block from `app.yaml.example` to your `app.yaml` (platform cron calls `/api/cron/tick` every minute with header `x-cron-secret` = `CRON_SECRET`; it wakes the app and requests every source that is due). Any external cron (cron-job.org, GitHub Actions) works the same way.

## Deployment
* Any host with Node + PostgreSQL (VPS, Render, Railway, Fly, cPanel Node app...). Set the env vars from `.env.example` (`NODE_ENV=production`, `TRUST_PROXY=1` behind a proxy).
* **HTTPS is required** in production (cookies are `Secure`; HTTP is redirected). Terminate TLS at your proxy/host.
* Start command: `npm start` (migrations run on boot and are safe to run concurrently). Run one instance, or keep scheduled jobs on one (jobs are idempotent but wasteful on many).
* Process manager example: `pm2 start src/server.js --name channel-api`.
* **Backups**: schedule `pg_dump -Fc "$DATABASE_URL" > backups/channel_$(date +%F).dump` daily (cron) and copy off-server. Keep `ENCRYPTION_KEY` backed up separately: without it stored ClickPesa/source secrets cannot be decrypted.

## WhatsApp button
Admin → WhatsApp: set only the support number (Tanzanian or international). The floating WhatsApp button appears on the customer dashboard only (message pre-filled with the customer's name and phone); remove the number to hide it. Public endpoint: `GET /api/public/contact` (number + greeting only).

## Emergency switch
If the app keeps restarting because of a background job, set the env var `DISABLE_SCHEDULER=true`: the app starts without background jobs (and `/api/cron/tick` does nothing) so you can open the admin panel and fix or disable the source. Remove the variable afterwards.

## Speed
Static files are compressed once at start-up (brotli/gzip, ~75% smaller) and served from memory with ETag/304 caching; admin statistics run their queries in parallel; the session check and page data load at the same time; password hashing cost defaults to 10 (`BCRYPT_COST`, 8–14; old hashes keep working). The every-minute platform cron also keeps the Wasmer instance warm.

## Rate limits (public channel API)
By default, `/api/v1/channel`, `/api/v1/amiri/{slug}` and `/api/v1/amiri/all` have **no request-volume limit**: a successful request from a valid API key is never throttled (`API_RATE_LIMIT_PER_MIN=0`, the default). Set `API_RATE_LIMIT_PER_MIN` to a positive number (e.g. `120`) to re-enable a per-key-per-minute cap. Admin login, password reset and payment endpoints keep their own brute-force limits regardless (unrelated to this setting).

Taking a channel has **no per-visitor limit of any kind**: not on `/api/v1/...` (channel/amiri lookup) and not on `/p/<token>/...` (the streaming proxy itself). Neither route applies any rate limiter any more — not a request-volume cap, and not even the "an IP that keeps guessing unknown keys/tokens gets blocked for a while" protection, which used to sit in front of both (removed on request). An unknown key or token still simply gets its normal 401/404 answer; it just no longer counts toward anything that could later block other requests.

Two such limiters (`badKeyLimiter` for `/p/...` tokens, `badApiKeyLimiter` for `/api/v1/...` keys) are still defined in `src/middleware/rateLimit.js` for optional future use, each scoped to count **only the exact status that signals a guess** (401 for a wrong API key, 404 for an unknown proxy token) and nothing else — so re-enabling one later, by adding it back on a route, would never again catch an unrelated failure like a channel source being temporarily down (503) or an account being suspended (403), the way the old version did. If you ever want one of these back (e.g. to slow down someone systematically guessing tokens), say so and I'll wire it back into that route.

Admin login, password reset and payment endpoints are unrelated to any of this and keep their own brute-force limits regardless. If requests behind a reverse proxy (Wasmer) all appear as one IP, `TRUST_PROXY=1` still matters for those limiters (and for correct IPs in logs), even with the channel-side limiters removed.

Separately (not a rate limit), the server caps how many `/p/...` relay connections it holds open **at once, across all channels and viewers combined** (`PROXY_MAX_ACTIVE`, default `500`, previously a fixed `80`); past that cap a request gets `503 Seva ina shughuli nyingi` until another connection frees up. Raise `PROXY_MAX_ACTIVE` further if you expect many simultaneous viewers.

## Agent (restricted admin role)
An admin can promote any existing user to **Agent** from Watumiaji → menu (⋯) on their row → "Fanya Agent", or
revoke it again from the "Agents" card at the top of the same page. An agent signs in through the normal
login form (no separate URL) and lands on `/admin`, same as an admin, but with a cut-down panel: only
**Channels** (source extraction) and **Proxy link** are in the nav and actually work — every other
`/api/admin/*` endpoint (Watumiaji, Vifurushi, Malipo, ClickPesa, Mipangilio, Audit Logs, amiriChannel,
beinProxy) answers `403` for an agent, enforced server-side regardless of what the client shows. An agent can
fully create/edit/delete sources and proxy channels, including switching which source a proxy channel takes
its token from and the "Source ya link zote" bulk action. Agent sign-ins go through the same admin IP
allowlist (`ADMIN_ALLOWED_IPS`) and shorter session lifetime as a full admin, and are logged (`AGENT_LOGIN`),
same as everything else an agent does in `/admin` (recorded in Audit Logs under the agent's own account, same
as any admin action). Revoking an agent (or promoting one) immediately invalidates any session they already
have, so a revoked agent is logged out at once rather than at next expiry.

## Security summary
bcrypt (cost 10 by default, configurable) passwords • HTTP-only SameSite=Strict session cookie + per-session CSRF header • role re-read from DB on every request • API keys: 256-bit random, HMAC-hashed, shown once • rate limits (global, auth, per-key) • strict CSP/Helmet • parameterized SQL only • SSRF protection • AES-256-GCM secrets • audit logs • log retention jobs.

## Scheduled jobs
Every minute: expire subscriptions + deactivate keys, reconcile pending payments, mark expired channel values, refresh sources that are due (per-source interval, default 3 min); daily 03:15: log retention. Request-time checks enforce expiry even if jobs are down.

## Tests
`npm test` (unit tests, no database needed). Manual checklist before go-live: register, duplicate phone, user/admin login, password reset (admin issues code), regenerate/revoke key, create package, small live ClickPesa payment, webhook delivery, subscription expiry, invalid key (401), expired (403), rate limit (429), non-admin on `/api/admin/*` (403), restart the server.

## Password reset flow
User requests reset (generic answer, no account enumeration) → admin verifies the person and issues a one-time code (30 min, shown once, hash stored) → user sets a new password with phone + code. To automate, send the code by SMS inside `issueReset()`.

## Proxy link (admin) — m3u8 / m4s

`/admin/proxy` lets the admin add HLS (`m3u8`) or DASH/fMP4 (`m4s`) channels in four types: **m3u8**, **m3u8 + header**, **m4s**, **m4s + header**.
Each channel gets a link `https://<site>/p/<token>/stream.m3u8` (or `stream.mpd`). Only the admin sees and copies it in the panel; users never see these.

- The link never points to the source. The server fetches the playlist, rewrites every segment/key/sub-playlist URL to `/p/<token>/…` (the real URLs are sealed with AES-256-GCM inside the link) and relays the bytes unchanged. Headers (referer, cookie, user-agent …) are stored encrypted and sent only upstream.
- Safety: authorized sources only (checkbox is required), http and https accepted (http ports 80/8080/8000/8008/8081/8888; plain http is not encrypted, so only use it for sources that offer nothing else), **every host used by the stream (playlist and segment CDNs) must be in the allowed-hosts list** (`/admin/channels` → Allowed hosts), private IPs blocked, DNS pinned, redirects re-checked, size/time caps. DRM and licence data are passed through untouched.
- The link is a secret: anyone who has it can play the stream. Use **Link mpya** to revoke it. Streaming uses your hosting bandwidth.
- DASH note: relative segment paths work; manifests with absolute `media=`/`initialization=` URLs are not rewritten.
- **ClearKey:** for m4s channels the admin can add `kid:key` lines, or press **"Tengeneza"** to generate a brand-new pair in the browser (16 random bytes each, so `kid` and `key` always come out exactly 32-by-32 hex — nothing to type or get wrong by hand). The proxied MPD then contains a ClearKey license URL (`/p/<token>/clearkey`, W3C JSON format) so players get the key by themselves; the keys and license URL also show on the card for copying. Keys are stored encrypted. The server still rejects anything that isn't exactly 32 hex characters on each side, whether generated or typed.
  - The license response (`/p/<token>/clearkey`) keeps the standard W3C ClearKey shape (`keys: [{ kty, kid, k }]` with `kid`/`k` base64url — this part must stay base64url, or EME players such as Shaka/dash.js/ExoPlayer's MediaDrm can no longer decrypt) and now also includes **`kid32`/`key32`** on each entry: the exact same values as plain 32-character hex, for any player or tool that reads raw hex instead of base64url.
- **Chanzo cha link ("Kutoka Source"):** instead of typing a fixed Source URL, the admin can pick "Kutoka Source" and choose one of the sources already set up under Channels. Paste the real link once (same `{token}` detection as amiriChannel: marker, current stored token, or the source's `tokenRegex`), and from then on the server fills in that source's **live, freshly-refreshed token on every single request** to `/p/<token>/stream.m3u8|mpd` — a token rotation at the source needs no admin action here. If the source cannot produce a token right now, the proxy answers `503` rather than relaying a stale or placeholder link. Switch a channel back to a fixed link at any time ("Link moja kwa moja").
- **One source for every "Kutoka Source" link:** the card "Source ya link zote 'Kutoka Source'" on `/admin/proxy` changes the token source of every proxy channel that is set to a source, in one action (`PUT /api/admin/proxy/source-all`, audited as `PROXY_SOURCE_ALL`). Each channel's link/template stays exactly as pasted; only which source supplies the live token changes. Channels still using a fixed, admin-typed `source_url` are never touched by this.

## amiriChannel (admin) — MPD link with the stored token + ClearKey

`/admin/amiri`: the admin pastes a **full MPD link**, chooses the **source** that supplies the token, and adds the **ClearKey** (`kid:key`).
The server finds the token part of the link (1: the `{token}` marker if you typed it, 2: the source's current stored token, 3: the source's `tokenRegex`) and replaces it with the current token on every request. The token is refreshed by the normal source extraction (every few minutes); an expired token is never served.

- Admin: Copy the link (with the real current token), the ClearKey, or both. The list shows the link with the token masked.
- API (needs the same `X-API-Key` and active subscription): `GET /api/v1/amiri/<name>` → `{ channel, id, slug, mpd_url, token, clearkey, clearkeys, expires_at }`; `?format=text` also works.
- The link host must be in Allowed hosts (http or https) and the authorization checkbox is required. Link template and ClearKey are stored encrypted.
- **Fresh token on every request:** each call to `/api/v1/amiri/<name>` makes the channel's source look for a new token first, then answers with it. A request that arrives while a fetch is already running shares that fetch. **Tokens never expire** (neither at the source nor in amiriChannel): the last stored token is kept and served until a new one is successfully requested, whatever its `exp` says. `503` only when no token has ever been stored (set `AMIRI_ALLOW_STALE=false` for strict mode: 503 whenever the fresh fetch fails; `AMIRI_MIN_REFRESH_SECONDS=N` lets requests within N seconds share one fetch to protect the source).
- **One source for all channels:** on `/admin/amiri` the card "Source ya channel zote" changes the token source of every amiriChannel at once (`PUT /api/admin/amiri/source-all`, audited as `AMIRI_SOURCE_ALL`). Each channel's link stays the same; only the source that supplies the token changes.

## Security
See `SECURITY.md` (protections, settings `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`, `ADMIN_SESSION_HOURS`, `ADMIN_ALLOWED_IPS`, and the deployment checklist). Migration 009 adds the lockout columns.

## Sources accept any MPD link
A source URL that ends in `.mpd` is accepted from **any public host** (http or https). It is not fetched: the token is read from the link (your `tokenRegex`, else a common parameter such as `token`/`hdnts`, else the query string) and the expiry is fixed when the link is first saved (`expiryParam` or `tokenTtlSeconds`), so it goes EXPIRED on time; paste a new link to renew. Links to localhost, internal networks or private IPs, and links with a username/password, are refused. Any other source (a page this server contacts) has its host added to the allowlist automatically when you confirm authorisation. amiriChannel links are also accepted from any public host.
- **`tok_` + JWT tokens** (`tok_eyJ….….…`): the default `tokenRegex` takes the whole token (dots included) from the MPD link, **or from the response body** when the MPD link has none (a source may return only the token; then no MPD is stored and amiriChannel supplies the link). If the token is a JWT, its own `exp` claim is used as the expiry (only that number is read); otherwise `expiryParam` / `tokenTtlSeconds`.
- **The whole response is searched for the MPD link** (body and the `Location`/`Link` headers of a redirect, which is not followed): plain text, JSON/HTML-escaped (`\/`, `/`, `&amp;`), percent-encoded, inside base64 or JWT parts, in attributes/scripts, absolute, protocol-relative or relative to the source URL. Every link found is read; the first one that carries a token is used (default `tok_…`, your `tokenRegex`, percent-encoded tokens, or a common parameter such as `token`/`hdnts`). A response that is itself an MPD file uses the source URL. Links to internal addresses are ignored.
- **Two token styles work by default:** `tok_…` and `?cdntoken=<JWT>` (also `token`, `hdnts`, … and any parameter holding a JWT; or `cdntoken` inside the response body). The JWT's `exp` becomes the expiry. Note: some providers bind a token to the IP/session that requested it (e.g. a `sip` or `max_sessions` claim). Such a token may not play for viewers on other connections; this system does not work around those provider rules.
- **amiriChannel follows your example:** the token goes exactly where it was in the link you pasted. `…/live/tok_<…>/ch/index.mpd` keeps `tok_` in the middle of the path; `…/ch.mpd?cdntoken=<JWT>` keeps the bare token at the end. The style is remembered too: if the source gives a bare value for a `tok_` link, `tok_` is added; if it gives `tok_<JWT>` for a `cdntoken=` link, the prefix is removed. (Typing `{token}` yourself puts the value in unchanged.)
- **Every token in the response is stored, by type** (migration 010, encrypted): `tok` (`tok_…`), `cdntoken` (or another parameter name such as `token`/`hdnts`), `jwt` (any other JWT), `custom` (your `tokenRegex`). Each keeps its own expiry (JWT `exp`); the channel is valid until the first of them expires. The source card shows the kinds found (names only). An amiriChannel takes the stored token that fits its link: `tok_` in the middle → the `tok` token, `cdntoken` at the end → the `cdntoken` (falling back to the primary token when that kind is absent).
- **cdntoken alone is the token:** from an MPD link such as `…/Ch.mpd?cdntoken=<JWT>` only the value of `cdntoken` is stored as the token (not the rest of the link); it beats `tok_…` when both exist. Rule `tokenParam` names another parameter instead; your own `tokenRegex` always wins.
- **Old pre-filled rule:** earlier versions pre-filled the source form with `tokenRegex: (tok_…)`, which made a `cdntoken` link fail with "token haikupatikana kwa tokenRegex". That value is now treated as "no custom rule" (also for sources already saved), the form no longer pre-fills it, and a custom `tokenRegex` that finds nothing falls back to automatic detection.
- **`tok_=<token>` path style:** a link like `https://host/tok_=<JWT>/live/…/Channel.mpd` is understood both ways. In amiriChannel the token is put right after `tok_=` exactly as in your example (`tok_=tok_…` can never happen); from a source response the value after `tok_=` is read as a token (type `tok_=`).
- **The cdntoken goes into the tok_ place:** whatever the style of the amiriChannel link (`tok_=<…>` or `tok_<…>`), the `cdntoken` found at the source is the token put there. Only when the source has no cdntoken is another stored token used (a `tok_` one first, then any JWT).
- **Exact link, nothing added:** a stored token never brings its own label into an amiriChannel link (`tok_`, `tok_=`, `cdntoken=` in front of it are removed), so the result is exactly `…mpd?cdntoken=<JWT>`. Each amiriChannel card now lists the token kinds its source holds and warns when the link wants a `cdntoken` the source does not have.

## beinProxy
Admin → **beinProxy**: paste one m3u8 link (http or https, any public host, signed `?t=...&e=...` links included), tick the authorization box and press **Tengeneza proxy link**. The server stores it (migration 011, `proxy_channels.quick`) and gives a copyable `/p/<token>/stream.m3u8`. The relay follows redirects, rewrites every segment/sub-playlist through the proxy and carries the playlist's `t`/`e` query to segments that have none. Optional **headers** (referer, user-agent, cookie... as lines or JSON) can be set when adding and changed later; they are stored encrypted and never shown again. The source link is never shown to users. When the source link expires (`e=`), use **Badilisha link**: the proxy link stays the same.

## Token kinds
Only two kinds of token are read by a source and by amiriChannel: **`tok_`** (`tok_<..>` or `tok_=<..>`, trailing `==` kept) and **`cdntoken`** (`?cdntoken=<JWT>`). Other parameters or opaque parts are ignored. For anything else, set your own `tokenRegex` in the source rules or put `{token}` in the amiriChannel link.

## amiriChannel logo
Each amiriChannel can have a logo, set either way:
- **Link**: paste an `http://` or `https://` image URL. It is never fetched by the server, only shown by the admin's own browser.
- **Upload**: pick a PNG/JPEG/WEBP/GIF under 350KB. It is sent as raw bytes to `POST /api/admin/amiri/:id/logo` (not through the normal JSON API, so the 50KB JSON body limit does not apply), base64-encoded and stored as a `data:` URI in the database — nothing is written to disk, which matters on hosts with an ephemeral or read-only filesystem (e.g. Wasmer).
A new channel is created first (without the file), then the picked file is uploaded right after, once its id exists. Clear the logo with "-" in the link field or the remove button.
