-- 001_init: core schema for Channel API System
-- gen_random_uuid() is built in since PostgreSQL 13; try pgcrypto only for older servers
DO $$ BEGIN
  PERFORM gen_random_uuid();
EXCEPTION WHEN undefined_function THEN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
END $$;

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      VARCHAR(120) NOT NULL,
  phone_number   VARCHAR(15)  NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  role           VARCHAR(10)  NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  account_status VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE','SUSPENDED')),
  token_version  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_name ON users (lower(full_name));

CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    CHAR(64) NOT NULL UNIQUE,
  key_prefix  VARCHAR(16) NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('INACTIVE','ACTIVE','REVOKED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
-- Only one non-revoked key per user
CREATE UNIQUE INDEX uq_api_keys_one_live_per_user ON api_keys (user_id) WHERE status <> 'REVOKED';

CREATE TABLE packages (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL,
  price         NUMERIC(12,0) NOT NULL CHECK (price >= 1),
  duration_days INTEGER NOT NULL CHECK (duration_days >= 1),
  status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id  INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  payment_id  UUID,
  status      VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','SUPERSEDED')),
  starts_at   TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_user ON subscriptions (user_id, status);
CREATE INDEX idx_subs_expiry ON subscriptions (status, expires_at);
CREATE UNIQUE INDEX uq_subs_one_active_per_user ON subscriptions (user_id) WHERE status = 'ACTIVE';

CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id         INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  transaction_id     VARCHAR(20) NOT NULL UNIQUE,     -- our ClickPesa orderReference (alphanumeric, <= 20 chars)
  amount             NUMERIC(12,0) NOT NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'TZS',
  payment_phone      VARCHAR(15),
  payment_status     VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PROCESSING','SUCCESS','FAILED')),
  provider_status    VARCHAR(20),
  provider_reference VARCHAR(80),
  failure_message    VARCHAR(255),
  subscription_id    UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at       TIMESTAMPTZ
);
CREATE INDEX idx_payments_user ON payments (user_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments (payment_status, created_at DESC);
CREATE INDEX idx_payments_provider_ref ON payments (provider_reference);

CREATE TABLE channel_sources (
  id                SERIAL PRIMARY KEY,
  source_name       VARCHAR(100) NOT NULL,
  source_url        TEXT NOT NULL,
  http_method       VARCHAR(6) NOT NULL DEFAULT 'GET' CHECK (http_method IN ('GET','POST')),
  content_type      VARCHAR(100),
  request_body      TEXT,
  encrypted_headers TEXT,
  extraction_rules  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            VARCHAR(10) NOT NULL DEFAULT 'DISABLED' CHECK (status IN ('ACTIVE','DISABLED')),
  authorized_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  authorized_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id               SERIAL PRIMARY KEY,
  source_id        INTEGER NOT NULL UNIQUE REFERENCES channel_sources(id) ON DELETE CASCADE, -- one channel per source
  channel_name     VARCHAR(100) NOT NULL,
  extracted_value  TEXT,
  extracted_at     TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  status           VARCHAR(10) NOT NULL DEFAULT 'EMPTY' CHECK (status IN ('EMPTY','VALID','EXPIRED','FAILED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE extraction_logs (
  id          BIGSERIAL PRIMARY KEY,
  source_id   INTEGER REFERENCES channel_sources(id) ON DELETE CASCADE,
  success     BOOLEAN NOT NULL,
  message     VARCHAR(500),
  http_status INTEGER,
  duration_ms INTEGER,
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_extraction_logs_source ON extraction_logs (source_id, created_at DESC);

CREATE TABLE admin_settings (
  id              SERIAL PRIMARY KEY,
  setting_name    VARCHAR(80) NOT NULL UNIQUE,
  encrypted_value TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_usage_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint        VARCHAR(120) NOT NULL,
  response_status INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_user ON api_usage_logs (user_id, created_at DESC);
CREATE INDEX idx_usage_created ON api_usage_logs (created_at);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(80),
  details     JSONB,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);

CREATE TABLE password_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   CHAR(64) UNIQUE,
  status       VARCHAR(10) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ISSUED','USED','CANCELLED','EXPIRED')),
  requested_ip VARCHAR(64),
  issued_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at      TIMESTAMPTZ
);
CREATE INDEX idx_pwreset_user ON password_resets (user_id, status);

CREATE TABLE webhook_events (
  id         BIGSERIAL PRIMARY KEY,
  provider   VARCHAR(20) NOT NULL DEFAULT 'CLICKPESA',
  event      VARCHAR(40),
  order_ref  VARCHAR(40),
  verified   BOOLEAN NOT NULL DEFAULT FALSE,
  outcome    VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_created ON webhook_events (created_at DESC);

-- Starter packages (admin can edit/delete them from the panel)
INSERT INTO packages (name, price, duration_days) VALUES
  ('Daily Package',   1000,  1),
  ('Weekly Package',  5000,  7),
  ('Monthly Package', 15000, 30);
