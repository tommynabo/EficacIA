-- Migration: Add campaign engine columns to leads table
-- Run this in Supabase SQL editor

-- Track which sequence step each lead is on and when the next action should fire
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sequence_status TEXT DEFAULT 'pending'
  CHECK (sequence_status IN ('pending', 'active', 'completed', 'failed', 'replied'));

-- Add job_title alias if it doesn't exist (some leads use position, others job_title)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Add campaign.sequence column if it doesn't exist (JSON array of steps)
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sequence JSONB DEFAULT '[]';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Index for the cron engine to efficiently find leads ready to process
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON public.leads (next_action_at)
  WHERE next_action_at IS NOT NULL AND sequence_status = 'active';

CREATE INDEX IF NOT EXISTS idx_campaigns_active ON public.campaigns (status)
  WHERE status = 'active';
