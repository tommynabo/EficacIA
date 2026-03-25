-- Migration: Conversation Temperature
-- Adds AI-powered conversation temperature analysis ("cold" / "warm" / "hot")
-- to the leads table, plus an index to accelerate Unibox filtering.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conversation_temperature VARCHAR(20) DEFAULT 'cold';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_analysis_at TIMESTAMP WITH TIME ZONE;

-- Fast filtering in the Unibox sidebar
CREATE INDEX IF NOT EXISTS idx_leads_conversation_temperature
  ON public.leads(conversation_temperature);

-- Optional: constrain to known values (comment out if you need flexibility)
-- ALTER TABLE public.leads
--   ADD CONSTRAINT leads_conversation_temperature_check
--   CHECK (conversation_temperature IN ('cold', 'warm', 'hot'));
