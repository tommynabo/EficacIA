# Getting Started with EficacIA

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the Application](#running-the-application)
5. [Testing Each Feature](#testing-each-feature)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **Node.js**: v18 or higher
- **npm**: v8 or higher
- **Redis**: Installed and running (for job queues)
- **macOS/Linux/Windows** with terminal access

### Required Accounts
1. **Supabase** - Database and authentication
2. **Anthropic** - Claude Haiku API for message generation
3. **LinkedIn** - For testing scraping (personal account recommended)

### Required Browser/Tools
- Chrome/Firefox with DevTools (for extracting LinkedIn cookies)
- Text editor for .env file editing

---

## Installation

### Step 1: Install Node Dependencies

```bash
# Navigate to project root
cd /path/to/EficacIA

# Install all dependencies (frontend + backend)
npm install

# Verify installation
npm list | grep -E "vite|express|supabase|bullmq|playwright|anthropic" | head -10
```

**Expected output:** Should show installed packages without errors

### Step 2: Install Redis (macOS Example)

```bash
# Using Homebrew (if not installed)
brew install redis

# Start Redis in background
redis-server --daemonize yes

# Verify Redis is running
redis-cli ping
# Expected: PONG
```

**For Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
redis-cli ping
```

**For Windows:**
- Download from https://github.com/microsoftarchive/redis/releases
- Install and start Redis service

---

## Configuration

### Step 1: Set Up Environment Variables

Create `.env` file in project root:

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env
# or
code .env  # in VS Code
```

**Required Variables:**

```env
# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Authentication
JWT_SECRET=your-32-character-random-string  # Generate: openssl rand -hex 16

# AI Integration
ANTHROPIC_API_KEY=sk-ant-abcdef123456...

# Redis Queue
REDIS_URL=redis://localhost:6379

# Environment
NODE_ENV=development
ENVIRONMENT=development

# Frontend API URL (for browser)
VITE_API_URL=http://localhost:3001
```

### Step 2: Set Up Supabase

1. **Create Supabase Project**
   - Go to https://app.supabase.com
   - Click "New Project"
   - Choose your region
   - Note your `SUPABASE_URL` and `anon key`

2. **Run Database Schema**
   - In Supabase, go to SQL Editor
   - Click "New query"
   - Copy contents of `database/schema.sql`
   - Paste into query editor
   - Click "Run"
   - Verify tables appear in Table view

3. **Enable Row Level Security (Optional but Recommended)**
   - For production, enable RLS on tables
   - See `database/schema.sql` comments for RLS policies

### Step 3: Get API Keys

**Anthropic (Claude Haiku)**
- Go to https://console.anthropic.com
- Create API key
- Copy format: `sk-ant-abcdef...`
- Paste into `.env` as `ANTHROPIC_API_KEY`

**LinkedIn Session Cookie**
- (Needed for testing scraping, not for initial setup)
- Save for later: Step 5 of Testing

---

## Running the Application

### Option 1: Run Everything Together (Recommended for Development)

```bash
npm run dev

# This runs:
# - Frontend: http://localhost:5173 (Vite)
# - Backend: http://localhost:3001 (Express)
# Both auto-restart on file changes
```

**Expected output:**
```
  ➜  Local:   http://localhost:5173/
  ➜  Backend: http://localhost:3001/
  ➜  Ready in 2.5s
```

### Option 2: Run Services Separately

**Terminal 1 - Frontend:**
```bash
npm run dev:frontend
# Frontend only on port 5173
```

**Terminal 2 - Backend:**
```bash
npm run dev:server
# Backend only on port 3001
# Requires Redis running
```

### Option 3: Production Build

```bash
# Build frontend
npm run build

# Start backend (backend must run Node, not npm)
npm run start:server
```

---

## Testing Each Feature

### Test 1: User Registration & Login ✅

**Steps:**
1. Open http://localhost:5173
2. Click "No tienes cuenta? Regístrate"
3. Fill in:
   - Email: `test@example.com`
   - Password: `TestPassword123!`
   - Name: `Test User`
4. Click "Registrarse"

**Expected Results:**
- ✅ Form validates email/password format
- ✅ Success message or redirect to dashboard
- ✅ Token saved to localStorage
- ✅ Can see user email in dashboard

**Verify Token:**
```javascript
// In DevTools Console:
localStorage.getItem('auth_token')
// Should return a JWT token
```

---

### Test 2: Login with Existing User ✅

**Steps:**
1. Go to http://localhost:5173/login
2. Enter registered email and password
3. Click "Iniciar Sesión"

**Expected Results:**
- ✅ Redirects to /dashboard/campaigns
- ✅ Shows "Bienvenido, [Name]"
- ✅ Token in localStorage

---

### Test 3: Protected Routes ✅

**Steps:**
1. Open new incognito window
2. Try to access http://localhost:5173/dashboard
3. Should redirect to login

**Expected Results:**
- ✅ Cannot access dashboard without token
- ✅ Redirects to login page

---

### Test 4: Campaigns Page ✅

**Steps:**
1. Log in
2. Go to "Campañas" in sidebar
3. Wait for list to load

**Expected Results:**
- ✅ Shows loading skeletons initially
- ✅ Lists campaigns (if any exist)
- ✅ Shows: Name, Status, Progress, Acceptance Rate
- ✅ Pause/Resume buttons work
- ✅ Status updates when paused/resumed

**Test Empty State:**
- If no campaigns, should show "No hay campañas aún"

---

### Test 5: Accounts Page ✅

**Steps:**
1. Go to "Cuentas" in sidebar
2. See "Conectar Nueva Cuenta" form
3. (LinkedIn cookie not needed yet, just test UI)

**Expected Results:**
- ✅ Form displays with cookie input
- ✅ "Conectar" button disabled if field empty
- ✅ Shows empty state: "No hay cuentas conectadas"

**With LinkedIn Cookie (Optional):**
1. Open LinkedIn.com in new window/tab
2. Open DevTools (F12 or Cmd+Option+I)
3. Go to Application → Cookies → linkedin.com
4. Find `li_at` cookie
5. Right-click and "Copy value"
6. Paste into "Cookie de Sesión" field
7. Click "Conectar"

**Expected Results:**
- ✅ Connection attempt (may take 5-10 seconds)
- ✅ Account appears in table if successful
- ✅ Shows account name and status "Activa"
- ✅ Can click trash icon to disconnect

---

### Test 6: Leads Page (After Campaign Created) ✅

**Steps:**
1. Create a campaign (API call or form when ready)
2. Go to campaign → "Ver Leads" (when link exists)
3. Should load leads for that campaign

**Expected Results:**
- ✅ Shows loading skeletons
- ✅ Lists leads with: Name, Position, Company, Message
- ✅ Shows status badges: Pending, Sent, Rejected
- ✅ "Enviar" button available for pending leads
- ✅ "Enviar Todos" button triggers bulk send

---

### Test 7: Network Requests 🔍

**Steps:**
1. Open DevTools (F12)
2. Go to Network tab
3. Do any action (login, fetch campaigns, etc.)
4. Watch network requests

**Expected Results - All requests should:**
- ✅ Include `Authorization: Bearer [token]` header
- ✅ POST to correct endpoints (`/api/auth/*`, `/api/linkedin/*`, `/api/leads/*`)
- ✅ Return HTTP 200 on success, 401 on auth error
- ✅ Response body is JSON

**Example requests to see:**
- `POST /api/auth/login` → Returns `{ user, token }`
- `GET /api/linkedin/campaigns` → Returns `{ campaigns: [...] }`
- `GET /api/leads/campaigns/:id/leads` → Returns `{ leads: [...] }`

---

## Troubleshooting

### Issue: "Command not found: npm"

**Solution:**
```bash
# Install Node.js from https://nodejs.org
# Then verify:
node --version  # Should be v18+
npm --version   # Should be v8+
```

### Issue: "Port 5173 or 3001 already in use"

**Solution:**
```bash
# Find process using port
lsof -i :5173
lsof -i :3001

# Kill process (example)
kill -9 12345
```

### Issue: "Redis connection refused"

**Solution:**
```bash
# Check if Redis is running
redis-cli ping
# If no response, start it:
redis-server --daemonize yes
```

### Issue: ".env variables not working"

**Solution:**
1. Verify `.env` file is in project root
2. Contents should be: `KEY=value` (no spaces around =)
3. Restart development server
4. Check terminal output: should show env vars on startup

### Issue: "SUPABASE_KEY undefined"

**Solution:**
1. Verify you have `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
2. These are from Supabase project settings
3. Restart backend: `npm run dev:server`
4. Check backend logs for error message

### Issue: "Bearer token invalid"

**Solution:**
1. Generate new JWT_SECRET: `openssl rand -hex 16`
2. Update in `.env`
3. Re-login to get new token
4. Check localStorage has new token

### Issue: "Cannot read property 'cookies' of undefined"

**Solution:**
This means Playwright is failing to initialize. Check:
1. Backend is running (`npm run dev:server`)
2. Playwright is installed: `npm list playwright`
3. Check backend logs for detailed error

### Issue: "Leads page shows 'No hay leads aún'"

**Possible causes:**
1. Campaign doesn't exist yet
2. No leads scraped yet
3. Need to run scraping job first
4. Check URL has correct `campaignId` in path

---

## Verification Checklist

After completing setup, verify:

- [ ] `npm install` completes without errors
- [ ] `.env` file created with all required variables
- [ ] Redis running (`redis-cli ping` returns PONG)
- [ ] Supabase database schema imported (7 tables visible)
- [ ] `npm run dev` starts both servers
- [ ] Frontend accessible at http://localhost:5173
- [ ] Backend accessible at http://localhost:3001
- [ ] Can register new user
- [ ] Can login with registered user
- [ ] Can access /dashboard/campaigns after login
- [ ] Campaigns page loads (empty or with data)
- [ ] Accounts page form appears
- [ ] Network requests include Authorization header

---

## Next Steps

Once verified:

1. **Read Integration Guide**
   - See `FRONTEND_INTEGRATION_GUIDE.md` for detailed architecture

2. **Read API Reference**
   - See `API_REFERENCE.md` for all endpoints

3. **Test Full Flow**
   - Connect LinkedIn account
   - Create campaign (when form added)
   - Scrape leads (when trigger added)
   - Send messages

4. **View Implementation**
   - Backend: `server/` directory
   - Frontend: `src/` directory
   - Database: `database/schema.sql`

5. **Continue Development**
   - See `CHANGES_SUMMARY.md` for what was completed
   - See TODO's in code for next features

---

## File Structure Reference

```
EficacIA/
├── .env                          # Configuration (create from .env.example)
├── .env.example                  # Template
├── package.json                  # Dependencies
├── vite.config.ts               # Frontend build config
├── tsconfig.json                # TypeScript config
├── tsconfig.server.json         # Backend TS config
│
├── src/                         # Frontend (React + TypeScript)
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Router + Protected routes
│   ├── index.css               # Global styles
│   ├── lib/
│   │   ├── api.ts             # API client
│   │   ├── auth-context.tsx   # Auth state
│   │   └── hooks.ts           # Custom hooks
│   ├── pages/
│   │   ├── auth.tsx           # Login/Register
│   │   └── dashboard/
│   │       ├── campaigns.tsx  # Campaigns list (connected)
│   │       ├── leads.tsx      # Leads list (connected)
│   │       ├── accounts.tsx   # LinkedIn accounts (connected)
│   │       └── ...            # Other pages
│   └── components/
│       ├── layout.tsx         # Dashboard layout
│       └── ui/                # Button, Card, Table, etc.
│
├── server/                      # Backend (Express + TypeScript)
│   ├── index.ts               # Server entry
│   ├── config/                # Configuration
│   ├── lib/                   # Utilities
│   ├── services/              # Business logic
│   ├── routes/                # API routes
│   ├── workers/               # Job workers
│   ├── middleware/            # Auth, error handling
│   └── types/                 # TypeScript types
│
├── database/
│   └── schema.sql             # PostgreSQL schema
│
├── docs/                        # Documentation
├── FRONTEND_INTEGRATION_GUIDE.md # This guide
├── CHANGES_SUMMARY.md          # What was updated
├── API_REFERENCE.md            # API endpoints
├── SETUP.md                    # Setup steps
└── README.md                   # Project overview
```

---

## Success Indicators

You'll know it's working when:

✅ Both servers start without errors
✅ Can register/login with real credentials  
✅ Dashboard loads with real data
✅ Network tab shows successful API requests
✅ Browser console has no errors
✅ Can interact with all pages (campaigns, leads, accounts)
✅ Data persists between page refreshes
✅ Tokens are stored and sent in headers

---

## Support Resources

1. **Detailed Integration Guide** → `FRONTEND_INTEGRATION_GUIDE.md`
2. **API Reference** → `API_REFERENCE.md`
3. **Architecture Overview** → `IMPLEMENTATION_SUMMARY.md`
4. **Troubleshooting Tips** → `TROUBLESHOOTING.md`
5. **Quick Reference** → `QUICK_REFERENCE.md`

---

## Ready to Start?

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit .env
cp .env.example .env
# Edit .env with your values

# 3. Ensure Redis is running
redis-cli ping

# 4. Start everything
npm run dev

# 5. Open browser
# Frontend: http://localhost:5173
# Backend: http://localhost:3001

# 6. Register and login
# Test the application!
```

Good luck! 🚀
