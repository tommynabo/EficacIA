-- Migration: Plan billing — subscription status enum + AI credits defaults
-- Adds 'growth' and 'scale' to the allowed subscription_status values, and
-- raises the ai_credits default to 1000 to cover trials and new sign-ups.

-- 1. Drop the old CHECK constraint (may have been auto-named by Postgres).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_status_check;

-- 2. Normalise any rows that contain non-canonical Stripe statuses (e.g.
--    'active', 'trialing', 'canceled', 'incomplete', etc.) to a valid plan
--    value so the new constraint will not reject them.
UPDATE public.users
SET subscription_status = CASE
  WHEN subscription_status IN ('free', 'pro', 'growth', 'scale', 'scale_oferta', 'enterprise') THEN subscription_status
  WHEN subscription_status IN ('active', 'trialing', 'past_due', 'incomplete', 'incomplete_expired') THEN 'pro'
  ELSE 'free'
END
WHERE subscription_status NOT IN ('free', 'pro', 'growth', 'scale', 'scale_oferta', 'enterprise')
   OR subscription_status IS NULL;

-- 3. Add the updated constraint with all valid plan values.
ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('free', 'pro', 'growth', 'scale', 'scale_oferta', 'enterprise'));

-- 4. Change the column default so new trial accounts start with 1000 credits.
ALTER TABLE public.users
  ALTER COLUMN ai_credits SET DEFAULT 1000;

-- 5. Give existing users with 0 credits 1000 as a one-time trial grant.
UPDATE public.users
SET ai_credits = 1000
WHERE ai_credits = 0;
