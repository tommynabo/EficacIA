-- ──────────────────────────────────────────────────────────────────
-- Migration: platform_config
-- Purpose:   Generic key-value store for platform-level settings.
--            Used by the Stripe Connect V2 thin events webhook to
--            persist account requirement updates from Stripe.
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_config (
  key        TEXT        PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index is unnecessary for a PK, but make the table visible to PostgREST
-- and protect it from public access (service-role key only via backend).
REVOKE ALL ON public.platform_config FROM anon, authenticated;
GRANT ALL  ON public.platform_config TO service_role;

COMMENT ON TABLE  public.platform_config           IS 'Platform-level key-value configuration.';
COMMENT ON COLUMN public.platform_config.key       IS 'Unique config key (e.g. connect_account_requirements).';
COMMENT ON COLUMN public.platform_config.value     IS 'JSON or plain-text value.';
COMMENT ON COLUMN public.platform_config.updated_at IS 'Last time this row was written.';
