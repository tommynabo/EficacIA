-- Add AI prompt columns to users table
-- These store the user's custom role/persona prompts for the EficacIA Assistant
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ai_prompt_sequence TEXT,
  ADD COLUMN IF NOT EXISTS ai_prompt_unibox TEXT;

COMMENT ON COLUMN public.users.ai_prompt_sequence IS 'Custom system role prompt used when the AI assistant generates messages in the Sequence Builder (cold outreach).';
COMMENT ON COLUMN public.users.ai_prompt_unibox IS 'Custom system role prompt used when the AI assistant helps reply in the Unibox (warm contacts that already responded).';
