import { useState, useCallback } from 'react';
import { api } from '../lib/api';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'error';
  leads_count: number;
  sent_count: number;
  accepted_count: number;
  rejected_count: number;
  created_at: string;
  updated_at: string;
}

interface Lead {
  id: string;
  name?: string;
  title?: string;
  company?: string;
  linkedin_profile_url: string;
  status: 'pending' | 'processing' | 'sent' | 'accepted' | 'rejected' | 'error';
  ai_message?: string;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch campaigns');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCampaign = useCallback(
    async (name: string, linkedInAccountId: string, settings?: any) => {
      setError(null);
      try {
        const campaign = await api.createCampaign(name, linkedInAccountId, settings);
        setCampaigns(prev => [...prev, campaign]);
        return campaign;
      } catch (err: any) {
        setError(err.message || 'Failed to create campaign');
        throw err;
      }
    },
    []
  );

  const updateCampaign = useCallback(
    async (campaignId: string, updates: any) => {
      setError(null);
      try {
        const updated = await api.updateCampaign(campaignId, updates);
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? updated : c))
        );
        return updated;
      } catch (err: any) {
        setError(err.message || 'Failed to update campaign');
        throw err;
      }
    },
    []
  );

  const pauseCampaign = useCallback(
    async (campaignId: string) => {
      setError(null);
      try {
        const updated = await api.pauseCampaign(campaignId);
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? { ...c, status: 'paused' as const } : c))
        );
        return updated;
      } catch (err: any) {
        setError(err.message || 'Failed to pause campaign');
        throw err;
      }
    },
    []
  );

  const resumeCampaign = useCallback(
    async (campaignId: string) => {
      setError(null);
      try {
        const updated = await api.resumeCampaign(campaignId);
        setCampaigns(prev =>
          prev.map(c => (c.id === campaignId ? { ...c, status: 'running' as const } : c))
        );
        return updated;
      } catch (err: any) {
        setError(err.message || 'Failed to resume campaign');
        throw err;
      }
    },
    []
  );

  return {
    campaigns,
    isLoading,
    error,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    pauseCampaign,
    resumeCampaign,
  };
}

export function useLeads(campaignId: string) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(
    async (status?: string) => {
      if (!campaignId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getCampaignLeads(campaignId, status);
        setLeads(Array.isArray(data) ? data : data.leads || []);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch leads');
      } finally {
        setIsLoading(false);
      }
    },
    [campaignId]
  );

  const sendLead = useCallback(
    async (leadId: string) => {
      setError(null);
      try {
        const lead = leads.find(l => l.id === leadId);
        if (!lead || !lead.ai_message) {
          throw new Error('Lead not found or message not generated');
        }
        
        // Call the simplified sendLead endpoint
        const result = await api.request('POST', `/api/leads/leads/${leadId}/send`, {
          message: lead.ai_message,
          profile_url: lead.linkedin_profile_url,
        });
        
        // Update local state
        setLeads(prev =>
          prev.map(l => (l.id === leadId ? { ...l, status: 'sent' as const } : l))
        );
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to send message');
        throw err;
      }
    },
    [leads]
  );

  const sendAllLeads = useCallback(
    async () => {
      if (!campaignId) return;
      setError(null);
      try {
        const result = await api.sendAllLeads(campaignId);
        // Refresh leads after sending all
        await fetchLeads();
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to send campaign');
        throw err;
      }
    },
    [campaignId, fetchLeads]
  );

  return {
    leads,
    isLoading,
    error,
    fetchLeads,
    sendLead,
    sendAllLeads,
  };
}
