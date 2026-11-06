-- amiriChannel: MPD links whose token part is replaced at request time by the token stored from a channel source.
CREATE TABLE IF NOT EXISTS amiri_channels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(60) NOT NULL UNIQUE,
  source_id INTEGER NOT NULL REFERENCES channel_sources(id) ON DELETE CASCADE,
  template_enc TEXT NOT NULL,            -- link with {token} where the token goes (encrypted)
  clearkey_enc TEXT,                     -- "kid:key,kid:key" (encrypted)
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
