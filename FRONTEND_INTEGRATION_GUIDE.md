# Frontend Integration Guide

## Overview

Este documento describe cómo el frontend de EficacIA está completamente integrado con el backend Express.js. Todos los componentes React están conectados a los endpoints de la API mediante hooks personalizados y un cliente API centralizado.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │   Auth       │  │  Campaigns   │  │    Leads       │   │
│  │   Pages      │  │   Manager    │  │   Management   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────┘   │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │    Custom React Hooks               │
          │  ┌────────────┐  ┌───────────────┐ │
          │  │useCampaigns│  │useLeads(id)   │ │
          │  └─────┬──────┘  └────────┬──────┘ │
          └────────┼──────────────────┼────────┘
                   │                  │
          ┌────────▼──────────────────▼────────┐
          │   Centralized API Client           │
          │         (src/lib/api.ts)           │
          │                                    │
          │  ┌─ register/login/updateProfile  │
          │  ├─ connectLinkedInAccount         │
          │  ├─ createCampaign/getCampaigns   │
          │  ├─ getCampaignLeads/sendLead     │
          │  └─ pauseCampaign/resumeCampaign  │
          └────────┬─────────────────────────┘
                   │
    ┌──────────────▼──────────────┐
    │     Global Auth Context     │
    │   (src/lib/auth-context.tsx)│
    │                             │
    │  - user state              │
    │  - token management        │
    │  - login/logout/register   │
    └────────┬────────────────────┘
             │
    ┌────────▼────────────────────────┐
    │  Express.js Backend (Port 3001) │
    │                                 │
    │  ┌─ /api/auth/register         │
    │  ├─ /api/auth/login            │
    │  ├─ /api/linkedin/accounts     │
    │  ├─ /api/linkedin/campaigns    │
    │  ├─ /api/leads/campaigns/:id   │
    │  └─ /api/leads/send-all        │
    │                                 │
    │   ↓ Services ↓                  │
    │  - AuthService                 │
    │  - LinkedInDataService         │
    │  - LinkedInScraperService      │
    │  - AIMessageService            │
    │  - QueueService (BullMQ)        │
    └────────┬─────────────────────────┘
             │
    ┌────────▼────────────────────────┐
    │  Supabase PostgreSQL Database   │
    │                                 │
    │  Tables:                        │
    │  - users                        │
    │  - linkedin_accounts            │
    │  - campaigns                    │
    │  - leads                        │
    │  - actions_logs                 │
    └─────────────────────────────────┘
```

## Key Integration Points

### 1. Authentication Flow

**Frontend (src/pages/auth.tsx)**
```tsx
const { login, register } = useAuth()

// On form submit:
await login(email, password)
// or
await register(email, password, name)
```

**What happens:**
- Form calls `login()` or `register()` from `useAuth()` hook
- Hook calls `api.login()` or `api.register()`
- API client POSTs to `/api/auth/login` or `/api/auth/register`
- Backend validates and returns JWT token
- Frontend stores token in localStorage
- AuthContext updates global `user` state
- ProtectedRoute components allow access to /dashboard

### 2. Campaign Management Flow

**Frontend (src/pages/dashboard/campaigns.tsx)**
```tsx
const { campaigns, fetchCampaigns, pauseCampaign, resumeCampaign } = useCampaigns()

// On component mount:
fetchCampaigns() // GETs /api/linkedin/campaigns

// On pause button click:
await pauseCampaign(campaignId) // POSTs /api/leads/campaigns/:id/pause
```

**What happens:**
1. `useCampaigns()` hook manages campaign state
2. `fetchCampaigns()` calls `api.getCampaigns()`
3. Backend queries campaigns table
4. Frontend displays campaigns in table
5. Pause/Resume buttons update campaign status

### 3. Accounts Management Flow

**Frontend (src/pages/dashboard/accounts.tsx)**
```tsx
const [sessionCookie, setSessionCookie] = useState("")

const handleConnectAccount = async (e) => {
  await api.connectLinkedInAccount(sessionCookie)
  // POST to /api/linkedin/accounts with { session_cookie, profile_name }
  await fetchAccounts() // GETs /api/linkedin/accounts
}
```

**What happens:**
1. User pastes LinkedIn session cookie
2. Form calls `api.connectLinkedInAccount()`
3. Backend validates session with Playwright
4. Backend saves linkedin_account in database
5. Frontend refreshes account list

### 4. Leads Management Flow

**Frontend (src/pages/dashboard/leads.tsx)**
```tsx
const { leads, fetchLeads, sendLead, sendAllLeads } = useLeads(campaignId)

