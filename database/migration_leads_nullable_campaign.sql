-- Allow leads to exist without a campaign (for Unibox CRM tagging of untracked contacts)
ALTER TABLE public.leads ALTER COLUMN campaign_id DROP NOT NULL;

-- Add 'ignored' status for contacts archived/ignored from Unibox
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'accepted', 'rejected', 'error', 'ignored'));
