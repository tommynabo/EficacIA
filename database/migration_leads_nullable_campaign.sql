-- Allow leads to exist without a campaign (for Unibox CRM tagging of untracked contacts)
ALTER TABLE public.leads ALTER COLUMN campaign_id DROP NOT NULL;

-- Add 'ignored' and 'blocked' statuses for contacts managed from Unibox
-- NOT VALID skips checking existing rows (avoids failure if legacy status values exist)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'accepted', 'rejected', 'error', 'ignored', 'blocked'))
  NOT VALID;
