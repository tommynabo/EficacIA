import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function checkLeads() {
  const { data, error } = await supabaseAdmin.from('leads').select('id, first_name, last_name, company, linkedin_url, custom_vars').limit(20);
  if (error) console.error(error);
  else {
    const scraped = data.filter(d => d.custom_vars && Object.keys(d.custom_vars).length > 0);
    console.log("Leads with custom_vars:", JSON.stringify(scraped, null, 2));
  }
}

checkLeads();
