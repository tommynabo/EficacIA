-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Premium B2B Features
-- Adds: leads.tags, leads.sequence_paused,
--       linkedin_accounts.auto_withdraw_invites, linkedin_accounts.withdraw_after_days
-- Run once against your Supabase project via the SQL editor or CLI.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. leads: mini-CRM tags (array of strings stored as JSONB)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- 2. leads: pause automated sequence for this specific lead
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sequence_paused BOOLEAN NOT NULL DEFAULT false;

-- 3. linkedin_accounts: auto-withdraw pending invitations feature
ALTER TABLE public.linkedin_accounts
  ADD COLUMN IF NOT EXISTS auto_withdraw_invites BOOLEAN NOT NULL DEFAULT false;

-- 4. linkedin_accounts: after how many days should pending invites be withdrawn
ALTER TABLE public.linkedin_accounts
  ADD COLUMN IF NOT EXISTS withdraw_after_days INTEGER NOT NULL DEFAULT 15;

-- Indexes for common filter queries
CREATE INDEX IF NOT EXISTS idx_leads_sequence_paused ON public.leads(sequence_paused);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_auto_withdraw ON public.linkedin_accounts(auto_withdraw_invites);