// On component mount:
useEffect(() => {
  fetchLeads() // GETs /api/leads/campaigns/:id/leads
}, [campaignId])

// On send button:
await sendLead(leadId) // POSTs /api/leads/leads/:id/send
// or
await sendAllLeads() // POSTs /api/leads/campaigns/:id/send-all
```

**What happens:**
1. Load leads for campaign
2. Display each lead with AI-generated message
3. User clicks "Send" button
4. Frontend calls sendLead() with lead data
5. Backend enqueues BullMQ job
6. Worker processes connection request
7. Frontend refreshes leads (status updates to "sent")

## Component Integration Details

### Protected Routes

**App.tsx**
```tsx
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" />
}

<Routes>
  <Route path="/login" element={<AuthPage />} />
  <Route 
    path="/dashboard/*" 
    element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>} 
  />
</Routes>
```

**Effect:** Users can't access /dashboard without valid token

### Token Management

**src/lib/api.ts**
```tsx
export function getToken(): string | null {
  return token || localStorage.getItem('auth_token')
}

async function request(method, endpoint, data?) {
  const headers = {
    'Content-Type': 'application/json',
  }
  
  const currentToken = getToken()
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`
  }
  
  // Every API request includes Authorization header
}
```

**Effect:** All backend requests automatically include JWT token

### Auth Context

**src/lib/auth-context.tsx**
```tsx
<AuthProvider>
  {/* All child components have access to useAuth() */}
</AuthProvider>

// In any component:
const { user, isAuthenticated, login, logout, register } = useAuth()
```

**Effect:** Global auth state available throughout app

## File Structure

```
src/
├── lib/
│   ├── api.ts              # Centralized API client (12 methods)
│   ├── auth-context.tsx    # Global auth state provider
│   └── hooks.ts            # useCampaigns(), useLeads()
│
├── pages/
│   ├── auth.tsx            # Login/Register (connected to useAuth)
│   └── dashboard/
│       ├── campaigns.tsx   # Connected to useCampaigns()
│       ├── leads.tsx       # Connected to useLeads()
│       ├── accounts.tsx    # Connected to api.connectLinkedInAccount()
│       ├── analytics.tsx   # Display-only metrics
│       ├── settings.tsx    # Settings page (not yet connected)
│       ├── unibox.tsx      # Chat/inbox (placeholder)
│       └── sequence-builder.tsx # Sequence builder (placeholder)
│
└── components/
    ├── layout.tsx          # Dashboard layout wrapper
    ├── activity-logs.tsx   # Activity log component
    └── ui/
        ├── button.tsx
        ├── card.tsx
        ├── table.tsx
        ├── input.tsx
        ├── badge.tsx
        ├── progress-ring.tsx
        ├── switch.tsx
        └── skeleton.tsx     # Loading skeletons
```

## API Methods Available

### Authentication
- `api.register(email, password, name)` → POST /api/auth/register
- `api.login(email, password)` → POST /api/auth/login
- `api.getMe()` → GET /api/auth/me
- `api.updateProfile(updates)` → PUT /api/auth/me

### LinkedIn Accounts
- `api.connectLinkedInAccount(sessionCookie)` → POST /api/linkedin/accounts
- `api.getLinkedInAccounts()` → GET /api/linkedin/accounts

### Campaigns
- `api.createCampaign(name, accountId, settings)` → POST /api/linkedin/campaigns
- `api.getCampaigns()` → GET /api/linkedin/campaigns
- `api.getCampaign(id)` → GET /api/linkedin/campaigns/:id
- `api.updateCampaign(id, updates)` → PUT /api/linkedin/campaigns/:id
- `api.scrapeSearchUrl(campaignId, url, maxLeads)` → POST /api/linkedin/campaigns/:id/scrape

### Leads
- `api.getCampaignLeads(campaignId, status)` → GET /api/leads/campaigns/:id/leads
- `api.sendLead(leadId, message, sessionCookie, profileUrl)` → POST /api/leads/leads/:id/send
- `api.sendAllLeads(campaignId)` → POST /api/leads/campaigns/:id/send-all
- `api.pauseCampaign(campaignId)` → POST /api/leads/campaigns/:id/pause
- `api.resumeCampaign(campaignId)` → POST /api/leads/campaigns/:id/resume

## Current Integration Status

### ✅ Completed
- [x] API client implementation (src/lib/api.ts)
- [x] Auth context and hooks (src/lib/auth-context.tsx)
- [x] useCampaigns() hook (src/lib/hooks.ts)
- [x] useLeads() hook (src/lib/hooks.ts)
- [x] Auth page connected to API (src/pages/auth.tsx)
- [x] Campaigns page connected to API (src/pages/dashboard/campaigns.tsx)
- [x] Leads page connected to API (src/pages/dashboard/leads.tsx)
- [x] Accounts page connected to API (src/pages/dashboard/accounts.tsx)
- [x] Protected routes (src/App.tsx)
- [x] Token management and persistence

### 🔄 Partially Complete
- [ ] Analytics page (displays mock data, not connected to backend yet)
- [ ] Settings page (placeholder, not yet connected)
- [ ] Sequence builder (placeholder, not yet connected)
- [ ] Unibox/Chat (placeholder, not yet connected)

### ❌ Not Yet Implemented
- [ ] Real-time updates (websockets)
- [ ] Search/filtering for leads
- [ ] Bulk actions with confirmation
- [ ] Export functionality
- [ ] Advanced campaign scheduling

## Testing the Integration

### 1. Start Both Services
```bash
npm run dev
# Runs on:
# - Frontend: http://localhost:5173
# - Backend: http://localhost:3001
```

### 2. Register a New User
- Go to http://localhost:5173
- Click "No tienes cuenta? Regístrate"
- Fill in email, password, name
- Click "Registrarse"
- Should redirect to /dashboard/campaigns

### 3. Connect a LinkedIn Account
- Go to Accounts page
- Paste your LinkedIn session cookie (li_at)
- Click "Conectar"
- Should see account in the list

### 4. Create a Campaign
- Go to Campaigns page
- (Note: Button not yet connected for "Crear Campaña", use API directly)

### 5. Scrape Leads
- (Once campaign exists, scraping would start with POST to /api/linkedin/campaigns/:id/scrape)

### 6. Send Messages
- Once leads are scraped and messages generated
- Click "Enviar" button on individual leads
- Should update status to "Enviado"

## Troubleshooting

### Token Not Persisting
```typescript
// Check localStorage in DevTools Console
localStorage.getItem('auth_token')

// If missing, login didn't work properly
// Check Network tab in DevTools to see /api/auth/login response
```

### API Calls Failing
```typescript
// Check if backend is running
curl http://localhost:3001/api/auth/me

// If 401 Unauthorized, token needs to be refreshed
// Re-login and check localStorage
```

### Leads Not Loading
```typescript
// Check if campaignId is in URL
// /dashboard/campaigns/:campaignId/leads

// Check backend logs for errors
// Check if campaign exists in database
```

## Next Steps

1. **Fix remaining routes** - Create campaign form, scrape trigger, etc.
2. **Add real-time updates** - Use WebSockets or polling for live updates
3. **Implement search/filtering** - Add filters to leads and campaigns pages
4. **Add export functionality** - Export leads to CSV
5. **Complete remaining pages** - Settings, Sequence Builder, Unibox

## Environment Variables

**Frontend (.env.local)**
```
VITE_API_URL=http://localhost:3001
```

**Backend (.env)**
```
DATABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
JWT_SECRET=your_jwt_secret
ANTHROPIC_API_KEY=your_anthropic_key
REDIS_URL=redis://localhost:6379
```

## API Response Format

All API responses follow this format:

**Success (200-201)**
```json
{
  "user": { /* user object */ },
  "campaigns": [ /* campaign objects */ ],
  "leads": [ /* lead objects */ ],
  "account": { /* account object */ }
}
```

**Error (4xx-5xx)**
```json
{
  "error": "Error message here"
}
```

## Key Differences from Backend API

The frontend **simplifies** some API calls:

1. **sendLead()** - Frontend finds message from leading object, doesn't require manual message parameter
2. **connectLinkedInAccount()** - Frontend handles form validation
3. **getCampaignLeads()** - Returns data directly (not wrapped in object)

These simplifications are handled in the hooks and API client.
