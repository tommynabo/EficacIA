# 🎯 LinkedIn Integration - MVP Guide

## Overview
EficacIA now includes **LinkedIn Leads Management** as part of your MVP! You can:
- ✅ Search for leads (simulated with demo data)
- ✅ Import leads manually via CSV
- ✅ Manage lead status (New → Contacted → Qualified → Converted)  
- ✅ View all leads in a beautiful dashboard

---

## 📍 Access the Leads Page

1. **Go to Dashboard**: http://localhost:5174/dashboard
2. **Click "Leads"** in the left sidebar (or navigate to `/dashboard/leads`)

---

## 🔍 Feature 1: Search LinkedIn

### Free Trial Users Can:
Click "**Buscar en LinkedIn**" button to get 10 demo leads instantly

**Current Implementation:**
- Returns simulated leads (realistic data for MVP testing)
- 10 leads per search with Spanish names and companies
- Auto-saves to your Supabase database

**Future Enhancement:**
- Connect to LinkedIn API or use web scraping
- Custom search filters (location, title, company)
- Unlimited lead search with plan limits

---

## 📥 Feature 2: Import Leads Manually

### How to Use:
1. Click "**Importar**" button
2. Paste CSV data in the format:
   ```
   first_name,last_name,email,company,position
   Juan,García,juan@example.com,TechCorp,Sales Director
   María,López,maria@example.com,Marketing Agency,Manager
   ```
3. Click "Importar" → Leads saved to database

### Example CSV Template:
```csv
first_name,last_name,email,company,position,phone,linkedin
Juan,García,juan@gmail.com,TechCorp,CEO,+34666666666,https://linkedin.com/in/juan
María,López,maria@gmail.com,Marketing Co,CMO,+34777777777,https://linkedin.com/in/maria
```

---

## 👥 Feature 3: Manage Leads

### Operations Available:
| Action | How | Result |
|--------|-----|--------|
| **Change Status** | Click dropdown on status column | Leads move through funnel (New → Contacted → Qualified → Converted) |
| **View LinkedIn** | Click upward arrow icon | Opens LinkedIn profile in new tab |
| **Delete Lead** | Click trash icon | Removes from database |
| **Search/Filter** | Type in search box + select status | Real-time filtering |

### Lead Status Meaning:
- 🔵 **Nuevo (New)**: Just imported, not contacted yet
- 🟡 **Contactado (Contacted)**: You've reached out
- 🟣 **Calificado (Qualified)**: Interested, fits criteria
- 🟢 **Convertido (Converted)**: Customer or sale completed

---

## 📊 Dashboard Metrics

Top of leads page shows:
- **Total Leads**: All leads in your database
- **Nuevos**: Leads not yet contacted  
- **Contactados**: Leads you've reached out to
- **Convertidos**: Won deals/customers

---

## 🚀 API Endpoints (Backend)

For developers building on top:

```typescript
// Get all leads
GET /api/linkedin/leads?status=all&limit=50&search=john

// Search LinkedIn (returns simulated demo leads)
POST /api/linkedin/search-leads
{
  "keywords": "sales director",
  "location": "Spain",
  "limit": 10
}

// Import leads manually
POST /api/linkedin/import-leads
{
  "leads": [
    { 
      "first_name": "Juan",
      "last_name": "García",
      "email": "juan@example.com",
      "company": "TechCorp",
      "position": "CEO"
    }
  ]
}

// Bulk import CSV
POST /api/linkedin/bulk-import
{
  "csvData": "first_name,last_name,email\nJuan,García,juan@example.com"
}

// Update lead
PUT /api/linkedin/leads/{leadId}
{
  "status": "contacted",
  "notes": "Called on Monday"
}

// Delete lead
DELETE /api/linkedin/leads/{leadId}
```

---

## 💾 Database Schema

Leads are stored in Supabase `leads` table:

```sql
leads:
- id: UUID (primary key)
- team_id: UUID (your org)
- first_name: String
- last_name: String
- email: String
- company: String
- position: String
- linkedin_url: String (optional)
- status: Enum (new, contacted, qualified, converted)
- source: String (linkedin_search / manual_import / csv_import)
- notes: Text
- created_at: Timestamp
- updated_at: Timestamp
```

---

## 🎯 MVP Use Cases

### Scenario 1: Sales Director Looking for Prospects
1. Go to Leads page
2. Click "Buscar en LinkedIn"
3. Get 10 qualified leads
4. Change status as you contact them
5. Track conversion in Analytics later

### Scenario 2: Importing Existing CRM Data
1. Export CSV from your current CRM
2. Click "Importar"
3. Paste CSV data
4. Instant sync to EficacIA
5. Now integrated with campaigns!

### Scenario 3: Lead Qualification Workflow
1. All new leads start as "Nuevo"
2. Call/Email them → Change to "Contactado"
3. They show interest → Change to "Calificado"
4. Close deal → Change to "Convertido"
5. See conversion %age in dashboard stats

---

## 🔐 Privacy & Security

✅ **Your data is private:**
- Stored in Supabase (EU servers by default)
- Only you can see your leads
- Row-level security enabled
- Encrypted in transit (HTTPS)

❌ **We don't:**
- Sell your data
- Share with LinkedIn
- Store passwords
- Track your activity

---

## 📈 Next Steps

### In Development:
- [ ] Real LinkedIn API integration (requires LinkedIn API key)
- [ ] Advanced lead scoring (AI-powered)
- [ ] Automated follow-up sequences
- [ ] Lead deduplication
- [ ] Email verification
- [ ] Bulk InMail campaigns

### How to Enable in Future:
```typescript
// When ready, swap this service
// FROM: LinkedInService (current demo)
// TO: LinkedInService (with real API)

const results = await LinkedInService.searchLeads('developers', 'Spain')
// Same interface, different backend!
```

---

## ⚠️ Current Limitations (MVP)

1. **Search returns demo data** - Built for testing without LinkedIn API
2. **No real-time sync** - One-way import from LinkedIn
3. **Manual status updates** - Not automated yet
4. **No scoring** - All leads treated equally
5. **Basic CSV import** - No auto-field mapping yet

---

## ✨ What Makes This a Real MVP

✅ **Fully functional** - Works end-to-end  
✅ **Production ready** - Deployed to Vercel  
✅ **Real database** - Supabase with RLS  
✅ **Beautiful UI** - Dark theme, responsive  
✅ **Free plan** - 7-day trial with basic features  
✅ **Scalable** - Ready for real API integration  

---

## 🆘 Troubleshooting

### "No leads appear"
→ Click "Buscar en LinkedIn" or "Importar" to add leads

### "Can't import CSV"
→ Check format: `first_name,last_name,email,company,position`

### "Status not changing"
→ Refresh page or check browser console for errors

### "Can't see Leads page"
→ Log in first, must be authenticated

---

## 📞 Support

For issues with leads feature:
1. Check `/api/linkedin/leads` endpoint in backend logs (port 3001)
2. Verify Supabase connection in server logs
3. Confirm you have an active team/org setup
4. Check browser dev console (F12) for client-side errors

---

**Status**: ✅ MVP Complete & Deployed  
**Last Updated**: 2025-03-04  
**Next Release**: Real LinkedIn API integration (TBD)
