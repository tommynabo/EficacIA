// Determina la URL base del API
// - En Vercel/producción: las rutas relativas /api funcionan
// - En desarrollo: también usa relativas (y el dev server las redirige si es necesario)
const API_URL = import.meta.env.VITE_API_URL || '';

let token: string | null = localStorage.getItem('auth_token');

export function setToken(newToken: string) {
  token = newToken;
  localStorage.setItem('auth_token', newToken);
}

export function getToken(): string | null {
  return token || localStorage.getItem('auth_token');
}

export function clearToken() {
  token = null;
  localStorage.removeItem('auth_token');
}

export async function request(
  method: string,
  endpoint: string,
  data?: any
): Promise<any> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const currentToken = getToken();
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return response.json();
  } catch (error: any) {
    throw new Error(error.message || 'Network error');
  }
}

export const api = {
  request,

  // Auth
  register: (email: string, password: string, name?: string) =>
    request('POST', '/api/auth/register', { email, password, name }),

  login: (email: string, password: string) =>
    request('POST', '/api/auth/login', { email, password }),

  getMe: () => request('GET', '/api/auth/me'),

  updateProfile: (updates: any) =>
    request('PUT', '/api/auth/me', updates),

  // LinkedIn Accounts
  connectLinkedInAccount: (sessionCookie: string, profileName?: string) =>
    request('POST', '/api/linkedin/accounts', { session_cookie: sessionCookie, profile_name: profileName }),

  createLinkedInAccount: (sessionCookie: string, proxyIp?: string) =>
    request('POST', '/api/linkedin/accounts', { sessionCookie, proxyIp }),

  getLinkedInAccounts: () =>
    request('GET', '/api/linkedin/accounts'),

  deleteLinkedInAccount: (accountId: string) =>
    request('DELETE', `/api/linkedin/accounts/${accountId}`),

  // Unipile – Conexión segura de LinkedIn
  generateUnipileLink: () =>
    request('POST', '/api/unipile'),

  registerUnipileAccount: (accountId: string) =>
    request('POST', `/api/unipile?action=register&accountId=${accountId}`),

  // Campaigns
  createCampaign: (name: string, linkedInAccountId: string, settings?: any) =>
    request('POST', '/api/linkedin/campaigns', { name, linkedInAccountId, settings }),

  getCampaigns: () =>
    request('GET', '/api/linkedin/campaigns'),

  getCampaign: (campaignId: string) =>
    request('GET', `/api/linkedin/campaigns/${campaignId}`),

  updateCampaign: (campaignId: string, updates: any) =>
    request('PUT', `/api/linkedin/campaigns/${campaignId}`, updates),

  // Scraping
  scrapeSearchUrl: (campaignId: string, searchUrl: string, maxLeads?: number) =>
    request('POST', `/api/linkedin/campaigns/${campaignId}/scrape`, {
      searchUrl,
      maxLeads,
    }),

  // Leads
  getCampaignLeads: (campaignId: string, status?: string) => {
    const url = status
      ? `/api/leads/campaigns/${campaignId}/leads?status=${status}`
      : `/api/leads/campaigns/${campaignId}/leads`;
    return request('GET', url);
  },

  getLead: (leadId: string) =>
    request('GET', `/api/leads/leads/${leadId}`),

  sendLead: (leadId: string, message: string, sessionCookie: string, profileUrl: string) =>
    request('POST', `/api/leads/leads/${leadId}/send`, {
      message,
      sessionCookie,
      profileUrl,
    }),

  sendAllLeads: (campaignId: string) =>
    request('POST', `/api/leads/campaigns/${campaignId}/send-all`),

  pauseCampaign: (campaignId: string) =>
    request('POST', `/api/leads/campaigns/${campaignId}/pause`),

  resumeCampaign: (campaignId: string) =>
    request('POST', `/api/leads/campaigns/${campaignId}/resume`),

  regenerateMessage: (leadId: string) =>
    request('POST', `/api/leads/leads/${leadId}/regenerate-message`),
};
