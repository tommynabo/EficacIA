export interface User {
  id: string;
  email: string;
  name?: string;
  stripe_id?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_status: 'free' | 'pro' | 'enterprise' | 'trial';
  subscription_plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  trial_ends_at?: string;
  ai_prompt_sequence?: string;
  ai_prompt_unibox?: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LinkedInAccount {
  id: string;
  user_id: string;
  session_cookie: string;
  proxy_ip?: string;
  status: 'active' | 'inactive' | 'banned';
  last_validated_at?: string;
  created_at: string;
  updated_at: string;
  auto_withdraw_invites: boolean;
  withdraw_after_days: number;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'error';
  leads_count: number;
  sent_count: number;
  accepted_count: number;
  rejected_count: number;
  linkedin_account_id: string;
  settings: {
    daily_limit: number;
    message_type: 'default' | 'custom';
    follow_up_enabled: boolean;
    follow_up_delay_days: number;
  };
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  campaign_id: string;
  linkedin_profile_url: string;
  name?: string;
  title?: string;
  company?: string;
  bio?: string;
  recent_post?: string;
  status: 'pending' | 'processing' | 'sent' | 'accepted' | 'rejected' | 'error';
  ai_message?: string;
  error_message?: string;
  created_at: string;
  sent_at?: string;
  updated_at: string;
  tags: string[];
  sequence_paused: boolean;
}

export interface ActionLog {
  id: string;
  lead_id: string;
  campaign_id: string;
  user_id: string;
  action_type: 'scrape' | 'send_message' | 'accept' | 'reject' | 'follow_up';
  status: 'success' | 'error' | 'pending';
  error_details?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface DomSelector {
  id: string;
  selector_name: string;
  xpath: string;
  css_selector?: string;
  fallback_text?: string;
  last_validated_at: string;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapingSession {
  user_id: string;
  linkedin_account_id: string;
  search_url: string;
  status: 'processing' | 'completed' | 'failed';
  total_leads: number;
  scraped_leads: number;
  error?: string;
  started_at: string;
  completed_at?: string;
}

export interface StripeWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      status?: string;
      items?: Array<{
        price: {
          product: string;
        };
      }>;
      [key: string]: any;
    };
  };
}
