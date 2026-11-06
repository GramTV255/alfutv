-- "all" is the endpoint for every source (/api/v1/channel/all)
UPDATE channel_sources SET slug = 'all-' || id WHERE slug = 'all';
