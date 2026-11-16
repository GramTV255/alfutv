CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
INSERT INTO roles(name) VALUES ('admin'),('user') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS channel_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  category_id INT REFERENCES channel_categories(id) ON DELETE SET NULL,
  stream_url TEXT NOT NULL,
  stream_type TEXT NOT NULL DEFAULT 'M3U8' CHECK (stream_type IN ('M3U8','MPD','M3U8_HEADERS','MPD_HEADERS')),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_type TEXT NOT NULL DEFAULT 'FREE' CHECK (access_type IN ('FREE','PAID')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  popular BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL CHECK (price >= 500),
  duration_days INT NOT NULL CHECK (duration_days > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_channels (
  package_id INT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, channel_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  package_id INT NOT NULL REFERENCES packages(id),
  order_id TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'clickpesa',
  provider_reference TEXT UNIQUE,
  phone TEXT,
  amount INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','VOIDED','EXPIRED','REVIEW')),
  fee_amount INT,
  net_amount INT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id INT NOT NULL REFERENCES packages(id),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED')),
  payment_id BIGINT UNIQUE REFERENCES payments(id),   -- inazuia subscription mbili kwa malipo moja
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS payouts (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'clickpesa',
  provider_reference TEXT UNIQUE,
  idempotency_key TEXT UNIQUE NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone_or_account TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('mobile','bank')),
  bank_code TEXT,
  amount INT NOT NULL,
  fee INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TZS',
  status TEXT NOT NULL DEFAULT 'PENDING',
  narration TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider TEXT PRIMARY KEY,
  api_key_enc TEXT,
  webhook_secret_enc TEXT,
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,                           -- inazuia usindikaji wa mara mbili
  event_type TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- ClearKey kwa channel za MPD: { kid_hex: key_hex }
ALTER TABLE channels ADD COLUMN IF NOT EXISTS clearkey JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS sliders (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_data BYTEA,
  image_type TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sliders ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE sliders ADD COLUMN IF NOT EXISTS button_text TEXT NOT NULL DEFAULT 'TAZAMA SASA';

-- Channel moja: bei + muda; malipo ya channel
ALTER TABLE channels ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS price_days INT NOT NULL DEFAULT 30;
ALTER TABLE payments ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES channels(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS channel_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUSPENDED')),
  payment_id BIGINT UNIQUE REFERENCES payments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_user ON channel_purchases(user_id);

-- Aina mpya ya stream: API (endpoint inayorudisha HTML/JSON yenye link + ClearKey)
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_stream_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_stream_type_check CHECK (stream_type IN ('M3U8','MPD','M3U8_HEADERS','MPD_HEADERS','API'));

-- Safisha mipangilio ya FastLipa (imeondolewa kwenye mfumo)
-- (imeondolewa: DELETE ya kila startup ilifuta mipangilio)

-- ClickPesa: Client ID (kwa usimbaji)
ALTER TABLE payment_provider_settings ADD COLUMN IF NOT EXISTS client_id_enc TEXT;

-- Mpangilio wa channel ndani ya category (ndogo inaonekana kwanza)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;



-- Proxy Link: jedwali kuu (linatumiwa na proxy-admin.js na proxy.js)
CREATE TABLE IF NOT EXISTS proxy_links (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('M3U8','M3U8_HEADERS','MPD','MPD_HEADERS','API')),
  source_url TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proxy Link: hakikisha safu zote zipo (kwa databases za zamani)
ALTER TABLE proxy_links ADD COLUMN IF NOT EXISTS token TEXT NOT NULL DEFAULT '';
ALTER TABLE proxy_links ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE proxy_links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE proxy_links ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Snippe imeondolewa
-- (imeondolewa: DELETE ya kila startup ilifuta mipangilio)
-- (imeondolewa: DELETE ya kila startup ilifuta mipangilio)

-- Mechi: kila mechi ina channel ya kuonyeshwa
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  kickoff_at TIMESTAMPTZ NOT NULL,
  channel_id INT REFERENCES channels(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_at);

-- Bei ya mechi: malipo ya mechi na ufikiaji wa mechi
ALTER TABLE matches ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS match_id INT REFERENCES matches(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS match_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  payment_id BIGINT UNIQUE REFERENCES payments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mp_user ON match_purchases(user_id, match_id);

-- Channel za mechi: zinaishi kwa ajili ya mechi hiyo tu, na zinafutwa mechi ikifutwa
ALTER TABLE channels ADD COLUMN IF NOT EXISTS match_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS match_id INT REFERENCES matches(id) ON DELETE CASCADE;

-- Mpangilio wa mechi (namba ndogo inaonekana kwanza)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Arifa: kikundi cha kutuma na muda wa kusomwa (admin anaona waliosoma)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notif_batch ON notifications(batch_id);

-- Muda kwa dakika (kifurushi na channel). Ikiwa NULL, siku (duration_days/price_days) hutumika.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS price_minutes INT;

-- Hakikisha jedwali la mipangilio ya malipo lipo na safu zote (kwa databases za zamani)
CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider TEXT PRIMARY KEY,
  api_key_enc TEXT,
  webhook_secret_enc TEXT,
  client_id_enc TEXT,
  last_test_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE payment_provider_settings ADD COLUMN IF NOT EXISTS client_id_enc TEXT;

-- Apps za kupakua (faili kwenye database, ili zisipotee seva inapoanza upya)
CREATE TABLE IF NOT EXISTS app_releases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  version TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INT NOT NULL DEFAULT 0,
  data BYTEA NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Picha za skrini za app (Play Store style)
CREATE TABLE IF NOT EXISTS app_screenshots (
  id SERIAL PRIMARY KEY,
  release_id INT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  size INT NOT NULL,
  data BYTEA NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_shots ON app_screenshots(release_id);

-- Logo ya app (picha moja, inajaza sehemu ya ikoni)
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS logo_mime TEXT;
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS logo_data BYTEA;

-- Muonekano wa Store: maelezo ya app, banners, sehemu (tabs), na maoni
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS developer TEXT NOT NULL DEFAULT '';
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1);
CREATE TABLE IF NOT EXISTS store_banners (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', bg_color TEXT NOT NULL DEFAULT '#6aa86a',
  release_id INT REFERENCES app_releases(id) ON DELETE SET NULL, image_mime TEXT, image_data BYTEA,
  position INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS store_sections (
  id SERIAL PRIMARY KEY, tab TEXT NOT NULL DEFAULT 'Featured', title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'row' CHECK (kind IN ('row','list')), position INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS store_section_apps (
  section_id INT NOT NULL REFERENCES store_sections(id) ON DELETE CASCADE,
  release_id INT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0, PRIMARY KEY (section_id, release_id));
CREATE TABLE IF NOT EXISTS app_reviews (
  id SERIAL PRIMARY KEY, release_id INT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  author TEXT NOT NULL, rating NUMERIC(2,1) NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Bei ya app na malipo yake (tofauti na vifurushi/channels/mechi)
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS price INT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS app_release_id INT REFERENCES app_releases(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS app_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INT NOT NULL REFERENCES app_releases(id) ON DELETE CASCADE,
  payment_id BIGINT UNIQUE REFERENCES payments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, release_id));

-- Aina ya faili ya upload (app, hati, zip, nyingine)
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS file_kind TEXT NOT NULL DEFAULT 'app';

-- Promo codes: mwenye code (akaunti tayari), wanunuzi wa vifurushi, commission ya 5% kwa miamala 3 ya kwanza
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  owner_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_code_id INT REFERENCES promo_codes(id);
CREATE TABLE IF NOT EXISTS promo_commissions (
  id BIGSERIAL PRIMARY KEY,
  code_id INT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  buyer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id BIGINT UNIQUE NOT NULL REFERENCES payments(id),
  gross INT NOT NULL, commission INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREDITED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_promo_comm_buyer ON promo_commissions(buyer_id, status);
CREATE TABLE IF NOT EXISTS promo_payouts (
  id SERIAL PRIMARY KEY,
  code_id INT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ);

-- Asilimia ya commission ya promo code (admin anaweza kuibadilisha)
CREATE TABLE IF NOT EXISTS promo_config (id INT PRIMARY KEY DEFAULT 1, rate_percent NUMERIC(5,2) NOT NULL DEFAULT 5);
INSERT INTO promo_config(id, rate_percent) VALUES (1, 5) ON CONFLICT (id) DO NOTHING;

-- Asilimia maalum kwa kila promo code (NULL = tumia asilimia ya jumla)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS rate_percent NUMERIC(5,2);

-- Asilimia maalum kwa promo code moja (NULL = inatumia asilimia ya jumla ya mfumo)


-- Payout za mkono: namba ya muamala kutoka SMS, haiwezi kutumika mara mbili
ALTER TABLE promo_payouts ADD COLUMN IF NOT EXISTS tx_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_payouts_tx ON promo_payouts(tx_ref) WHERE tx_ref IS NOT NULL;

-- SonicPesa haina makato: payout zilizopita zinasafishwa fee (deni la makato linaondoka kwenye salio)
UPDATE payouts SET fee = 0 WHERE provider = 'sonicpesa' AND fee <> 0;

-- Logo za timu mbili kwenye mechi (picha ndogo, data URL)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_logo TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_logo TEXT;

-- Aina ya ufikiaji wa mechi: FREE (bure), PRICE (bei ya mechi), PACKAGE (vifurushi vya admin)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'FREE';
UPDATE matches SET access_mode = 'PRICE' WHERE price > 0 AND access_mode = 'FREE';

-- Promo za majaribio: kifurushi cha siku 1 kwa kifaa kimoja mara moja tu
ALTER TABLE promo_codes ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'COMMISSION';
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_price_check;
ALTER TABLE packages ADD CONSTRAINT packages_price_check CHECK (price >= 0);
INSERT INTO packages(name,description,price,duration_days,active) SELECT 'Majaribio ya siku 1','Kifurushi cha majaribio (siku 1)',0,1,FALSE WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name='Majaribio ya siku 1');
CREATE TABLE IF NOT EXISTS trial_claims (device_hash TEXT PRIMARY KEY, ip TEXT, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, code_id INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Kubadilisha password kwa code ya admin
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  code_hash TEXT, expires_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), approved_at TIMESTAMPTZ, approved_by BIGINT, used_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id, status);

-- Hitilafu ya mwisho ya stream ya channel za API (admin anaiona kwenye kadi ya channel)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
