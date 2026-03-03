# ✅ Complete Integration Checklist

Use this checklist to verify that everything has been set up correctly.

## 📋 Pre-Setup Requirements

- [ ] Node.js v18 or higher installed
  ```bash
  node --version  # Should show v18+
  ```

- [ ] npm v8 or higher installed
  ```bash
  npm --version  # Should show v8+
  ```

- [ ] Redis installed
  ```bash
  redis-cli --version  # Should show version
  ```

- [ ] Supabase account created
  - [ ] Logged in at https://app.supabase.com
  - [ ] Project created
  - [ ] SUPABASE_URL noted
  - [ ] SUPABASE_KEY copied

- [ ] Anthropic account created
  - [ ] API key generated
  - [ ] Format verified: sk-ant-...

---

## 🔧 Installation & Configuration

### Step 1: Dependencies
- [ ] npm install completed without errors
  ```bash
  npm install
  ```

- [ ] Verify key packages installed
  ```bash
  npm list react express supabase bullmq playwright anthropic
  ```

### Step 2: Environment Setup
- [ ] .env file created in project root
  ```bash
  cp .env.example .env
  ```

- [ ] .env file has all required variables:
  - [ ] SUPABASE_URL=
  - [ ] SUPABASE_KEY=
  - [ ] SUPABASE_SERVICE_ROLE_KEY=
  - [ ] JWT_SECRET= (32-char random)
  - [ ] ANTHROPIC_API_KEY=sk-ant-...
  - [ ] REDIS_URL=redis://localhost:6379
  - [ ] NODE_ENV=development
  - [ ] VITE_API_URL=http://localhost:3001

- [ ] Verify .env format is correct
  - [ ] No spaces around = signs
  - [ ] Each line is KEY=value
  - [ ] No quotes around values

### Step 3: Database Setup
- [ ] Supabase database schema imported
  - [ ] Opened Supabase SQL Editor
  - [ ] Copied database/schema.sql contents
  - [ ] Executed in Supabase
  - [ ] 7 tables visible in Tables view:
    - [ ] users
    - [ ] linkedin_accounts
    - [ ] campaigns
    - [ ] leads
    - [ ] actions_logs
    - [ ] dom_selectors

- [ ] Verified tables created
  ```bash
  # In Supabase SQL Editor:
  SELECT tablename FROM pg_tables WHERE schemaname='public';
  ```

### Step 4: Redis Setup
- [ ] Redis server installed
  ```bash
  redis-cli --version
  ```

- [ ] Redis running
  ```bash
  redis-cli ping  # Should return PONG
  ```

---

## 🚀 Start & Verify

### Starting the Application

#### Option A: Both services together
- [ ] Terminal command runs without errors
  ```bash
  npm run dev
  ```

- [ ] Both services started
  - [ ] Frontend: http://localhost:5173
  - [ ] Backend: http://localhost:3001

#### Option B: Separate terminals
- [ ] Frontend starts in Terminal 1
  ```bash
  npm run dev:frontend
  ```

- [ ] Backend starts in Terminal 2
  ```bash
  npm run dev:server
  ```

### Browser Verification
- [ ] Can access http://localhost:5173
  - [ ] No CORS errors in console
  - [ ] Page loads without errors
  - [ ] See login/register form

- [ ] Can access http://localhost:3001 (optional)
  - [ ] Should see Express "Cannot GET /"
  - [ ] This is normal

---

## 👤 Test Authentication

### User Registration
- [ ] Navigate to http://localhost:5173
- [ ] Click "No tienes cuenta? Regístrate"
- [ ] Fill registration form:
  - [ ] Email: test@example.com
  - [ ] Password: TestPass123!
  - [ ] Name: Test User
- [ ] Click "Registrarse" button
- [ ] Expected result:
  - [ ] No error message
  - [ ] Redirects to /dashboard/campaigns
  - [ ] Can see username in dashboard

**Debug if fails:**
```
Check browser console (F12):
- Look for error messages
- Check Network tab for POST /api/auth/register
- Verify response status is 201 or 200
Check backend logs:
- Should show "User created" or similar
```

