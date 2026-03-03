# 🔑 API Keys & Configuration Guide

## Overview
This guide explains all the API keys and environment variables needed for the EficacIA project, how to obtain them, and what they do.

---

## 📋 Environment Variables Explained

### **Authentication & Core**

#### `JWT_SECRET`
- **What it is**: Secret key for signing JSON Web Tokens (JWT)
- **Why you need it**: Used to create and verify authentication tokens when users log in
- **Type**: String (32+ characters recommended)
- **How to get it**: 
  ```bash
  # Generate a random secret on macOS/Linux
  openssl rand -hex 32
  
  # Or use any random string with 32+ chars
  ```
- **Example**: `your-super-secret-key-min-32-chars`
- **Security**: ⚠️ Keep this SECRET. Never share it or commit it to git

#### `NODE_ENV`
- **What it is**: Environment mode
- **Values**: `development`, `staging`, `production`
- **Example**: `development` (for local testing)

#### `PORT`
- **What it is**: Port where backend server runs
- **Example**: `3001`
- **Default**: `3001`

---

### **Frontend Configuration**

#### `VITE_API_URL`
- **What it is**: URL where frontend sends API requests
- **Development**: `http://localhost:3001`
- **Production**: `https://your-backend-domain.com`
- **Why**: Tells the React app where to find the backend

---

### **Supabase (Database & Auth)**

