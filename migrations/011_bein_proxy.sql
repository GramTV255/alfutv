-- beinProxy: quick HLS links. The admin pastes one m3u8 link (any public host, incl. signed ?t=..&e=.. links) and gets a proxy link.
ALTER TABLE proxy_channels ADD COLUMN IF NOT EXISTS quick BOOLEAN NOT NULL DEFAULT FALSE;