### Token Verification
- [ ] After successful registration
- [ ] Open DevTools (F12)
- [ ] Go to Application → LocalStorage
- [ ] Verify:
  - [ ] Key exists: auth_token
  - [ ] Value starts with: eyJhbGc...
  - [ ] It's a JWT token

### Login Test
- [ ] Go to /login page
- [ ] Enter credentials from registration:
  - [ ] Email: test@example.com
  - [ ] Password: TestPass123!
- [ ] Click "Iniciar Sesión"
- [ ] Expected result:
  - [ ] Redirects to /dashboard/campaigns
  - [ ] Can see username
  - [ ] No auth errors

### Protected Routes Test
- [ ] Open new incognito/private window
- [ ] Try to access http://localhost:5173/dashboard
- [ ] Expected result:
  - [ ] Redirects to login page
  - [ ] Cannot access dashboard without token

### Logout Test
- [ ] Click logout button (if available)
- [ ] Or manually clear localStorage:
  - [ ] Open DevTools → Application
  - [ ] LocalStorage → Clear Site Data
- [ ] Go to /dashboard
- [ ] Expected result:
  - [ ] Redirects to /login
  - [ ] Cannot access dashboard

---

## 📊 Test Dashboard Pages

### Campaigns Page
- [ ] Navigate to /dashboard/campaigns
- [ ] Expected results:
  - [ ] Page loads
  - [ ] See "Campañas" heading
  - [ ] Shows loading skeletons briefly
  - [ ] Empty state displays (if no campaigns)
  - [ ] Or campaigns list shows (if campaigns exist)

**Verify API call:**
```
DevTools → Network → Filter "campaigns"
Should see: GET /api/linkedin/campaigns
Headers should include: Authorization: Bearer...
Response should have: campaigns array
```

### Accounts Page
- [ ] Navigate to /dashboard/accounts (sidebar or URL)
- [ ] Expected results:
  - [ ] See "Conectar Nueva Cuenta" form
  - [ ] Form has input field for cookie
  - [ ] "Conectar" button is disabled (until input)
  - [ ] Below is accounts list section
  - [ ] Empty state shows: "No hay cuentas conectadas"

**Test connecting account (optional - requires LinkedIn):**
- [ ] Have LinkedIn session cookie (li_at)
- [ ] Paste into form
- [ ] Click "Conectar"
- [ ] Wait 5-10 seconds
- [ ] Account should appear in list
- [ ] Status should show "Activa"

**Verify API calls:**
```
Network tab should show:
- POST /api/linkedin/accounts (connection attempt)
- GET /api/linkedin/accounts (loading list)
Status should be 200 if successful
```

### Leads Page
- [ ] Have a campaign created first
- [ ] Navigate to /dashboard/campaigns
- [ ] Click on a campaign row
- [ ] Should navigate to /dashboard/campaigns/:campaignId/leads
- [ ] Expected results:
  - [ ] See "Leads" heading
  - [ ] Shows loading skeletons briefly
  - [ ] Empty state shows: "No hay leads aún"
  - [ ] Or leads list shows (if scraped)

**Verify with leads data:**
```
Network tab should show:
- GET /api/leads/campaigns/:id/leads
Status should be 200
Response should have leads array
```

---

## 🔐 Network & API Verification

### Authorization Header Check
For every API request:
```
DevTools → Network tab
Click any API request (campaigns, leads, etc.)
Headers tab:
- Look for "Authorization: Bearer ..."
- The token should be present
- Status code should be 200 or 201 (not 401)
```

### API Endpoint Verification
Check these endpoints respond correctly:
- [ ] GET /api/linkedin/campaigns → Returns 200
- [ ] GET /api/linkedin/accounts → Returns 200
- [ ] POST /api/auth/register → Returns 201
- [ ] POST /api/auth/login → Returns 200
- [ ] GET /api/auth/me → Returns 200 (with token)

---

## 🚨 Troubleshooting Checkpoint

If anything above fails:

### Common Issues & Fixes

