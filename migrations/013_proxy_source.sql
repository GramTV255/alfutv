-- proxyChannels: admin may pick a "source" (channel_sources) instead of typing/maintaining a fixed source_url
-- by hand. When source_id is set, the stream URL is built from source_template_enc (a link with a {token}
-- marker, same mechanism as amiriChannel) filled in with that source's live, freshly-refreshed token on every
-- request - so a token rotation at the source is picked up automatically, with nothing to update by hand.
ALTER TABLE proxy_channels ADD COLUMN IF NOT EXISTS source_id INTEGER REFERENCES channel_sources(id) ON DELETE SET NULL;
ALTER TABLE proxy_channels ADD COLUMN IF NOT EXISTS source_template_enc TEXT;
-- source_url stays required when there is no source_id (admin typed a fixed link); not required when source_id is set.
ALTER TABLE proxy_channels ALTER COLUMN source_url DROP NOT NULL;
ALTER TABLE proxy_channels DROP CONSTRAINT IF EXISTS proxy_channels_source_check;
ALTER TABLE proxy_channels ADD CONSTRAINT proxy_channels_source_check
  CHECK ((source_id IS NULL AND source_url IS NOT NULL) OR (source_id IS NOT NULL AND source_template_enc IS NOT NULL));
