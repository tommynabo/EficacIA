-- ─── Lifetime Extension Tokens ─────────────────────────────────────────────
-- Adds a permanent, non-expiring token to every user so the Chrome extension
-- never hits 401 due to JWT expiration.

-- 1. Add the column (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS extension_token TEXT UNIQUE;

-- 2. Backfill: generate a UUID token for every existing user that doesn't have one
UPDATE users SET extension_token = gen_random_uuid()::text WHERE extension_token IS NULL;

-- 3. Fast index for auth lookups (O(1) instead of full-table scan on every request)
CREATE INDEX IF NOT EXISTS idx_users_extension_token ON users(extension_token);
