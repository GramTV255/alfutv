# alfutvpromax — TV Streaming (Node.js + PostgreSQL + ClickPesa)

## Kabla ya kupakia
1. `npm install` (inatengeneza `package-lock.json`). Tumetumia `bcryptjs` (JS safi) ili ifanye kazi bila native build.
2. Nakili `.env.example` kuwa `.env` (local) au weka variables kwenye Wasmer secrets.
3. Tengeneza PostgreSQL, weka `DB_*`. Schema inaendeshwa kiotomatiki (`AUTO_MIGRATE=true`) au `npm run migrate`.
4. `ADMIN_PHONE` + `ADMIN_PASSWORD` huunda admin wa kwanza. Ingia `/admin/index.html`.
5. `BASE_URL=https://domain-yako` (inatumika kwenye webhook_url).
6. Admin > ClickPesa Settings: weka API Key + Webhook Secret, bonyeza Test Connection.
7. Kwenye dashboard ya ClickPesa weka webhook: `https://domain-yako/webhooks/clickpesa`.
8. Angalia `https://domain-yako/api/health`.

## Notes muhimu
- Subscription inawashwa tu baada ya webhook iliyothibitishwa (HMAC) + kuthibitisha na `GET /v1/payments/{ref}` + amount/currency kulingana; `payment_id UNIQUE` na `webhook_events.event_id PK` vinazuia kurudiwa.
- Secrets za ClickPesa zinasimbwa (AES-256-GCM) kwenye DB; hazirudishwi kwenye browser.
- Payout: Idempotency-Key kila ombi; timeout -> status `PENDING_VERIFY` + kitufe cha Retry (key ile ile).
- Headers za stream (Referer n.k.) hutumwa kwa mtumiaji mwenye ruhusa; browser haziruhusu kuweka `Referer`/`User-Agent` kwenye XHR.
- ClickPesa inahitaji email ya mteja; tunajaza `user{ID}@CUSTOMER_EMAIL_DOMAIN` kwa kuwa registration haina email.
