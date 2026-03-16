-- ============================================================================
-- EFICACIA AUTH & CORE TABLES
-- Copia y pega esto en Supabase SQL Editor
-- ============================================================================

-- 1. Users (Extended Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_plan TEXT DEFAULT 'free', -- free, pro, enterprise
  subscription_status TEXT DEFAULT 'active', -- active, canceled, trial
  trial_ends_at TIMESTAMP,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 3. Team Members
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- owner, admin, member
  joined_at TIMESTAMP DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- 4. LinkedIn Accounts (Scraped accounts)
CREATE TABLE IF NOT EXISTS public.linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  profile_url TEXT,
  headline TEXT,
  about TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER,
  last_scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 5. Leads (Extracted from scraping)
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  source TEXT, -- linkedin, manual, import
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  linkedin_url TEXT,
  company TEXT,
  position TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new', -- new, contacted, qualified, converted, rejected
  tags TEXT[], -- array of tags
  sequence_status TEXT DEFAULT 'pending', -- pending, active, completed, paused
  current_step INTEGER DEFAULT 0,
  next_action_at TIMESTAMP,
  last_action_at TIMESTAMP,
  sent_message BOOLEAN DEFAULT false,
  sent_at TIMESTAMP,
  error_message TEXT,
  ai_message TEXT,
  custom_vars JSONB DEFAULT '{}',
  job_title TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 6. Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft', -- draft, active, paused, completed
  template_id UUID,
  leads_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  sequence JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 7. Campaign Steps (Sequence builder)
CREATE TABLE IF NOT EXISTS public.campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL, -- linkedin_message, email, wait
  linkedin_message TEXT,
  email_subject TEXT,
  email_body TEXT,
  wait_days INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

-- 8. Campaign Activity (Logs)
CREATE TABLE IF NOT EXISTS public.campaign_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- message_sent, email_sent, response_received
  action_details JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- 9. Payments / Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending', -- pending, paid, failed
  created_at TIMESTAMP DEFAULT now(),
  due_at TIMESTAMP,
  paid_at TIMESTAMP
);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) - Activate for production
-- ============================================================================

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Teams: Users can read teams they're members of
CREATE POLICY "Users can read their teams"
  ON public.teams FOR SELECT
  USING (
    owner_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

-- Team Members policy
CREATE POLICY "Users can read team members"
  ON public.team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teams 
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    ) OR user_id = auth.uid()
  );

-- Leads: Team members can read leads from their team
CREATE POLICY "Team members can read leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_members.team_id = leads.team_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.teams 
      WHERE teams.id = leads.team_id AND owner_id = auth.uid()
    )
  );

-- ============================================================================
-- INITIAL INDEXES (for performance)
-- ============================================================================

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_stripe_customer_id ON public.users(stripe_customer_id);
CREATE INDEX idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX idx_linkedin_accounts_team_id ON public.linkedin_accounts(team_id);
CREATE INDEX idx_leads_team_id ON public.leads(team_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_campaigns_team_id ON public.campaigns(team_id);
CREATE INDEX idx_campaign_activity_campaign_id ON public.campaign_activity(campaign_id);
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_stripe_invoice_id ON public.invoices(stripe_invoice_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_linkedin_accounts_updated_at BEFORE UPDATE ON public.linkedin_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
