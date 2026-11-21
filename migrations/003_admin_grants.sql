-- Admin-granted subscriptions (no payment). granted_by is NULL for paid subscriptions.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES users(id) ON DELETE SET NULL;
