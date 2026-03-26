-- Migration: Launch Prep
-- Adds columns required for:
--   - Growth Annual / Scale plans (unlimited AI credits with optional expiry)
--   - LinkedIn account add-on slots (max_linkedin_accounts per user)
-- Run once against the production Supabase database.

-- ── Unlimited AI credits fields ──────────────────────────────────────────────
-- ai_credits_unlimited: true while the user is on an unlimited plan (Growth Annual / Scale)
-- ai_credits_unlimited_expires: set for time-limited plans (Growth Annual = 1 year), NULL = no expiry
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_credits_unlimited BOOLEAN DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_credits_unlimited_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ── Extra LinkedIn account add-on ────────────────────────────────────────────
-- max_linkedin_accounts: overrides plan default when the user buys extra slots.
-- NULL means "use the plan's default limit" (no override). 1 = Starter default, etc.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS max_linkedin_accounts INTEGER DEFAULT NULL;

-- ── Index for unlimited credit lookups (e.g. cron job clearing expired grants) ─
CREATE INDEX IF NOT EXISTS idx_users_ai_credits_unlimited
  ON public.users(ai_credits_unlimited)
  WHERE ai_credits_unlimited = true;

-- ── Reset expired unlimited grants (run as a scheduled job or ad-hoc) ────────
-- Update this to a cron / pg_cron setup as needed:
-- UPDATE public.users
--   SET ai_credits_unlimited = false,
--       ai_credits_unlimited_expires = NULL
-- WHERE ai_credits_unlimited = true
--   AND ai_credits_unlimited_expires IS NOT NULL
--   AND ai_credits_unlimited_expires < NOW();
