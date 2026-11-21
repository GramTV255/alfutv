-- 002: per-source fetch interval (default every 3 minutes) + stored MPD link and ClearKey (both encrypted)
ALTER TABLE channel_sources ADD COLUMN interval_minutes INTEGER NOT NULL DEFAULT 3 CHECK (interval_minutes BETWEEN 1 AND 60);
ALTER TABLE channel_sources ADD COLUMN last_fetch_at TIMESTAMPTZ;
ALTER TABLE channels ADD COLUMN mpd_url_enc TEXT;
ALTER TABLE channels ADD COLUMN clearkey_enc TEXT;
