-- amiriChannel: optional logo, either an external link (http/https) or an uploaded image stored as a data: URI.
ALTER TABLE amiri_channels ADD COLUMN IF NOT EXISTS logo_url TEXT;
