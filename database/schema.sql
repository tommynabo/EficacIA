-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "http";

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  stripe_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- LinkedIn Accounts table
CREATE TABLE IF NOT EXISTS public.linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_cookie TEXT NOT NULL,
  proxy_ip VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
  last_validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'error')),
  leads_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  linkedin_account_id UUID NOT NULL REFERENCES public.linkedin_accounts(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{
    "daily_limit": 25,
    "message_type": "default",
    "follow_up_enabled": false,
    "follow_up_delay_days": 3
  }',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  linkedin_profile_url VARCHAR(500) NOT NULL,
  name VARCHAR(255),
  title VARCHAR(255),
  company VARCHAR(255),
  bio TEXT,
  recent_post TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'accepted', 'rejected', 'error')),
  ai_message TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Actions Log table
CREATE TABLE IF NOT EXISTS public.actions_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('scrape', 'send_message', 'accept', 'reject', 'follow_up')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('success', 'error', 'pending')),
  error_details TEXT,
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- DOM Selectors table (for self-healing)
CREATE TABLE IF NOT EXISTS public.dom_selectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  selector_name VARCHAR(255) NOT NULL UNIQUE,
  xpath TEXT,
  css_selector VARCHAR(500),
  fallback_text VARCHAR(255),
  last_validated_at TIMESTAMP WITH TIME ZONE,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_linkedin_accounts_user_id ON public.linkedin_accounts(user_id);
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX idx_campaigns_linkedin_account_id ON public.campaigns(linkedin_account_id);
CREATE INDEX idx_leads_campaign_id ON public.leads(campaign_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_actions_logs_campaign_id ON public.actions_logs(campaign_id);
CREATE INDEX idx_actions_logs_user_id ON public.actions_logs(user_id);
CREATE INDEX idx_actions_logs_timestamp ON public.actions_logs(timestamp);

-- View for campaign statistics
CREATE OR REPLACE VIEW campaign_stats AS
SELECT
  c.id,
  c.name,
  c.status,
  COUNT(CASE WHEN l.status = 'sent' THEN 1 END) as messages_sent,
  COUNT(CASE WHEN l.status = 'accepted' THEN 1 END) as acceptances,
  COUNT(CASE WHEN l.status = 'rejected' THEN 1 END) as rejections,
  COUNT(CASE WHEN l.status = 'error' THEN 1 END) as errors,
  COUNT(l.id) as total_leads
FROM campaigns c
LEFT JOIN leads l ON c.id = l.campaign_id
GROUP BY c.id, c.name, c.status;
