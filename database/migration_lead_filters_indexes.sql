-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Indexes for advanced lead filtering
-- Purpose  : Support efficient filtering of leads by status, sent_message,
--            company, and email presence — used by the campaign leads view
--            with the new filter bar (status chips + "solo con email" toggle).
-- Applied  : Run once in Supabase SQL editor or via any migration tool.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Fast per-campaign lookup — base index for all lead queries scoped to a campaign
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id
  ON leads (campaign_id);

-- (2) Filter by status value (new / contacted / qualified / converted / error…)
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
  ON leads (campaign_id, status);

-- (3) Filter by "enviado" / "no enviado"  (sent_message boolean)
CREATE INDEX IF NOT EXISTS idx_leads_campaign_sent
  ON leads (campaign_id, sent_message);

-- (4) Combined status + sent (covers the most common compound filter)
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status_sent
  ON leads (campaign_id, status, sent_message);

-- (5) Partial index for "solo con email" filter — only rows that have an email
CREATE INDEX IF NOT EXISTS idx_leads_campaign_has_email
  ON leads (campaign_id)
  WHERE email IS NOT NULL AND email <> '';

-- (6) Company search support (partial index avoids indexing NULLs)
CREATE INDEX IF NOT EXISTS idx_leads_company
  ON leads (campaign_id, company)
  WHERE company IS NOT NULL;

-- (7) Full-text search on name + company for the search-bar query
--     (optional but improves performance on large lead sets)
CREATE INDEX IF NOT EXISTS idx_leads_name_company_trgm
  ON leads USING gin (
    (first_name || ' ' || last_name || ' ' || COALESCE(company, '')) gin_trgm_ops
  );

-- Note: index (7) requires the pg_trgm extension.
-- If not enabled, comment out index (7) and run:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- first, or simply skip it — the other indexes cover most filter scenarios.
