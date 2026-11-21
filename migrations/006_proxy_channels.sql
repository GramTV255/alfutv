-- Proxy links: the admin adds HLS (m3u8) or DASH/fMP4 (m4s) streams; clients get a proxy link, never the source link.
CREATE TABLE IF NOT EXISTS proxy_channels (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  kind              VARCHAR(8)   NOT NULL CHECK (kind IN ('M3U8','M4S')),
  source_url        TEXT         NOT NULL,
  encrypted_headers TEXT,
  token_hash        CHAR(64)     NOT NULL UNIQUE,
  token_enc         TEXT         NOT NULL,
  status            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  authorized_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  authorized_at     TIMESTAMPTZ,
  hits              BIGINT       NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
