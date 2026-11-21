-- Agent: a restricted admin-style role. An admin can promote an existing user to AGENT; an agent can sign in
-- to /admin and may only see/manage "source" extraction (channel_sources, under /admin/channels) and proxy
-- channels (under /admin/proxy, including which source a proxy channel takes its token from) - nothing else
-- in the admin panel (users, packages, payments, settings, audit, amiriChannel, beinProxy stay ADMIN-only).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN', 'AGENT'));
