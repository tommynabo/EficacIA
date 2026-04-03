-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Enterprise-grade webhook security, anti-ban jittering & error UX
-- Purpose  : Support DB-level anti-ban throttle on linkedin_accounts and
--            ensure error_message column exists on leads for transparent UX.
-- Safe to run multiple times — all statements use IF NOT EXISTS / idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Anti-ban DB-level jitter timestamp on each LinkedIn account.
--     The campaign-engine writes NOW() + random(45-120 s) here after each
--     successful send. The next cron run skips accounts whose throttle is
--     still active, avoiding sleep() calls in serverless functions.
ALTER TABLE linkedin_accounts
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ;

-- (2) Efficient throttle check: only index rows that have a future timestamp.
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_next_action
  ON linkedin_accounts (next_action_at)
  WHERE next_action_at IS NOT NULL;

-- (3) Human-readable error message stored per lead.
--     Written by campaign-engine / send-action to explain transient or
--     permanent failures in plain language for the end user (shown in tooltip).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- (4) Index to efficiently query leads that need a retry (retry_later status).
CREATE INDEX IF NOT EXISTS idx_leads_retry_later
  ON leads (campaign_id, next_action_at)
  WHERE sequence_status = 'retry_later';
