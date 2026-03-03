import { supabase } from '../lib/supabase.js';
import { LinkedInAccount, Campaign, Lead, ActionLog } from '../types/index.js';
import { sanitizeUrl } from '../lib/utils.js';

export class LinkedInDataService {
  // LinkedIn Accounts
  static async createLinkedInAccount(
    userId: string,
    sessionCookie: string,
    proxyIp?: string
  ): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('linkedin_accounts')
      .insert({
        user_id: userId,
        session_cookie: sessionCookie,
        proxy_ip: proxyIp,
        status: 'active',
        last_validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as LinkedInAccount;
  }

  static async getLinkedInAccounts(userId: string): Promise<LinkedInAccount[]> {
    const { data, error } = await supabase
      .from('linkedin_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return data as LinkedInAccount[];
  }

  static async updateLinkedInAccount(accountId: string, updates: Partial<LinkedInAccount>): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('linkedin_accounts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as LinkedInAccount;
  }

  // Campaigns
  static async createCampaign(
    userId: string,
    name: string,
    linkedInAccountId: string,
    settings?: any
  ): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        user_id: userId,
        name,
        linkedin_account_id: linkedInAccountId,
        status: 'draft',
        leads_count: 0,
        sent_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        settings: settings || {
          daily_limit: 25,
          message_type: 'default',
          follow_up_enabled: false,
          follow_up_delay_days: 3,
        },
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Campaign;
  }

  static async getCampaigns(userId: string): Promise<Campaign[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Campaign[];
  }

  static async getCampaignById(campaignId: string): Promise<Campaign | null> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error) return null;
    return data as Campaign;
  }

  static async updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('campaigns')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Campaign;
  }

  // Leads
  static async createLeads(campaignId: string, leads: Array<{ linkedinProfileUrl: string }>): Promise<Lead[]> {
    const leadsData = leads.map(lead => ({
      campaign_id: campaignId,
      linkedin_profile_url: sanitizeUrl(lead.linkedinProfileUrl),
      status: 'pending',
    }));

    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('leads')
      .insert(leadsData)
      .select();

    if (error) throw new Error(error.message);
    return data as Lead[];
  }

  static async getLeads(campaignId: string, status?: string): Promise<Lead[]> {
    let query = supabase
      .from('leads')
      .select('*')
      .eq('campaign_id', campaignId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data as Lead[];
  }

  static async updateLead(leadId: string, updates: Partial<Lead>): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Lead;
  }

  static async updateLeadsBatch(leadIds: string[], updates: Partial<Lead>): Promise<void> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .in('id', leadIds);

    if (error) throw new Error(error.message);
  }

  // Action Logs
  static async logAction(logData: Omit<ActionLog, 'id' | 'timestamp'>): Promise<any> {
    // @ts-ignore-next-line - Supabase types not fully generated
    const { data, error } = await supabase
      .from('actions_logs')
      .insert({
        ...logData,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ActionLog;
  }

  static async getActionLogs(campaignId: string, limit: number = 100): Promise<ActionLog[]> {
    const { data, error } = await supabase
      .from('actions_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data as ActionLog[];
  }
}