#### `SUPABASE_URL`
- **What it is**: URL to your Supabase project
- **Format**: `https://[project-id].supabase.co`
- **How to get it**:
  1. Go to [supabase.com](https://supabase.com)
  2. Create a new project
  3. Go to Settings → API
  4. Copy the "Project URL"

#### `SUPABASE_KEY` (Anon Key)
- **What it is**: Public API key for client-side authentication
- **Usage**: Frontend uses this to authenticate users
- **How to get it**:
  1. In Supabase dashboard
  2. Settings → API
  3. Copy "anon public" key
- **Security**: 🟢 OK to expose in frontend (it's limited)

#### `SUPABASE_SERVICE_ROLE_KEY` (Service Role Key)
- **What it is**: Secret admin key for backend operations
- **Usage**: Backend uses this to bypass RLS and manage database
- **How to get it**:
  1. In Supabase dashboard
  2. Settings → API
  3. Copy "service_role secret" key
- **Security**: ⚠️ KEEP SECRET! Never expose in frontend

---

### **Claude AI (Message Generation)**

#### `ANTHROPIC_API_KEY`
- **What it is**: API key for Claude AI service (generates personalized messages)
- **Why you need it**: Generates targeted LinkedIn messages for each prospect
- **How to get it**:
  1. Go to [console.anthropic.com](https://console.anthropic.com)
  2. Create account
  3. Go to "API Keys" in left sidebar
  4. Click "Create Key"
  5. Copy the generated key
- **Models used**: `claude-3-5-haiku-20241022` (fast & cheap)
- **Cost**: ~$0.003 per 1M input tokens (very affordable)
- **Security**: ⚠️ KEEP SECRET

---

### **Redis (Job Queue)**

#### `REDIS_URL`
- **What it is**: Connection string for Redis message queue
- **Usage**: Manages async jobs (scraping, sending messages, etc.)
- **Development**: `redis://localhost:6379`
- **How to set up locally**:
  ```bash
  # macOS with Homebrew
  brew install redis
  brew services start redis
  redis-cli ping  # Should return PONG
  
  # Docker
  docker run -d -p 6379:6379 redis:latest
  ```
- **Production**: Use managed Redis (Heroku, AWS ElastiCache, Upstash)
- **Example production URL**: `redis://default:password@host:port`

---

### **Stripe Payments (Optional - For Future Use)**

#### `STRIPE_SECRET_KEY`
- **What it is**: Secret key for processing payments
- **Why you need it**: To charge customers for premium features
- **How to get it**:
  1. Go to [stripe.com](https://stripe.com)
  2. Create account
  3. Go to Dashboard → Developers → API keys
  4. Copy "Secret key" (starts with `sk_test_` or `sk_live_`)
- **Test vs Live**:
  - Use `sk_test_*` for development
  - Use `sk_live_*` when going to production
- **Security**: ⚠️ KEEP SECRET

#### `STRIPE_WEBHOOK_SECRET`
- **What it is**: Secret for receiving real-time payment events
- **Why**: Notifies your app when payments succeed/fail
- **How to get it**:
  1. In Stripe Dashboard → Developers → Webhooks
  2. Click "Add endpoint"
  3. URL: `https://your-domain.com/api/webhooks/stripe`
  4. Select events: `payment_intent.succeeded`, `payment_intent.failed`
  5. Click "Reveal" to see the secret
- **Security**: ⚠️ KEEP SECRET

#### What to do with Stripe for this project:
1. **Create a Stripe account** (free)
2. **Create a product** (e.g., "EficacIA Pro"):
   - Name: "EficacIA Pro"
   - Type: "Service"
   - Prices: Create price in USD/EUR with your desired price
   - Example: $49/month
3. **Copy the keys**:
   - Secret key: For `.env`
   - Webhook secret: For `.env`
4. **Test with test card**: `4242 4242 4242 4242`

---

### **Bright Data Proxies (Optional - Currently Not Used)**

#### `BRIGHT_DATA_API_KEY`
- **What it is**: API key for rotating proxy service
- **Why it's there**: Could be used to rotate IP addresses when scraping
- **Is it required?**: ❌ **NO** - not currently used in code
- **To disable**: Just leave blank in `.env`

---

## 🗄️ Supabase Setup - SQL Commands

After creating your Supabase project and before running the app, you need to create the database tables. Run these SQL commands in the Supabase SQL Editor:

### Create All Tables

```sql
-- Create the users table (auth profiles)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  subscription_status VARCHAR(50) DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create LinkedIn accounts table
CREATE TABLE linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_cookie TEXT NOT NULL,
  proxy_ip VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create campaigns table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linkedin_account_id UUID REFERENCES linkedin_accounts(id),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  leads_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{"daily_limit": 25, "message_type": "default", "follow_up_enabled": false}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  linkedin_profile_url TEXT NOT NULL,
  name VARCHAR(255),
  title VARCHAR(255),
  company VARCHAR(255),
  bio TEXT,
  recent_post TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  ai_message TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create action logs table (audit trail)
CREATE TABLE actions_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  lead_id UUID REFERENCES leads(id),
  action_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error_details TEXT,
  metadata JSONB
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_linkedin_accounts_user_id ON linkedin_accounts(user_id);
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX idx_actions_logs_user_id ON actions_logs(user_id);
CREATE INDEX idx_actions_logs_campaign_id ON actions_logs(campaign_id);

-- Enable Row Level Security (RLS) to protect user data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for row-level security
-- Users can only see their own data

-- Users table
CREATE POLICY "Users can see their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- LinkedIn accounts
CREATE POLICY "Users can see their own accounts" ON linkedin_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own accounts" ON linkedin_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own accounts" ON linkedin_accounts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own accounts" ON linkedin_accounts
  FOR DELETE USING (user_id = auth.uid());

-- Campaigns
CREATE POLICY "Users can see their own campaigns" ON campaigns
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create campaigns" ON campaigns
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own campaigns" ON campaigns
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own campaigns" ON campaigns
  FOR DELETE USING (user_id = auth.uid());

-- Leads
CREATE POLICY "Users can see leads from their campaigns" ON leads
  FOR SELECT USING (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

CREATE POLICY "Users can update leads from their campaigns" ON leads
  FOR UPDATE USING (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

-- Action logs
CREATE POLICY "Users can see their own action logs" ON actions_logs
  FOR SELECT USING (user_id = auth.uid());
```

### How to Run These Commands:

1. Go to [supabase.com](https://supabase.com)
2. Open your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste the SQL above
6. Click **Run**
7. Wait for completion (should see "Success" message)

---

## ✅ Checklist - What You Need Before Launching

- [ ] **Supabase Project Created**
  - [ ] Project URL saved to `SUPABASE_URL`
  - [ ] Anon key saved to `SUPABASE_KEY`
  - [ ] Service role key saved to `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] SQL tables created (run commands above)

- [ ] **Claude AI**
  - [ ] API key generated at anthropic.com
  - [ ] Key saved to `ANTHROPIC_API_KEY`

- [ ] **Redis Setup**
  - [ ] Redis running locally (test: `redis-cli ping`)
  - [ ] Or production Redis URL saved to `REDIS_URL`

- [ ] **JWT Secret**
  - [ ] Generated random string saved to `JWT_SECRET`

- [ ] **Optional (For Future)**
  - [ ] Stripe account created (if planning payments)

---

## 🚀 Setting Up .env File

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your values:
   ```bash
   # Required
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=eyJhbGci...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ANTHROPIC_API_KEY=sk-ant-api03-...
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-32-char-random-secret

   # Optional but recommended
   VITE_API_URL=http://localhost:3001
   PORT=3001
   NODE_ENV=development
   ```

3. Never commit `.env` to git!

---

## 🔐 Security Best Practices

1. **Never expose secrets in code**
   - Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` secret
   - Don't commit `.env` to git

2. **Use environment variables**
   - In production, use Vercel/Heroku secrets dashboard
   - Not physical `.env` files

3. **Rotate keys regularly**
   - If a key is exposed, regenerate it immediately
   - Remove old keys from Supabase/Anthropic dashboard

4. **Limit key permissions**
   - Stripe: Use `sk_test_` for dev, `sk_live_` for prod
   - Supabase: Use anon key in frontend, service role only in backend
   - Anthropic: Has no permission levels, just keep it secret

---

## 📞 Support Links

- **Supabase Help**: https://supabase.com/docs
- **Anthropic API Docs**: https://docs.anthropic.com
- **Stripe Setup**: https://stripe.com/docs/setup
- **Redis Docs**: https://redis.io/documentation

---

**Your project is ready to launch once all required keys are set!** 🎉

