-- Each source gets its own endpoint: /api/v1/channel/<id or slug>
ALTER TABLE channel_sources ADD COLUMN IF NOT EXISTS slug VARCHAR(80);
UPDATE channel_sources SET slug = trim(both '-' from lower(regexp_replace(source_name, '[^a-zA-Z0-9]+', '-', 'g'))) WHERE slug IS NULL;
UPDATE channel_sources SET slug = 'source' WHERE slug IS NULL OR slug = '';
UPDATE channel_sources SET slug = 'src-' || slug WHERE slug ~ '^[0-9]+$';
UPDATE channel_sources s SET slug = left(s.slug, 70) || '-' || s.id
  WHERE EXISTS (SELECT 1 FROM channel_sources o WHERE o.slug = s.slug AND o.id < s.id);
ALTER TABLE channel_sources ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_sources_slug ON channel_sources (slug);