**Frontend loads but shows errors:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Backend won't start - "Port 3001 in use":**
```bash
# Kill process using port
lsof -i :3001
kill -9 <PID>
# Or use different port
PORT=3002 npm run dev:server
```

**API calls returning 401 Unauthorized:**
- [ ] Check token in localStorage is present
- [ ] Re-login to get fresh token
- [ ] Check JWT_SECRET matches between requests
- [ ] Check Authorization header is being sent

**Cannot connect to database:**
- [ ] Verify SUPABASE_URL in .env
- [ ] Verify SUPABASE_KEY in .env
- [ ] Check Supabase project is active
- [ ] Check internet connection

**Redis connection refused:**
```bash
# Verify Redis is running
redis-cli ping
# If no response:
redis-server --daemonize yes
# Or on macOS:
brew services start redis
```

**CORS errors in browser:**
- [ ] Check VITE_API_URL in frontend .env
- [ ] Should be http://localhost:3001
- [ ] Not https
- [ ] Check backend CORS config allows http://localhost:5173

---

## 📈 Progressive Testing

### Phase 1: Basic Setup ✅
- [ ] Application starts without errors
- [ ] Frontend loads on 5173
- [ ] Backend runs on 3001
- [ ] No critical errors in console

### Phase 2: Authentication ✅
- [ ] Can register user
- [ ] Token stores in localStorage
- [ ] Can login with credentials
- [ ] Redirects to dashboard on success

### Phase 3: Protected Routes ✅
- [ ] Unauthenticated users can't access /dashboard
- [ ] Authenticated users can access all pages
- [ ] Logout clears token

### Phase 4: API Connectivity ✅
- [ ] Table pagina showing real data
- [ ] Authorization header present in requests
- [ ] Backend returns correct response format
- [ ] Errors handled gracefully

### Phase 5: Full Features ✅
- [ ] Create campaigns (when form available)
- [ ] View campaigns and leads
- [ ] Send messages to leads
- [ ] Disconnect accounts

---

## 📝 Sign-Off Checklist

Once all above items are checked:

- [ ] I have read GETTING_STARTED.md
- [ ] I have read COMPLETE_INTEGRATION_SUMMARY.md
- [ ] I understand the architecture
- [ ] All dependencies are installed
- [ ] Environment variables are configured
- [ ] Database schema is imported
- [ ] Application starts without errors
- [ ] Can register and login
- [ ] Can view dashboard pages
- [ ] API requests include auth headers
- [ ] All critical features are working

**If all checked:** ✅ **You're ready to go!**

---

## 🎓 Next Learning Steps

- [ ] Read FRONTEND_INTEGRATION_GUIDE.md to understand integration
- [ ] Read API_REFERENCE.md to understand all endpoints
- [ ] Read PAGES_STATUS.md to see what else can be done
- [ ] Check QUICK_REFERENCE.md for commands while developing

---

## 📞 Support Resources

If you get stuck:
1. Check TROUBLESHOOTING.md → Common Problems section
2. Check GETTING_STARTED.md → Troubleshooting section
3. Look at browser console (F12)
4. Check server logs in terminal
5. Verify all checklist items above

---

## 📊 Completion Tracking

Count how many items you've completed:
- Prerequisites: ___ / 5
- Installation: ___ / 4
- Configuration: ___ / 4
- Database: ___ / 2
- Redis: ___ / 2
- Starting: ___ / 4
- Browser: ___ / 2
- Registration: ___ / 4
- Token: ___ / 1
- Login: ___ / 3
- Protected: ___ / 2
- Logout: ___ / 2
- Campaigns: ___ / 3
- Accounts: ___ / 3
- Leads: ___ / 2
- Network: ___ / 3
- API: ___ / 5

**Total: ___ / 60**

Target: 60/60 ✅

---

## 🎉 Success!

When you've completed all items:

✅ **Frontend and backend are fully integrated**
✅ **All core features are working**
✅ **You're ready for development or testing**
✅ **You understand the architecture**
✅ **You know how to troubleshoot**

**Congratulations! The MVP is ready.** 🚀

---

**Print this checklist or bookmark it for reference!**

Last Updated: December 2024
