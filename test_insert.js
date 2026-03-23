import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function test() {
  console.log("Testing insert...");
  const leadsToInsert = [{
    team_id: "083f2cf1-6923-4c91-aca7-47b2c2195dfb", // Random UUID for testing, or I can fetch one
    campaign_id: "25de763b-155c-4ba1-8bb1-5f927589e561",
    first_name: "JUAN C.A. LOBO",
    last_name: "",
    job_title: "Contacto de 2º y miembro de LinkedIn Premium",
    company: "· 2º",
    linkedin_url: "https://www.linkedin.com/sales/lead/ACwAAACnJhUBEc_chHL3lqQ09oCuOJYtwlM0BSY,NAME_SEARCH,_Tih/",
    status: 'new'
  }];
  
  // Actually let's just fetch the teamId for campaign 25de763b-155c-4ba1-8bb1-5f927589e561
  const { data: camp } = await supabaseAdmin.from('campaigns').select('team_id').eq('id', leadsToInsert[0].campaign_id).single();
  leadsToInsert[0].team_id = camp?.team_id;

  const { data, error } = await supabaseAdmin.from('leads').insert(leadsToInsert).select();
  console.log("Data:", data);
  console.log("Error:", error);
}

test();
